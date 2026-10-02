/**
 * Presence.
 *
 * Who else has this page open. The only interesting part is expiry: a browser that is
 * closed or crashes sends no goodbye, so liveness is a heartbeat and silence past the
 * TTL means gone. Without that, the peer list slowly fills with ghosts and stops being
 * believed.
 *
 * Pure — the bridge and the panel both use it, and neither gets its own rules.
 */

export interface Peer {
  /** Stable per (page, user), so two tabs are one peer rather than two. */
  id: string;
  userId: string;
  name: string;
  /** The page they are on, normalized. */
  url: string;
  /** Epoch ms of the last heartbeat. */
  lastSeen: number;
  /** The tab, when the client can tell them apart. */
  tab?: string;
}

/** Silence after which a peer is presumed gone. Shorter than an agent's — a browser closes fast. */
export const PEER_TTL_MS = 20_000;
/** How often a client should heartbeat. Comfortably inside the TTL. */
export const PEER_HEARTBEAT_MS = 6_000;

/** Stable across reloads and tabs of the same page, so a refresh does not duplicate you. */
export function peerId(url: string, userId: string): string {
  let h = 0x811c9dc5;
  const input = `${url}\u0000${userId}`;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `p_${h.toString(16).padStart(8, "0")}`;
}

export interface JoinInput {
  url: string;
  userId: string;
  name: string;
  tab?: string;
}

export function joinPresence(peers: Peer[], input: JoinInput, now: number = Date.now()): Peer[] {
  const id = peerId(input.url, input.userId);
  const without = peers.filter((p) => p.id !== id);
  return [...without, { id, ...input, lastSeen: now }];
}

/** Refresh one peer. An unknown id is ignored — the next join revives it. */
export function heartbeatPresence(peers: Peer[], id: string, now: number = Date.now()): Peer[] {
  if (!peers.some((p) => p.id === id)) return peers;
  return peers.map((p) => (p.id === id ? { ...p, lastSeen: now } : p));
}

export function leavePresence(peers: Peer[], id: string): Peer[] {
  return peers.filter((p) => p.id !== id);
}

/** Drop anything silent for the TTL. Inclusive at the boundary. */
export function sweepPresence(peers: Peer[], now: number = Date.now(), ttlMs: number = PEER_TTL_MS): Peer[] {
  return peers.filter((p) => now - p.lastSeen < ttlMs);
}

/** Peers on one page, excluding the viewer — "who else is here". */
export function peersOnPage(peers: Peer[], url: string, viewerId?: string): Peer[] {
  return peers.filter((p) => p.url === url && p.id !== viewerId);
}

/**
 * Cursor updates arrive faster than anyone can usefully render them, so a client
 * throttles. Returns the delay to wait before sending the next one — 0 when it can go
 * immediately, so the first move is never delayed.
 */
export function throttleDelay(lastSentAt: number, now: number = Date.now(), minMs = 80): number {
  if (!lastSentAt) return 0;
  const elapsed = now - lastSentAt;
  return elapsed >= minMs ? 0 : minMs - elapsed;
}

/** Initials for a tiny avatar: two words → two letters, one word → one. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0]!.slice(0, 1).toUpperCase();
  return (words[0]!.slice(0, 1) + words[words.length - 1]!.slice(0, 1)).toUpperCase();
}
