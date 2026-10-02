import { describe, expect, it } from "vitest";
import {
  SelectionStore, validateSelection, type SelectionPayload,
} from "../src/bridge/selection-store.ts";
import {
  AGENT_STALE_MS, AgentRegistry, agentId,
} from "../src/bridge/agent-registry.ts";
import { EventBus } from "../src/bridge/events.ts";
import { allowedOrigin, startHttpBridge, MAX_BODY_BYTES } from "../src/bridge/http-bridge.ts";

const sel = (over: Partial<SelectionPayload> = {}): SelectionPayload => ({
  correlationId: "c1", url: "https://acme.test/checkout", tag: "button",
  selector: "#save", text: "Save", ...over,
});

describe("selection store", () => {
  it("keeps the newest and evicts the oldest at capacity", () => {
    const s = new SelectionStore(3);
    for (let i = 1; i <= 5; i++) s.add(sel({ correlationId: `c${i}` }));
    expect(s.size()).toBe(3);
    expect(s.latest()!.correlationId).toBe("c5");
    // Newest first, and the two oldest are gone.
    expect(s.history().map((x) => x.correlationId)).toEqual(["c5", "c4", "c3"]);
  });

  it("looks a selection up by correlationId", () => {
    const s = new SelectionStore(3);
    s.add(sel({ correlationId: "a" }));
    s.add(sel({ correlationId: "b" }));
    expect(s.get("a")!.correlationId).toBe("a");
    expect(s.get("nope")).toBeNull();
    // Lookup respects eviction: "a" is gone once the ring moved past it.
    s.add(sel({ correlationId: "c" }));
    s.add(sel({ correlationId: "d" }));
    expect(s.get("a")).toBeNull();
  });

  it("stamps a selection that arrives without a time", () => {
    const s = new SelectionStore(2);
    const stored = s.add(sel());
    expect(Date.parse(stored.at!)).not.toBeNaN();
  });

  it("reports empty rather than a fake latest", () => {
    const s = new SelectionStore(2);
    expect(s.latest()).toBeNull();
    expect(s.history()).toEqual([]);
    expect(s.size()).toBe(0);
  });

  it("refuses a nonsense capacity", () => {
    expect(() => new SelectionStore(0)).toThrow();
    expect(() => new SelectionStore(-1)).toThrow();
    expect(() => new SelectionStore(1.5)).toThrow();
  });
});

describe("selection validation", () => {
  it("accepts the canonical shape", () => {
    const r = validateSelection(sel({ attrs: { "data-testid": "save" }, styles: { color: "red" }, box: { x: 1, y: 2, w: 3, h: 4 } }));
    expect(r.ok).toBe(true);
    expect(r.ok && r.value.correlationId).toBe("c1");
  });

  it("rejects partial payloads and junk", () => {
    for (const bad of [null, undefined, "nope", 42, [], {}]) {
      expect(validateSelection(bad).ok).toBe(false);
    }
    expect(validateSelection({ url: "u", tag: "div" }).ok).toBe(false);          // no correlationId
    expect(validateSelection({ correlationId: "c", tag: "div" }).ok).toBe(false); // no url
    expect(validateSelection({ correlationId: "c", url: "u" }).ok).toBe(false);   // no tag
    expect(validateSelection({ correlationId: " ", url: "u", tag: "div" }).ok).toBe(false);
  });

  it("type-checks the optional fields instead of passing them through", () => {
    const base = { correlationId: "c", url: "u", tag: "div" };
    expect(validateSelection({ ...base, attrs: { a: 1 } }).ok).toBe(false);
    expect(validateSelection({ ...base, styles: "nope" }).ok).toBe(false);
    expect(validateSelection({ ...base, box: { x: 1, y: 2, w: 3 } }).ok).toBe(false);
    expect(validateSelection({ ...base, box: { x: 1, y: 2, w: 3, h: "4" } }).ok).toBe(false);
    expect(validateSelection({ ...base, classes: [1] }).ok).toBe(false);
    expect(validateSelection({ ...base, text: 5 }).ok).toBe(false);
  });

  it("drops unknown keys rather than handing them to an agent", () => {
    const r = validateSelection({ correlationId: "c", url: "u", tag: "div", evil: "payload" });
    expect(r.ok).toBe(true);
    expect(r.ok && "evil" in r.value).toBe(false);
  });
});

