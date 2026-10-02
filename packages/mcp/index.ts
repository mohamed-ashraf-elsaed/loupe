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

import { Buffer } from "node:buffer";
import {
  CHANGE_TYPE_LABELS,
  CHANGE_TYPES,
  COMMENT_PRIORITIES,
  COMMENT_STAGES,
  normalizeChangeType,
  normalizePriority,
  normalizeStatus,
  PRIORITY_LABELS,
  STAGE_LABELS,
} from "@loupekit/shared";
import type { Comment, Proposal } from "@loupekit/shared";

/**
 * Accepted values for a status argument: the five board stages, plus the legacy
 * `open` / `done` aliases so an agent configured before the board still works
 * (they normalize to `queue` / `resolved`).
 */
const STAGE_ARG = z
  .string()
  .describe(`Stage: ${COMMENT_STAGES.join(" / ")}. Legacy "open" and "done" are accepted too.`);

/** Accepted values for a priority argument. */
const PRIORITY_ARG = z.string().describe(`Priority, most urgent first: ${COMMENT_PRIORITIES.join(" / ")}.`);

/** Accepted values for a change-type argument. */
const CHANGE_TYPE_ARG = z.string().describe(`Change type: ${CHANGE_TYPES.join(" / ")}.`);

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

type Content =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };
/** Wrap tool output. Bare strings become text blocks; images pass through. */
const wrap = (...parts: (string | Content)[]) => ({
  content: parts.map((p) => (typeof p === "string" ? { type: "text" as const, text: p } : p)),
});

/**
 * Fetch a screenshot so Claude gets the actual pixels (an image content block),
 * not just a URL string. Handles both object-storage URLs (server mode) and inline
 * data URLs (offline mode). Returns null on any failure so the text still goes out.
 */
async function fetchImage(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    if (url.startsWith("data:")) {
      const m = /^data:([^;,]+)[^,]*,(.*)$/s.exec(url);
      if (!m) return null;
      return { mimeType: m[1] || "image/png", data: m[2]!.replace(/^base64,/, "") };
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    const mimeType = res.headers.get("content-type") || "image/png";
    // Only inline real images — a recording (video/*) can't be an image block.
    if (!mimeType.startsWith("image/")) return null;
    return { mimeType, data: Buffer.from(await res.arrayBuffer()).toString("base64") };
  } catch {
    return null;
  }
}

/** How to name a comment's target in a one-liner. Free notes have no element. */
const targetOf = (c: Comment) =>
  c.kind === "free"
    ? "page-level note"
    : c.anchor.testid ? `[data-testid="${c.anchor.testid}"]` : c.anchor.cssPath;

/** The one-line summary: the title, or the first line of the description. */
const titleOf = (c: Comment) => c.title || (c.body.split("\n")[0] ?? "").trim() || "(no title)";

/** Fetch the reporter's IMAGE attachments as content blocks (videos stay URL text). */
async function imageBlocks(attachments?: { url: string; kind: string }[]) {
  const out: { data: string; mimeType: string }[] = [];
  for (const a of attachments ?? []) {
    if (a.kind !== "image") continue;
    const img = await fetchImage(a.url);
    if (img) out.push(img);
  }
  return out;
}

/** `**Attachments:**` block for the text part, when there are any. */
const attachmentLines = (c: Comment) =>
  (c.attachments ?? []).length
    ? ["", "**Attachments:**", ...(c.attachments ?? []).map((a) => `- ${a.kind === "video" ? "🎬" : "🖼"} ${a.name ?? "attachment"} — ${a.url}`)]
    : [];

// Tool handlers are exported so they can be unit-tested in-process (the stdio
// transport below only runs when this file is the entrypoint).

export async function listComments(
  { status, priority, changeType, repo, branch, url }:
    { status?: string; priority?: string; changeType?: string; repo?: string; branch?: string; url?: string },
) {
  const q = new URLSearchParams({ projectKey: PROJECT_KEY });
  if (url) q.set("url", url);
  // Push the filters to the API so it does the heavy lifting; the checks below
  // remain as a safety net for a backend that predates them.
  if (status) q.set("status", status);
  if (priority) q.set("priority", priority);
  if (changeType) q.set("changeType", changeType);
  if (repo) q.set("repo", repo);
  if (branch) q.set("branch", branch);
  let comments = (await api(`/v1/comments?${q}`)) as Comment[];
  if (status) {
    const want = normalizeStatus(status);
    comments = comments.filter((c) => normalizeStatus(c.status) === want);
  }
  if (priority) {
    const want = normalizePriority(priority);
    comments = comments.filter((c) => normalizePriority(c.priority) === want);
  }
  if (changeType) {
    const want = normalizeChangeType(changeType);
    comments = comments.filter((c) => normalizeChangeType(c.changeType) === want);
  }
  if (repo) comments = comments.filter((c) => c.repo === repo);
  if (branch) comments = comments.filter((c) => c.branch === branch);
  if (!comments.length) return wrap("No comments match.");
  const lines = comments.map(
    (c) =>
      `- [${STAGE_LABELS[normalizeStatus(c.status)]}] ${PRIORITY_LABELS[normalizePriority(c.priority)]} · ${CHANGE_TYPE_LABELS[normalizeChangeType(c.changeType)]} · #${c.id} — ${titleOf(c)}: ${c.body}` +
      `\n    ↳ ${targetOf(c)} on ${c.url} (by ${c.author.name})${c.repo ? ` [${c.repo}${c.branch ? ` @ ${c.branch}` : ""}]` : ""}`,
  );
  return wrap(`${comments.length} comment(s):\n\n${lines.join("\n")}\n\nUse get_comment(id) for the full element context.`);
}

