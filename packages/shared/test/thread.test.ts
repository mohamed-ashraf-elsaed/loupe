import { describe, expect, it } from "vitest";
import {
  firstMessageFromComment, isAgentMessage, iterationLabel, participantsOf, threadConversation,
  type ThreadMessage,
} from "../src/thread.ts";

const comment = {
  id: "t1",
  body: "The CTA is too small.",
  author: { id: "u1", name: "Sara", email: "sara@acme.test" },
  createdAt: "2026-01-01T10:00:00.000Z",
  attachments: [{ url: "http://x/a.png", kind: "image" as const, name: "a.png" }],
};

const reply = (over: Partial<ThreadMessage> = {}): ThreadMessage => ({
  id: "m1", threadId: "t1",
  author: { id: "a1", name: "Claude Code", type: "agent" },
  body: "Made it bigger.", createdAt: "2026-01-01T11:00:00.000Z", ...over,
});

describe("the comment body as the first message", () => {
  it("presents it without storing anything", () => {
    const m = firstMessageFromComment(comment);
    expect(m.id).toBe("t1:0");
    expect(m.threadId).toBe("t1");
    expect(m.body).toBe("The CTA is too small.");
    // A comment's author is a person; an agent has to say so explicitly.
    expect(m.author.type).toBe("user");
    expect(m.createdAt).toBe(comment.createdAt);
    expect(m.attachments).toEqual(comment.attachments);
  });

  it("gives a stable id, so a keyed list does not flicker on re-render", () => {
    expect(firstMessageFromComment(comment).id).toBe(firstMessageFromComment(comment).id);
  });

  it("drops an empty attachment list rather than carrying an empty array", () => {
    expect(firstMessageFromComment({ ...comment, attachments: [] }).attachments).toBeUndefined();
  });
});

describe("a conversation", () => {
  it("is the original first, then replies oldest-first", () => {
    const later = reply({ id: "m2", body: "second", createdAt: "2026-01-01T12:00:00.000Z" });
    const convo = threadConversation(comment, [later, reply()]);
    expect(convo.map((m) => m.body)).toEqual(["The CTA is too small.", "Made it bigger.", "second"]);
    // The original is always first, whatever order the replies arrive in.
    expect(convo[0]!.id).toBe("t1:0");
  });

  it("is just the original when nobody has replied", () => {
    expect(threadConversation(comment, []).length).toBe(1);
  });

  it("sorts a reply that somehow predates the request, rather than dropping it", () => {
    const early = reply({ createdAt: "2025-12-01T00:00:00.000Z" });
    const convo = threadConversation(comment, [early]);
    expect(convo.length).toBe(2);
    expect(convo[0]!.body).toBe("Made it bigger.");
  });
});

describe("participants and authorship", () => {
  it("lists who took part, in the order they first spoke, without duplicates", () => {
    const convo = threadConversation(comment, [
      reply(),
      reply({ id: "m2", author: { id: "u1", name: "Sara", type: "user" } }),
      reply({ id: "m3" }),
    ]);
    expect(participantsOf(convo).map((p) => p.id)).toEqual(["u1", "a1"]);
  });

  it("tells an agent's message from a person's", () => {
    expect(isAgentMessage(reply())).toBe(true);
    expect(isAgentMessage(reply({ author: { id: "u1", name: "Sara", type: "user" } }))).toBe(false);
    expect(isAgentMessage(reply({ author: { id: "g1", name: "Guest", type: "guest" } }))).toBe(false);
  });
});

describe("revision labels", () => {
  it("names an iteration, and says nothing for an original", () => {
    expect(iterationLabel({ parentThreadId: "t1", iterationType: "revision", iterationNumber: 2 })).toBe("Iteration 2");
    // A revision without a number is still the second pass.
    expect(iterationLabel({ parentThreadId: "t1", iterationType: "revision" })).toBe("Iteration 2");
    expect(iterationLabel({})).toBeNull();
    expect(iterationLabel({ iterationType: "original" })).toBeNull();
    // A parent with no revision type is not an iteration — it is a mistake, and
    // labelling it would be worse than staying quiet.
    expect(iterationLabel({ parentThreadId: "t1" })).toBeNull();
  });
});
