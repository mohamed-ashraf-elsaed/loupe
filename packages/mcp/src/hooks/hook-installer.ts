/**
 * Installing Loupe's hooks into Claude Code's settings.
 *
 * This writes into a file the user owns and did not ask us to touch, so the rules are
 * stricter than usual:
 *
 * - **Never clobber.** Read-modify-write, and every key we do not own is preserved
 *   byte-for-byte in value. Pre-existing hooks — theirs — are left alone.
 * - **Idempotent.** Running it twice produces the same file and reports no changes.
 * - **Reversible.** A backup is written before the first modification.
 * - **Never fatal.** A read-only home, a malformed file, no disk: all of it is reported
 *   and none of it stops the agent from working.
 *
 * And it is **opt-in**, not run on startup. An MCP server that silently edits your
 * agent's settings the first time you run it is the kind of thing that gets a package
 * uninstalled, whatever it says in its README.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** Marked by this substring, so an existing entry can be recognised and repaired. */
export const HOOK_MARKER = "loupe-hook";

/** The events Loupe listens to, and what each one is for. */
export const HOOK_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "SubagentStop",
  "Notification",
  "SessionEnd",
] as const;

export type HookEvent = (typeof HOOK_EVENTS)[number];

export interface HookCommand {
  type: "command";
  command: string;
  timeout?: number;
}

export interface HookEntry {
  matcher?: string;
  hooks: HookCommand[];
}

export interface ClaudeSettings {
  hooks?: Record<string, HookEntry[]>;
  [key: string]: unknown;
}

/** How the hook is invoked. Quoted, because a path with a space is normal. */
export function hookCommand(scriptPath: string, event: HookEvent): string {
  return `node "${scriptPath}" ${event}`;
}

export interface InstallResult {
  settings: ClaudeSettings;
  /** False when the file already said exactly this — the second run of the acceptance test. */
  changed: boolean;
  added: HookEvent[];
  repaired: HookEvent[];
  /** What was already there and left alone. */
  preserved: HookEvent[];
  error?: string;
}

/**
 * Merge Loupe's hooks into a settings object.
 *
 * Pure, so it can be tested against fixtures — empty, populated, malformed — without
 * touching a real file. That is the whole reason it is separate from the write.
 */
export function installHooks(
  settings: ClaudeSettings | null | undefined,
  scriptPath: string,
): InstallResult {
  // A malformed value must not be propagated; start from a clean object but keep the
  // keys we cannot understand, so nothing is silently dropped.
  const base: ClaudeSettings = settings && typeof settings === "object" && !Array.isArray(settings) ? { ...settings } : {};
  const hooks: Record<string, HookEntry[]> = base.hooks && typeof base.hooks === "object" && !Array.isArray(base.hooks)
    ? { ...base.hooks }
    : {};

  const added: HookEvent[] = [];
  const repaired: HookEvent[] = [];
  const preserved: HookEvent[] = [];

  for (const event of HOOK_EVENTS) {
    const existing = Array.isArray(hooks[event]) ? [...(hooks[event] as HookEntry[])] : [];
    const want = hookCommand(scriptPath, event);

    // Find ours: an entry with a command mentioning the marker. `matcher` is left
    // alone, and an entry that is not ours is never rewritten.
    let found = false;
    let alreadyRight = false;
    const next = existing.map((entry) => {
      if (!entry || typeof entry !== "object" || !Array.isArray(entry.hooks)) return entry;
      const commands = entry.hooks.map((h) => {
        if (!h || typeof h !== "object" || typeof h.command !== "string") return h;
        if (!h.command.includes(HOOK_MARKER)) return h;
        if (!found) {
          found = true;
          if (h.command === want) alreadyRight = true;
          else return { ...h, command: want };
        }
        return h;
      });
      return { ...entry, hooks: commands };
    });

    if (found && alreadyRight) {
      preserved.push(event);
      hooks[event] = existing;
      continue;
    }

    if (found) {
      // Ours but pointing somewhere stale (a moved checkout, a different port) — repair
      // in place rather than adding a second one.
      repaired.push(event);
      hooks[event] = next;
      continue;
    }

    added.push(event);
    // Appended, never prepended: someone else's hook may depend on running first.
    hooks[event] = [...existing, { hooks: [{ type: "command", command: want }] }];
  }

  return {
    settings: { ...base, hooks },
    changed: added.length > 0 || repaired.length > 0,
    added,
    repaired,
    preserved,
  };
}

export interface WriteResult extends InstallResult {
  /** Where the untouched copy went, when one was written. */
  backup?: string;
  wrote: boolean;
}

/**
 * Install into a settings file on disk.
 *
 * Never throws: every failure is returned as `error` with `wrote: false`. Startup must
 * not depend on this succeeding.
 */
export function installHooksFile(path: string, scriptPath: string, opts: { backup?: boolean } = {}): WriteResult {
  const empty: WriteResult = { settings: {}, changed: false, added: [], repaired: [], preserved: [], wrote: false };
  try {
    let current: ClaudeSettings | null = null;
    if (existsSync(path)) {
      const raw = readFileSync(path, "utf8");
      if (raw.trim()) {
        try {
          current = JSON.parse(raw);
        } catch (e) {
          // Do not write over a file we cannot parse — it may hold settings we would
          // destroy, and a syntax error is something a person should see.
          return { ...empty, error: `settings file is not valid JSON (${(e as Error).message}); left untouched` };
        }
      }
    }

    const result = installHooks(current, scriptPath);
    if (!result.changed) return { ...result, wrote: false };

    let backup: string | undefined;
    if (opts.backup !== false && existsSync(path)) {
      backup = `${path}.loupe-backup`;
      copyFileSync(path, backup);
    }

    mkdirSync(dirname(path), { recursive: true });
    // Atomic: a crash mid-write must not leave the user without a settings file.
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(result.settings, null, 2)}\n`);
    renameSync(tmp, path);

    return { ...result, backup, wrote: true };
  } catch (e) {
    return { ...empty, error: (e as Error).message };
  }
}
