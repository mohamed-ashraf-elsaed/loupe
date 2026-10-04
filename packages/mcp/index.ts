#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { argv } from "node:process";
import { existsSync } from "node:fs";
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
import { SelectionStore } from "./src/bridge/selection-store.ts";
import { AgentRegistry, AGENT_SWEEP_MS } from "./src/bridge/agent-registry.ts";
import { PresenceRegistry } from "./src/bridge/presence-registry.ts";
import { EventStore } from "./src/bridge/event-store.ts";
import { CompanionQueue, prependToResult } from "./src/bridge/companion-queue.ts";
import { activitySummary, sessionsFromEvents, sessionSummaryText } from "./src/bridge/session-manager.ts";
import { installHooksFile, HOOK_MARKER } from "./src/hooks/hook-installer.ts";
import { stateFilePath } from "./src/bridge/state-file.ts";
import { EventBus } from "./src/bridge/events.ts";
import { startHttpBridge } from "./src/bridge/http-bridge.ts";
import { createElementContextTools } from "./src/tools/element-context.ts";
import { createHandoffTools } from "./src/tools/handoff.ts";
import { CreatePrError, createPrForThread } from "./src/tools/create-pr.ts";
import { GitHubClient, GitHubError, resolveGitHubToken } from "./src/github/github-client.ts";
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
import type { Comment, Proposal, ThreadMessage } from "@loupekit/shared";

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
/** Where the browser hands us selections. 0 disables the bridge entirely. */
const BRIDGE_PORT = Number(process.env.LOUPE_BRIDGE_PORT ?? 9800);

// The bridge's shared state. Created eagerly so the tool handlers below can publish
// to it whether or not the listener ever came up — a busy port should not silence
// the panel, it should just mean the browser cannot reach us.
const store = new SelectionStore(Number(process.env.LOUPE_SELECTION_CAP ?? 50));
const registry = new AgentRegistry();
// Peers expire faster than agents — a browser closes quickly, a terminal does not.
const presence = new PresenceRegistry();
// Agent events from the hooks, and the companion queue the panel writes to. Both are
// optional at the bridge level; here they are always on, because this process is the
// one the hooks and the panel are talking to.
const events = new EventStore({ file: process.env.LOUPE_EVENT_FILE || undefined });
const companion = new CompanionQueue();
// Set once the bridge is up, so a tool can tell a person where to watch. Null when the
// bridge could not start, which the tool reports rather than inventing a URL.
let bridgeUrl: string | null = null;
const bus = new EventBus();
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
  // Tell any open panel. Best-effort: a browser that is not listening must never
  // make this tool call fail.
  bus.publishThread(id, stage === "resolved" ? "thread_resolved" : "status_changed", { status: stage });
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
  bus.publishThread(id, "preview_live", { author: proposal.author });
  return wrap(`Proposal saved for #${id}. The dev team can now review your modified HTML/CSS in the dashboard.`);
}


/**
 * Where the hook script lives.
 *
 * It is not next to the entry point in both cases: run from source it is `./hooks`,
 * and in the published package the entry is bundled into `dist/` so it is `../hooks`.
 * Resolving it wrongly would install a command pointing at a file that does not exist,
 * which fails silently — the hook simply never runs.
 */
function hookScriptPath(): string {
  const candidates = [
    new URL("./hooks/loupe-hook.mjs", import.meta.url).pathname,
    new URL("../hooks/loupe-hook.mjs", import.meta.url).pathname,
  ];
  return candidates.find((c) => existsSync(c)) ?? candidates[0]!;
}

const server = new McpServer({ name: "loupe", version: "0.11.0" });

/**
 * Carry any pending companion message on every tool result.
 *
 * The queue is taken only *after* the handler has returned, so a tool that throws does
 * not consume a message it never delivered. And it is acked here, in the same breath as
 * returning the result the agent will read — as close to "delivered exactly once" as a
 * request/response protocol allows.
 */
function withCompanion<T extends (...args: any[]) => any>(handler: T): T {
  return (async (...args: any[]) => {
    const result = await handler(...args);
    const pending = companion.take();
    if (!pending.length) return result;
    const wrapped = prependToResult(result, pending);
    companion.ack(pending.map((m) => m.id));
    return wrapped;
  }) as T;
}

