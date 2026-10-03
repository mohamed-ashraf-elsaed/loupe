import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { argv } from "node:process";
import * as store from "./store.ts";
import { authenticate } from "./auth.ts";
import {
  addRepoUrl, deleteWorkingBranch, listRepoUrls, listWorkingBranches, removeRepoUrl, resolvePreview, upsertWorkingBranch,
} from "./branches.ts";
import { putBlob, getBlob, dataUrlToBuffer, extFromDataUrl, contentTypeForId } from "./blobs.ts";
import { migrate } from "./db.ts";
import { addNotification, listNotifications, listPeople, markRead, unreadCount } from "./notifications.ts";
import { listReactions, toggleReaction } from "./reactions.ts";
import {
  addMapping, disconnect, getIntegration, listDeliveries, listIntegrations, listMappings,
  removeMapping, saveCredentials, storable,
} from "./integrations.ts";
import { providers } from "./providers/index.ts";
import { redact } from "./credentials.ts";
import { httpTransport } from "./integrations.ts";
import { dispatchInBackground, lifecyclePayload } from "./delivery.ts";
import { addMessage, deleteMessage, listMessages, listParticipants } from "./messages.ts";
import { REACTION_CHOICES, THREAD_MESSAGE_ADDED, THREAD_MESSAGE_DELETED, resolveMentions } from "@loupekit/shared";
import type { Comment } from "@loupekit/shared";

const PORT = Number(process.env.PORT || 8787);

// ---- static assets (dashboard, demo, sdk bundle) served from this one process ----
const STATIC = [
  { prefix: "/dashboard", dir: fileURLToPath(new URL("../dashboard", import.meta.url)) },
  { prefix: "/demo", dir: fileURLToPath(new URL("../sdk/demo", import.meta.url)) },
  { prefix: "/sdk", dir: fileURLToPath(new URL("../sdk/dist", import.meta.url)) },
];
const TYPES: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".map": "application/json",
};

function cors(req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Loupe-User, X-Loupe-Hmac, X-Loupe-Admin, X-Loupe-Project");
}
function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}
// Comments are small JSON; screenshots/recordings ride the blob route, which needs
// a bigger ceiling (a short webm is a few MB, ~33% larger as base64). Prototype
// transport — production would stream/multipart uploads to S3 instead.
const BODY_CAP = 12_000_000;
const BLOB_BODY_CAP = 60_000_000;
function readBody(req: IncomingMessage, max = BODY_CAP): Promise<any> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => { raw += c; if (raw.length > max) reject(new Error("payload too large")); });
    req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}

function serveStatic(pathname: string, res: ServerResponse): boolean {
  if (pathname === "/") { res.writeHead(302, { Location: "/dashboard/" }); res.end(); return true; }
  for (const s of STATIC) {
    if (pathname === s.prefix || pathname.startsWith(s.prefix + "/")) {
      let rel = pathname.slice(s.prefix.length).replace(/^\/+/, "") || "index.html";
      let file = join(s.dir, rel);
      if (!file.startsWith(s.dir)) { res.writeHead(403); res.end(); return true; }
      if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
      if (!existsSync(file)) { res.writeHead(404); res.end("Not found"); return true; }
      res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
      res.end(readFileSync(file));
      return true;
    }
  }
  return false;
}


/**
 * Relay a thread event to the agent bridge, when one is configured.
 *
 * The SSE channel lives in the MCP process, not here, so the API cannot publish to it
 * directly — it POSTs to the bridge's ingest instead. `LOUPE_BRIDGE_URL` is set when the
 * two run side by side (the dev and demo setup); with it unset this is a no-op, which is
 * the honest default for an API that may be shared by many developers.
 *
 * Never throws and never awaits for long: a reply must not fail because a browser-facing
 * relay is unreachable.
 */
