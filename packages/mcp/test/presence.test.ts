import { describe, expect, it } from "vitest";
import { PEER_TTL_MS, peerId } from "@loupekit/shared";
import { PresenceRegistry } from "../src/bridge/presence-registry.ts";
import { AgentRegistry } from "../src/bridge/agent-registry.ts";
import { EventBus } from "../src/bridge/events.ts";
import { SelectionStore } from "../src/bridge/selection-store.ts";
import { startHttpBridge } from "../src/bridge/http-bridge.ts";

const sara = { url: "/checkout", userId: "u1", name: "Sara" };
const jane = { url: "/checkout", userId: "u2", name: "Jane" };

const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("the presence registry", () => {
  it("joins, and refreshes rather than duplicating on re-join", () => {
    const reg = new PresenceRegistry(PEER_TTL_MS, () => 1000);
    const a = reg.join(sara);
    expect(reg.size()).toBe(1);
    const again = reg.join({ ...sara, name: "Sara A." });
    expect(reg.size()).toBe(1);
    expect(again.id).toBe(a.id);
    expect(again.name).toBe("Sara A.");
  });

  it("treats the same person on a different page as a different peer", () => {
    const reg = new PresenceRegistry();
    reg.join(sara);
    reg.join({ ...sara, url: "/pricing" });
    expect(reg.size()).toBe(2);
  });

  it("rejects a non-positive TTL rather than silently never expiring", () => {
    expect(() => new PresenceRegistry(0)).toThrow(/positive/);
    expect(() => new PresenceRegistry(Number.NaN)).toThrow(/positive/);
  });

  it("expires a peer that stops talking, and reports it", () => {
    let now = 0;
    const reg = new PresenceRegistry(PEER_TTL_MS, () => now);
    const peer = reg.join(sara);
    now = PEER_TTL_MS - 1;
    expect(reg.sweep()).toEqual([]); // not yet
    now = PEER_TTL_MS;
    expect(reg.sweep().map((p) => p.id)).toEqual([peer.id]);
    expect(reg.size()).toBe(0);
    // A second sweep finds nothing new to report.
    expect(reg.sweep()).toEqual([]);
  });

  it("a heartbeat keeps a peer alive; an unknown id does not resurrect one", () => {
    let now = 0;
    const reg = new PresenceRegistry(PEER_TTL_MS, () => now);
    const peer = reg.join(sara);
    now = PEER_TTL_MS - 1;
    expect(reg.heartbeat(peer.id)).not.toBeNull();
    now = PEER_TTL_MS + 1;
    expect(reg.sweep()).toEqual([]);
    expect(reg.heartbeat("p_nope")).toBeNull();
  });

  it("lists only others on a page", () => {
    const reg = new PresenceRegistry();
    const me = reg.join(sara);
    reg.join(jane);
    reg.join({ url: "/pricing", userId: "u3", name: "Ali" });
    expect(reg.list("/checkout", me.id).map((p) => p.name)).toEqual(["Jane"]);
    expect(reg.list().length).toBe(3);
  });

  it("leaves immediately when asked", () => {
    const reg = new PresenceRegistry();
    const me = reg.join(sara);
    expect(reg.leave(me.id)).toBe(true);
    expect(reg.size()).toBe(0);
    expect(reg.leave(me.id)).toBe(false);
  });

  it("ids peers deterministically, so a reload is the same peer", () => {
    const reg = new PresenceRegistry();
    expect(reg.join(sara).id).toBe(peerId("/checkout", "u1"));
  });
});

