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
import { addMessage, deleteMessage, listMessages, listParticipants } from "./messages.ts";
import { REACTION_CHOICES, resolveMentions } from "@loupekit/shared";
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

      if (req.method === "GET") return send(res, 200, await listMessages(threadId));

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
      return send(res, 200, { ok: await deleteMessage(threadId, decodeURIComponent(messageDelete[2]!)) });
    }

    // ---- reactions ---------------------------------------------------------
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
      return send(res, 201, await store.upsertComment(c));
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
        return send(res, 200, await store.patchComment(id, patch));
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
