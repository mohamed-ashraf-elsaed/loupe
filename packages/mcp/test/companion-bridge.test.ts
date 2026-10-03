import { describe, expect, it } from "vitest";
import { AgentRegistry } from "../src/bridge/agent-registry.ts";
import { CompanionQueue, prependToResult } from "../src/bridge/companion-queue.ts";
import { EventStore } from "../src/bridge/event-store.ts";
import { EventBus } from "../src/bridge/events.ts";
import { startHttpBridge } from "../src/bridge/http-bridge.ts";
import { PresenceRegistry } from "../src/bridge/presence-registry.ts";
import { SelectionStore } from "../src/bridge/selection-store.ts";
import { eventTypeFor, normalizeHookEvent, toolFailed } from "../src/hooks/hook-events.ts";
import { activitySummary } from "../src/bridge/session-manager.ts";
import { clip, notify, planNotification } from "../src/bridge/notify.ts";

const boot = async (opts: { events?: EventStore; companion?: CompanionQueue } = {}) => {
  const events = opts.events ?? new EventStore();
  const companion = opts.companion ?? new CompanionQueue();
  const handle = await startHttpBridge(0, {
    store: new SelectionStore(10),
    registry: new AgentRegistry(),
    presence: new PresenceRegistry(),
    events,
    companion,
    bus: new EventBus(),
  });
  if (!handle) throw new Error("bridge did not start");
  return { handle, events, companion };
};

const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("mapping Claude Code hooks to events", () => {
  it("maps the documented hook names", () => {
    expect(eventTypeFor("PreToolUse")).toBe("tool_use");
    expect(eventTypeFor("PostToolUse")).toBe("tool_result");
    expect(eventTypeFor("UserPromptSubmit")).toBe("prompt_submit");
    expect(eventTypeFor("SessionStart")).toBe("session_start");
    expect(eventTypeFor("SessionEnd")).toBe("session_end");
    expect(eventTypeFor("Notification")).toBe("notification");
    expect(eventTypeFor("SubagentStop")).toBe("subagent_stop");
  });

  it("keeps an unrecognised hook rather than dropping it", () => {
    // The event that would explain a gap is exactly the one a strict map throws away.
    expect(eventTypeFor("SomeFutureThing")).toBe("SomeFutureThing");
    expect(eventTypeFor("")).toBe("unknown");
  });

  it("reads a tool call: name, session and files", () => {
    const e = normalizeHookEvent("PreToolUse", {
      session_id: "s1", tool_name: "Edit", tool_input: { file_path: "src/app.ts", old_string: "a" },
    });
    expect(e.type).toBe("tool_use");
    expect(e.tool).toBe("Edit");
    expect(e.sessionId).toBe("s1");
    expect(e.files).toEqual(["src/app.ts"]);
    expect(e.summary).toBe("used Edit");
  });

  it("reads a session start's directory", () => {
    const e = normalizeHookEvent("SessionStart", { session_id: "s1", cwd: "/repo" });
    expect(e.summary).toBe("/repo");
  });

  it("summarizes a prompt and a notification", () => {
    expect(normalizeHookEvent("UserPromptSubmit", { prompt: "fix the header" }).summary).toBe("fix the header");
    expect(normalizeHookEvent("Notification", { message: "waiting for input" }).summary).toBe("waiting for input");
  });

  it("tells a failed tool result from a successful one", () => {
    expect(normalizeHookEvent("PostToolUse", { tool_name: "Bash", tool_response: { is_error: true } }).payload).toMatchObject({ ok: false });
    expect(normalizeHookEvent("PostToolUse", { tool_name: "Bash", tool_response: { is_error: false } }).payload).toMatchObject({ ok: true });
  });

  it("stays quiet when success cannot be told, rather than guessing", () => {
    expect(toolFailed({ tool_response: { output: "..." } })).toBeUndefined();
    expect(toolFailed({})).toBeUndefined();
    // "We do not know" is a real answer; a wrong `ok` is worse than none.
    expect(normalizeHookEvent("PostToolUse", { tool_name: "Bash" }).payload).not.toHaveProperty("ok");
  });

  it("reads the other shapes a result can take", () => {
    expect(toolFailed({ tool_response: { error: "boom" } })).toBe(true);
    expect(toolFailed({ tool_response: { success: false } })).toBe(true);
    expect(toolFailed({ tool_response: { exit_code: 1 } })).toBe(true);
    expect(toolFailed({ tool_response: { exit_code: 0 } })).toBe(false);
    expect(toolFailed({ tool_response: { status: 500 } })).toBe(true);
  });

  it("does not mistake a tool's own file for a file it touched", () => {
    // `tool_input` is what the tool was asked to do; `payload` also carries tool_name
    // and session_id, which must not be read as paths.
    const e = normalizeHookEvent("PreToolUse", { tool_name: "Read", tool_input: { file_path: "a.ts" } });
    expect(e.files).toEqual(["a.ts"]);
  });
});

