import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Exercises the exported tool handlers in-process (counted coverage), against a
// canned Loupe API. The stdio path is covered separately by mcp.test.ts.
const C1 = {
  id: "c1", url: "/p", status: "open", body: "fix it", author: { name: "Sara" },
  anchor: { cssPath: '[data-testid="x"]', testid: "x" }, context: { html: "<b/>", styles: { a: "1" } },
  screenshot: "http://blob/x", createdAt: "t",
};
const C2 = {
  id: "c2", url: "/q", status: "done", body: "other", author: { name: "Bob" },
  anchor: { cssPath: ".foo", testid: null }, context: { html: "<i/>", styles: {} }, createdAt: "t",
};

let api: Server;
let patched: unknown = null;
let mod: typeof import("../index.ts");

beforeAll(async () => {
  api = createServer((req, res) => {
    if (req.headers["x-loupe-admin"] !== "sek") { res.writeHead(401); return res.end("{}"); }
    const url = new URL(req.url!, "http://x");
    const json = (o: unknown) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    if (url.pathname === "/v1/comments" && req.method === "GET") return json([C1, C2]);
    if (url.pathname === "/v1/comments/c1") { if (req.method === "PATCH") { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { patched = JSON.parse(b); json({ ...C1, ...(patched as object) }); }); return; } return json(C1); }
    if (url.pathname === "/v1/comments/c2") return json(C2);
    res.writeHead(404); res.end("{}");
  });
  await new Promise<void>((r) => api.listen(0, () => r()));
  process.env.LOUPE_API = `http://127.0.0.1:${(api.address() as any).port}`;
  process.env.LOUPE_PROJECT_KEY = "pk";
  process.env.LOUPE_ADMIN_KEY = "sek";
  vi.resetModules();
  mod = await import("../index.ts");
});
afterAll(() => new Promise<void>((r) => api.close(() => r())));

const text = (r: any) => r.content[0].text as string;

describe("mcp handlers", () => {
  it("list_comments renders both testid and cssPath anchors", async () => {
    const out = text(await mod.listComments({}));
    expect(out).toContain("fix it");
    expect(out).toContain('[data-testid="x"]');
    expect(out).toContain(".foo"); // c2 has no testid → cssPath
  });

  it("list_comments filters by status", async () => {
    expect(text(await mod.listComments({ status: "done" }))).toContain("other");
    expect(text(await mod.listComments({ status: "in_progress" }))).toContain("No comments");
  });

  it("list_comments filters by url", async () => {
    expect(text(await mod.listComments({ url: "/p" }))).toContain("fix it");
  });

  it("get_comment: testid + screenshot branch", async () => {
    const out = text(await mod.getComment({ id: "c1" }));
    expect(out).toContain("<b/>");
    expect(out).toContain("http://blob/x");
    expect(out).toContain('[data-testid="x"]');
  });

  it("get_comment: cssPath + no-screenshot branch", async () => {
    const out = text(await mod.getComment({ id: "c2" }));
    expect(out).toContain("<i/>");
    expect(out).not.toContain("Screenshot:");
    expect(out).toContain("`.foo`");
  });

  it("update_status patches through", async () => {
    expect(text(await mod.updateStatus({ id: "c1", status: "done" }))).toContain("done");
    expect(patched).toEqual({ status: "done" });
  });

  it("api() throws on a non-OK response", async () => {
    await expect(mod.getComment({ id: "missing" })).rejects.toThrow();
  });
});
