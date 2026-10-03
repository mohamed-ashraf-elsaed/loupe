/**
 * Turning a Claude Code hook payload into an event worth storing.
 *
 * The hook names are Claude Code's; the event names are ours. Keeping the mapping in
 * one pure function means the payload shapes can be tested against fixtures rather than
 * discovered by running an agent and hoping.
 *
 * It is deliberately forgiving: an unrecognised event is stored under its own lowercased
 * name rather than dropped, because the event that would explain a gap is exactly the
 * one a strict mapping would throw away.
 */

import type { AgentEventType, NewEvent } from "../bridge/event-store.ts";
import { extractFiles } from "../bridge/session-manager.ts";

/** Claude Code hook name → our event type. */
const EVENT_MAP: Record<string, AgentEventType> = {
  sessionstart: "session_start",
  sessionend: "session_end",
  userpromptsubmit: "prompt_submit",
  pretooluse: "tool_use",
  posttooluse: "tool_result",
  subagentstop: "subagent_stop",
  subagentstart: "subagent_start",
  notification: "notification",
  stop: "turn_end",
  precompact: "compact",
};

export function eventTypeFor(hookName: string): AgentEventType {
  const key = String(hookName || "").toLowerCase().replace(/[^a-z]/g, "");
  return EVENT_MAP[key] ?? (hookName ? String(hookName) : "unknown");
}

/** A short line that says what happened, for a feed nobody wants to parse JSON to read. */
export function summarize(hookName: string, payload: Record<string, any>): string | undefined {
  const type = eventTypeFor(hookName);
  const at = (s: unknown) => (typeof s === "string" && s.trim() ? s.trim() : undefined);

  if (type === "prompt_submit") return at(payload.prompt)?.slice(0, 200);
  if (type === "notification") return at(payload.message)?.slice(0, 200);
  if (type === "tool_use" || type === "tool_result") {
    const tool = at(payload.tool_name);
    return tool ? `${type === "tool_use" ? "used" : "finished"} ${tool}` : undefined;
  }
  if (type === "session_start" || type === "session_end") {
    // The directory is the useful part — "which repo was this?" is the first question.
    return at(payload.cwd) ?? at(payload.source);
  }
  return undefined;
}

/**
 * Whether a tool result failed.
 *
 * `PostToolUse` carries `tool_response`, whose shape is per-tool. An explicit error
 * field is trusted; otherwise a non-zero-looking status. Left undefined when it cannot
 * be told, rather than guessing false — "we do not know" is a real answer.
 */
export function toolFailed(payload: Record<string, any>): boolean | undefined {
  const resp = payload.tool_response;
  if (resp && typeof resp === "object") {
    if (typeof resp.is_error === "boolean") return resp.is_error;
    if (typeof resp.error === "string" && resp.error) return true;
    if (typeof resp.success === "boolean") return !resp.success;
    if (typeof resp.exit_code === "number") return resp.exit_code !== 0;
    if (typeof resp.status === "number") return resp.status >= 400;
  }
  return undefined;
}

export function normalizeHookEvent(
  hookName: string,
  payload: Record<string, any>,
  at?: string,
): NewEvent {
  const type = eventTypeFor(hookName);
  const sessionId = typeof payload.session_id === "string" ? payload.session_id : undefined;
  const tool = typeof payload.tool_name === "string" ? payload.tool_name : undefined;

  // Files come from wherever the tool put them, plus whatever the payload mentions by
  // path. Two sources, because one of them is usually absent.
  const files = [...new Set([...extractFiles(payload.tool_input ?? {}), ...extractFiles(payload)])];

  const extra: Record<string, unknown> = {};
  const failed = type === "tool_result" ? toolFailed(payload) : undefined;
  if (failed !== undefined) extra.ok = !failed;

  return {
    type,
    sessionId,
    tool,
    summary: summarize(hookName, payload),
    files: files.length ? files : undefined,
    at,
    payload: Object.keys(extra).length ? { ...extra, hook: hookName } : { hook: hookName },
  };
}