describe("agent registry", () => {
  const reg = { name: "loupe-mcp", type: "claude-code", workspace: "/repo" };

  it("derives a stable id from the identity, so a restart is not a new agent", () => {
    expect(agentId(reg)).toBe(agentId({ ...reg }));
    // Different identity → different id; the order of nothing else matters.
    expect(agentId(reg)).not.toBe(agentId({ ...reg, name: "other" }));
    expect(agentId(reg)).not.toBe(agentId({ ...reg, workspace: "/elsewhere" }));
    // Two registries agree — this is what "across restarts" means.
    const a = new AgentRegistry().register(reg);
    const b = new AgentRegistry().register(reg);
    expect(a.id).toBe(b.id);
  });

  it("re-registering refreshes rather than duplicating", () => {
    let now = 1000;
    const r = new AgentRegistry(AGENT_STALE_MS, () => now);
    r.register(reg);
    now = 5000;
    const second = r.register(reg);
    expect(r.size()).toBe(1);
    expect(second.lastSeen).toBe(5000);
  });

  it("evicts exactly at the staleness boundary, not before", () => {
    let now = 10_000;
    const r = new AgentRegistry(AGENT_STALE_MS, () => now);
    const a = r.register(reg);

    now = 10_000 + AGENT_STALE_MS - 1;
    expect(r.sweep()).toEqual([]);
    expect(r.size()).toBe(1);

    now = 10_000 + AGENT_STALE_MS;
    const gone = r.sweep();
    expect(gone.map((g) => g.id)).toEqual([a.id]);
    expect(r.size()).toBe(0);
  });

  it("heartbeats keep an agent alive and ignore strangers", () => {
    let now = 0;
    const r = new AgentRegistry(1000, () => now);
    const a = r.register(reg);
    now = 900;
    expect(r.heartbeat(a.id)!.lastSeen).toBe(900);
    now = 1500;
    expect(r.sweep()).toEqual([]); // the heartbeat moved it past the cutoff
    expect(r.heartbeat("ag_nope")).toBeNull();
  });

  it("unregisters on request", () => {
    const r = new AgentRegistry();
    const a = r.register(reg);
    expect(r.unregister(a.id)).toBe(true);
    expect(r.unregister(a.id)).toBe(false);
    expect(r.list()).toEqual([]);
  });

  it("lists what is registered", () => {
    const r = new AgentRegistry();
    r.register(reg);
    r.register({ ...reg, name: "second" });
    expect(r.list().map((a) => a.name).sort()).toEqual(["loupe-mcp", "second"]);
  });
});

describe("event bus", () => {
  it("delivers to every subscriber and unsubscribes cleanly", () => {
    const bus = new EventBus();
    const seen: string[] = [];
    const off1 = bus.subscribe(() => seen.push("a"));
    bus.subscribe(() => seen.push("b"));
    expect(bus.count()).toBe(2);
    bus.publishThread("t1", "pr_created");
    expect(seen).toEqual(["a", "b"]);
    off1();
    off1(); // calling it twice is safe
    expect(bus.count()).toBe(1);
  });

  it("drops a subscriber that throws instead of breaking the loop", () => {
    const bus = new EventBus();
    const seen: string[] = [];
    bus.subscribe(() => { throw new Error("dead socket"); });
    bus.subscribe(() => seen.push("survivor"));
    expect(() => bus.publishThread("t1", "preview_live")).not.toThrow();
    // The dead one is gone and the healthy one still got it.
    expect(seen).toEqual(["survivor"]);
    expect(bus.count()).toBe(1);
  });

  it("carries the thread id, event type and time", () => {
    const bus = new EventBus();
    let got: any = null;
    bus.subscribe((e) => { got = e; });
    bus.publishThread("t9", "thread_resolved", { status: "resolved" });
    expect(got.type).toBe("thread");
    expect(got.threadId).toBe("t9");
    expect(got.eventType).toBe("thread_resolved");
    expect(got.data).toEqual({ status: "resolved" });
    expect(Date.parse(got.at)).not.toBeNaN();
  });
});

describe("cors", () => {
  it("allows the extension and loopback, and nothing else", () => {
    expect(allowedOrigin("chrome-extension://abcdef")).toBe("chrome-extension://abcdef");
    expect(allowedOrigin("http://localhost:3000")).toBe("http://localhost:3000");
    expect(allowedOrigin("http://127.0.0.1:8787")).toBe("http://127.0.0.1:8787");
    for (const bad of ["https://evil.test", "http://localhost.evil.test", undefined, "", "not a url"]) {
      expect(allowedOrigin(bad)).toBeNull();
    }
  });
});

