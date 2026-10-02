import { describe, expect, it } from "vitest";
import {
  REACTION_CHOICES, reactionsByMessage, summarizeReactions, toggleReaction, type Reaction,
} from "../src/reactions.ts";
import {
  PEER_TTL_MS, heartbeatPresence, initialsOf, joinPresence, leavePresence, peerId, peersOnPage,
  sweepPresence, throttleDelay,
} from "../src/presence.ts";

const r = (over: Partial<Reaction> = {}): Reaction => ({
  messageId: "m1", emoji: "👍", userId: "u1", userName: "Sara", ...over,
});

describe("toggling a reaction", () => {
  it("adds one when it was not there", () => {
    expect(toggleReaction([], r()).length).toBe(1);
  });

  it("removes it when it was", () => {
    expect(toggleReaction([r()], r())).toEqual([]);
  });

  it("is idempotent on retry — applying the same toggle twice adds one", () => {
    // A flaky network WILL resend; the result must not depend on how many times.
    const once = toggleReaction([], r());
    expect(toggleReaction(once, r())).toEqual([]);
    // …and toggling an already-removed one adds it back exactly once.
    expect(toggleReaction(toggleReaction([], r()), r()).length).toBe(0);
  });

  it("keeps people apart", () => {
    const both = toggleReaction(toggleReaction([], r()), r({ userId: "u2", userName: "Jane" }));
    expect(both.length).toBe(2);
    // One person removing theirs leaves the other alone.
    expect(toggleReaction(both, r()).map((x) => x.userId)).toEqual(["u2"]);
  });

  it("keeps emoji apart", () => {
    const both = toggleReaction(toggleReaction([], r()), r({ emoji: "🎉" }));
    expect(both.length).toBe(2);
    expect(toggleReaction(both, r({ emoji: "🎉" })).map((x) => x.emoji)).toEqual(["👍"]);
  });

  it("keeps messages apart", () => {
    const both = toggleReaction(toggleReaction([], r()), r({ messageId: "m2" }));
    expect(toggleReaction(both, r({ messageId: "m2" })).map((x) => x.messageId)).toEqual(["m1"]);
  });

  it("does not mutate the set it was given", () => {
    const original = [r()];
    toggleReaction(original, r({ emoji: "🎉" }));
    expect(original.length).toBe(1);
  });
});

describe("summarising reactions", () => {
  it("counts per emoji and marks the viewer's own", () => {
    const out = summarizeReactions([
      r({ userId: "u1" }),
      r({ userId: "u2", userName: "Jane" }),
      r({ emoji: "🎉", userId: "u2", userName: "Jane" }),
    ], "u1");

    const thumbs = out.find((x) => x.emoji === "👍")!;
    expect(thumbs.count).toBe(2);
    expect(thumbs.mine).toBe(true);
    expect(thumbs.users).toEqual(["Sara", "Jane"]);

    const party = out.find((x) => x.emoji === "🎉")!;
    expect(party.mine).toBe(false);
  });

  it("orders by count, then by the picker's order so ties do not reshuffle", () => {
    const out = summarizeReactions([
      r({ emoji: "🚀", userId: "u1" }),
      r({ emoji: "👍", userId: "u1" }),
      r({ emoji: "👍", userId: "u2" }),
    ]);
    expect(out.map((x) => x.emoji)).toEqual(["👍", "🚀"]);

    // Two tied emoji come back in picker order, not insertion order.
    const tied = summarizeReactions([r({ emoji: "🚀", userId: "u1" }), r({ emoji: "👍", userId: "u2" })]);
    expect(tied.map((x) => x.emoji)).toEqual(["👍", "🚀"]);
  });

  it("falls back to the id when a name is unknown", () => {
    expect(summarizeReactions([r({ userName: undefined })])[0]!.users).toEqual(["u1"]);
  });

  it("is empty for a message nobody reacted to", () => {
    expect(summarizeReactions([])).toEqual([]);
  });

  it("groups a whole conversation at once", () => {
    const map = reactionsByMessage([r(), r({ messageId: "m2", emoji: "🎉", userId: "u2" })], "u1");
    expect(map.get("m1")![0]).toMatchObject({ emoji: "👍", mine: true });
    expect(map.get("m2")![0]).toMatchObject({ emoji: "🎉", mine: false });
    expect(map.has("m3")).toBe(false);
  });

  it("offers a short, fixed picker", () => {
    expect(REACTION_CHOICES.length).toBeLessThanOrEqual(8);
    expect(new Set(REACTION_CHOICES).size).toBe(REACTION_CHOICES.length);
  });
});

