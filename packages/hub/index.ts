import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { argv } from "node:process";
import type { Comment } from "@loupekit/shared";
import { migrate } from "./db.ts";
import * as store from "./store.ts";
import { decodeSession, encodeSession, newId, SESSION_TTL_SECONDS, verifySignature, type Session } from "./crypto.ts";
import { deliver } from "./webhook.ts";
import { auth } from "./google.ts";
import * as views from "./views.ts";

const PORT = Number(process.env.PORT || 8790);
const SESSION_COOKIE = "hub_session";
const INGEST_BODY_CAP = 5_000_000;
const FORM_BODY_CAP = 64_000;

// ---- config (read lazily so tests can set env per file) ----

let devSessionSecret: string | null = null;
function sessionSecret(): string {
  const s = process.env.HUB_SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("HUB_SESSION_SECRET is required in production");
  devSessionSecret ??= randomBytes(32).toString("hex");
  return devSessionSecret;
}

// ---- tiny http helpers ----

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function readRaw(req: IncomingMessage, max: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const onData = (c: Buffer) => {
      size += c.length;
      if (size > max) {
        // Stop buffering but keep draining, so the 413 response can still be sent.
        req.off("data", onData);
        req.resume();
        reject(new HttpError(413, "payload too large"));
        return;
      }
      chunks.push(c);
    };
    req.on("data", onData);
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/client",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  "frame-src https://accounts.google.com/gsi/",
  "connect-src 'self' https://accounts.google.com/gsi/",
  "img-src 'self' data: https:",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

function html(res: ServerResponse, status: number, body: string) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": CSP,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function redirect(res: ServerResponse, to: string, headers: Record<string, string> = {}) {
  res.writeHead(303, { Location: to, ...headers });
  res.end();
}

function cookie(value: string, maxAge: number): string {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function getSession(req: IncomingMessage): Session | null {
  const raw = req.headers.cookie ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === SESSION_COOKIE) return decodeSession(v.join("="), sessionSecret());
  }
  return null;
}

/**
 * CSRF defense for dashboard POSTs, on top of SameSite=Lax: the browser's Origin
 * header must match the Host we were reached on.
 */
function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

async function readForm(req: IncomingMessage): Promise<URLSearchParams> {
  return new URLSearchParams(await readRaw(req, FORM_BODY_CAP));
}

function field(form: URLSearchParams, name: string, max = 500): string {
  return (form.get(name) ?? "").trim().slice(0, max);
}

