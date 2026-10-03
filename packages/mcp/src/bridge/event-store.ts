/**
 * The agent event store.
 *
 * Bounded on purpose. Hooks fire on every tool call, so an unbounded store turns a
 * long session into a memory leak — the cap is the feature, not a limitation. Events
 * are kept newest-last so "the last N" is a slice rather than a sort.
 *
 * Persistence is debounced: a hook fires on every tool use, and writing the whole file
 * synchronously for each one would put disk I/O in the agent's hot path. The store is
 * always correct in memory, and `flush()` makes it durable on demand.
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

export type AgentEventType =
  | "session_start"
  | "session_end"
  | "prompt_submit"
  | "tool_use"
  | "tool_result"
  | "notification"
  | "subagent_start"
  | "subagent_stop"
  | (string & {});

export interface AgentEvent {
  id: string;
  at: string;
  type: AgentEventType;
  sessionId?: string;
  /** The tool name, for tool events. */
  tool?: string;
  /** A short human-readable line. */
  summary?: string;
  /** Files the event touched, already extracted. */
  files?: string[];
  /** Anything else the hook sent, already truncated. */
  payload?: Record<string, unknown>;
}

export interface NewEvent {
  type: AgentEventType;
  sessionId?: string;
  tool?: string;
  summary?: string;
  files?: string[];
  payload?: Record<string, unknown>;
  at?: string;
}

/** How many events to keep. */
export const EVENT_CAP = 1000;
/**
 * Any single string kept from a payload is cut here.
 *
 * Tool inputs contain entire file contents and tool results contain entire pages; a
 * few of those and the store is megabytes of text nobody will read. 2000 chars keeps
 * the useful head and makes the truncation obvious.
 */
export const PAYLOAD_CHAR_CAP = 2000;
/** How long after a write the file is updated. */
const FLUSH_DEBOUNCE_MS = 250;

/** Cut a string to the cap, saying so rather than silently shortening it. */
export function truncate(value: string, cap: number = PAYLOAD_CHAR_CAP): string {
  if (value.length <= cap) return value;
  return `${value.slice(0, cap)}… [truncated ${value.length - cap} chars]`;
}

/**
 * Shrink a payload to something worth storing.
 *
 * Recursive, and both directions matter: a deep object and a long string are the same
 * problem, and an array of long strings is the common case (a glob's matches, a diff).
 */
export function shrinkPayload(value: unknown, depth = 0, cap: number = PAYLOAD_CHAR_CAP): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return truncate(value, cap);
  if (typeof value === "number" || typeof value === "boolean") return value;
  // Past a few levels it is structure nobody reads — keep the shape, drop the content.
  if (depth >= 4) return "[deeper]";
  if (Array.isArray(value)) {
    const head = value.slice(0, 20).map((v) => shrinkPayload(v, depth + 1, cap));
    return value.length > 20 ? [...head, `… ${value.length - 20} more`] : head;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 30);
    for (const [k, v] of entries) out[k] = shrinkPayload(v, depth + 1, cap);
    return out;
  }
  return String(value);
}

function newId(): string {
  return `ev_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export class EventStore {
  private events: AgentEvent[] = [];
  private readonly cap: number;
  private readonly file?: string;
  private writeTimer?: ReturnType<typeof setTimeout>;
  private dirty = false;

  constructor(opts: { cap?: number; file?: string } = {}) {
    this.cap = opts.cap && opts.cap > 0 ? opts.cap : EVENT_CAP;
    this.file = opts.file;
    if (this.file) this.load();
  }

  /** Read what is on disk, ignoring anything unusable. A store that will not load must
   *  not stop the bridge — the events are a convenience, not the product. */
  private load() {
    if (!this.file || !existsSync(this.file)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.file, "utf8"));
      if (!Array.isArray(parsed)) return;
      this.events = parsed.filter((e: any) => e && typeof e.id === "string" && typeof e.type === "string").slice(-this.cap);
    } catch {
      // A corrupt file is dropped rather than fatal; the next flush overwrites it.
      this.events = [];
    }
  }

  add(input: NewEvent): AgentEvent {
    const event: AgentEvent = {
      id: newId(),
      at: input.at ?? new Date().toISOString(),
      type: input.type,
      sessionId: input.sessionId,
      tool: input.tool ? truncate(input.tool, 200) : undefined,
      summary: input.summary ? truncate(input.summary, 500) : undefined,
      files: input.files?.length ? [...new Set(input.files)].slice(0, 50) : undefined,
      payload: input.payload ? (shrinkPayload(input.payload) as Record<string, unknown>) : undefined,
    };
    this.events.push(event);
    // Trim from the front: the newest are what anyone wants.
    if (this.events.length > this.cap) this.events = this.events.slice(-this.cap);
    this.scheduleFlush();
    return event;
  }

  /** Newest last. `limit` takes the most recent N, oldest of those first. */
  recent(limit = 50): AgentEvent[] {
    if (limit <= 0) return [];
    return this.events.slice(-limit);
  }

  /** Newest first, for a feed. */
  latest(limit = 50): AgentEvent[] {
    return this.recent(limit).reverse();
  }

  size(): number {
    return this.events.length;
  }

  clear(): void {
    this.events = [];
    this.scheduleFlush();
  }

  private scheduleFlush() {
    if (!this.file) return;
    this.dirty = true;
    if (this.writeTimer) return;
    this.writeTimer = setTimeout(() => {
      this.writeTimer = undefined;
      this.flush();
    }, FLUSH_DEBOUNCE_MS);
    // Never hold the process open for a convenience write.
    if (typeof this.writeTimer.unref === "function") this.writeTimer.unref();
  }

  /** Write now. Atomic: a temp file renamed into place, so a crash cannot leave a
   *  half-written store that then fails to parse on the next start. */
  flush(): void {
    if (!this.file || !this.dirty) return;
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = undefined;
    }
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.events));
      renameSync(tmp, this.file);
      this.dirty = false;
    } catch {
      // Read-only home, no disk, a full filesystem — none of which should stop the
      // agent from working.
    }
  }
}
