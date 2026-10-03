/**
 * The companion queue.
 *
 * The problem this solves: a person watching an agent work notices something and says
 * so — but the agent is mid-task. Queueing the message and prepending it to the next
 * tool result is how it gets seen *during* the work rather than after it.
 *
 * The invariant the issue calls out is "no companion message is ever lost or delivered
 * twice", and those pull in opposite directions:
 * - Never twice → a delivery must remove it.
 * - Never lost → it must not be removed before it is actually handed over.
 *
 * So delivery is two steps: `take()` marks messages in flight and returns them, and the
 * caller `ack()`s once the result reached the agent. A failed tool call leaves them
 * queued, because the caller never acks.
 */

export interface CompanionMessage {
  id: string;
  at: string;
  /** Who sent it — the panel's user. */
  author?: { id: string; name: string };
  body: string;
  /** Element ids or urls the message was gathered with. */
  contexts?: { kind: string; id?: string; url?: string; label?: string }[];
  /** A screenshot or file the user attached. */
  attachments?: { url: string; kind: string; name?: string }[];
  /** The user held a mic rather than typed. */
  voice?: boolean;
}

export interface CompanionReply {
  id: string;
  at: string;
  /** The message being answered, when it was a direct reply. */
  inReplyTo?: string;
  body: string;
}

export class CompanionQueue {
  private queue: CompanionMessage[] = [];
  /** Taken but not yet acknowledged. Kept so a failure can put them back. */
  private inFlight: CompanionMessage[] = [];
  private replies: CompanionReply[] = [];
  private readonly replyCap: number;
  private readonly now: () => number;

  // Explicit fields, not constructor parameter properties — Node's strip-only TypeScript
  // mode rejects those and this file runs unbundled from source.
  constructor(replyCap = 100, now: () => number = Date.now) {
    this.replyCap = replyCap;
    this.now = now;
  }

  push(message: Omit<CompanionMessage, "id" | "at"> & { id?: string; at?: string }): CompanionMessage {
    const full: CompanionMessage = {
      ...message,
      id: message.id ?? `cm_${this.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      at: message.at ?? new Date().toISOString(),
    };
    this.queue.push(full);
    return full;
  }

  /** What is waiting, without taking it. Safe to call repeatedly. */
  peek(): CompanionMessage[] {
    return [...this.queue];
  }

  size(): number {
    return this.queue.length;
  }

  /** In-flight count, for the panel to show "delivering…". */
  pending(): number {
    return this.inFlight.length;
  }

  /**
   * Take everything waiting, marking it in flight.
   *
   * Deliberately *not* a plain drain: the caller must `ack()` for the messages to be
   * gone. If the tool call they were attached to throws, the queue still holds them.
   */
  take(): CompanionMessage[] {
    const taken = this.queue;
    this.queue = [];
    this.inFlight = [...this.inFlight, ...taken];
    return taken;
  }

  /** Confirm delivery. Only what was actually handed over is dropped. */
  ack(ids?: string[]): void {
    if (!ids) {
      this.inFlight = [];
      return;
    }
    const done = new Set(ids);
    this.inFlight = this.inFlight.filter((m) => !done.has(m.id));
  }

  /**
   * Put the in-flight messages back at the front, in their original order.
   *
   * Used when a delivery did not happen — the tool failed, or the transport went away.
   * Front, not back, because they were sent first and the conversation should read in
   * the order it was written.
   */
  requeue(): CompanionMessage[] {
    const restored = this.inFlight;
    this.inFlight = [];
    this.queue = [...restored, ...this.queue];
    return restored;
  }

  /** All messages, queued and in flight — what the panel shows. */
  list(): CompanionMessage[] {
    return [...this.inFlight, ...this.queue];
  }

  addReply(reply: Omit<CompanionReply, "id" | "at"> & { id?: string; at?: string }): CompanionReply {
    const full: CompanionReply = {
      ...reply,
      id: reply.id ?? `cr_${this.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      at: reply.at ?? new Date().toISOString(),
    };
    this.replies.push(full);
    if (this.replies.length > this.replyCap) this.replies = this.replies.slice(-this.replyCap);
    return full;
  }

  listReplies(limit = 50): CompanionReply[] {
    return this.replies.slice(-limit);
  }

  clear(): void {
    this.queue = [];
    this.inFlight = [];
  }
}

/**
 * The nudge prepended to a tool result.
 *
 * It has to be unmissable and short: this is the first thing the agent reads on its way
 * into a tool result it was expecting, and a long preamble is a preamble that gets
 * skimmed.
 */
export function companionPreamble(messages: CompanionMessage[]): string {
  const lines = messages.map((m) => {
    const where = m.contexts?.length
      ? ` (re: ${m.contexts.map((c) => c.label ?? c.url ?? c.id ?? c.kind).join(", ")})`
      : "";
    const atts = m.attachments?.length ? ` [${m.attachments.length} attachment(s)]` : "";
    return `- ${m.author?.name ? `${m.author.name}: ` : ""}${m.body}${where}${atts}`;
  });
  return [
    `⚠️ The person watching sent you ${messages.length} message${messages.length === 1 ? "" : "s"} while you were working. Read and act on this before continuing:`,
    ...lines,
    "",
    "Answer with reply_to_companion so it reaches them, then carry on.",
    "",
  ].join("\n");
}

/**
 * Prepend the preamble to a tool result, keeping the original intact.
 *
 * Written as a pure function over the MCP result shape so it can be tested without a
 * server: the failure that matters is dropping or reordering the original content, and
 * that is exactly what a test should pin.
 */
export function prependToResult<T extends { content?: unknown[] }>(result: T, messages: CompanionMessage[]): T {
  if (!messages.length) return result;
  const content = Array.isArray(result?.content) ? result.content : [];
  return { ...result, content: [{ type: "text", text: companionPreamble(messages) }, ...content] };
}
