/**
 * Sessions, folded from the event stream.
 *
 * Deliberately derived rather than maintained. A parallel "sessions" structure has to
 * be updated on every event and reconciled on every restart, and the way that fails is
 * by drifting: the store says one thing, the manager another. Folding 1000 events is
 * microseconds, so it is done on read and cannot disagree with the events.
 */

import type { AgentEvent } from "./event-store.ts";

export interface SessionSummary {
  id: string;
  startedAt: string;
  endedAt?: string;
  /** No `session_end` seen and recent enough to be considered live. */
  active: boolean;
  prompts: number;
  /** Total tool calls. */
  tools: number;
  /** Per tool name, most used first. */
  toolCounts: { tool: string; count: number }[];
  /** Files the session touched, in first-seen order. */
  files: string[];
  eventCount: number;
  lastEventAt: string;
}

/** A session with no `session_end` is live until it has been quiet this long. */
export const SESSION_IDLE_MS = 10 * 60 * 1000;

const FILE_KEYS = ["file", "file_path", "path", "filepath", "notebook_path", "filename", "target_file"];

/**
 * Pull file paths out of a tool's payload.
 *
 * Heuristic by nature — the payload shape differs per tool and every tool in the world
 * invents its own key. Deliberately conservative: a key that says `file`, `path` or
 * `file_path`, or a value that reads like a path with an extension. A false negative
 * costs a line in a list; a false positive makes the list untrustworthy.
 */
export function extractFiles(payload: unknown, depth = 0): string[] {
  if (depth >= 5 || !payload || typeof payload !== "object") return [];
  const out: string[] = [];

  const consider = (key: string, value: unknown) => {
    if (typeof value !== "string" || !value) return;
    const keyed = FILE_KEYS.includes(key.toLowerCase());
    const pathish = /^[\w./~-]+\/[\w./~-]*\.[A-Za-z0-9]+$/.test(value) || /^[\w.-]+\.[A-Za-z0-9]{1,8}$/.test(value);
    if (keyed && value.length < 500) out.push(value);
    else if (pathish && !keyed && /[/.]/.test(value) && !value.includes(" ")) out.push(value);
  };

  if (Array.isArray(payload)) {
    for (const item of payload) out.push(...extractFiles(item, depth + 1));
    return out;
  }
  for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
    consider(k, v);
    if (v && typeof v === "object") out.push(...extractFiles(v, depth + 1));
  }
  return out;
}

/**
 * Fold events into sessions, newest session first.
 *
 * An event with no `sessionId` lands in a synthetic catch-all rather than being dropped:
 * a hook that forgets to send one is a hook to fix, but losing the events it sent would
 * hide the problem.
 */
export function sessionsFromEvents(events: AgentEvent[], now: number = Date.now()): SessionSummary[] {
  const byId = new Map<string, AgentEvent[]>();
  for (const e of events) {
    const id = e.sessionId || "unattributed";
    const list = byId.get(id) ?? [];
    list.push(e);
    byId.set(id, list);
  }

  const sessions: SessionSummary[] = [];
  for (const [id, list] of byId) {
    const sorted = [...list].sort((a, b) => a.at.localeCompare(b.at));
    const counts = new Map<string, number>();
    const files: string[] = [];
    let prompts = 0;
    let tools = 0;
    let endedAt: string | undefined;

    for (const e of sorted) {
      if (e.type === "prompt_submit") prompts++;
      if (e.type === "tool_use") {
        tools++;
        if (e.tool) counts.set(e.tool, (counts.get(e.tool) ?? 0) + 1);
      }
      if (e.type === "session_end") endedAt = e.at;
      for (const f of e.files ?? []) if (!files.includes(f)) files.push(f);
      // Tool payloads carry the paths even when the hook did not extract them.
      for (const f of extractFiles(e.payload)) if (!files.includes(f)) files.push(f);
    }

    const lastEventAt = sorted[sorted.length - 1]!.at;
    const quiet = now - Date.parse(lastEventAt) > SESSION_IDLE_MS;
    sessions.push({
      id,
      startedAt: sorted[0]!.at,
      endedAt,
      // An explicit end wins; otherwise a session that has gone quiet is not "live"
      // just because no hook said goodbye — a killed terminal never does.
      active: !endedAt && !quiet,
      prompts,
      tools,
      toolCounts: [...counts.entries()]
        .map(([tool, count]) => ({ tool, count }))
        .sort((a, b) => b.count - a.count || a.tool.localeCompare(b.tool)),
      files,
      eventCount: sorted.length,
      lastEventAt,
    });
  }

  return sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/** One line an agent can read: what happened, in this session, so far. */
export function sessionSummaryText(s: SessionSummary): string {
  const parts = [
    `${s.active ? "● live" : "○ ended"} ${s.id}`,
    `${s.prompts} prompt${s.prompts === 1 ? "" : "s"}`,
    `${s.tools} tool call${s.tools === 1 ? "" : "s"}`,
    `${s.files.length} file${s.files.length === 1 ? "" : "s"} touched`,
  ];
  const top = s.toolCounts.slice(0, 3).map((t) => `${t.tool} ×${t.count}`).join(", ");
  return `${parts.join(" · ")}${top ? `\n   most used: ${top}` : ""}`;
}

export interface ActivitySummary {
  totals: { events: number; tools: number; files: number; failures: number; sessions: number };
  sessions: SessionSummary[];
  /** Across every session, most used first. */
  toolCounts: { tool: string; count: number }[];
  /** Across every session, in first-seen order. */
  files: string[];
}

/**
 * One aggregation, used by the dashboard and by `get_activity_summary`.
 *
 * Shared on purpose: a page that counted its own way would eventually disagree with
 * what an agent is told, and then neither would be trusted.
 */
export function activitySummary(events: AgentEvent[], opts: { sessionLimit?: number; now?: number } = {}): ActivitySummary {
  const sessions = sessionsFromEvents(events, opts.now);
  const counts = new Map<string, number>();
  const files: string[] = [];
  let tools = 0;
  let failures = 0;

  // Sessions are newest-first for display, but the file list is documented as
  // "first-seen" — so walk them oldest-first, or the list reads backwards.
  for (const s of [...sessions].reverse()) {
    for (const t of s.toolCounts) counts.set(t.tool, (counts.get(t.tool) ?? 0) + t.count);
    tools += s.tools;
    for (const f of s.files) if (!files.includes(f)) files.push(f);
  }
  for (const e of events) {
    if (e.type === "tool_result" && (e.payload as any)?.ok === false) failures++;
  }

  return {
    totals: { events: events.length, tools, files: files.length, failures, sessions: sessions.length },
    sessions: opts.sessionLimit ? sessions.slice(0, opts.sessionLimit) : sessions,
    toolCounts: [...counts.entries()]
      .map(([tool, count]) => ({ tool, count }))
      .sort((a, b) => b.count - a.count || a.tool.localeCompare(b.tool)),
    files,
  };
}
