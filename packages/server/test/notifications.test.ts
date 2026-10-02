process.env.LOUPE_PG_DIR = "memory://";
import { beforeEach, describe, expect, it } from "vitest";
import type { Comment } from "@loupekit/shared";
import { db, migrate } from "../db.ts";
import * as store from "../store.ts";
import { addMessage } from "../messages.ts";
import { addNotification, listNotifications, listPeople, markRead, unreadCount } from "../notifications.ts";

const project = { project_key: "pk_test", name: "Test", secret: "s3cr3t", allowed_origins: ["*"] };

const comment = (over: Partial<Comment> = {}): Comment => ({
  id: "c1", projectKey: "pk_test", url: "/p", status: "queue", body: "hi",
  author: { id: "u1", name: "Sara Ahmed", email: "sara@acme.test" },
  anchor: { tag: "div", cssPath: "", xpath: "", testid: null, text: "", attrs: {}, nthOfType: 1, rect: { x: 0, y: 0, w: 0, h: 0 }, viewport: { w: 0, h: 0 } },
  context: { html: "<div/>", styles: {} }, offset: { x: 0.5, y: 0.5 },
  createdAt: "2026-01-01T00:00:00.000Z", ...over,
});

beforeEach(async () => {
  await migrate();
  const d = await db();
  for (const t of ["comments", "thread_messages", "thread_participants", "notifications", "projects"]) {
    await d.query(`DELETE FROM ${t}`);
  }
  await store.upsertProject(project as any);
});

describe("who can be mentioned", () => {
  it("is derived from who has taken part, not from a members table", async () => {
    await store.upsertComment(comment());
    await addMessage("c1", "pk_test", {
      author: { id: "a1", name: "Claude Code", type: "agent" }, body: "on it",
    });

    const people = await listPeople("pk_test");
    expect(people.map((p) => p.id).sort()).toEqual(["a1", "u1"]);
    expect(people.find((p) => p.id === "u1")!.name).toBe("Sara Ahmed");
  });

  it("does not duplicate someone who both commented and replied", async () => {
    await store.upsertComment(comment());
    await addMessage("c1", "pk_test", { author: { id: "u1", name: "Sara Ahmed", type: "user" }, body: "also me" });
    expect((await listPeople("pk_test")).filter((p) => p.id === "u1").length).toBe(1);
  });

  it("is empty for a project nobody has touched", async () => {
    expect(await listPeople("pk_test")).toEqual([]);
  });

  it("does not leak another project's people", async () => {
    await store.upsertComment(comment());
    expect(await listPeople("other")).toEqual([]);
  });
});

describe("notifications", () => {
  it("records one and lists it for the recipient", async () => {
    await addNotification({
      projectKey: "pk_test", recipientId: "u2", threadId: "c1", kind: "mention",
      body: "Sara mentioned you on “the CTA”", actorName: "Sara",
    });
    const list = await listNotifications("pk_test", "u2");
    expect(list.length).toBe(1);
    expect(list[0]).toMatchObject({ kind: "mention", threadId: "c1", actorName: "Sara" });
    expect(list[0]!.readAt).toBeUndefined();
  });

  it("keeps each person's inbox separate", async () => {
    await addNotification({ projectKey: "pk_test", recipientId: "u2", threadId: "c1", kind: "mention", body: "a" });
    await addNotification({ projectKey: "pk_test", recipientId: "u3", threadId: "c1", kind: "mention", body: "b" });
    expect((await listNotifications("pk_test", "u2")).map((n) => n.body)).toEqual(["a"]);
    expect((await listNotifications("pk_test", "u3")).map((n) => n.body)).toEqual(["b"]);
  });

  it("counts unread and can filter to them", async () => {
    await addNotification({ projectKey: "pk_test", recipientId: "u2", threadId: "c1", kind: "mention", body: "a" });
    await addNotification({ projectKey: "pk_test", recipientId: "u2", threadId: "c1", kind: "mention", body: "b" });
    expect(await unreadCount("pk_test", "u2")).toBe(2);

    expect(await markRead("pk_test", "u2")).toBe(2);
    expect(await unreadCount("pk_test", "u2")).toBe(0);
    expect((await listNotifications("pk_test", "u2")).length).toBe(2); // still readable
    expect(await listNotifications("pk_test", "u2", { unreadOnly: true })).toEqual([]);
  });

  it("marks one read without touching the rest", async () => {
    const first = await addNotification({ projectKey: "pk_test", recipientId: "u2", threadId: "c1", kind: "mention", body: "a" });
    await addNotification({ projectKey: "pk_test", recipientId: "u2", threadId: "c1", kind: "mention", body: "b" });
    expect(await markRead("pk_test", "u2", first.id)).toBe(1);
    expect(await unreadCount("pk_test", "u2")).toBe(1);
    // Marking the same one again is a no-op, not an error.
    expect(await markRead("pk_test", "u2", first.id)).toBe(0);
  });

  it("never marks someone else's notification read", async () => {
    const mine = await addNotification({ projectKey: "pk_test", recipientId: "u2", threadId: "c1", kind: "mention", body: "a" });
    expect(await markRead("pk_test", "u3", mine.id)).toBe(0);
    expect(await unreadCount("pk_test", "u2")).toBe(1);
  });

  it("does not leak across projects", async () => {
    await addNotification({ projectKey: "pk_test", recipientId: "u2", threadId: "c1", kind: "mention", body: "a" });
    expect(await listNotifications("other", "u2")).toEqual([]);
    expect(await unreadCount("other", "u2")).toBe(0);
  });
});