/** Register a tool with the companion wrapper applied — the single chokepoint. */
function registerTool(name: string, description: string, schema: any, handler: any) {
  return (server as any).tool(name, description, schema, withCompanion(handler));
}
registerTool(
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
registerTool(
  "get_comment",
  "Get the full context for one comment: the request, the page, the target element's HTML, and its computed styles — everything needed to make the change.",
  { id: z.string().describe("The comment id from list_comments.") },
  getComment,
);
registerTool(
  "update_status",
  "Move a comment along the board. Set In Progress when you start it, and In Review when the change is ready for a human — only a person resolves a comment, so never set Resolved yourself.",
  { id: z.string(), status: STAGE_ARG },
  updateStatus,
);
registerTool(
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

// ---- element context (bridged from the browser) -----------------------------

const WS = process.env.LOUPE_WORKSPACE || process.cwd();

/** One thread fetcher, shared by every tool that needs one. */
async function fetchThreadById(id: string): Promise<Comment | null> {
  try {
    return (await api(`/v1/comments/${encodeURIComponent(id)}`)) as Comment;
  } catch {
    return null; // a missing thread is a normal answer, not a tool failure
  }
}

const elementTools = createElementContextTools({
  store,
  workspaceRoot: WS,
  mapperOptions: { maxFiles: Number(process.env.LOUPE_MAP_MAX_FILES ?? 4000) },
  fetchThread: fetchThreadById,
});

const SELECTION_ARGS = {
  thread_id: z.string().optional().describe("Work from a stored comment instead of a live selection."),
  selection_id: z.string().optional().describe(
    "A specific selection by correlation id (see get_selection_history). Omit for the most recent.",
  ),
};

registerTool(
  "get_latest_selection",
  "What the user last selected in the browser, with its element, computed styles and the source files most likely to render it. Use this when someone says \"this element\" or \"what I'm looking at\" and no thread exists yet.",
  {},
  async () => wrap((await elementTools.getLatestSelection()).text),
);
registerTool(
  "get_selection_history",
  "The recent element selections, newest first — useful when the user clicked a few things and you need to pick the right one.",
  { limit: z.number().int().positive().max(50).optional().describe("How many to list. Defaults to 10.") },
  async ({ limit }) => wrap((await elementTools.getSelectionHistory({ limit })).text),
);
registerTool(
  "get_element_context",
  "Full context for one element: the element, the page, its key computed styles, the ranked source files that probably render it, and a ready-made edit prompt. Pass thread_id to work from a stored comment, or nothing to use the latest live selection. Call this before editing anything.",
  {
    ...SELECTION_ARGS,
    include_prompt: z.boolean().optional().describe("Include the edit prompt. Defaults to true."),
  },
  async ({ thread_id, selection_id, include_prompt }) =>
    wrap((await elementTools.getElementContext({ thread_id, selection_id }, { include_prompt })).text),
);
registerTool(
  "find_source_for_selection",
  "Just the ranked source files for the current selection or a stored thread — for when you only need to know where the component lives. Heuristic: verify the top candidate before editing it.",
  SELECTION_ARGS,
  async ({ thread_id, selection_id }) =>
    wrap((await elementTools.findSourceForSelection({ thread_id, selection_id })).text),
);

// ---- companion + activity ---------------------------------------------------

registerTool(
  "get_companion_messages",
  "Read what the person watching has said while you were working. Messages are ALSO delivered automatically on every other tool result, so you rarely need this — use it when you want to check before finishing a task, or when someone asked you to wait for their input.",
  { drain: z.boolean().optional().describe("Set false to read without consuming. Default true.") },
  async ({ drain }) => {
    const messages = drain === false ? companion.peek() : companion.take();
    if (drain !== false) companion.ack(messages.map((m) => m.id));
    if (!messages.length) return wrap("No companion messages waiting.");
    return wrap(
      messages.map((m) => {
        const where = m.contexts?.length ? ` (re: ${m.contexts.map((c) => c.label ?? c.url ?? c.id ?? c.kind).join(", ")})` : "";
        const atts = m.attachments?.length ? ` [${m.attachments.map((a) => a.url).join(", ")}]` : "";
        return `[${m.at}] ${m.author?.name ? `${m.author.name}: ` : ""}${m.body}${where}${atts}`;
      }).join("\n"),
    );
  },
);

registerTool(
  "reply_to_companion",
  "Answer the person watching, in the panel they are looking at. Use this when a companion message needs a response, when you need a decision before continuing, or when you finish something they asked about.",
  {
    body: z.string().describe("Your reply. Markdown is fine."),
    inReplyTo: z.string().optional().describe("The id of the message you are answering."),
  },
  async ({ body, inReplyTo }) => {
    const reply = companion.addReply({ body, inReplyTo });
    bus.publishCompanion("reply", reply);
    return wrap(`Sent to the panel at ${reply.at}.`);
  },
);

registerTool(
  "get_activity_summary",
  "What this machine's agent sessions have been doing: sessions, tool-call counts, files touched, and whether a session is still live. Use it to understand what has already been tried before starting, or to answer \"what have you been working on?\".",
  {
    session_id: z.string().optional().describe("Just this session."),
    limit: z.number().int().positive().max(50).optional().describe("How many sessions to summarize. Default 5."),
  },
  async ({ session_id, limit }) => {
    const all = sessionsFromEvents(events.recent(events.size()));
    const picked = session_id ? all.filter((s) => s.id === session_id) : all.slice(0, limit ?? 5);
    if (!picked.length) {
      return wrap(
        events.size()
          ? `No session matched. Known sessions: ${all.map((s) => s.id).join(", ") || "(none)"}.`
          : "No agent events recorded yet. The hooks may not be installed — install_agent_hooks adds them.",
      );
    }
    return wrap(picked.map(sessionSummaryText).join("\n\n"));
  },
);

registerTool(
  "get_recent_events",
  "The raw agent event stream — tool calls, prompts, session starts and stops — newest first. Use it when you need to know exactly what has run, rather than a summary.",
  {
    limit: z.number().int().positive().max(200).optional().describe("How many events. Default 30."),
    type: z.string().optional().describe('Filter to one type, e.g. "tool_use" or "prompt_submit".'),
  },
  async ({ limit, type }) => {
    const events = events.latest(limit ?? 30).filter((e) => !type || e.type === type);
    if (!events.length) {
      return wrap(
        events.size === 0 && !type
          ? "No agent events recorded yet. The hooks may not be installed — install_agent_hooks adds them."
          : `No events${type ? ` of type ${type}` : ""} recorded.`,
      );
    }
    return wrap(
      events
        .map((e) => {
          const ok = (e.payload as any)?.ok === false ? " [FAILED]" : "";
          const files = e.files?.length ? ` — ${e.files.join(", ")}` : "";
          return `${e.at}  ${e.type}${e.tool ? ` (${e.tool})` : ""}${ok}: ${e.summary ?? ""}${files}`.trimEnd();
        })
        .join("\n"),
    );
  },
);

registerTool(
  "get_files_touched",
  "Every file the agent has touched in the recorded sessions, in first-seen order. Use it to see the blast radius of the work so far before adding to it.",
  {},
  async () => {
    const summary = activitySummary(events.recent(events.size()));
    if (!summary.files.length) {
      return wrap("No files recorded yet. The hooks may not be installed — install_agent_hooks adds them.");
    }
    const bySession = summary.sessions
      .filter((s) => s.files.length)
      .map((s) => `${s.active ? "●" : "○"} ${s.id}:\n  ${s.files.join("\n  ")}`)
      .join("\n\n");
    return wrap(`${summary.files.length} file${summary.files.length === 1 ? "" : "s"} touched:\n\n${bySession}`);
  },
);

registerTool(
  "get_dashboard_url",
  "The local URL of the live activity dashboard — a page a person can open to watch what the agent is doing right now. Give them this when they ask to see progress.",
  {},
  async () => {
    if (!bridgeUrl) {
      return wrap("The activity dashboard is not running — the bridge did not start. Agents still work; there is just nothing to watch.");
    }
    return wrap(`Open ${bridgeUrl}/monitor to watch agent activity live.\n\nIt is served by the local bridge and is read-only.`);
  },
);

registerTool(
  "install_agent_hooks",
  "Install the Claude Code hooks that report tool use, prompts and sessions to Loupe. Idempotent (running it twice changes nothing), backed up before writing, and it never touches another tool's hook entries. Opt-in: nothing installs these on its own.",
  {
    path: z.string().optional().describe("The settings file to write. Defaults to ~/.claude/settings.json."),
  },
  async ({ path: custom }) => {
    const script = process.env.LOUPE_HOOK_SCRIPT || hookScriptPath();
    const target = custom || process.env.LOUPE_CLAUDE_SETTINGS || `${process.env.HOME || ""}/.claude/settings.json`;
    const result = installHooksFile(target, script);
    if (result.error) return wrap(`Could not install: ${result.error}\n\nNothing was changed.`);
    if (!result.wrote) {
      return wrap(`Already installed and current — nothing to change (${result.preserved.length} events already wired).\n\nSettings: ${target}\nHook script: ${script}`);
    }
    const lines = [
      `Installed into ${target}.`,
      result.added.length ? `Added: ${result.added.join(", ")}` : null,
      result.repaired.length ? `Repaired (pointed somewhere stale): ${result.repaired.join(", ")}` : null,
      result.backup ? `Backup: ${result.backup}` : null,
      `Hook script: ${script}`,
      "",
      "Restart Claude Code for the hooks to take effect. Loupe's own hooks are marked with",
      `"${HOOK_MARKER}" and your other hook entries were left untouched.`,
    ].filter(Boolean);
    return wrap(lines.join("\n"));
  },
);

// ---- handoff: the agent's half of the workflow ------------------------------

const AGENT = {
  id: process.env.LOUPE_AGENT_ID || "loupe-agent",
  name: process.env.LOUPE_AGENT_NAME || "Claude Code",
};

const handoff = createHandoffTools({
  agent: AGENT,
  fetchThread: fetchThreadById,
  patchThread: async (id, patch) => {
    await api(`/v1/comments/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
  },
  postMessage: async (threadId, message) =>
    (await api(`/v1/comments/${encodeURIComponent(threadId)}/messages`, {
      method: "POST", body: JSON.stringify(message),
    })) as ThreadMessage,
  listMessages: async (threadId) =>
    (await api(`/v1/comments/${encodeURIComponent(threadId)}/messages`)) as ThreadMessage[],
});

registerTool(
  "mark_thread_addressed",
  "Hand a thread back to a human: it moves to In Review and, optionally, posts your closing note. Use this when the change is ready. It CANNOT resolve a thread — only a person does that — which is why there is no status argument.",
  {
    thread_id: z.string().describe("The thread you have addressed."),
    message: z.string().optional().describe("A short note for the reviewer — what changed and where to look. Include a preview URL if there is one."),
  },
  async ({ thread_id, message }) => wrap((await handoff.markThreadAddressed({ thread_id, message })).text),
);
registerTool(
  "add_thread_message",
  "Reply on a thread without changing its status — progress notes, questions, or the preview URL when it goes live. The status is left exactly as it was.",
  {
    thread_id: z.string(),
    message: z.string().describe("Markdown. Say something useful; a person reads this."),
  },
  async ({ thread_id, message }) => wrap((await handoff.addThreadMessage({ thread_id, message })).text),
);
registerTool(
  "get_thread_conversation",
  "The whole conversation on a thread: the original request, then every reply with its author. Read it before answering so you are not repeating something already said.",
  { thread_id: z.string() },
  async ({ thread_id }) => wrap((await handoff.getThreadConversation({ thread_id })).text),
);

registerTool(
  "create_pr_for_thread",
  "Open a pull request for a fix — or, more usually, add it to the one the repo already has. One working branch per repo accumulates every fix as its own commit, and the PR body keeps a table of them. If that PR was merged or closed, a fresh branch is started automatically. Use `get_element_context` first to find the file, then pass the full new contents of each file you changed.",
  {
    repo: z.string().describe('Owner/name, e.g. "acme/web".'),
    thread_id: z.string().describe("The thread this fix answers."),
    description: z.string().describe("One line for the PR table, e.g. \"larger checkout button\"."),
    files: z.array(z.object({
      path: z.string().describe("Path within the repo."),
      content: z.string().describe("The file's FULL new contents, not a diff."),
    })).min(1).describe("Every file you changed. They land as one atomic commit."),
    base_branch: z.string().optional().describe('What to branch from. Defaults to "main".'),
    branch_name: z.string().optional().describe("Override the branch name. Rarely needed."),
    revision_of: z.string().optional().describe("Set to a thread id when this is a revision — it gets its own revision-* branch rather than joining the accumulating one."),
  },
  async (args) => {
    // Resolve the token at call time, not at startup: `gh auth login` after the server
    // started should just work, and a missing token must read as advice, not a crash.
    const resolved = resolveGitHubToken();
    if (!resolved.token) return wrap(resolved.message);
    try {
      const result = await createPrForThread(
        { github: new GitHubClient(resolved.token), apiBase: API, adminKey: ADMIN, projectKey: PROJECT_KEY },
        {
          repo: args.repo, threadId: args.thread_id, description: args.description,
          files: args.files, baseBranch: args.base_branch, branchName: args.branch_name,
          revisionOf: args.revision_of,
        },
      );
      // Stamp the PR back onto the thread so the panel's chip has something to show,
      // and tell any open panel about it.
      await api(`/v1/comments/${encodeURIComponent(args.thread_id)}`, {
        method: "PATCH",
        body: JSON.stringify({ pr: { number: result.prNumber, url: result.prUrl, state: "open" } }),
      });
      bus.publishThread(args.thread_id, "pr_created", {
        number: result.prNumber, url: result.prUrl, branch: result.branch, commit: result.commit,
      });
      return wrap(
        `#${args.thread_id} → ${result.prUrl}\n\n${result.note}\n\n` +
        `Branch \`${result.branch}\` · commit \`${result.commit.slice(0, 7)}\` · outcome: ${result.outcome}.\n` +
        "The thread's status is unchanged — call `mark_thread_addressed` when the change is ready for review.",
      );
    } catch (e) {
      // GitHub's own message, token redacted; a refusal we raised; or something else.
      const text = e instanceof GitHubError || e instanceof CreatePrError ? e.message : String(e);
      return wrap(`Could not open the pull request: ${text}`);
    }
  },
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
  // The bridge first: it is how the browser reaches us, and the tools still work
  // without it, so a busy port must not stop the server from connecting.
  const bridge = BRIDGE_PORT ? await startHttpBridge(BRIDGE_PORT, { store, registry, presence, events, companion, bus }) : null;
  bridgeUrl = bridge?.url ?? null;

  // Register this agent so the panel's picker shows it, and keep it alive. The id is
  // derived from the identity, so a restart lands on the same row instead of leaving
  // a ghost behind for 30s.
  const self = registry.register({
    name: process.env.LOUPE_AGENT_NAME || "loupe-mcp",
    type: process.env.LOUPE_AGENT_TYPE || "claude-code",
    workspace: process.env.LOUPE_WORKSPACE || process.cwd(),
    cwd: process.cwd(),
  });
  const sweep = setInterval(() => {
    if (registry.sweep().length) bus.publish({ type: "agents", data: registry.list(), at: new Date().toISOString() });
    // A peer going quiet is worth broadcasting too — someone leaving the page matters
    // as much as someone arriving.
    if (presence.sweep().length) bus.publish({ type: "presence", data: presence.list(), at: new Date().toISOString() });
    registry.heartbeat(self.id);
  }, AGENT_SWEEP_MS);
  if (typeof sweep.unref === "function") sweep.unref();

  const shutdown = async () => {
    clearInterval(sweep);
    registry.unregister(self.id);
    await bridge?.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  await server.connect(new StdioServerTransport());
  console.error(
    `[loupe-mcp] connected · project=${PROJECT_KEY} · api=${API}` +
    (bridge ? ` · bridge=${bridge.url}` : " · bridge=disabled"),
  );
}