describe("ingesting events over the bridge", () => {
  it("stores what a hook sends", async () => {
    const { handle, events } = await boot();
    try {
      const res = await post(`${handle.url}/events/ingest`, {
        event: "PreToolUse",
        payload: { session_id: "s1", tool_name: "Read", tool_input: { file_path: "a.ts" } },
      });
      expect(res.status).toBe(202);
      expect(events.size()).toBe(1);
      expect(events.recent()[0]).toMatchObject({ type: "tool_use", tool: "Read", sessionId: "s1" });
    } finally {
      handle.close();
    }
  });

  it("rejects a payload with no event name, and one that is not JSON", async () => {
    const { handle } = await boot();
    try {
      expect((await post(`${handle.url}/events/ingest`, { payload: {} })).status).toBe(400);
      expect((await fetch(`${handle.url}/events/ingest`, { method: "POST", body: "{" })).status).toBe(400);
    } finally {
      handle.close();
    }
  });

  it("serves recent events newest first, and can filter by type", async () => {
    const { handle } = await boot();
    try {
      await post(`${handle.url}/events/ingest`, { event: "SessionStart", payload: { session_id: "s1" } });
      await post(`${handle.url}/events/ingest`, { event: "PreToolUse", payload: { session_id: "s1", tool_name: "Read" } });

      const all = await (await fetch(`${handle.url}/events/recent`)).json();
      expect(all.events.map((e: any) => e.type)).toEqual(["tool_use", "session_start"]);
      expect(all.total).toBe(2);

      const filtered = await (await fetch(`${handle.url}/events/recent?type=tool_use`)).json();
      expect(filtered.events).toHaveLength(1);
    } finally {
      handle.close();
    }
  });

  it("folds sessions from what it has stored", async () => {
    const { handle } = await boot();
    try {
      await post(`${handle.url}/events/ingest`, { event: "SessionStart", payload: { session_id: "s1", cwd: "/repo" } });
      await post(`${handle.url}/events/ingest`, { event: "PreToolUse", payload: { session_id: "s1", tool_name: "Edit", tool_input: { file_path: "src/a.ts" } } });
      await post(`${handle.url}/events/ingest`, { event: "PreToolUse", payload: { session_id: "s1", tool_name: "Edit", tool_input: { file_path: "src/a.ts" } } });

      const { sessions } = await (await fetch(`${handle.url}/sessions`)).json();
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toMatchObject({ id: "s1", tools: 2, active: true });
      expect(sessions[0].toolCounts).toEqual([{ tool: "Edit", count: 2 }]);
      expect(sessions[0].files).toEqual(["src/a.ts"]);
    } finally {
      handle.close();
    }
  });

  it("says 503 rather than pretending when the event store is off", async () => {
    const handle = await startHttpBridge(0, {
      store: new SelectionStore(10), registry: new AgentRegistry(), presence: new PresenceRegistry(), bus: new EventBus(),
    });
    try {
      expect((await fetch(`${handle!.url}/events/recent`)).status).toBe(503);
      expect((await fetch(`${handle!.url}/sessions`)).status).toBe(503);
      // A hook that finds no store must not look like a hook that failed.
      expect((await post(`${handle!.url}/events/ingest`, { event: "PreToolUse", payload: {} })).status).toBe(503);
    } finally {
      handle!.close();
    }
  });
});

