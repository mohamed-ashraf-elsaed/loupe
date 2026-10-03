#!/usr/bin/env node
/**
 * The Loupe hook.
 *
 * Claude Code runs this on each configured event and hands the event on stdin. It
 * forwards to the bridge and gets out of the way.
 *
 * Three rules, all of them about not being the reason someone's agent misbehaves:
 *  - **Never block.** A short timeout, and nothing is awaited that could hang.
 *  - **Never throw.** A non-zero exit prints noise into the agent's session, and a
 *    hook that fails is worse than a hook that did nothing.
 *  - **Never write to stdout.** Claude Code interprets hook stdout; a stray line could
 *    be read as a decision. Diagnostics go to stderr only when LOUPE_HOOK_DEBUG is set.
 *
 * The bridge binds an ephemeral port, so it publishes where it can be found rather
 * than the port being baked into this command.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const TIMEOUT_MS = 1200;

function debug(...args) {
  if (process.env.LOUPE_HOOK_DEBUG) console.error("[loupe-hook]", ...args);
}

function readStdin() {
  return new Promise((resolve) => {
    // A hook can be run with no stdin at all; resolve empty rather than hang.
    if (process.stdin.isTTY) return resolve("");
    let data = "";
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve(data);
    };
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", finish);
    process.stdin.on("error", finish);
    // Claude Code always closes stdin, but a wedged pipe must not hold the agent.
    setTimeout(finish, 500).unref?.();
  });
}

function stateFile() {
  const dir = process.env.LOUPE_STATE_DIR || join(homedir(), ".loupe");
  return join(dir, "bridge.json");
}

function bridgeUrl() {
  if (process.env.LOUPE_BRIDGE_URL) return process.env.LOUPE_BRIDGE_URL.replace(/\/$/, "");
  try {
    const state = JSON.parse(readFileSync(stateFile(), "utf8"));
    if (state && typeof state.url === "string" && state.url) return state.url.replace(/\/$/, "");
  } catch {
    // No bridge has run on this machine, or the file is stale. Either way there is
    // nothing to report to, and that is not an error.
  }
  return null;
}

async function main() {
  const event = process.argv[2] || "unknown";
  const raw = await readStdin();
  const url = bridgeUrl();
  if (!url) {
    debug("no bridge state file; nothing to report to");
    return;
  }

  let payload = {};
  if (raw.trim()) {
    try {
      payload = JSON.parse(raw);
    } catch {
      // Keep the raw text; a hook that sends something unparseable still tells us the
      // event happened and when.
      payload = { raw: raw.slice(0, 2000) };
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    await fetch(`${url}/events/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event, payload, at: new Date().toISOString() }),
      signal: controller.signal,
    });
  } catch (e) {
    debug("forward failed:", e?.message ?? e);
  } finally {
    clearTimeout(timer);
  }
}

// Exit 0 whatever happened — see the rules at the top.
main()
  .catch((e) => debug("unexpected:", e?.message ?? e))
  .finally(() => process.exit(0));