async function publishThreadEvent(threadId: string, eventType: string, data?: unknown): Promise<void> {
  const base = process.env.LOUPE_BRIDGE_URL;
  if (!base) return;
  try {
    await fetch(`${base.replace(/\/$/, "")}/thread-updates`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ threadId, eventType, data }),
      signal: AbortSignal.timeout(1000),
    });
  } catch {
    // The bridge is a convenience, never a dependency.
  }
}

export async function handler(req: IncomingMessage, res: ServerResponse) {
  cors(req, res);
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const path = url.pathname;

  // non-API GETs → static
  if (!path.startsWith("/v1") && req.method === "GET") {
    if (serveStatic(path, res)) return;
    return send(res, 404, { error: "not found" });
  }

  try {
    if (path === "/v1/health") return send(res, 200, { ok: true });

    // ---- working branches (the accumulating-PR model) ----------------------
    if (path === "/v1/working-branches" && req.method === "POST") {
      const body = await readBody(req);
      const auth = await authenticate(body.projectKey, req);
      if (!auth.ok) return send(res, auth.status, { error: auth.reason });
      if (!body.repo || !body.branch) return send(res, 400, { error: "repo and branch are required" });
      return send(res, 201, await upsertWorkingBranch({ ...body, projectKey: auth.project.project_key }));
    }
    if (path === "/v1/working-branches" && req.method === "GET") {
      const auth = await authenticate(url.searchParams.get("projectKey"), req);
      if (!auth.ok) return send(res, auth.status, { error: auth.reason });
      return send(res, 200, await listWorkingBranches(auth.project.project_key, url.searchParams.get("repo") ?? undefined));
    }
    if (path === "/v1/working-branches" && req.method === "DELETE") {
      const auth = await authenticate(url.searchParams.get("projectKey"), req);
      if (!auth.ok) return send(res, auth.status, { error: auth.reason });
      const repo = url.searchParams.get("repo");
      const branch = url.searchParams.get("branch");
      if (!repo || !branch) return send(res, 400, { error: "repo and branch are required" });
      return send(res, 200, { ok: await deleteWorkingBranch(auth.project.project_key, repo, branch) });
    }

    // ---- repo url patterns -------------------------------------------------
    if (path === "/v1/repo-urls" && req.method === "POST") {
      const body = await readBody(req);
      const auth = await authenticate(body.projectKey, req);
      if (!auth.ok) return send(res, auth.status, { error: auth.reason });
      if (!body.repo || !body.pattern) return send(res, 400, { error: "repo and pattern are required" });
      return send(res, 201, await addRepoUrl({
        projectKey: auth.project.project_key, repo: body.repo,
        environment: body.environment ?? "staging", pattern: body.pattern,
      }));
    }
    if (path === "/v1/repo-urls" && req.method === "GET") {
      const auth = await authenticate(url.searchParams.get("projectKey"), req);
      if (!auth.ok) return send(res, auth.status, { error: auth.reason });
      return send(res, 200, await listRepoUrls(auth.project.project_key, url.searchParams.get("repo") ?? undefined));
    }
    const repoUrlDelete = path.match(/^\/v1\/repo-urls\/(.+)$/);
    if (repoUrlDelete && req.method === "DELETE") {
      const auth = await authenticate(url.searchParams.get("projectKey"), req);
      if (!auth.ok) return send(res, auth.status, { error: auth.reason });
      return send(res, 200, { ok: await removeRepoUrl(auth.project.project_key, decodeURIComponent(repoUrlDelete[1]!)) });
    }

    // ---- thread messages ---------------------------------------------------
    // The comment's own body is message #1, synthesised by the client — this returns
    // the replies only, so there is nothing to backfill.
    const messages = path.match(/^\/v1\/comments\/([^/]+)\/messages$/);
    if (messages) {
      const threadId = decodeURIComponent(messages[1]!);
      const comment = await store.getComment(threadId);
      if (!comment) return send(res, 404, { error: "not found" });
      const auth = await authenticate(comment.projectKey, req);
      if (!auth.ok) return send(res, auth.status, { error: auth.reason });

      if (req.method === "GET") {
        return send(res, 200, await listMessages(threadId, {
          includeDeleted: url.searchParams.get("includeDeleted") === "1",
        }));
      }

      if (req.method === "POST") {
        const body = await readBody(req);
        if (typeof body.body !== "string" || !body.body.trim()) return send(res, 400, { error: "body is required" });
        if (!body.author?.id) return send(res, 400, { error: "author.id is required" });
        const author = {
          id: String(body.author.id),
          name: String(body.author.name ?? "Unknown"),
          email: body.author.email,
          // Default to a person; an agent has to say so, or every reply would look
          // like it came from the reporter.
          type: (body.author.type === "agent" || body.author.type === "guest" ? body.author.type : "user") as "user" | "agent" | "guest",
        };
        const message = await addMessage(threadId, comment.projectKey, {
          author,
          body: body.body,
          attachments: Array.isArray(body.attachments) ? body.attachments : undefined,
        });

        // Mentions: resolve against everyone who has taken part, notify each person
        // once, and report the handles that matched nobody rather than dropping them —
        // a mention that quietly does nothing is the failure this exists to prevent.
        const resolution = resolveMentions(body.body, await listPeople(comment.projectKey));
        for (const { user } of resolution.resolved) {
          if (user.id === author.id) continue; // don't notify someone about their own reply
          await addNotification({
            projectKey: comment.projectKey,
            recipientId: user.id,
            threadId,
            kind: "mention",
            body: `${author.name} mentioned you on “${comment.title || comment.body.split("\n")[0] || "a thread"}”`,
            actorName: author.name,
          });
        }

        // Tell anyone with this thread open. Best-effort and env-gated: with no bridge
        // configured there is nothing to tell, and that must not fail the post.
        void publishThreadEvent(threadId, THREAD_MESSAGE_ADDED, {
          messageId: message.id,
          author: message.author.name,
        });

        // An agent replying is a lifecycle moment; a person replying is not news to the
        // people already in the thread.
        if (author.type === "agent") {
          dispatchInBackground(comment.projectKey, "agent_replied", lifecyclePayload({
            id: comment.id, title: comment.title, body: body.body, status: comment.status,
            url: comment.url, agent: author.name, repo: (comment as any).repo,
          }), { registry: providers });
        }

        return send(res, 201, {
          ...message,
          mentions: resolution.resolved.map((r) => r.user.id),
          unknownMentions: resolution.unknown,
        });
      }
    }
    const participants = path.match(/^\/v1\/comments\/([^/]+)\/participants$/);
    if (participants && req.method === "GET") {
      const threadId = decodeURIComponent(participants[1]!);
      const comment = await store.getComment(threadId);
      if (!comment) return send(res, 404, { error: "not found" });
      const auth = await authenticate(comment.projectKey, req);
      if (!auth.ok) return send(res, auth.status, { error: auth.reason });
      // The thread's own author is folded in: a reporter who never replied is still a
      // participant, and dropping them from a notification list is a silent bug.
      return send(res, 200, await listParticipants(threadId, { ...comment.author, type: "user" }));
    }

    const messageDelete = path.match(/^\/v1\/comments\/([^/]+)\/messages\/([^/]+)$/);
    if (messageDelete && req.method === "DELETE") {
      const threadId = decodeURIComponent(messageDelete[1]!);
      const comment = await store.getComment(threadId);
      if (!comment) return send(res, 404, { error: "not found" });
      const auth = await authenticate(comment.projectKey, req);
      if (!auth.ok) return send(res, auth.status, { error: auth.reason });
      const deleted = await deleteMessage(threadId, decodeURIComponent(messageDelete[2]!));
      if (deleted) void publishThreadEvent(threadId, THREAD_MESSAGE_DELETED, { messageId: deleted.id });
      // `ok: false` for an unknown or already-retracted message — a retry is a no-op,
      // not an error, and the caller can tell the difference.
      return send(res, deleted ? 200 : 404, { ok: Boolean(deleted), message: deleted ?? undefined });
    }

    // ---- integrations ------------------------------------------------------
    // Management only: connect, test, map. A credential is written here and never read
    // back — the response carries which fields are set, not their values.
    if (path === "/v1/integrations" && req.method === "GET") {
      const auth = await authenticate(url.searchParams.get("projectKey"), req);
      if (!auth.ok) return send(res, auth.status, { error: auth.reason });
      if (auth.mode !== "admin") return send(res, 403, { error: "administrators only" });
      return send(res, 200, { integrations: await listIntegrations(auth.project.project_key, providers) });
    }

    // Deliberately before the `:provider` routes, or it would be read as a provider name.
    if (path === "/v1/integrations/deliveries" && req.method === "GET") {
      const auth = await authenticate(url.searchParams.get("projectKey"), req);
      if (!auth.ok) return send(res, auth.status, { error: auth.reason });
      if (auth.mode !== "admin") return send(res, 403, { error: "administrators only" });
      const limit = Number(url.searchParams.get("limit") ?? 50);
      return send(res, 200, {
        deliveries: await listDeliveries(url.searchParams.get("provider") ?? undefined, Number.isFinite(limit) ? limit : 50),
      });
    }

    const integrationRoute = path.match(/^\/v1\/integrations\/([^/]+)(\/.*)?$/);
    if (integrationRoute) {
      const providerId = decodeURIComponent(integrationRoute[1]!);
      const rest = integrationRoute[2] ?? "";
      const provider = providers.get(providerId);
      if (!provider) return send(res, 404, { error: `unknown integration provider ${providerId}` });

      // The project comes from the query string on every method, the same as the other
      // admin routes — reading it from the body would mean consuming the body here and
      // then not having it in the handler.
      const auth = await authenticate(url.searchParams.get("projectKey"), req);
      if (!auth.ok) return send(res, auth.status, { error: auth.reason });
      if (auth.mode !== "admin") return send(res, 403, { error: "administrators only" });
      const projectKey = auth.project.project_key;

      // --- credentials ---
      if (rest === "/config" && req.method === "POST") {
        const body = await readBody(req);
        const credentials: Record<string, string> = {};
        for (const field of provider.fields) {
          const value = body.credentials?.[field.key];
          if (typeof value === "string" && value.trim()) credentials[field.key] = value.trim();
          else if (field.required) return send(res, 400, { error: `${field.key} is required` });
        }
        if (!storable()) {
          return send(res, 400, {
            error: "No credential key is configured. Set LOUPE_CREDENTIAL_KEY before connecting an integration — credentials are not stored unencrypted.",
          });
        }

        // Test before saving: storing a token that does not work leaves a card that says
        // "connected" and silently sends nothing.
        const result = await provider.test(credentials, httpTransport);
        if (!result.ok) {
          return send(res, 400, { ok: false, error: result.error, hint: result.hint });
        }
        await saveCredentials(projectKey, provider.id, credentials, result.identity);
        return send(res, 201, {
          ok: true,
          identity: result.identity,
          targets: result.targets ?? [],
          hint: result.hint,
          // The response NEVER carries the credential back.
          credentials: redact(Object.keys(credentials)),
        });
      }

      if (rest === "/test" && req.method === "POST") {
        const existing = await getIntegration(projectKey, provider.id);
        const body = await readBody(req);
        // Re-test with new values when supplied (the "I typed a new token" case), else
        // with what is stored.
        const supplied = body.credentials && typeof body.credentials === "object" ? body.credentials : null;
        const credentials = supplied
          ? Object.fromEntries(Object.entries(supplied).filter(([, v]) => typeof v === "string" && v))
          : existing?.credentials;
        if (!credentials) return send(res, 400, { error: "nothing to test — connect first" });

        const result = await provider.test(credentials as Record<string, string>, httpTransport);
        if (result.ok && existing && !supplied) {
          // A successful re-test clears a previous credential error.
          await saveCredentials(projectKey, provider.id, credentials as Record<string, string>, result.identity);
        }
        return send(res, result.ok ? 200 : 400, result);
      }

      if (rest === "" && req.method === "DELETE") {
        if (!storable()) return send(res, 400, { error: "no credential key configured" });
        return send(res, 200, { ok: await disconnect(projectKey, provider.id) });
      }

      // --- mappings ---
      if (rest === "/mappings" && req.method === "GET") {
        return send(res, 200, { mappings: await listMappings(projectKey, provider.id) });
      }

      if (rest === "/mappings" && req.method === "POST") {
        const body = await readBody(req);
        if (!body.repo || !body.targetId) return send(res, 400, { error: "repo and targetId are required" });
        if (!(await getIntegration(projectKey, provider.id))) {
          return send(res, 400, { error: "connect the integration before mapping it" });
        }
        return send(res, 201, await addMapping(projectKey, provider.id, {
          repo: String(body.repo), targetId: String(body.targetId), targetName: String(body.targetName ?? body.targetId),
        }));
      }

      if (rest.startsWith("/mappings/") && req.method === "DELETE") {
        const repo = decodeURIComponent(rest.slice("/mappings/".length));
        return send(res, 200, { ok: await removeMapping(projectKey, provider.id, repo) });
      }

      return send(res, 404, { error: `no route for ${req.method} ${path}` });
    }

    // ---- reactions ---------------------------------------------------------
    // Every reaction on a thread, in one call. The client aggregates them itself, so
    // there is no count to drift and no need to ask per message.
    const threadReactions = path.match(/^\/v1\/comments\/([^/]+)\/reactions$/);
    if (threadReactions && req.method === "GET") {
      const threadId = decodeURIComponent(threadReactions[1]!);
      const comment = await store.getComment(threadId);
      if (!comment) return send(res, 404, { error: "comment not found" });
      const auth = await authenticate(comment.projectKey, req);
      if (!auth.ok) return send(res, auth.status, { error: auth.reason });
      return send(res, 200, { reactions: await listReactions(threadId, url.searchParams.get("viewer") ?? undefined) });
    }

    // `…/messages/:messageId/reactions` — toggle for the caller, then return the
    // full set so the client never has to guess the new count.
    const reactionMatch = path.match(/^\/v1\/comments\/([^/]+)\/messages\/([^/]+)\/reactions$/);
    if (reactionMatch) {
      const comment = await store.getComment(reactionMatch[1]!);
      if (!comment) return send(res, 404, { error: "comment not found" });
      const auth = await authenticate(comment.projectKey, req);
      if (!auth.ok) return send(res, auth.status, { error: auth.reason });
      const threadId = comment.id;
      const messageId = reactionMatch[2]!;

      const messages = await listMessages(threadId);
      if (!messages.some((m) => m.id === messageId)) return send(res, 404, { error: "message not found" });

      if (req.method === "GET") {
        const viewer = url.searchParams.get("viewer") ?? undefined;
        return send(res, 200, { reactions: await listReactions(threadId, viewer) });
      }
      if (req.method === "POST") {
        const body = await readBody(req);
        if (!body.emoji || typeof body.emoji !== "string") return send(res, 400, { error: "emoji is required" });
        // One grapheme's worth of emoji; anything longer is not an emoji anyone sent.
        if ([...body.emoji].length > 4) return send(res, 400, { error: "emoji is not an emoji" });
        const userId = String(body.userId ?? req.headers["x-loupe-user"] ?? "");
        if (!userId) return send(res, 400, { error: "userId is required" });
        const { on } = await toggleReaction({
          threadId, messageId, emoji: body.emoji, userId, userName: body.userName,
        });
        return send(res, 200, { on, reactions: await listReactions(threadId, userId) });
      }
      return send(res, 405, { error: "method not allowed" });
    }

    // ---- notifications -----------------------------------------------------
    if (path === "/v1/notifications" && req.method === "GET") {
      const auth = await authenticate(url.searchParams.get("projectKey"), req);
      if (!auth.ok) return send(res, auth.status, { error: auth.reason });
      const recipient = url.searchParams.get("recipient") ?? String(req.headers["x-loupe-user"] ?? "");
      if (!recipient) return send(res, 400, { error: "recipient is required" });
      const unreadOnly = url.searchParams.get("unread") === "1";
      return send(res, 200, {
        notifications: await listNotifications(auth.project.project_key, recipient, { unreadOnly }),
        unread: await unreadCount(auth.project.project_key, recipient),
      });
    }
    if (path === "/v1/notifications/read" && req.method === "POST") {
      const body = await readBody(req);
      const auth = await authenticate(body.projectKey, req);
      if (!auth.ok) return send(res, auth.status, { error: auth.reason });
      const recipient = body.recipient ?? String(req.headers["x-loupe-user"] ?? "");
      if (!recipient) return send(res, 400, { error: "recipient is required" });
      return send(res, 200, { marked: await markRead(auth.project.project_key, recipient, body.id) });
    }
    // The emoji the client may send, so the picker and the server agree on one list.
    if (path === "/v1/reactions/allowed" && req.method === "GET") {
      return send(res, 200, { choices: REACTION_CHOICES });
    }
    // Who can be mentioned: everyone who has taken part in this project.
    if (path === "/v1/people" && req.method === "GET") {
      const auth = await authenticate(url.searchParams.get("projectKey"), req);
      if (!auth.ok) return send(res, auth.status, { error: auth.reason });
      return send(res, 200, await listPeople(auth.project.project_key));
    }

    // Is there a preview for this branch yet? Answers, or says "not ready".
    if (path === "/v1/preview" && req.method === "GET") {
      const auth = await authenticate(url.searchParams.get("projectKey"), req);
      if (!auth.ok) return send(res, auth.status, { error: auth.reason });
      const repo = url.searchParams.get("repo");
      const branch = url.searchParams.get("branch");
      if (!repo || !branch) return send(res, 400, { error: "repo and branch are required" });
      const pr = url.searchParams.get("pr");
      return send(res, 200, await resolvePreview(auth.project.project_key, repo, branch, pr ? { pr: Number(pr) } : {}));
    }

    // Public: serve screenshot blobs (unguessable ids). Prod: signed URLs.
    const blobGet = path.match(/^\/v1\/blobs\/([^/]+)$/);
    if (blobGet && req.method === "GET") {
      const id = decodeURIComponent(blobGet[1]!);
      const buf = getBlob(id);
      if (!buf) return send(res, 404, { error: "not found" });
      res.writeHead(200, { "Content-Type": contentTypeForId(id), "Cache-Control": "public, max-age=31536000, immutable" });
      return res.end(buf);
    }

    // Upload a screenshot or screen recording → returns { url }. Authed.
    if (path === "/v1/blobs" && req.method === "POST") {
      const body = await readBody(req, BLOB_BODY_CAP);
      const auth = await authenticate(body.projectKey || String(req.headers["x-loupe-project"] || "") || null, req);
      if (!auth.ok) return send(res, auth.status, { error: auth.reason });
      if (typeof body.data !== "string" || !body.data.startsWith("data:")) return send(res, 400, { error: "data (data URL) required" });
      const url2 = putBlob(randomUUID(), dataUrlToBuffer(body.data), extFromDataUrl(body.data));
      return send(res, 201, { url: url2 });
    }

    // List comments (SDK per-page, or dashboard for all). Authed.
    if (path === "/v1/comments" && req.method === "GET") {
      const projectKey = url.searchParams.get("projectKey");
      const auth = await authenticate(projectKey, req);
      if (!auth.ok) return send(res, auth.status, { error: auth.reason });
      // Filter in SQL, so a board with thousands of rows never ships them all.
      const p = url.searchParams;
      return send(res, 200, await store.listComments(projectKey!, {
        url: p.get("url") || undefined,
        repo: p.get("repo") || undefined,
        branch: p.get("branch") || undefined,
        status: p.get("status") || undefined,
        priority: p.get("priority") || undefined,
        changeType: p.get("changeType") || undefined,
        kind: p.get("kind") || undefined,
        q: p.get("q") || undefined,
      }));
    }

    // Create/replace a comment. Authed; users may only post as themselves.
    if (path === "/v1/comments" && req.method === "POST") {
      const c = (await readBody(req)) as Comment;
      const auth = await authenticate(c?.projectKey || null, req);
      if (!auth.ok) return send(res, auth.status, { error: auth.reason });
      if (!c?.id) return send(res, 400, { error: "id required" });
      if (auth.mode === "user" && c.author?.id !== auth.userId) return send(res, 403, { error: "cannot post as another user" });
      const created = await store.upsertComment(c);
      // Fire and forget: a slow provider must not make creating a comment slow.
      dispatchInBackground(auth.project.project_key, "thread_created", lifecyclePayload({
        id: created.id, title: created.title, body: created.body, status: created.status,
        priority: (created as any).priority, url: created.url,
        screenshotUrl: (created as any).screenshotUrl ?? (created as any).screenshot,
        repo: (created as any).repo,
      }), { registry: providers });
      return send(res, 201, created);
    }

    // Single-comment ops — auth is resolved from the comment's own project.
    const m = path.match(/^\/v1\/comments\/([^/]+)$/);
    if (m) {
      const id = decodeURIComponent(m[1]!);
      const existing = await store.getComment(id);
      if (!existing) return send(res, 404, { error: "not found" });
      const auth = await authenticate(existing.projectKey, req);
      if (!auth.ok) return send(res, auth.status, { error: auth.reason });

      if (req.method === "GET") return send(res, 200, existing);
      if (req.method === "PATCH") {
        const patch = await readBody(req);
        const before = await store.getComment(id);
        const updated = await store.patchComment(id, patch);
        // Which lifecycle moment this is, if any. A PR appearing is its own event even
        // when the status did not change.
        if (updated) {
          const event =
            (patch as any).pr && !(before as any)?.pr ? "pr_created"
            : (updated as any).status === "resolved" && (before as any)?.status !== "resolved" ? "thread_resolved"
            : (updated as any).status === "in_progress" && (before as any)?.status !== "in_progress" ? "agent_working"
            : null;
          if (event) {
            dispatchInBackground(auth.project.project_key, event, lifecyclePayload({
              id: updated.id, title: updated.title, body: updated.body, status: (updated as any).status,
              priority: (updated as any).priority, url: updated.url,
              screenshotUrl: (updated as any).screenshotUrl ?? (updated as any).screenshot,
              pr: (updated as any).pr, repo: (updated as any).repo,
            }), { registry: providers });
          }
        }
        return send(res, 200, updated);
      }
      if (req.method === "DELETE") {
        await store.removeComment(id);
        return send(res, 204, {});
      }
    }

    send(res, 404, { error: "not found" });
  } catch (err) {
    send(res, 500, { error: String((err as Error).message || err) });
  }
}

/** Migrate, then start listening. Returns the server (used by tests on port 0). */
export async function start(port: number = PORT) {
  await migrate();
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(port, () => resolve()));
  return server;
}

// Auto-start only when run directly (`node index.ts`), not when imported by tests.
if (import.meta.url === pathToFileURL(argv[1] ?? "").href) {
  await start();
  console.log(`[loupe] API + static on http://localhost:${PORT}  (dashboard: /dashboard/ · demo: /demo/)`);
}
