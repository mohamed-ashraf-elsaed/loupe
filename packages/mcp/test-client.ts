import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

// Spawns the MCP server exactly as Claude Code would, then exercises every tool.
const serverPath = fileURLToPath(new URL("./index.ts", import.meta.url));

const transport = new StdioClientTransport({
  command: "node",
  args: [serverPath],
  env: { ...process.env, LOUPE_API: "http://localhost:8787", LOUPE_PROJECT_KEY: "pk_demo_acme", LOUPE_ADMIN_KEY: process.env.LOUPE_ADMIN_KEY || "sk_demo_acme_0f3b9c" } as Record<string, string>,
});

const client = new Client({ name: "loupe-test-client", version: "0.1.0" });
await client.connect(transport);

const text = (r: any) => r.content.map((c: any) => c.text).join("\n");

console.log("=== tools/list ===");
const tools = await client.listTools();
console.log(tools.tools.map((t) => `${t.name} — ${t.description?.slice(0, 60)}…`).join("\n"));

console.log("\n=== list_comments ===");
console.log(text(await client.callTool({ name: "list_comments", arguments: {} })));

console.log("\n=== get_comment(seed_1) ===");
console.log(text(await client.callTool({ name: "get_comment", arguments: { id: "seed_1" } })));

console.log("\n=== update_status(seed_1 → done) ===");
console.log(text(await client.callTool({ name: "update_status", arguments: { id: "seed_1", status: "done" } })));

console.log("\n=== list_comments status=done ===");
console.log(text(await client.callTool({ name: "list_comments", arguments: { status: "done" } })));

await client.close();
console.log("\nOK");
