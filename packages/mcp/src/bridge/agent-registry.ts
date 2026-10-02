/**
 * The agent registry.
 *
 * Every running agent registers with the bridge so the panel can show *which*
 * agents are around to hand work to. Agents die without saying goodbye — a crashed
 * process, a killed terminal — so liveness is a heartbeat rather than a flag, and
 * silence past the TTL is treated as gone.
 */

export interface AgentInfo {
  id: string;
  name: string;
  /** "claude-code", "cursor", anything — the caller's label. */
  type: string;
  /** The workspace root, so two agents in different repos are distinguishable. */
  workspace: string;
  cwd?: string;
  /** Epoch ms of the last heartbeat. */
  lastSeen: number;
}

export interface AgentRegistration {
  name: string;
  type: string;
  workspace: string;
  cwd?: string;
}

/** Silence after which an agent is presumed gone. */
export const AGENT_STALE_MS = 30_000;
/** How often the sweep runs. */
export const AGENT_SWEEP_MS = 10_000;

/**
 * A deterministic id from the identity fields.
 *
 * Deliberately *not* random: an agent that restarts must land on the same row, or
 * every crash would leave a ghost in the picker until its TTL expired. FNV-1a —
 * small, stable, and no dependency.
 */
export function agentId(reg: Pick<AgentRegistration, "type" | "workspace" | "name">): string {
  const input = `${reg.type}\u0000${reg.workspace}\u0000${reg.name}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `ag_${h.toString(16).padStart(8, "0")}`;
}

export class AgentRegistry {
  private agents = new Map<string, AgentInfo>();
  private readonly staleMs: number;
  private readonly now: () => number;

  // Explicit fields, not constructor parameter properties — Node's strip-only
  // TypeScript mode rejects those, and these files run unbundled from source.
  constructor(staleMs: number = AGENT_STALE_MS, now: () => number = Date.now) {
    if (!Number.isFinite(staleMs) || staleMs <= 0) throw new Error("staleMs must be positive");
    this.staleMs = staleMs;
    this.now = now;
  }

  /** Register or refresh. Re-registering the same identity is a heartbeat. */
  register(reg: AgentRegistration): AgentInfo {
    const id = agentId(reg);
    const info: AgentInfo = { ...reg, id, lastSeen: this.now() };
    this.agents.set(id, info);
    return info;
  }

  /** Refresh an existing agent. Unknown ids are ignored — the next register revives it. */
  heartbeat(id: string): AgentInfo | null {
    const existing = this.agents.get(id);
    if (!existing) return null;
    const info = { ...existing, lastSeen: this.now() };
    this.agents.set(id, info);
    return info;
  }

  /** Live agents only, oldest registration order. */
  list(): AgentInfo[] {
    return [...this.agents.values()];
  }

  unregister(id: string): boolean {
    return this.agents.delete(id);
  }

  /**
   * Drop anything silent for the TTL. Returns what was evicted.
   *
   * Inclusive at the boundary: "30s of silence" means an agent that last spoke
   * exactly 30s ago is gone, which is what anyone reading the constant expects.
   */
  sweep(): AgentInfo[] {
    const now = this.now();
    const gone: AgentInfo[] = [];
    for (const [id, info] of this.agents) {
      if (now - info.lastSeen >= this.staleMs) {
        this.agents.delete(id);
        gone.push(info);
      }
    }
    return gone;
  }

  size(): number {
    return this.agents.size;
  }
}
