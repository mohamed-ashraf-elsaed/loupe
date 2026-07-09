import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

// End-to-end: read, through MCP tools, the comment the browser SDK created.
const transport = new StdioClientTransport({
  command: "node",
  args: [fileURLToPath(new URL("./index.ts", import.meta.url))],
  env: { ...process.env, LOUPE_API: "http://localhost:8787", LOUPE_PROJECT_KEY: "pk_demo_acme", LOUPE_ADMIN_KEY: process.env.LOUPE_ADMIN_KEY || "sk_demo_acme_0f3b9c" } as Record<string, string>,
});
const client = new Client({ name: "verify", version: "0.1.0" });
await client.connect(transport);
const text = (r: any) => r.content.map((c: any) => c.text).join("\n");

const listed = text(await client.callTool({ name: "list_comments", arguments: {} }));
console.log("=== list_comments (all, via MCP) ===\n" + listed);

// pull the first listed comment's full context through MCP
const id = (listed.match(/#(\S+) —/) || [])[1];
console.log("\nfirst comment id (parsed from MCP output):", id);
if (id) {
  console.log("\n=== get_comment (via MCP) ===\n" + text(await client.callTool({ name: "get_comment", arguments: { id } })));
}
await client.close();
console.log("\nLOOP OK");