function validWebhookUrl(s: string): boolean {
  if (s.length > 2000) return false;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

// ---- ingest: POST /v1/issues ----

async function ingest(req: IncomingMessage, res: ServerResponse) {
  const projectId = String(req.headers["x-loupe-project"] ?? "");
  const timestamp = String(req.headers["x-loupe-timestamp"] ?? "");
  const signature = String(req.headers["x-loupe-signature"] ?? "");
  if (!projectId || !timestamp || !signature) {
    return json(res, 401, { error: "missing X-Loupe-Project, X-Loupe-Timestamp or X-Loupe-Signature" });
  }
  const raw = await readRaw(req, INGEST_BODY_CAP);

  const project = await store.getProject(projectId);
  if (!project) return json(res, 404, { error: "unknown project" });

  const check = verifySignature(timestamp, raw, signature, project.secret);
  if (!check.ok) return json(res, 401, { error: check.reason });

  let body: { user?: { email?: unknown; name?: unknown }; issue?: Comment };
  try {
    body = JSON.parse(raw);
  } catch {
    return json(res, 400, { error: "invalid JSON" });
  }
  const email = body?.user?.email;
  if (!store.isEmail(email)) return json(res, 400, { error: "user.email required" });
  const issue = body.issue;
  if (!issue || typeof issue !== "object" || typeof issue.id !== "string" || issue.id === "") {
    return json(res, 400, { error: "issue.id required" });
  }

  const org = (await store.getOrg(project.org_id))!;
  if (!(await store.isAllowedSubmitter(org, email))) return json(res, 403, { error: "user not in organization" });

  const user: { email: string; name?: string } = { email: store.normEmail(email) };
  if (typeof body.user!.name === "string" && body.user!.name !== "") user.name = body.user!.name;

  const deliveryId = newId("dlv");
  const payload = JSON.stringify({
    project_id: project.id,
    organization_id: org.id,
    user,
    issue,
    received_at: new Date().toISOString(),
  });
  const result = await deliver(project.webhook_url, payload, project.webhook_secret, deliveryId);
  await store.recordDelivery({
    id: deliveryId,
    project_id: project.id,
    issue_id: issue.id,
    status: result.status,
    http_status: result.httpStatus,
    attempts: result.attempts,
    last_error: result.lastError,
  });
  if (result.status === "failed") console.warn(`[hub] delivery ${deliveryId} to ${project.id} failed: ${result.lastError}`);
  return json(res, 202, { id: deliveryId, delivery: result.status });
}

// ---- dashboard ----

async function signIn(req: IncomingMessage, res: ServerResponse) {
  if (!sameOrigin(req)) return json(res, 403, { error: "bad origin" });
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return json(res, 503, { error: "GOOGLE_CLIENT_ID not configured" });
  let credential: unknown;
  try {
    credential = JSON.parse(await readRaw(req, FORM_BODY_CAP)).credential;
  } catch {
    return json(res, 400, { error: "invalid JSON" });
  }
  if (typeof credential !== "string" || !credential) return json(res, 400, { error: "credential required" });
  let who;
  try {
    who = await auth.verify(credential, clientId);
  } catch (err) {
    return json(res, 401, { error: `sign-in rejected: ${(err as Error).message}` });
  }
  const s: Session = { email: store.normEmail(who.email), exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS };
  if (who.name) s.name = who.name;
  res.setHeader("Set-Cookie", cookie(encodeSession(s, sessionSecret()), SESSION_TTL_SECONDS));
  return json(res, 200, { ok: true, email: s.email });
}

/** Load an org the signed-in user belongs to (404 otherwise, so non-members learn nothing). */
async function orgFor(me: Session, orgId: string) {
  const org = await store.getOrg(orgId);
  const role = org ? await store.roleIn(org.id, me.email) : null;
  if (!org || !role) throw new HttpError(404, "Organization not found");
  return { org, role };
}

async function projectFor(me: Session, projectId: string) {
  const project = await store.getProject(projectId);
  if (!project) throw new HttpError(404, "Project not found");
  const { org, role } = await orgFor(me, project.org_id).catch(() => {
    throw new HttpError(404, "Project not found");
  });
  return { project, org, role };
}

function requireOwner(role: store.Role) {
  if (role !== "owner") throw new HttpError(403, "Only an organization owner can do that");
}

async function renderOrg(res: ServerResponse, me: Session, orgId: string, status = 200, error?: string) {
  const { org, role } = await orgFor(me, orgId);
  html(res, status, views.orgPage(me, org, role, await store.listMembers(org.id), await store.listProjects(org.id), error));
}

async function renderProject(res: ServerResponse, me: Session, projectId: string, opts: { reveal?: string; error?: string } = {}, status = 200) {
  const { project, org, role } = await projectFor(me, projectId);
  html(res, status, views.projectPage(me, org, project, role, await store.listDeliveries(project.id), opts));
}

async function dashboard(req: IncomingMessage, res: ServerResponse, path: string) {
  const method = req.method ?? "GET";
  if (method === "POST" && path === "/auth/google") return signIn(req, res);

  const me = getSession(req);
  if (method === "POST" && !sameOrigin(req)) throw new HttpError(403, "Bad origin");

  if (method === "POST" && path === "/logout") return redirect(res, "/", { "Set-Cookie": cookie("", 0) });

  if (!me) {
    if (method === "GET" && path === "/") return html(res, 200, views.signInPage(process.env.GOOGLE_CLIENT_ID));
    if (method === "GET") return redirect(res, "/");
    throw new HttpError(401, "Sign in first");
  }

  if (method === "GET" && path === "/") return html(res, 200, views.homePage(me, await store.listOrgsFor(me.email)));

  if (method === "POST" && path === "/orgs") {
    const form = await readForm(req);
    const name = field(form, "name", 100);
    const domain = store.normDomain(field(form, "allowed_domain", 253));
    if (!name) throw new HttpError(400, "Name is required");
    if (domain && !store.isDomain(domain)) throw new HttpError(400, "Allowed domain is not a valid domain");
    const org = await store.createOrg(name, me.email, domain);
    return redirect(res, `/orgs/${org.id}`);
  }

  let m = path.match(/^\/orgs\/([\w-]+)(?:\/(members|members\/remove|domain|projects))?$/);
  if (m) {
    const orgId = m[1]!;
    const action = m[2];
    if (method === "GET" && !action) return renderOrg(res, me, orgId);
    if (method !== "POST" || !action) throw new HttpError(404, "Not found");

    const { role } = await orgFor(me, orgId);
    requireOwner(role);
    const form = await readForm(req);

    if (action === "members") {
      const email = field(form, "email", 320);
      const r = field(form, "role");
      if (!store.isEmail(email)) return renderOrg(res, me, orgId, 400, "Enter a valid email");
      await store.addMember(orgId, email, r === "owner" ? "owner" : "member");
    } else if (action === "members/remove") {
      if (!(await store.removeMember(orgId, field(form, "email", 320)))) {
        return renderOrg(res, me, orgId, 400, "An organization needs at least one owner");
      }
    } else if (action === "domain") {
      const domain = store.normDomain(field(form, "allowed_domain", 253));
      if (domain && !store.isDomain(domain)) return renderOrg(res, me, orgId, 400, "Allowed domain is not a valid domain");
      await store.setAllowedDomain(orgId, domain);
    } else {
      const name = field(form, "name", 100);
      const url = field(form, "webhook_url", 4000);
      if (!name) return renderOrg(res, me, orgId, 400, "Project name is required");
      if (!validWebhookUrl(url)) return renderOrg(res, me, orgId, 400, "Webhook URL must be an http(s) URL");
      const p = await store.createProject(orgId, name, url);
      // Secrets are displayed exactly once, on this response.
      return renderProject(res, me, p.id, {
        reveal: views.secretsCard([
          { label: "Project Secret (LOUPE_PROJECT_SECRET)", value: p.secret },
          { label: "Webhook signing secret", value: p.webhook_secret },
        ]),
      }, 201);
    }
    return redirect(res, `/orgs/${orgId}`);
  }

  m = path.match(/^\/projects\/([\w-]+)(?:\/(webhook|rotate))?$/);
  if (m) {
    const projectId = m[1]!;
    const action = m[2];
    if (method === "GET" && !action) return renderProject(res, me, projectId);
    if (method !== "POST" || !action) throw new HttpError(404, "Not found");

    const { role } = await projectFor(me, projectId);
    requireOwner(role);
    const form = await readForm(req);

    if (action === "webhook") {
      const url = field(form, "webhook_url", 4000);
      if (!validWebhookUrl(url)) return renderProject(res, me, projectId, { error: "Webhook URL must be an http(s) URL" }, 400);
      await store.setWebhookUrl(projectId, url);
      return redirect(res, `/projects/${projectId}`);
    }
    const which = field(form, "which") === "webhook_secret" ? "webhook_secret" : "secret";
    const value = await store.rotateSecret(projectId, which);
    return renderProject(res, me, projectId, {
      reveal: views.secretsCard([
        { label: which === "secret" ? "New Project Secret (LOUPE_PROJECT_SECRET)" : "New webhook signing secret", value },
      ]),
    });
  }

  throw new HttpError(404, "Not found");
}

export async function handler(req: IncomingMessage, res: ServerResponse) {
  const path = new URL(req.url || "/", "http://hub.local").pathname;
  const isApi = path.startsWith("/v1/");
  try {
    if (path === "/v1/health") return json(res, 200, { ok: true });
    if (path === "/v1/issues") {
      if (req.method !== "POST") return json(res, 405, { error: "method not allowed" });
      return await ingest(req, res);
    }
    if (isApi) return json(res, 404, { error: "not found" });
    await dashboard(req, res, path);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof HttpError ? err.message : "Internal error";
    if (status === 500) console.error("[hub]", err);
    if (res.headersSent) return void res.end();
    if (isApi || path === "/auth/google") return json(res, status, { error: message });
    html(res, status, views.errorPage(status, message));
  }
}

/** Migrate, then start listening. Returns the server (used by tests on port 0). */
export async function start(port: number = PORT, host = process.env.HOST || "127.0.0.1") {
  sessionSecret(); // fail fast in production without a session secret
  await migrate();
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(port, host, () => resolve()));
  return server;
}

// Auto-start only when run directly (`node index.ts`), not when imported by tests.
if (import.meta.url === pathToFileURL(argv[1] ?? "").href) {
  const host = process.env.HOST || "127.0.0.1";
  await start(PORT, host);
  console.log(`[hub] Loupe Hub on http://${host}:${PORT}`);
}