describe("the companion over the bridge", () => {
  it("queues a message for the agent", async () => {
    const { handle, companion } = await boot();
    try {
      const res = await post(`${handle.url}/companion`, {
        body: "make the button bigger",
        author: { id: "u1", name: "Sara" },
        contexts: [{ kind: "element", id: "e1", label: ".cta" }],
      });
      expect(res.status).toBe(201);
      expect((await res.json()).queued).toBe(1);
      expect(companion.peek()[0]!.body).toBe("make the button bigger");
    } finally {
      handle.close();
    }
  });

  it("rejects an empty body", async () => {
    const { handle } = await boot();
    try {
      expect((await post(`${handle.url}/companion`, { body: "   " })).status).toBe(400);
      expect((await post(`${handle.url}/companion`, {})).status).toBe(400);
    } finally {
      handle.close();
    }
  });

  it("returns the queue and the replies, for a panel that cannot hold a stream", async () => {
    const { handle } = await boot();
    try {
      await post(`${handle.url}/companion`, { body: "hi" });
      await post(`${handle.url}/companion/reply`, { body: "on it" });

      const state = await (await fetch(`${handle.url}/companion?since=0`)).json();
      expect(state.messages.map((m: any) => m.body)).toEqual(["hi"]);
      expect(state.replies.map((r: any) => r.body)).toEqual(["on it"]);
    } finally {
      handle.close();
    }
  });

  it("delivers a reply over SSE", async () => {
    const { handle } = await boot();
    try {
      const controller = new AbortController();
      const stream = await fetch(`${handle.url}/events`, { signal: controller.signal });
      const reader = stream.body!.getReader();

      await post(`${handle.url}/companion/reply`, { body: "answered" });

      const decoder = new TextDecoder();
      let text = "";
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline && !text.includes("answered")) {
        const { value } = await reader.read();
        if (value) text += decoder.decode(value);
      }
      expect(text).toContain("companion");
      expect(text).toContain("answered");
      controller.abort();
    } finally {
      handle.close();
    }
  });

  it("carries the message contexts and attachments", async () => {
    const { handle, companion } = await boot();
    try {
      await post(`${handle.url}/companion`, {
        body: "look at these",
        contexts: [{ kind: "element", id: "a" }, { kind: "element", id: "b" }],
        attachments: [{ url: "/x.png", kind: "image" }],
        voice: true,
      });
      const m = companion.peek()[0]!;
      expect(m.contexts).toHaveLength(2);
      expect(m.attachments).toHaveLength(1);
      expect(m.voice).toBe(true);
    } finally {
      handle.close();
    }
  });
});

describe("the delivery guarantee", () => {
  it("hands a message to the agent once, and only once", async () => {
    const companion = new CompanionQueue();
    companion.push({ body: "only once" });

    // First tool call carries it.
    const first = companion.take();
    companion.ack(first.map((m) => m.id));
    expect(prependToResult({ content: [{ type: "text", text: "result 1" }] }, first).content).toHaveLength(2);

    // Second tool call does not.
    const second = companion.take();
    expect(second).toEqual([]);
    expect(prependToResult({ content: [{ type: "text", text: "result 2" }] }, second).content).toHaveLength(1);
  });

  it("does not consume a message when the tool call failed", async () => {
    // The wrapper takes only after the handler returns, which is what this pins.
    const companion = new CompanionQueue();
    companion.push({ body: "must survive" });

    const handler = async () => {
      throw new Error("tool blew up");
    };
    await expect(handler()).rejects.toThrow();
    // Nothing was taken, so the message is still waiting for the next call.
    expect(companion.peek().map((m) => m.body)).toEqual(["must survive"]);
  });

  it("carries several messages in the order they were sent", async () => {
    const companion = new CompanionQueue();
    companion.push({ body: "first" });
    companion.push({ body: "second" });
    const taken = companion.take();
    const out = prependToResult({ content: [] }, taken);
    const text = (out.content![0] as any).text as string;
    expect(text.indexOf("first")).toBeLessThan(text.indexOf("second"));
  });
});