describe("presence over the bridge", () => {
  const boot = async () => {
    const handle = await startHttpBridge(0, {
      store: new SelectionStore(10),
      registry: new AgentRegistry(),
      presence: new PresenceRegistry(),
      bus: new EventBus(),
    });
    if (!handle) throw new Error("bridge did not start");
    return handle;
  };

  it("joins, lists, heartbeats and leaves", async () => {
    const h = await boot();
    try {
      const joined = await post(`${h.url}/presence`, sara);
      expect(joined.status).toBe(201);
      const { peer } = await joined.json();
      expect(peer.id).toBe(peerId("/checkout", "u1"));

      // A second person on the same page shows up for the first.
      await post(`${h.url}/presence`, jane);
      const listed = await (await fetch(`${h.url}/presence?url=%2Fcheckout&viewer=${peer.id}`)).json();
      expect(listed.peers.map((p: any) => p.name)).toEqual(["Jane"]);

      // The listed peers exclude the viewer, and another page is not included.
      await post(`${h.url}/presence`, { url: "/pricing", userId: "u3", name: "Ali" });
      const again = await (await fetch(`${h.url}/presence?url=%2Fcheckout`)).json();
      expect(again.peers.map((p: any) => p.name)).toEqual(["Sara", "Jane"]);

      expect((await post(`${h.url}/presence/${peer.id}/heartbeat`, {})).status).toBe(200);
      expect((await post(`${h.url}/presence/p_nope/heartbeat`, {})).status).toBe(404);

      const left = await fetch(`${h.url}/presence/${peer.id}`, { method: "DELETE" });
      expect((await left.json()).ok).toBe(true);
      expect((await (await fetch(`${h.url}/presence`)).json()).peers.length).toBe(2);
    } finally {
      h.close();
    }
  });

  it("rejects a join missing its identity", async () => {
    const h = await boot();
    try {
      for (const bad of [{}, { url: "/x" }, { url: "/x", userId: "u" }, { url: "/x", name: "N" }]) {
        expect((await post(`${h.url}/presence`, bad)).status, JSON.stringify(bad)).toBe(400);
      }
      expect((await post(`${h.url}/presence`, { url: "/x", userId: "u", name: "N" })).status).toBe(201);
    } finally {
      h.close();
    }
  });

  it("rejects a body that is not JSON", async () => {
    const h = await boot();
    try {
      const res = await fetch(`${h.url}/presence`, { method: "POST", body: "{" });
      expect(res.status).toBe(400);
    } finally {
      h.close();
    }
  });

  it("counts peers in health", async () => {
    const h = await boot();
    try {
      await post(`${h.url}/presence`, sara);
      const health = await (await fetch(`${h.url}/health`)).json();
      expect(health.peers).toBe(1);
      expect(health.agents).toBe(0);
    } finally {
      h.close();
    }
  });
});

describe("relaying a thread update from the API", () => {
  const boot2 = async () => {
    const handle = await startHttpBridge(0, {
      store: new SelectionStore(10),
      registry: new AgentRegistry(),
      presence: new PresenceRegistry(),
      bus: new EventBus(),
    });
    if (!handle) throw new Error("bridge did not start");
    return handle;
  };

  it("accepts a thread update and relays it to subscribers", async () => {
    const h = await boot2();
    try {
      // Subscribe first, so the relayed event has somewhere to land.
      const controller = new AbortController();
      const stream = await fetch(`${h.url}/thread-updates`, { signal: controller.signal });
      const reader = stream.body!.getReader();

      const accepted = await post(`${h.url}/thread-updates`, {
        threadId: "t1", eventType: "message_added", data: { messageId: "m1" },
      });
      expect(accepted.status).toBe(202);

      const decoder = new TextDecoder();
      let text = "";
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline && !text.includes("message_added")) {
        const { value } = await reader.read();
        if (value) text += decoder.decode(value);
      }
      expect(text).toContain("message_added");
      expect(text).toContain("t1");
      controller.abort();
    } finally {
      h.close();
    }
  });

  it("rejects a thread update missing its identity", async () => {
    const h = await boot2();
    try {
      for (const bad of [{}, { threadId: "t1" }, { eventType: "x" }, { threadId: "", eventType: "x" }]) {
        expect((await post(`${h.url}/thread-updates`, bad)).status, JSON.stringify(bad)).toBe(400);
      }
      expect((await post(`${h.url}/thread-updates`, { threadId: "t1", eventType: "message_added" })).status).toBe(202);
    } finally {
      h.close();
    }
  });

  it("rejects a body that is not JSON", async () => {
    const h = await boot2();
    try {
      expect((await fetch(`${h.url}/thread-updates`, { method: "POST", body: "{" })).status).toBe(400);
    } finally {
      h.close();
    }
  });
});
