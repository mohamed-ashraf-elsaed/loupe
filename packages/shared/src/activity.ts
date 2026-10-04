/**
 * The activity contract.
 *
 * The panel renders a live feed of what an agent (or the host app) is doing.
 * Nothing here knows *who* produces the events: the bridge, an MCP-driven agent
 * and the host application all push through the same shape, and the SDK emits its
 * own operations into it too, so the view is useful before a bridge exists.
 */

/** How a run is doing, as shown by the status dot in the panel. */
export type ActivityStatus = "idle" | "working" | "error";

export const ACTIVITY_STATUSES: ActivityStatus[] = ["idle", "working", "error"];

export const ACTIVITY_STATUS_LABELS: Record<ActivityStatus, string> = {
  idle: "Idle",
  working: "Working",
  error: "Error",
};

/** Event severity — drives the row's colour, not its filtering. */
export type ActivityLevel = "info" | "warn" | "error";

/** One thing that happened. */
export interface ActivityEvent {
  id: string;
  /** ISO timestamp. */
  at: string;
  /**
   * The tool or operation, used as the feed's chip label — e.g. "Read", "Edit",
   * "Bash" for an agent, or "comment.create" / "capture.screenshot" for Loupe's own
   * operations. Chips group by this exact string.
   */
  kind: string;
  /** The one-line human summary. */
  label: string;
  /** Optional second line (a command, a path, an error message). */
  detail?: string;
  level?: ActivityLevel;
  /** Files this event touched — rolled up into the "files" micro-stat. */
  files?: string[];
  /** The comment this event is about, when the server recorded one. */
  commentId?: string;
  /** Who did it, when the server knows. */
  actor?: { id: string; name: string };
}

/** What a caller supplies; the SDK fills in `id` and `at`. */
export type ActivityEventInput = Omit<ActivityEvent, "id" | "at"> & { at?: string; id?: string };

/** Rolled-up numbers for the summary card and the micro-stat row. */
export interface ActivitySummary {
  status: ActivityStatus;
  /** Events currently held (capped — the feed is a live view, not an archive). */
  events: number;
  /** Errors seen this session. */
  errors: number;
  /** Distinct files touched. */
  files: number;
  /** Milliseconds from the first event to now. */
  durationMs: number;
  /** Per-`kind` counts, most frequent first. */
  byKind: { kind: string; count: number }[];
}

/** "2m 14s" / "48s" / "—" for a duration in ms. */
export function formatDuration(ms: number): string {
  if (!ms || ms < 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  if (m < 60) return rest ? `${m}m ${rest}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/**
 * Derive the summary from a feed. Pure, so the panel and any other consumer agree
 * on what the numbers mean.
 */
export function summarizeActivity(
  events: ActivityEvent[],
  status: ActivityStatus = "idle",
  now: number = Date.now(),
): ActivitySummary {
  const files = new Set<string>();
  const kinds = new Map<string, number>();
  let errors = 0;
  let first = Infinity;

  for (const e of events) {
    for (const f of e.files ?? []) files.add(f);
    kinds.set(e.kind, (kinds.get(e.kind) ?? 0) + 1);
    if (e.level === "error") errors++;
    const t = Date.parse(e.at);
    if (!Number.isNaN(t)) first = Math.min(first, t);
  }

  return {
    status,
    events: events.length,
    errors,
    files: files.size,
    durationMs: events.length && first !== Infinity ? Math.max(0, now - first) : 0,
    byKind: [...kinds.entries()]
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind)),
  };
}
