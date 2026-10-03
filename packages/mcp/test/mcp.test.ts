import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// A canned Loupe API so we test the MCP server in isolation (auth + all tools).
const COMMENT = {
  id: "c1", url: "/p", status: "queue", body: "fix it",
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
let apiBase = "";
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
  apiBase = base;
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
  await companionClient?.close();
  await new Promise<void>((r) => api.close(() => r()));
});

// A second instance on a fixed bridge port, so the companion hand-off can be driven
// end to end exactly as the panel drives it: POST to the bridge, then call a tool.
const BRIDGE_PORT = 9871;
let companionClient: Client;

beforeAll(async () => {
  const transport = new StdioClientTransport({
    command: "node",
    args: [fileURLToPath(new URL("../index.ts", import.meta.url))],
    env: {
      ...process.env,
      LOUPE_API: apiBase,
      LOUPE_PROJECT_KEY: "pk",
      LOUPE_ADMIN_KEY: "sek",
      LOUPE_BRIDGE_PORT: String(BRIDGE_PORT),
      LOUPE_EVENT_FILE: "",
    } as Record<string, string>,
  });
  companionClient = new Client({ name: "companion-test", version: "0.0.0" });
  await companionClient.connect(transport);
  // The bridge retries on EADDRINUSE, so wait for it to answer rather than guessing.
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/health`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("companion bridge never came up");
});

const text = (r: any) => r.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");

describe("mcp server", () => {
  it("exposes the backlog, element-context and handoff tools", async () => {
    const t = await client.listTools();
    expect(t.tools.map((x) => x.name).sort()).toEqual([
      "add_thread_message",
      "create_pr_for_thread",
      "find_source_for_selection",
      "get_activity_summary",
      "get_comment",
      "get_companion_messages",
      "get_element_context",
      "get_latest_selection",
      "get_selection_history",
      "get_thread_conversation",
      "install_agent_hooks",
      "list_comments",
      "mark_thread_addressed",
      "propose_change",
      "reply_to_companion",
      "update_status",
    ]);
  });

  it("every tool carries a description an agent can choose on", async () => {
    const t = await client.listTools();
    for (const tool of t.tools) {
      // A tool with no description is a tool an agent will never pick correctly.
      expect(tool.description, tool.name).toBeTruthy();
      expect((tool.description ?? "").length, tool.name).toBeGreaterThan(40);
    }
  });

  it("says what to do when nothing is selected, rather than erroring", async () => {
    const out = text(await client.callTool({ name: "get_latest_selection", arguments: {} }));
    expect(out).toContain("Nothing has been selected yet");
    expect(out).toContain("bridge");

    const ctx = text(await client.callTool({ name: "get_element_context", arguments: {} }));
    expect(ctx).toContain("Nothing has been selected yet");
  });

  it("answers a missing thread id helpfully", async () => {
    const out = text(await client.callTool({ name: "get_element_context", arguments: { thread_id: "nope" } }));
    expect(out).toContain("No thread found");
    expect(out).toContain("list_comments");
  });

  it("list_comments renders the backlog", async () => {
    const out = text(await client.callTool({ name: "list_comments", arguments: {} }));
    expect(out).toContain("fix it");
    expect(out).toContain('[data-testid="x"]');
  });

  it("list_comments filters by status", async () => {
    const out = text(await client.callTool({ name: "list_comments", arguments: { status: "resolved" } }));
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
    const out = text(await client.callTool({ name: "update_status", arguments: { id: "c1", status: "in_review" } }));
    expect(out).toContain("In Review");
    expect(patched).toEqual({ status: "in_review" });
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

describe("the companion hand-off", () => {
  const bridge = `http://127.0.0.1:${BRIDGE_PORT}`;
  const send = (body: unknown) =>
    fetch(`${bridge}/companion`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  it("carries a panel message on the next tool result, exactly once", async () => {
    await send({ body: "please use the brand blue", author: { id: "u1", name: "Sara" }, contexts: [{ kind: "element", label: ".cta" }] });

    // The next tool call carries it…
    const first = await companionClient.callTool({ name: "list_comments", arguments: {} });
    const firstText = text(first);
    expect(firstText).toContain("brand blue");
    expect(firstText).toContain("Sara");
    expect(firstText).toContain(".cta");
    // …and the real answer is still there, not replaced by the preamble.
    expect(firstText).toContain("fix it");
    expect(first.content.length).toBeGreaterThan(1);

    // …and the one after that does not. No message is delivered twice.
    const second = await companionClient.callTool({ name: "list_comments", arguments: {} });
    expect(text(second)).not.toContain("brand blue");
  });

  it("keeps several messages in the order they were sent", async () => {
    await send({ body: "first message" });
    await send({ body: "second message" });
    const result = await companionClient.callTool({ name: "list_comments", arguments: {} });
    const t = text(result);
    expect(t.indexOf("first message")).toBeGreaterThan(-1);
    expect(t.indexOf("first message")).toBeLessThan(t.indexOf("second message"));
  });

  it("replies back to the panel and reads them out", async () => {
    const res = await fetch(`${bridge}/companion/reply`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "done — switched it to the brand blue" }),
    });
    expect(res.status).toBe(201);

    // The polling fallback sees it…
    const state = await (await fetch(`${bridge}/companion?since=0`)).json();
    expect(state.replies.map((r: any) => r.body)).toContain("done — switched it to the brand blue");

    // …and so does the tool.
    const viaTool = await companionClient.callTool({ name: "reply_to_companion", arguments: { body: "and again" } });
    expect(text(viaTool)).toMatch(/Sent to the panel/);
  });

  it("drains with get_companion_messages and does not repeat it on the next tool call", async () => {
    await send({ body: "drain me" });
    const drained = await companionClient.callTool({ name: "get_companion_messages", arguments: {} });
    expect(text(drained)).toContain("drain me");

    // Already read, so the next tool result must not carry it again.
    const next = await companionClient.callTool({ name: "list_comments", arguments: {} });
    expect(text(next)).not.toContain("drain me");
  });

  it("reports no messages rather than an empty string", async () => {
    const none = await companionClient.callTool({ name: "get_companion_messages", arguments: {} });
    expect(text(none)).toBe("No companion messages waiting.");
  });

  it("summarizes activity from the events the hooks sent", async () => {
    await fetch(`${bridge}/events/ingest`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "SessionStart", payload: { session_id: "s_tool", cwd: "/repo" } }),
    });
    await fetch(`${bridge}/events/ingest`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "PreToolUse", payload: { session_id: "s_tool", tool_name: "Edit", tool_input: { file_path: "src/a.ts" } } }),
    });

    const result = await companionClient.callTool({ name: "get_activity_summary", arguments: { session_id: "s_tool" } });
    const t = text(result);
    expect(t).toContain("s_tool");
    expect(t).toContain("1 tool call");
    expect(t).toContain("1 file touched");
  });

  it("explains itself when no events have been recorded", async () => {
    const result = await companionClient.callTool({ name: "get_activity_summary", arguments: { session_id: "nope" } });
    expect(text(result)).toMatch(/s_tool|No session matched/);
  });
});
