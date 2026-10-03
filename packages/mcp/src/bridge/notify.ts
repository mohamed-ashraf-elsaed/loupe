/**
 * Desktop notifications.
 *
 * Best-effort by design. There is no portable API: each desktop has its own tool, and
 * any of them may be missing, sandboxed away, or refuse to run from a background
 * process. So this either works or says nothing — it never throws and never blocks, and
 * it reports which of those happened rather than claiming success.
 *
 * Two things matter more than the notification itself:
 *  - **No shell.** The title and body come from a person's message, and a message is
 *    arbitrary text. Arguments are passed as an array to `spawn` with `shell: false`, so
 *    a body containing `; rm -rf ~` is a body, not a command.
 *  - **Escaping for AppleScript**, which has no argv — the text is interpolated into a
 *    script, so quotes and backslashes must be neutralised.
 */

import { spawn } from "node:child_process";

export type NotifyPlatform = "linux" | "darwin" | "win32" | "unsupported";

export interface NotifyPlan {
  platform: NotifyPlatform;
  command: string;
  args: string[];
  /** Set when the platform has a notification tool we know how to call. */
  usable: boolean;
  reason?: string;
}

/**
 * Escape for an AppleScript string literal.
 *
 * Backslash first, or the escapes added afterwards get escaped again.
 */
export function escapeAppleScript(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ");
}

/**
 * What to run, without running it — so the platform rules can be tested anywhere.
 */
export function planNotification(title: string, body: string, platform: string = process.platform): NotifyPlan {
  if (platform === "linux") {
    // notify-send ships with libnotify, which every mainstream desktop has.
    return { platform: "linux", command: "notify-send", args: ["--app-name=Loupe", title, body], usable: true };
  }
  if (platform === "darwin") {
    const script = `display notification "${escapeAppleScript(body)}" with title "${escapeAppleScript(title)}"`;
    return { platform: "darwin", command: "osascript", args: ["-e", script], usable: true };
  }
  if (platform === "win32") {
    // A toast needs a module or a signed app id; a balloon tip needs a GUI process we
    // are not. Rather than pretend, Windows reports itself as unsupported.
    return { platform: "win32", command: "", args: [], usable: false, reason: "no portable notification tool on Windows" };
  }
  return { platform: "unsupported", command: "", args: [], usable: false, reason: `unknown platform ${platform}` };
}

export interface NotifyOptions {
  /** Set false to make every call a no-op. */
  enabled?: boolean;
  platform?: string;
  /** Injected so a test can assert without spawning anything. */
  run?: (command: string, args: string[]) => void;
}

export interface NotifyResult {
  sent: boolean;
  reason?: string;
}

/** Truncate so a long message does not become an unreadable wall on screen. */
export function clip(text: string, cap = 200): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length <= cap ? oneLine : `${oneLine.slice(0, cap - 1)}…`;
}

/**
 * Show a notification. Never throws, never waits.
 *
 * Detached and unref'd: the agent's process must not be held open by a desktop popup,
 * and it must not wait for a notification daemon to answer.
 */
export function notify(title: string, body: string, opts: NotifyOptions = {}): NotifyResult {
  if (opts.enabled === false) return { sent: false, reason: "notifications are off" };

  const plan = planNotification(clip(title, 80), clip(body), opts.platform);
  if (!plan.usable) return { sent: false, reason: plan.reason };

  const run = opts.run ?? defaultRun;
  try {
    run(plan.command, plan.args);
    return { sent: true };
  } catch (e) {
    // A missing tool, a sandbox, a permissions prompt — none of which is our problem.
    return { sent: false, reason: (e as Error).message };
  }
}

function defaultRun(command: string, args: string[]): void {
  const child = spawn(command, args, {
    // No shell: the body is arbitrary text from a person.
    shell: false,
    stdio: "ignore",
    detached: true,
  });
  // A tool that does not exist fails asynchronously; swallow it here so it cannot
  // become an unhandled 'error' event and take the process down.
  child.on("error", () => {});
  child.unref();
}