export async function getComment({ id }: { id: string }) {
  const c = (await api(`/v1/comments/${encodeURIComponent(id)}`)) as Comment;
  // Free notes aren't tied to an element — skip the element HTML/styles sections.
  if (c.kind === "free") {
    const text = [
      `# Feedback #${c.id} from ${c.author.name} (${STAGE_LABELS[normalizeStatus(c.status)]})`,
      ``,
      `**Priority:** ${PRIORITY_LABELS[normalizePriority(c.priority)]} · **Change type:** ${CHANGE_TYPE_LABELS[normalizeChangeType(c.changeType)]}`,
      `**Title:** ${titleOf(c)}`,
      `**Note:** ${c.body}`,
      `**Page:** ${c.url}`,
      `**Type:** Free note — a page-level comment, not tied to a specific element.`,
      ...attachmentLines(c),
    ].join("\n");
    const imgs = await imageBlocks(c.attachments);
    return wrap(text, ...imgs.map((i) => ({ type: "image" as const, data: i.data, mimeType: i.mimeType })));
  }
  const text = [
    `# Feedback #${c.id} from ${c.author.name} (${STAGE_LABELS[normalizeStatus(c.status)]})`,
    ``,
    `**Title:** ${titleOf(c)}`,
    `**Request:** ${c.body}`,
    `**Page:** ${c.url}`,
    `**Target element:** ${c.anchor.testid ? `[data-testid="${c.anchor.testid}"]` : `\`${c.anchor.cssPath}\``}`,
    c.screenshot ? `**Screenshot:** ${c.screenshot}` : ``,
    c.recording ? `**Screen recording (webm):** ${c.recording}` : ``,
    ...attachmentLines(c),
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
    // Surface an existing proposal so Claude can iterate rather than start over.
    ...(c.proposal
      ? [
          ``,
          `## Existing proposal (by ${c.proposal.author ?? "unknown"})`,
          c.proposal.notes ? c.proposal.notes : ``,
          "```html",
          c.proposal.html,
          "```",
          ...(c.proposal.css ? ["```css", c.proposal.css, "```"] : []),
        ]
      : []),
    ``,
    `---`,
    `When you've rewritten this UI, call \`propose_change(id: "${c.id}", html, css?, notes?)\` so the dev team sees your modified HTML/CSS in the dashboard.`,
  ].filter(Boolean).join("\n");

  // Attach real pixels: the auto screenshot and every image the reporter attached.
  const images = [
    ...(c.screenshot ? [await fetchImage(c.screenshot)] : []),
    ...(await imageBlocks(c.attachments)),
  ].filter((i): i is { data: string; mimeType: string } => i !== null);
  return wrap(text, ...images.map((i) => ({ type: "image" as const, data: i.data, mimeType: i.mimeType })));
}

export async function updateStatus({ id, status }: { id: string; status: string }) {
  // Accept the legacy names too, and store the canonical stage.
  const stage = normalizeStatus(status);
  await api(`/v1/comments/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status: stage }) });
  return wrap(`#${id} → ${STAGE_LABELS[stage]}`);
}

export async function proposeChange({ id, html, css, notes }: { id: string; html: string; css?: string; notes?: string }) {
  const proposal: Proposal = {
    html,
    css,
    notes,
    author: "Claude Code via MCP",
    createdAt: new Date().toISOString(),
  };
  await api(`/v1/comments/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ proposal }) });
  return wrap(`Proposal saved for #${id}. The dev team can now review your modified HTML/CSS in the dashboard.`);
}

const server = new McpServer({ name: "loupe", version: "0.10.10" });
server.tool(
  "list_comments",
  "List Loupe product-feedback comments for the project as a task backlog. Each item carries its board stage, priority and change type, so you can start with the most urgent. Use this to see what a PM has flagged, then work through the items.",
  {
    status: STAGE_ARG.optional().describe(`Filter by stage. Omit for all.`),
    priority: PRIORITY_ARG.optional().describe("Filter by priority."),
    changeType: CHANGE_TYPE_ARG.optional().describe("Filter by change type."),
    repo: z.string().optional().describe('Filter to one repository, e.g. "org/repo".'),
    branch: z.string().optional().describe('Filter to one branch, e.g. "main".'),
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
  "Move a comment along the board. Set In Progress when you start it, and In Review when the change is ready for a human — only a person resolves a comment, so never set Resolved yourself.",
  { id: z.string(), status: STAGE_ARG },
  updateStatus,
);
server.tool(
  "propose_change",
  "Submit the modified UI for a comment: the rewritten HTML (and optional CSS) that resolves the PM's request. This stores your proposal on the comment so the dev team can review the code and a live preview in the dashboard. Use get_comment first to see the original element, its computed styles, and the screenshot.",
  {
    id: z.string().describe("The comment id from list_comments."),
    html: z.string().describe("The modified element markup that implements the requested change."),
    css: z.string().optional().describe("Accompanying CSS. Omit if the styling is inlined in the HTML."),
    notes: z.string().optional().describe("A short explanation of what you changed and why."),
  },
  proposeChange,
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