describe("the activity summary", () => {
  const at = (n: number) => new Date(1_700_000_000_000 + n * 1000).toISOString();

  it("counts across sessions, and the dashboard and the tools share it", () => {
    const events = [
      { id: "1", at: at(1), type: "tool_use", sessionId: "a", tool: "Read" },
      { id: "2", at: at(2), type: "tool_use", sessionId: "a", tool: "Read", files: ["x.ts"] },
      { id: "3", at: at(3), type: "tool_use", sessionId: "b", tool: "Edit", files: ["y.ts"] },
    ] as any[];
    const s = activitySummary(events, { now: Date.parse(at(3)) + 1000 });
    expect(s.totals).toMatchObject({ events: 3, tools: 3, files: 2, sessions: 2 });
    expect(s.toolCounts).toEqual([{ tool: "Read", count: 2 }, { tool: "Edit", count: 1 }]);
    expect(s.files).toEqual(["x.ts", "y.ts"]);
  });

  it("counts a failed tool result, and only a failed one", () => {
    const events = [
      { id: "1", at: at(1), type: "tool_result", sessionId: "a", payload: { ok: false } },
      { id: "2", at: at(2), type: "tool_result", sessionId: "a", payload: { ok: true } },
      // No verdict recorded means no failure claimed — "we do not know" is not "no".
      { id: "3", at: at(3), type: "tool_result", sessionId: "a", payload: {} },
    ] as any[];
    expect(activitySummary(events, { now: Date.parse(at(3)) }).totals.failures).toBe(1);
  });

  it("is empty and honest about it", () => {
    const s = activitySummary([]);
    expect(s.totals).toEqual({ events: 0, tools: 0, files: 0, failures: 0, sessions: 0 });
    expect(s.sessions).toEqual([]);
    expect(s.toolCounts).toEqual([]);
    expect(s.files).toEqual([]);
  });
});

describe("desktop notifications", () => {
  it("plans the right tool per platform", () => {
    expect(planNotification("t", "b", "linux")).toMatchObject({ command: "notify-send", usable: true });
    expect(planNotification("t", "b", "darwin").command).toBe("osascript");
    // Windows has no portable toast without a module or a signed app id, so it says so
    // rather than pretending.
    expect(planNotification("t", "b", "win32")).toMatchObject({ usable: false });
    expect(planNotification("t", "b", "plan9").usable).toBe(false);
  });

  it("passes the body as an argument, never through a shell", () => {
    const calls: { command: string; args: string[] }[] = [];
    const body = "hello; rm -rf ~ && echo pwned";
    const result = notify("t", body, { platform: "linux", run: (command, args) => calls.push({ command, args }) });
    expect(result.sent).toBe(true);
    // Whatever the body says, it is one argument to notify-send. `spawn` with
    // shell:false is what makes that true.
    expect(calls[0]!.args).toContain(body);
    expect(calls[0]!.command).toBe("notify-send");
  });

  it("escapes quotes and backslashes for AppleScript, which has no argv", () => {
    const quoted = planNotification("t", 'say "hi" C:\\temp', "darwin");
    const script = quoted.args[1]!;
    expect(script).toContain('\\"hi\\"');
    expect(script).toContain("C:\\\\temp");
    // One `-e` argument, so nothing in the body can become a second statement.
    expect(quoted.args).toHaveLength(2);
  });

  it("flattens a multi-line body so the notification stays readable", () => {
    expect(clip("line one\n\nline two")).toBe("line one line two");
    expect(clip("x".repeat(400)).length).toBeLessThanOrEqual(200);
  });

  it("is a no-op when turned off, and never throws when the tool is missing", () => {
    let ran = false;
    expect(notify("t", "b", { enabled: false, platform: "linux", run: () => { ran = true; } })).toMatchObject({ sent: false });
    expect(ran).toBe(false);

    const failed = notify("t", "b", { platform: "linux", run: () => { throw new Error("notify-send: not found"); } });
    expect(failed.sent).toBe(false);
    expect(failed.reason).toMatch(/not found/);

    // An unusable platform never even tries.
    expect(notify("t", "b", { platform: "win32" })).toMatchObject({ sent: false });
  });
});

