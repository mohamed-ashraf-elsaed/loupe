import { describe, expect, it, vi } from "vitest";
import {
  AGENT_ALLOWED_STATUSES, createHandoffTools, isAgentAllowedStatus, RESOLVE_REFUSAL,
} from "../src/tools/handoff.ts";
import type { Comment, ThreadMessage } from "@loupekit/shared";

const thread = (over: Partial<Comment> = {}): Comment => ({
  id: "t1", projectKey: "pk", url: "/checkout", title: "Make the CTA bigger", body: "It is too small.",
  status: "in_progress", author: { id: "u1", name: "Sara" },
  anchor: { tag: "button", cssPath: "#save" } as any, context: { html: "", styles: {} },
  offset: { x: 0, y: 0 }, createdAt: "2026-01-01T10:00:00.000Z", ...over,
} as Comment);

function harness(opts: { found?: Comment | null; replies?: ThreadMessage[] } = {}) {
  const patches: { id: string; patch: any }[] = [];
  const posted: any[] = [];
  return {
    patches, posted,
    tools: createHandoffTools({
      agent: { id: "a1", name: "Claude Code" },
      fetchThread: async () => (opts.found === undefined ? thread() : opts.found),
      patchThread: async (id, patch) => { patches.push({ id, patch }); },
      postMessage: async (threadId, message) => {
        const m = { id: "m1", threadId, ...message, createdAt: "2026-01-01T11:00:00.000Z" } as ThreadMessage;
        posted.push(m);
        return m;
      },
      listMessages: async () => opts.replies ?? [],
    }),
  };
}

describe("mark_thread_addressed", () => {
  it("moves the thread to In Review", async () => {
    const h = harness();
    const out = await h.tools.markThreadAddressed({ thread_id: "t1" });
    expect(h.patches).toEqual([{ id: "t1", patch: { status: "in_review" } }]);
    expect(out.text).toContain("In Review");
    expect(out.text).toContain("A person has to look at it now");
  });

  it("cannot resolve a thread — there is no path to it", async () => {
    // The acceptance criterion, asserted structurally: the only status this tool can
    // write is in_review, whatever it is asked for.
    const h = harness();
    await h.tools.markThreadAddressed({ thread_id: "t1", message: "done" });
    for (const { patch } of h.patches) {
      expect(patch.status).toBe("in_review");
      expect(patch.status).not.toBe("resolved");
    }
    // And the allowed set has no `resolved` in it either.
    expect(AGENT_ALLOWED_STATUSES).not.toContain("resolved");
    expect(isAgentAllowedStatus("resolved")).toBe(false);
    expect(isAgentAllowedStatus("in_review")).toBe(true);
  });

  it("posts the closing note on the thread, attributed to the agent", async () => {
    const h = harness();
    const out = await h.tools.markThreadAddressed({ thread_id: "t1", message: "Larger hit area; see https://preview.test/pr-1/" });
    expect(h.posted).toHaveLength(1);
    expect(h.posted[0].author).toMatchObject({ id: "a1", type: "agent" });
    expect(h.posted[0].body).toContain("preview.test");
    expect(out.text).toContain("Your note is on the thread");
  });

  it("skips an empty or whitespace note rather than posting a blank reply", async () => {
    const h = harness();
    await h.tools.markThreadAddressed({ thread_id: "t1", message: "   " });
    expect(h.posted).toEqual([]);
  });

  it("says the thread is missing, without erroring", async () => {
    const h = harness({ found: null });
    const out = await h.tools.markThreadAddressed({ thread_id: "nope" });
    expect(out.unavailable).toBe(true);
    expect(out.text).toContain("No thread found");
  });
});

describe("add_thread_message", () => {
  it("posts without touching the status", async () => {
    const h = harness();
    const out = await h.tools.addThreadMessage({ thread_id: "t1", message: "Working on it." });
    expect(h.posted).toHaveLength(1);
    expect(h.posted[0].author.type).toBe("agent");
    // The whole point: a reply is not a handoff.
    expect(h.patches).toEqual([]);
    expect(out.text).toContain("status is unchanged");
    expect(out.text).toContain("in_progress");
  });

  it("refuses an empty message", async () => {
    const h = harness();
    const out = await h.tools.addThreadMessage({ thread_id: "t1", message: "" });
    expect(out.unavailable).toBe(true);
    expect(h.posted).toEqual([]);
  });

  it("says the thread is missing", async () => {
    const h = harness({ found: null });
    expect((await h.tools.addThreadMessage({ thread_id: "x", message: "hi" })).text).toContain("No thread found");
  });
});

describe("get_thread_conversation", () => {
  it("shows the original request first, then every reply", async () => {
    const h = harness({
      replies: [
        { id: "m1", threadId: "t1", author: { id: "a1", name: "Claude Code", type: "agent" }, body: "Made it bigger.", createdAt: "2026-01-01T11:00:00.000Z" },
        { id: "m2", threadId: "t1", author: { id: "u1", name: "Sara", type: "user" }, body: "Still too small.", createdAt: "2026-01-01T12:00:00.000Z" },
      ],
    });
    const out = await h.tools.getThreadConversation({ thread_id: "t1" });
    expect(out.text).toContain("It is too small.");
    expect(out.text).toContain("Made it bigger.");
    expect(out.text).toContain("Still too small.");
    expect(out.text).toContain("2 replies");
    expect(out.text.indexOf("It is too small.")).toBeLessThan(out.text.indexOf("Made it bigger."));
  });

  it("says so when nobody has replied", async () => {
    const h = harness();
    const out = await h.tools.getThreadConversation({ thread_id: "t1" });
    expect(out.text).toContain("No replies yet");
    expect(out.text).toContain("0 replies");
  });
});

describe("the refusal message", () => {
  it("explains that the rule is the workflow, not a preference", () => {
    expect(RESOLVE_REFUSAL).toContain("Only a person resolves");
    expect(RESOLVE_REFUSAL).toContain("In Review");
  });
});
