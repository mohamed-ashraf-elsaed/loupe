import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// A canned Loupe API so we test the MCP server in isolation (auth + all tools).
const COMMENT = {
  id: "c1", url: "/p", status: "open", body: "fix it",
  author: { name: "Sara" }, anchor: { cssPath: '[data-testid="x"]', testid: "x" },
  context: { html: "<b/>", styles: { a: "1" } }, screenshot: "http://blob/x", createdAt: "t",
};
// c2 carries an inline data-URL screenshot so get_comment can attach a real image
// block without any network fetch (deterministic in tests).
const PNG_B64 = Buffer.from("PNGBYTES").toString("base64");
const COMMENT2 = {
  ...COMMENT, id: "c2", body: "tweak spacing",
  screenshot: `data:image/png;base64,${PNG_B64}`,
};
let patched: unknown = null;
let api: Server;
let client: Client;

beforeAll(async () => {
  api = createServer((req, res) => {
    if (req.headers["x-loupe-admin"] !== "sek") { res.writeHead(401); return res.end("{}"); }
    const url = new URL(req.url!, "http://x");
    const json = (o: unknown) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    if (url.pathname === "/v1/comments" && req.method === "GET") return json([COMMENT]);
    if (url.pathname === "/v1/comments/c1" && req.method === "GET") return json(COMMENT);
    if (url.pathname === "/v1/comments/c2" && req.method === "GET") return json(COMMENT2);
    if ((url.pathname === "/v1/comments/c1" || url.pathname === "/v1/comments/c2") && req.method === "PATCH") {
      let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { patched = JSON.parse(b); json({ ...COMMENT, ...(patched as object) }); });
      return;
    }
    res.writeHead(404); res.end("{}");
  });
  await new Promise<void>((r) => api.listen(0, () => r()));
  const base = `http://127.0.0.1:${(api.address() as any).port}`;
  const transport = new StdioClientTransport({
    command: "node",
    args: [fileURLToPath(new URL("../index.ts", import.meta.url))],
    env: { ...process.env, LOUPE_API: base, LOUPE_PROJECT_KEY: "pk", LOUPE_ADMIN_KEY: "sek" } as Record<string, string>,
  });
  client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(transport);
});

afterAll(async () => {
  await client?.close();
  await new Promise<void>((r) => api.close(() => r()));
});

const text = (r: any) => r.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");

describe("mcp server", () => {
  it("exposes the four tools", async () => {
    const t = await client.listTools();
    expect(t.tools.map((x) => x.name).sort()).toEqual(["get_comment", "list_comments", "propose_change", "update_status"]);
  });

  it("list_comments renders the backlog", async () => {
    const out = text(await client.callTool({ name: "list_comments", arguments: {} }));
    expect(out).toContain("fix it");
    expect(out).toContain('[data-testid="x"]');
  });

  it("list_comments filters by status", async () => {
    const out = text(await client.callTool({ name: "list_comments", arguments: { status: "done" } }));
    expect(out).toContain("No comments");
  });

  it("get_comment returns full Claude-ready context", async () => {
    const out = text(await client.callTool({ name: "get_comment", arguments: { id: "c1" } }));
    expect(out).toContain("fix it");
    expect(out).toContain("<b/>");
    expect(out).toContain("http://blob/x");
  });

  it("get_comment attaches the screenshot as an image content block", async () => {
    const res: any = await client.callTool({ name: "get_comment", arguments: { id: "c2" } });
    const img = res.content.find((c: any) => c.type === "image");
    expect(img).toBeTruthy();
    expect(img.mimeType).toBe("image/png");
    expect(img.data).toBe(PNG_B64);
  });

  it("update_status patches through to the API", async () => {
    const out = text(await client.callTool({ name: "update_status", arguments: { id: "c1", status: "done" } }));
    expect(out).toContain("done");
    expect(patched).toEqual({ status: "done" });
  });

  it("propose_change writes the modified UI back to the comment", async () => {
    const out = text(await client.callTool({
      name: "propose_change",
      arguments: { id: "c1", html: "<b>new</b>", css: ".x{color:red}", notes: "tightened" },
    }));
    expect(out).toContain("Proposal saved");
    const p = (patched as any).proposal;
    expect(p.html).toBe("<b>new</b>");
    expect(p.css).toBe(".x{color:red}");
    expect(p.notes).toBe("tightened");
    expect(p.author).toBe("Claude Code via MCP");
    expect(typeof p.createdAt).toBe("string");
  });
});
