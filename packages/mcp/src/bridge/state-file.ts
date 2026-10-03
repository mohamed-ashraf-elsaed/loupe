/**
 * Where the bridge says which port it is on.
 *
 * The bridge binds an ephemeral port (0) so two developers on one machine, or a
 * leftover process, cannot collide. But the hook script runs as a *separate process*
 * spawned by Claude Code, and has no way to be told what the port turned out to be.
 *
 * So the bridge publishes it. A small JSON file in the user's state directory, written
 * on start and removed on close, read by the hook. That is the whole mechanism — it is
 * a note left on the kitchen table, not a service discovery system.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface BridgeState {
  url: string;
  port: number;
  pid: number;
  at: string;
}

export function stateDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.LOUPE_STATE_DIR || join(homedir(), ".loupe");
}

export function stateFilePath(env: NodeJS.ProcessEnv = process.env): string {
  return join(stateDir(env), "bridge.json");
}

/** Write the state. Never throws: no home directory is not a reason to lose the bridge. */
export function writeBridgeState(port: number, env: NodeJS.ProcessEnv = process.env): string | null {
  const file = stateFilePath(env);
  try {
    mkdirSync(dirname(file), { recursive: true });
    const state: BridgeState = { url: `http://127.0.0.1:${port}`, port, pid: process.pid, at: new Date().toISOString() };
    writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
    return file;
  } catch {
    // A read-only home means hooks cannot find us — they degrade to doing nothing,
    // which is the correct failure for an optional relay.
    return null;
  }
}

/**
 * Remove the state, but only if it is still ours.
 *
 * A second bridge may have started and overwritten the file after we did; deleting it
 * then would strand the newer one's hooks.
 */
export function clearBridgeState(port: number, env: NodeJS.ProcessEnv = process.env): void {
  const file = stateFilePath(env);
  try {
    if (!existsSync(file)) return;
    const state = JSON.parse(readFileSync(file, "utf8")) as Partial<BridgeState>;
    if (state?.port !== port) return;
    rmSync(file, { force: true });
  } catch {
    // Already gone, or unreadable — nothing to do either way.
  }
}

export function readBridgeState(env: NodeJS.ProcessEnv = process.env): BridgeState | null {
  try {
    const state = JSON.parse(readFileSync(stateFilePath(env), "utf8")) as BridgeState;
    return state && typeof state.url === "string" ? state : null;
  } catch {
    return null;
  }
}