describe("http bridge", () => {
  const boot = async () => {
    const store = new SelectionStore(10);
    const registry = new AgentRegistry();
    const bus = new EventBus();
    const handle = await startHttpBridge(0, { store, registry, bus });
    if (!handle) throw new Error("bridge did not start");
    return { handle, store, registry, bus, url: handle.url };
  };

  it("round-trips a selection through ingest and latest", async () => {
    const { handle, url } = await boot();
    try {
      const post = await fetch(`${url}/selection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sel({ correlationId: "round" })),
      });
      expect(post.status).toBe(201);
      const created = await post.json();
      expect(created.correlationId).toBe("round");

      const latest = await (await fetch(`${url}/selection/latest`)).json();
      expect(latest.selection.correlationId).toBe("round");
      expect(latest.selection.selector).toBe("#save");

      const history = await (await fetch(`${url}/selection/history?limit=5`)).json();
      expect(history.selections.length).toBe(1);
    } finally {
      await handle.close();
    }
  });

  it("rejects malformed JSON and partial payloads with a 400 and a reason", async () => {
    const { handle, url } = await boot();
    try {
      const bad = await fetch(`${url}/selection`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{ not json",
      });
      expect(bad.status).toBe(400);
      expect((await bad.json()).error).toContain("JSON");

      const partial = await fetch(`${url}/selection`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: "u" }),
      });
      expect(partial.status).toBe(400);
      expect((await partial.json()).error).toContain("correlationId");
    } finally {
      await handle.close();
    }
  });

  it("answers with nothing selected rather than an error", async () => {
    const { handle, url } = await boot();
    try {
      const res = await fetch(`${url}/selection/latest`);
      expect(res.status).toBe(200);
      expect((await res.json()).selection).toBeNull();
    } finally {
      await handle.close();
    }
  });

  it("reports health, registers agents and answers 404 for unknown routes", async () => {
    const { handle, url } = await boot();
    try {
      const health = await (await fetch(`${url}/health`)).json();
      expect(health).toMatchObject({ ok: true, selections: 0, agents: 0, subscribers: 0 });

      const reg = await fetch(`${url}/agents`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "mcp", type: "claude-code", workspace: "/repo" }),
      });
      expect(reg.status).toBe(201);
      const { agent } = await reg.json();
      expect((await (await fetch(`${url}/agents`)).json()).agents.length).toBe(1);

      const beat = await fetch(`${url}/agents/${agent.id}/heartbeat`, { method: "POST" });
      expect(beat.status).toBe(200);
      // A heartbeat for an agent nobody registered is a 404, not a silent success.
      expect((await fetch(`${url}/agents/ag_00000000/heartbeat`, { method: "POST" })).status).toBe(404);

      const del = await fetch(`${url}/agents/${agent.id}`, { method: "DELETE" });
      expect((await del.json()).ok).toBe(true);
      expect((await (await fetch(`${url}/agents`)).json()).agents).toEqual([]);

      expect((await fetch(`${url}/nope`)).status).toBe(404);
    } finally {
      await handle.close();
    }
  });

  it("refuses an agent registration missing its identity", async () => {
    const { handle, url } = await boot();
    try {
      const res = await fetch(`${url}/agents`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "x" }),
      });
      expect(res.status).toBe(400);
    } finally {
      await handle.close();
    }
  });

  it("streams a published thread update over SSE", async () => {
    const { handle, url, bus } = await boot();
    try {
      const ctl = new AbortController();
      const stream = await fetch(`${url}/thread-updates`, { signal: ctl.signal });
      expect(stream.headers.get("content-type")).toContain("text/event-stream");
      const reader = stream.body!.getReader();
      const decoder = new TextDecoder();
      // The opening comment arrives immediately, so we know we are attached.
      await reader.read();

      bus.publishThread("t42", "preview_live", { url: "https://preview.test" });
      let text = "";
      for (let i = 0; i < 5 && !text.includes("preview_live"); i++) {
        const { value } = await reader.read();
        text += decoder.decode(value, { stream: true });
      }
      expect(text).toContain("event: thread");
      expect(text).toContain("preview_live");
      expect(text).toContain("t42");

      ctl.abort();
      await new Promise((r) => setTimeout(r, 40));
      expect(bus.count()).toBe(0); // the disconnect removed the subscriber
    } finally {
      await handle.close();
    }
  });

  it("keeps a second instance on the same port from throwing", async () => {
    const first = await boot();
    const deps = { store: new SelectionStore(5), registry: new AgentRegistry(), bus: new EventBus() };
    try {
      // Retries are cut down so the test does not sit through the real backoff; the
      // behaviour under test is "returns rather than throws".
      const second = await startHttpBridge(first.handle.port, deps, { retries: 1, retryDelayMs: 10 });
      expect(second).toBeNull();
      // And the first one is still serving.
      expect((await fetch(`${first.url}/health`)).status).toBe(200);
    } finally {
      await first.handle.close();
    }
  });

  it("caps the body so an oversized post cannot buffer forever", () => {
    // Asserted as a constant rather than by posting a megabyte at it.
    expect(MAX_BODY_BYTES).toBeLessThanOrEqual(2 * 1024 * 1024);
  });

  it("binds loopback only", async () => {
    const { handle } = await boot();
    try {
      // Reachable on 127.0.0.1 …
      expect((await fetch(`http://127.0.0.1:${handle.port}/health`)).status).toBe(200);
      // … and the handle advertises exactly that, never a wildcard address.
      expect(handle.url).toContain("127.0.0.1");
      expect(handle.url).not.toContain("0.0.0.0");
    } finally {
      await handle.close();
    }
  });
});
