#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { argv } from "node:process";
import { z } from "zod";

/**
 * Loupe MCP server — exposes a project's PM feedback to Claude Code as an
 * actionable backlog. This is the payoff of storing comments in a database:
 * a developer opens the repo, and Claude can read exactly what to change, with
 * the screenshot, the target element's HTML, and its computed styles.
 *
 * Configure in Claude Code:
 *   {
 *     "mcpServers": {
 *       "loupe": {
 *         "command": "node",
 *         "args": ["/path/to/loupe/mcp/index.ts"],
 *         "env": { "LOUPE_API": "http://localhost:8787", "LOUPE_PROJECT_KEY": "pk_demo_acme" }
 *       }
 *     }
 *   }
 */

import type { Comment } from "@loupekit/shared";

const API = (process.env.LOUPE_API || "http://localhost:8787").replace(/\/$/, "");
const PROJECT_KEY = process.env.LOUPE_PROJECT_KEY || "pk_demo_acme";
// The MCP server authenticates to the API as an admin (project secret).
const ADMIN = process.env.LOUPE_ADMIN_KEY || "";

async function api(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", "X-Loupe-Admin": ADMIN, ...(init?.headers || {}) },
  });
  if (!res.ok) throw new Error(`${init?.method || "GET"} ${path} → ${res.status}`);
  return res.status === 204 ? null : res.json();
}

const wrap = (text: string) => ({ content: [{ type: "text" as const, text }] });

/** How to name a comment's target in a one-liner. Free notes have no element. */
const targetOf = (c: Comment) =>
  c.kind === "free"
    ? "page-level note"
    : c.anchor.testid ? `[data-testid="${c.anchor.testid}"]` : c.anchor.cssPath;

// Tool handlers are exported so they can be unit-tested in-process (the stdio
// transport below only runs when this file is the entrypoint).

export async function listComments({ status, url }: { status?: string; url?: string }) {
  const q = new URLSearchParams({ projectKey: PROJECT_KEY });
  if (url) q.set("url", url);
  let comments = (await api(`/v1/comments?${q}`)) as Comment[];
  if (status) comments = comments.filter((c) => c.status === status);
  if (!comments.length) return wrap("No comments match.");
  const lines = comments.map(
    (c) =>
      `- [${c.status}] #${c.id} — ${c.body}\n    ↳ ${targetOf(c)} on ${c.url} (by ${c.author.name})`,
  );
  return wrap(`${comments.length} comment(s):\n\n${lines.join("\n")}\n\nUse get_comment(id) for the full element context.`);
}

export async function getComment({ id }: { id: string }) {
  const c = (await api(`/v1/comments/${encodeURIComponent(id)}`)) as Comment;
  // Free notes aren't tied to an element — skip the element HTML/styles sections.
  if (c.kind === "free") {
    return wrap(
      [
        `# Feedback #${c.id} from ${c.author.name} (${c.status})`,
        ``,
        `**Note:** ${c.body}`,
        `**Page:** ${c.url}`,
        `**Type:** Free note — a page-level comment, not tied to a specific element (no screenshot).`,
      ].join("\n"),
    );
  }
  return wrap(
    [
      `# Feedback #${c.id} from ${c.author.name} (${c.status})`,
      ``,
      `**Request:** ${c.body}`,
      `**Page:** ${c.url}`,
      `**Target element:** ${c.anchor.testid ? `[data-testid="${c.anchor.testid}"]` : `\`${c.anchor.cssPath}\``}`,
      c.screenshot ? `**Screenshot:** ${c.screenshot}` : ``,
      ``,
      `## Target element HTML`,
      "```html",
      c.context.html,
      "```",
      ``,
      `## Computed styles`,
      "```json",
      JSON.stringify(c.context.styles, null, 2),
      "```",
    ].filter(Boolean).join("\n"),
  );
}

export async function updateStatus({ id, status }: { id: string; status: string }) {
  await api(`/v1/comments/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) });
  return wrap(`#${id} → ${status}`);
}

const server = new McpServer({ name: "loupe", version: "0.5.2" });
server.tool(
  "list_comments",
  "List Loupe product-feedback comments for the project as a task backlog. Use this to see what a PM has flagged, then work through the items.",
  {
    status: z.enum(["open", "in_progress", "done"]).optional().describe("Filter by status. Omit for all."),
    url: z.string().optional().describe("Filter to a single page path, e.g. /checkout."),
  },
  listComments,
);
server.tool(
  "get_comment",
  "Get the full context for one comment: the request, the page, the target element's HTML, and its computed styles — everything needed to make the change.",
  { id: z.string().describe("The comment id from list_comments.") },
  getComment,
);
server.tool(
  "update_status",
  "Update a comment's status. Set to in_progress when you start it and done when the change is shipped — this closes the loop back to the PM.",
  { id: z.string(), status: z.enum(["open", "in_progress", "done"]) },
  updateStatus,
);

// Connect the stdio transport only when run directly (not when imported by tests).
// Resolve symlinks: when launched via the `loupe-mcp` bin, argv[1] is a symlink into
// node_modules/.bin while import.meta.url is the real path — compare their realpaths.
function isEntrypoint(): boolean {
  try {
    return import.meta.url === pathToFileURL(realpathSync(argv[1] ?? "")).href;
  } catch {
    return false;
  }
}
if (isEntrypoint()) {
  await server.connect(new StdioServerTransport());
  console.error(`[loupe-mcp] connected · project=${PROJECT_KEY} · api=${API}`);
}
