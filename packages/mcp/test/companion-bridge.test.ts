import { describe, expect, it } from "vitest";
import { AgentRegistry } from "../src/bridge/agent-registry.ts";
import { CompanionQueue, prependToResult } from "../src/bridge/companion-queue.ts";
import { EventStore } from "../src/bridge/event-store.ts";
import { EventBus } from "../src/bridge/events.ts";
import { startHttpBridge } from "../src/bridge/http-bridge.ts";
import { PresenceRegistry } from "../src/bridge/presence-registry.ts";
import { SelectionStore } from "../src/bridge/selection-store.ts";
import { eventTypeFor, normalizeHookEvent, toolFailed } from "../src/hooks/hook-events.ts";

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
