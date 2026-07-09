import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { argv } from "node:process";
import * as store from "./store.ts";
import { authenticate } from "./auth.ts";
import { putBlob, getBlob, dataUrlToBuffer } from "./blobs.ts";
import { migrate } from "./db.ts";
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
function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => { raw += c; if (raw.length > 12_000_000) reject(new Error("payload too large")); });
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

    // Public: serve screenshot blobs (unguessable ids). Prod: signed URLs.
    const blobGet = path.match(/^\/v1\/blobs\/([^/]+)$/);
    if (blobGet && req.method === "GET") {
      const buf = getBlob(decodeURIComponent(blobGet[1]!));
      if (!buf) return send(res, 404, { error: "not found" });
      res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" });
      return res.end(buf);
    }

    // Upload a screenshot → returns { url }. Authed.
    if (path === "/v1/blobs" && req.method === "POST") {
      const body = await readBody(req);
      const auth = await authenticate(body.projectKey || String(req.headers["x-loupe-project"] || "") || null, req);
      if (!auth.ok) return send(res, auth.status, { error: auth.reason });
      if (typeof body.data !== "string" || !body.data.startsWith("data:")) return send(res, 400, { error: "data (data URL) required" });
      const url2 = putBlob(randomUUID(), dataUrlToBuffer(body.data));
      return send(res, 201, { url: url2 });
    }

    // List comments (SDK per-page, or dashboard for all). Authed.
    if (path === "/v1/comments" && req.method === "GET") {
      const projectKey = url.searchParams.get("projectKey");
      const auth = await authenticate(projectKey, req);
      if (!auth.ok) return send(res, auth.status, { error: auth.reason });
      return send(res, 200, await store.listComments(projectKey!, url.searchParams.get("url") || undefined));
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
