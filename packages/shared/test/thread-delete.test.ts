import { describe, expect, it } from "vitest";
import {
  THREAD_MESSAGE_ADDED, THREAD_MESSAGE_DELETED, firstMessageFromComment, threadConversation,
  visibleMessages, type ThreadMessage,
} from "../src/thread.ts";

const comment = {
  id: "c1", body: "the original report",
  author: { id: "u1", name: "Sara" }, createdAt: "2026-01-01T10:00:00.000Z",
};

const reply = (over: Partial<ThreadMessage> = {}): ThreadMessage => ({
  id: "m1", threadId: "c1", author: { id: "u2", name: "Jane", type: "user" },
  body: "a reply", createdAt: "2026-01-01T11:00:00.000Z", ...over,
});

describe("a retracted message", () => {
  it("is left out of the conversation", () => {
    const conv = threadConversation(comment, [reply(), reply({ id: "m2", deletedAt: "2026-01-01T12:00:00.000Z" })]);
    expect(conv.map((m) => m.id)).toEqual(["c1:0", "m1"]);
  });

  it("is still there when the record is what you need", () => {
    const conv = threadConversation(
      comment,
      [reply(), reply({ id: "m2", deletedAt: "2026-01-01T12:00:00.000Z" })],
      { includeDeleted: true },
    );
    expect(conv.map((m) => m.id)).toEqual(["c1:0", "m1", "m2"]);
  });

  it("is filtered by visibleMessages too, for callers holding a plain list", () => {
    expect(visibleMessages([reply(), reply({ id: "m2", deletedAt: "x" })]).map((m) => m.id)).toEqual(["m1"]);
  });

  it("leaves the rest of the conversation intact", () => {
    // Retracting is not the same as clearing the thread.
    expect(threadConversation(comment, [reply({ deletedAt: "x" })]).length).toBe(1);
  });

  it("does not disturb ordering", () => {
    const conv = threadConversation(comment, [
      reply({ id: "m2", createdAt: "2026-01-01T12:00:00.000Z" }),
      reply({ id: "m1", createdAt: "2026-01-01T11:00:00.000Z" }),
      reply({ id: "m3", createdAt: "2026-01-01T13:00:00.000Z", deletedAt: "2026-01-01T14:00:00.000Z" }),
    ]);
    expect(conv.map((m) => m.id)).toEqual(["c1:0", "m1", "m2"]);
  });
});

describe("message attachments", () => {
  it("are carried through the conversation", () => {
    const withFile = reply({
      attachments: [{ url: "/v1/blobs/b1.png", kind: "image", name: "shot.png" }],
    });
    const [first, second] = threadConversation(comment, [withFile]);
    expect(first!.attachments).toBeUndefined();
    expect(second!.attachments![0]).toMatchObject({ kind: "image", name: "shot.png" });
  });

  it("reach the first message from the comment's own attachments", () => {
    const first = firstMessageFromComment({
      ...comment, attachments: [{ url: "/v1/blobs/b2.png", kind: "image" }],
    });
    expect(first.attachments!.length).toBe(1);
  });

  it("are absent rather than an empty array, so a renderer can skip the strip", () => {
    expect(firstMessageFromComment({ ...comment, attachments: [] }).attachments).toBeUndefined();
  });
});

describe("the thread event names", () => {
  it("are the ones the bridge relays", () => {
    expect(THREAD_MESSAGE_ADDED).toBe("message_added");
    expect(THREAD_MESSAGE_DELETED).toBe("message_deleted");
  });
});
