import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:http";
process.env.LOUPE_PG_DIR = "memory://";
process.env.LOUPE_BLOB_DIR = mkdtempSync(join(tmpdir(), "loupe-api-blob-"));

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { handler } from "../index.ts";
import { db, migrate } from "../db.ts";
import { upsertProject } from "../store.ts";
import { signUser } from "../auth.ts";

const SECRET = "sec";
let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer(handler);
  await new Promise<void>((r) => server.listen(0, () => r()));
  const addr = server.address() as any;
  base = `http://127.0.0.1:${addr.port}`;
  process.env.LOUPE_PUBLIC_URL = base; // so blob URLs point back at this test server
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(async () => {
  await migrate();
  const d = await db();
  await d.query("TRUNCATE comments, projects CASCADE");
  await upsertProject({ project_key: "pk", name: "n", secret: SECRET, allowed_origins: [] });
});

const userH = { "X-Loupe-User": "u1", "X-Loupe-Hmac": signUser("u1", SECRET), "Content-Type": "application/json" };
const adminH = { "X-Loupe-Admin": SECRET, "Content-Type": "application/json" };

function comment(over: Record<string, unknown> = {}) {
  return {
    id: "c1", projectKey: "pk", url: "/p?utm_source=x", status: "open", body: "b",
    author: { id: "u1", name: "U" },
    anchor: { tag: "div", cssPath: "", xpath: "", testid: null, text: "", attrs: {}, nthOfType: 1, rect: { x: 0, y: 0, w: 0, h: 0 }, viewport: { w: 0, h: 0 } },
    context: { html: "<div/>", styles: {} }, offset: { x: 0.5, y: 0.5 },
    createdAt: "2026-01-01T00:00:00.000Z", ...over,
  };
}
const post = (body: unknown, headers = userH) => fetch(`${base}/v1/comments`, { method: "POST", headers, body: JSON.stringify(body) });

describe("api", () => {
  it("health", async () => {
    const r = await fetch(`${base}/v1/health`);
    expect(r.status).toBe(200);
    expect((await r.json()).ok).toBe(true);
  });

  it("CORS preflight", async () => {
    const r = await fetch(`${base}/v1/comments`, { method: "OPTIONS" });
    expect(r.status).toBe(204);
    expect(r.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("list requires auth, rejects unknown/blank project", async () => {
    expect((await fetch(`${base}/v1/comments?projectKey=pk`)).status).toBe(401);
    expect((await fetch(`${base}/v1/comments?projectKey=nope`, { headers: adminH })).status).toBe(404);
    expect((await fetch(`${base}/v1/comments`, { headers: adminH })).status).toBe(400);
  });

  it("creates as user, normalizes URL, then lists", async () => {
    expect((await post(comment(), { "Content-Type": "application/json" } as any)).status).toBe(401);
    const r = await post(comment());
    expect(r.status).toBe(201);
    expect((await r.json()).url).toBe("/p");
    const list = await (await fetch(`${base}/v1/comments?projectKey=pk`, { headers: adminH })).json();
    expect(list.length).toBe(1);
  });

  it("blocks posting as another user, and missing id", async () => {
    expect((await post(comment({ author: { id: "other", name: "O" } }))).status).toBe(403);
    expect((await post(comment({ id: undefined }))).status).toBe(400);
  });

  it("gets, patches, and deletes by id", async () => {
    await post(comment());
    expect((await fetch(`${base}/v1/comments/c1`, { headers: adminH })).status).toBe(200);
    const patched = await (await fetch(`${base}/v1/comments/c1`, { method: "PATCH", headers: adminH, body: JSON.stringify({ status: "done" }) })).json();
    expect(patched.status).toBe("done");
    expect((await fetch(`${base}/v1/comments/c1`, { method: "DELETE", headers: adminH })).status).toBe(204);
    expect((await fetch(`${base}/v1/comments/c1`, { headers: adminH })).status).toBe(404);
  });

  it("uploads a blob and serves it back", async () => {
    const data = "data:image/png;base64," + Buffer.from("PNG").toString("base64");
    const up = await fetch(`${base}/v1/blobs`, { method: "POST", headers: userH, body: JSON.stringify({ projectKey: "pk", data }) });
    expect(up.status).toBe(201);
    const { url } = await up.json();
    const img = await fetch(url);
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/png");
  });

  it("guards and validates blob upload", async () => {
    expect((await fetch(`${base}/v1/blobs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectKey: "pk", data: "data:,x" }) })).status).toBe(401);
    expect((await fetch(`${base}/v1/blobs`, { method: "POST", headers: adminH, body: JSON.stringify({ projectKey: "pk", data: "notadataurl" }) })).status).toBe(400);
    expect((await fetch(`${base}/v1/blobs/missing`)).status).toBe(404);
  });

  it("serves static assets and 404s unknown files", async () => {
    const r = await fetch(`${base}/demo/`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/html");
    expect((await fetch(`${base}/demo/nope.js`)).status).toBe(404);
  });

  it("handles routing edges", async () => {
    const root = await fetch(`${base}/`, { redirect: "manual" });
    expect([301, 302]).toContain(root.status);
    expect((await fetch(`${base}/v1/nope`, { headers: adminH })).status).toBe(404);
    expect((await fetch(`${base}/nope/whatever`)).status).toBe(404);
  });

  it("returns 500 on a malformed JSON body", async () => {
    const r = await fetch(`${base}/v1/comments`, { method: "POST", headers: userH, body: "{not json" });
    expect(r.status).toBe(500);
  });
});
