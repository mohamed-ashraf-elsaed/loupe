/**
 * The bridge's event bus — the Server-Sent Events channel.
 *
 * "Sent to agent… PR opened… preview live" has to arrive without a refresh, which
 * means the MCP tools need a way to push. This is that way, and it is deliberately
 * **best-effort**: publishing must never throw into a tool call, because a broken
 * browser tab is not a reason for `update_status` to fail.
 */

import type { AgentInfo } from "./agent-registry.ts";

export type ThreadEventType = "pr_created" | "preview_live" | "thread_resolved" | (string & {});

export type BridgeEvent =
  | { type: "selection"; at: string; data: unknown }
  | { type: "agents"; at: string; data: AgentInfo[] }
  | { type: "presence"; at: string; data: unknown[] }
  | { type: "thread"; at: string; threadId: string; eventType: ThreadEventType; data?: unknown };

export type Subscriber = (event: BridgeEvent) => void;

export class EventBus {
  private subscribers = new Set<Subscriber>();

  /** Returns an unsubscribe function; calling it twice is safe. */
  subscribe(fn: Subscriber): () => void {
    this.subscribers.add(fn);
    return () => { this.subscribers.delete(fn); };
  }

  count(): number {
    return this.subscribers.size;
  }

  /**
   * Broadcast to everyone. A subscriber that throws is dropped rather than allowed
   * to break the loop — a dead SSE connection would otherwise silence every other
   * client behind it.
   */
  publish(event: BridgeEvent): void {
    for (const fn of [...this.subscribers]) {
      try {
        fn(event);
      } catch {
        this.subscribers.delete(fn);
      }
    }
  }

  /** Publish a thread update. The seam the MCP tools use. */
  publishThread(threadId: string, eventType: ThreadEventType, data?: unknown): void {
    this.publish({ type: "thread", threadId, eventType, data, at: new Date().toISOString() });
  }

  clear(): void {
    this.subscribers.clear();
  }
}