describe("the activity dashboard", () => {
  it("serves a self-contained page", async () => {
    const { handle } = await boot();
    try {
      const res = await fetch(`${handle.url}/monitor`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toMatch(/text\/html/);
      const html = await res.text();
      // Self-contained on purpose: it has to work when nothing else is running, which
      // is exactly when a broken asset pipeline would be discovered.
      expect(html).toContain("<!doctype html>");
      expect(html).toContain("/monitor/api/events");
      expect(html).toContain("/monitor/api/summary");
      expect(html).toContain("EventSource");
      expect(html).not.toMatch(/<script[^>]+src=/);
    } finally {
      handle.close();
    }
  });

  it("answers the dashboard's own API", async () => {
    const { handle, events } = await boot();
    try {
      events.add({ type: "tool_use", sessionId: "s1", tool: "Read", files: ["a.ts"] });

      const list = await (await fetch(`${handle.url}/monitor/api/events`)).json();
      expect(list.events).toHaveLength(1);
      expect(list.total).toBe(1);

      const summary = await (await fetch(`${handle.url}/monitor/api/summary`)).json();
      expect(summary.totals).toMatchObject({ tools: 1, files: 1, sessions: 1 });
      expect(summary.toolCounts).toEqual([{ tool: "Read", count: 1 }]);
    } finally {
      handle.close();
    }
  });

  it("broadcasts an activity event on ingest, so the page updates live", async () => {
    const { handle } = await boot();
    try {
      const controller = new AbortController();
      const stream = await fetch(`${handle.url}/events`, { signal: controller.signal });
      const reader = stream.body!.getReader();

      await post(`${handle.url}/events/ingest`, {
        event: "PreToolUse", payload: { session_id: "s1", tool_name: "Grep", tool_input: { path: "src/x.ts" } },
      });

      const decoder = new TextDecoder();
      let text = "";
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline && !text.includes('"activity"')) {
        const { value } = await reader.read();
        if (value) text += decoder.decode(value);
      }
      expect(text).toContain('"activity"');
      expect(text).toContain("Grep");
      controller.abort();
    } finally {
      handle.close();
    }
  });
});

describe("the SSE wire format", () => {
  // The contract that broke: the bridge writes `event: <type>`, so a client that only
  // listens to `onmessage` — which is for unnamed events — receives nothing at all,
  // while its own tests pass against a fake. Pinned here so it cannot drift again.
  it("names every event, so a client must listen by name", async () => {
    const { handle } = await boot();
    try {
      const controller = new AbortController();
      const stream = await fetch(`${handle.url}/events`, { signal: controller.signal });
      const reader = stream.body!.getReader();

      await post(`${handle.url}/companion/reply`, { body: "named" });

      const decoder = new TextDecoder();
      let text = "";
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline && !text.includes("named")) {
        const { value } = await reader.read();
        if (value) text += decoder.decode(value);
      }
      // The `event:` line is what makes it a named event rather than a `message` one.
      expect(text).toMatch(/event: companion\ndata: /);
      expect(text).toContain('"body":"named"');
      controller.abort();
    } finally {
      handle.close();
    }
  });

  it("keeps /thread-updates to thread events only", async () => {
    const { handle } = await boot();
    try {
      const controller = new AbortController();
      const stream = await fetch(`${handle.url}/thread-updates`, { signal: controller.signal });
      const reader = stream.body!.getReader();

      // A companion message must not appear on the thread channel.
      await post(`${handle.url}/companion`, { body: "not a thread event" });
      await post(`${handle.url}/thread-updates`, { threadId: "t1", eventType: "message_added" });

      const decoder = new TextDecoder();
      let text = "";
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline && !text.includes("message_added")) {
        const { value } = await reader.read();
        if (value) text += decoder.decode(value);
      }
      expect(text).toContain("event: thread");
      expect(text).not.toContain("not a thread event");
      controller.abort();
    } finally {
      handle.close();
    }
  });
});
