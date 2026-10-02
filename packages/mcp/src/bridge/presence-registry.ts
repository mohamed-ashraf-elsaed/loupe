/**
 * Presence on the bridge: who else has this page open.
 *
 * Same shape as the agent registry, and for the same reason — browsers die without
 * saying goodbye (a closed tab, a crash, a laptop lid), so liveness is a heartbeat and
 * silence past the TTL is treated as gone. Without expiry the peer list fills with
 * ghosts and stops being believed.
 *
 * The rules themselves (`joinPresence`, `sweepPresence`, the TTL) live in
 * `@loupekit/shared`, so the panel and the bridge cannot drift apart on what "here"
 * means.
 */

import {
  PEER_TTL_MS,
  heartbeatPresence,
  joinPresence,
  leavePresence,
  peerId,
  sweepPresence,
  type Peer,
} from "@loupekit/shared";

export interface PresenceJoin {
  url: string;
  userId: string;
  name: string;
  tab?: string;
}

export class PresenceRegistry {
  private peers: Peer[] = [];
  private readonly ttlMs: number;
  private readonly now: () => number;

  // Explicit fields, not constructor parameter properties — Node's strip-only
  // TypeScript mode rejects those and this file runs unbundled from source.
  constructor(ttlMs: number = PEER_TTL_MS, now: () => number = Date.now) {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error("ttlMs must be positive");
    this.ttlMs = ttlMs;
    this.now = now;
  }

  /** Join or refresh. The same person on the same page is one peer, not two. */
  join(input: PresenceJoin): Peer {
    this.peers = joinPresence(this.peers, input, this.now());
    return this.peers.find((p) => p.id === peerId(input.url, input.userId))!;
  }

  heartbeat(id: string): Peer | null {
    const before = this.peers.length;
    this.peers = heartbeatPresence(this.peers, id, this.now());
    if (this.peers.length !== before) return null;
    return this.peers.find((p) => p.id === id) ?? null;
  }

  leave(id: string): boolean {
    const had = this.peers.some((p) => p.id === id);
    this.peers = leavePresence(this.peers, id);
    return had;
  }

  /** Everyone on a page, the viewer excluded — "who else is here". */
  list(url?: string, viewerId?: string): Peer[] {
    const live = this.peers;
    if (!url) return live;
    return live.filter((p) => p.url === url && p.id !== viewerId);
  }

  /**
   * Drop anything silent for the TTL. Returns what went, so the caller can broadcast —
   * a peer vanishing matters as much as one arriving.
   */
  sweep(): Peer[] {
    const before = this.peers;
    const after = sweepPresence(before, this.now(), this.ttlMs);
    if (after.length === before.length) return [];
    const kept = new Set(after.map((p) => p.id));
    const gone = before.filter((p) => !kept.has(p.id));
    this.peers = after;
    return gone;
  }

  size(): number {
    return this.peers.length;
  }
}