describe("presence", () => {
  const me = { url: "/checkout", userId: "u1", name: "Sara" };

  it("ids a peer by page and user, so a refresh or a second tab is the same peer", () => {
    expect(peerId("/checkout", "u1")).toBe(peerId("/checkout", "u1"));
    expect(peerId("/checkout", "u1")).not.toBe(peerId("/checkout", "u2"));
    expect(peerId("/checkout", "u1")).not.toBe(peerId("/pricing", "u1"));
  });

  it("joining twice is one peer, refreshed", () => {
    const first = joinPresence([], me, 1000);
    const again = joinPresence(first, { ...me, name: "Sara A." }, 2000);
    expect(again.length).toBe(1);
    expect(again[0]).toMatchObject({ name: "Sara A.", lastSeen: 2000 });
  });

  it("keeps different people on the same page apart", () => {
    const peers = joinPresence(joinPresence([], me), { url: "/checkout", userId: "u2", name: "Jane" });
    expect(peers.length).toBe(2);
  });

  it("expires exactly at the TTL, not before", () => {
    const peers = joinPresence([], me, 10_000);
    expect(sweepPresence(peers, 10_000 + PEER_TTL_MS - 1).length).toBe(1);
    expect(sweepPresence(peers, 10_000 + PEER_TTL_MS).length).toBe(0);
  });

  it("a heartbeat keeps a peer alive", () => {
    const peers = joinPresence([], me, 0);
    const id = peers[0]!.id;
    const revived = heartbeatPresence(peers, id, PEER_TTL_MS - 1);
    expect(sweepPresence(revived, PEER_TTL_MS).length).toBe(1);
    // …and an unknown id is ignored rather than creating a ghost.
    expect(heartbeatPresence(peers, "p_nope", 500)).toEqual(peers);
  });

  it("leaving removes immediately", () => {
    const peers = joinPresence([], me);
    expect(leavePresence(peers, peers[0]!.id)).toEqual([]);
    expect(leavePresence(peers, "p_nope").length).toBe(1);
  });

  it("lists only others on this page", () => {
    const peers = [
      ...joinPresence([], me),
      { ...joinPresence([], { url: "/checkout", userId: "u2", name: "Jane" })[0]! },
      { ...joinPresence([], { url: "/pricing", userId: "u3", name: "Ali" })[0]! },
    ];
    const here = peersOnPage(peers, "/checkout", peerId("/checkout", "u1"));
    expect(here.map((p) => p.name)).toEqual(["Jane"]);
  });
});

describe("cursor throttling", () => {
  it("lets the first move through immediately", () => {
    expect(throttleDelay(0, 1000)).toBe(0);
  });

  it("holds a rapid second move until the window has passed", () => {
    expect(throttleDelay(1000, 1020, 80)).toBe(60);
    expect(throttleDelay(1000, 1080, 80)).toBe(0);
    expect(throttleDelay(1000, 1200, 80)).toBe(0);
  });
});

describe("avatar initials", () => {
  it("takes two letters from two names and one from one", () => {
    expect(initialsOf("Sara Ahmed")).toBe("SA");
    expect(initialsOf("Sara")).toBe("S");
    expect(initialsOf("  jane   doe  ")).toBe("JD");
    expect(initialsOf("")).toBe("?");
  });
});
