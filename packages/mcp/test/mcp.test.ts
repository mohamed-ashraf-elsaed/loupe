import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// A canned Loupe API so we test the MCP server in isolation (auth + all 3 tools).
const COMMENT = {
  id: "c1", url: "/p", status: "open", body: "fix it",
  author: { name: "Sara" }, anchor: { cssPath: '[data-testid="x"]', testid: "x" },
  context: { html: "<b/>", styles: { a: "1" } }, screenshot: "http://blob/x", createdAt: "t",
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
    if (url.pathname === "/v1/comments/c1" && req.method === "PATCH") {
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

const text = (r: any) => r.content.map((c: any) => c.text).join("\n");

describe("mcp server", () => {
  it("exposes the three tools", async () => {
    const t = await client.listTools();
    expect(t.tools.map((x) => x.name).sort()).toEqual(["get_comment", "list_comments", "update_status"]);
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

  it("update_status patches through to the API", async () => {
    const out = text(await client.callTool({ name: "update_status", arguments: { id: "c1", status: "done" } }));
    expect(out).toContain("done");
    expect(patched).toEqual({ status: "done" });
  });
});
