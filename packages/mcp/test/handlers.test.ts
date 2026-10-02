import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Exercises the exported tool handlers in-process (counted coverage), against a
// canned Loupe API. The stdio path is covered separately by mcp.test.ts.
const C1 = {
  id: "c1", url: "/p", status: "queue", priority: "high", changeType: "frontend",
  repo: "acme/web", branch: "main",
  body: "fix it", author: { name: "Sara" },
  anchor: { cssPath: '[data-testid="x"]', testid: "x" }, context: { html: "<b/>", styles: { a: "1" } },
  screenshot: "http://blob/x", createdAt: "t",
};
const C2 = {
  id: "c2", url: "/q", status: "resolved", priority: "critical", changeType: "api",
  repo: "acme/api", branch: "main",
  body: "other", author: { name: "Bob" },
  anchor: { cssPath: ".foo", testid: null }, context: { html: "<i/>", styles: {} }, createdAt: "t",
};
const C3 = {
  id: "c3", url: "/r", status: "queue", body: "page is cramped", author: { name: "Zoe" },
  kind: "free", anchor: { cssPath: "page", testid: null, tag: "page" }, context: { html: "", styles: {} }, createdAt: "t",
};

let api: Server;
let patched: unknown = null;
let mod: typeof import("../index.ts");

beforeAll(async () => {
  api = createServer((req, res) => {
    if (req.headers["x-loupe-admin"] !== "sek") { res.writeHead(401); return res.end("{}"); }
    const url = new URL(req.url!, "http://x");
    const json = (o: unknown) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    if (url.pathname === "/v1/comments" && req.method === "GET") return json([C1, C2, C3]);
    if (url.pathname === "/v1/comments/c1") { if (req.method === "PATCH") { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { patched = JSON.parse(b); json({ ...C1, ...(patched as object) }); }); return; } return json(C1); }
    if (url.pathname === "/v1/comments/c2") return json(C2);
    if (url.pathname === "/v1/comments/c3") return json(C3);
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

  it("list_comments filters by status, accepting the legacy names too", async () => {
    expect(text(await mod.listComments({ status: "resolved" }))).toContain("other");
    // `done` is the pre-board name for Resolved — an agent may still send it.
    expect(text(await mod.listComments({ status: "done" }))).toContain("other");
    expect(text(await mod.listComments({ status: "in_review" }))).toContain("No comments");
  });

  it("list_comments surfaces priority and change type, and filters by them", async () => {
    const all = text(await mod.listComments({}));
    expect(all).toContain("High · Frontend");
    expect(all).toContain("Critical · API");
    // A comment filed without triage metadata reads as the defaults.
    expect(all).toContain("Medium · Other");

    const urgent = text(await mod.listComments({ priority: "critical" }));
    expect(urgent).toContain("other");
    expect(urgent).not.toContain("fix it");

    const api = text(await mod.listComments({ changeType: "api" }));
    expect(api).not.toContain("fix it");

    // An unrecognised priority falls back to the default instead of matching nothing.
    const unknown = text(await mod.listComments({ priority: "nonsense" }));
    expect(unknown).toContain("page is cramped");
    expect(unknown).not.toContain("fix it");
  });

  it("list_comments filters by repo and branch, and labels them", async () => {
    // The repo/branch travel with the thread so an agent knows where to look.
    expect(text(await mod.listComments({}))).toContain("[acme/web @ main]");

    const web = text(await mod.listComments({ repo: "acme/web" }));
    expect(web).toContain("fix it");
    expect(web).not.toContain("page is cramped");

    // A comment with no branch is not returned when filtering by one.
    const onMain = text(await mod.listComments({ branch: "main" }));
    expect(onMain).toContain("fix it");
    expect(onMain).not.toContain("page is cramped");
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

  it("list_comments labels a free note as a page-level note", async () => {
    expect(text(await mod.listComments({}))).toContain("page-level note");
  });

  it("get_comment: free note omits the element sections", async () => {
    const out = text(await mod.getComment({ id: "c3" }));
    expect(out).toContain("Free note");
    expect(out).not.toContain("Target element HTML");
    expect(out).not.toContain("Computed styles");
  });

  it("update_status patches through", async () => {
    expect(text(await mod.updateStatus({ id: "c1", status: "in_review" }))).toContain("In Review");
    expect(patched).toEqual({ status: "in_review" });
    // A legacy value is normalized before it reaches the API.
    await mod.updateStatus({ id: "c1", status: "done" });
    expect(patched).toEqual({ status: "resolved" });
  });

  it("api() throws on a non-OK response", async () => {
    await expect(mod.getComment({ id: "missing" })).rejects.toThrow();
  });
});
