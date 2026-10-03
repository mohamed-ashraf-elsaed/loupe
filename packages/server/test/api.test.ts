import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:http";
process.env.LOUPE_PG_DIR = "memory://";
process.env.LOUPE_BLOB_DIR = mkdtempSync(join(tmpdir(), "loupe-api-blob-"));

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { handler } from "../index.ts";
import { db, migrate } from "../db.ts";
import { upsertProject } from "../store.ts";
import { signUser } from "../auth.ts";

const SECRET = "sec";
let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer(handler);
  await new Promise<void>((r) => server.listen(0, () => r()));
  const addr = server.address() as any;
  base = `http://127.0.0.1:${addr.port}`;
  process.env.LOUPE_PUBLIC_URL = base; // so blob URLs point back at this test server
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(async () => {
  await migrate();
  const d = await db();
  // Every table the routes touch. Truncating only `comments`/`projects` left
  // working_branches, repo_urls, notifications and reactions behind, so one test saw
  // another's rows — which is how the preview assertion picked up a registered pattern
  // it never created.
  await d.query("TRUNCATE comments, projects, working_branches, repo_urls, notifications, reactions, thread_messages, thread_participants CASCADE");
  await upsertProject({ project_key: "pk", name: "n", secret: SECRET, allowed_origins: [] });
});

const userH = { "X-Loupe-User": "u1", "X-Loupe-Hmac": signUser("u1", SECRET), "Content-Type": "application/json" };
const adminH = { "X-Loupe-Admin": SECRET, "Content-Type": "application/json" };

function comment(over: Record<string, unknown> = {}) {
  return {
    id: "c1", projectKey: "pk", url: "/p?utm_source=x", status: "queue", body: "b",
    author: { id: "u1", name: "U" },
    anchor: { tag: "div", cssPath: "", xpath: "", testid: null, text: "", attrs: {}, nthOfType: 1, rect: { x: 0, y: 0, w: 0, h: 0 }, viewport: { w: 0, h: 0 } },
    context: { html: "<div/>", styles: {} }, offset: { x: 0.5, y: 0.5 },
    createdAt: "2026-01-01T00:00:00.000Z", ...over,
  };
}
const post = (body: unknown, headers = userH) => fetch(`${base}/v1/comments`, { method: "POST", headers, body: JSON.stringify(body) });

// Every route that takes a project key from the *authenticated* request rather than
// from the body. These exist because the server is not typechecked: `auth` carries the
// project row, not a `projectKey`, so `auth.projectKey` was silently `undefined` — a
// 500 on write (the not-null constraint) and an empty list on read. The store-level
// tests passed the whole time because they never crossed the HTTP boundary.
describe("routes that take the project from auth", () => {
  const json = (r: Response) => r.json() as Promise<any>;

  it("registers and reads back a working branch", async () => {
    const created = await fetch(`${base}/v1/working-branches`, {
      method: "POST", headers: adminH,
      body: JSON.stringify({ projectKey: "pk", repo: "acme/shop", branch: "loupe/fix" }),
    });
    expect(created.status).toBe(201);
    expect((await json(created)).projectKey).toBe("pk");

    const listed = await json(await fetch(`${base}/v1/working-branches?projectKey=pk&repo=acme/shop`, { headers: adminH }));
    expect(listed.map((b: any) => b.branch)).toEqual(["loupe/fix"]);
  });

  it("does not leak a working branch into another project", async () => {
    await upsertProject({ project_key: "other", name: "o", secret: "other-sec", allowed_origins: [] });
    await fetch(`${base}/v1/working-branches`, {
      method: "POST", headers: adminH,
      body: JSON.stringify({ projectKey: "pk", repo: "acme/shop", branch: "loupe/fix" }),
    });
    const otherH = { "X-Loupe-Admin": "other-sec", "Content-Type": "application/json" };
    const theirs = await json(await fetch(`${base}/v1/working-branches?projectKey=other`, { headers: otherH }));
    expect(theirs).toEqual([]);
  });

  it("adds, reads and removes a repo url", async () => {
    const added = await fetch(`${base}/v1/repo-urls`, {
      method: "POST", headers: adminH,
      body: JSON.stringify({ projectKey: "pk", repo: "acme/shop", pattern: "https://preview-*.acme.test" }),
    });
    expect(added.status).toBe(201);

    const listed = await json(await fetch(`${base}/v1/repo-urls?projectKey=pk`, { headers: adminH }));
    expect(listed.map((u: any) => u.pattern)).toEqual(["https://preview-*.acme.test"]);

    // Addressed by the id the API handed back — that is what the store matches on.
    const id = (await json(await fetch(`${base}/v1/repo-urls?projectKey=pk`, { headers: adminH })))[0].id;
    const removed = await fetch(`${base}/v1/repo-urls/${encodeURIComponent(id)}?projectKey=pk`, {
      method: "DELETE", headers: adminH,
    });
    expect((await json(removed)).ok).toBe(true);
    expect(await json(await fetch(`${base}/v1/repo-urls?projectKey=pk`, { headers: adminH }))).toEqual([]);
  });

  it("does not claim to have removed a repo url it did not find", async () => {
    const missing = await fetch(`${base}/v1/repo-urls/${encodeURIComponent("pk:acme/shop:staging")}?projectKey=pk`, {
      method: "DELETE", headers: adminH,
    });
    expect((await json(missing)).ok).toBe(false);
  });

  it("answers a preview request without guessing a URL", async () => {
    const res = await json(await fetch(`${base}/v1/preview?projectKey=pk&repo=acme/shop&branch=loupe/fix`, { headers: adminH }));
    expect(res.status).toBe("not_ready");
    expect(res.candidates).toEqual([]);
    // It must explain rather than invent one.
    expect(String(res.reason)).toMatch(/no url patterns are registered/i);
  });

  it("lists the people who have taken part, from auth's project", async () => {
    await fetch(`${base}/v1/comments`, { method: "POST", headers: adminH, body: JSON.stringify(comment()) });
    const people = await json(await fetch(`${base}/v1/people?projectKey=pk`, { headers: adminH }));
    expect(people.map((p: any) => p.id)).toEqual(["u1"]);
  });

  it("resolves a mention of a known person and reports an unknown one", async () => {
    await fetch(`${base}/v1/comments`, { method: "POST", headers: adminH, body: JSON.stringify(comment()) });
    const res = await fetch(`${base}/v1/comments/c1/messages`, {
      method: "POST", headers: adminH,
      body: JSON.stringify({ author: { id: "bob", name: "Bob Smith" }, body: "cc @U and @nobody" }),
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.mentions).toEqual(["u1"]);
    expect(body.unknownMentions).toEqual(["nobody"]);
  });

  it("notifies a mentioned person and never the author of the reply", async () => {
    await fetch(`${base}/v1/comments`, { method: "POST", headers: adminH, body: JSON.stringify(comment()) });

    // bob mentions u1 → u1 is notified.
    await fetch(`${base}/v1/comments/c1/messages`, {
      method: "POST", headers: adminH,
      body: JSON.stringify({ author: { id: "bob", name: "Bob Smith" }, body: "cc @U" }),
    });
    const inbox = await json(await fetch(`${base}/v1/notifications?projectKey=pk&recipient=u1`, { headers: adminH }));
    expect(inbox.unread).toBe(1);
    expect(inbox.notifications[0].kind).toBe("mention");

    // u1 mentions themselves → no second notification.
    await fetch(`${base}/v1/comments/c1/messages`, {
      method: "POST", headers: adminH,
      body: JSON.stringify({ author: { id: "u1", name: "U" }, body: "me: @U" }),
    });
    expect((await json(await fetch(`${base}/v1/notifications?projectKey=pk&recipient=u1`, { headers: adminH }))).unread).toBe(1);
  });

  it("marks notifications read without losing them", async () => {
    await fetch(`${base}/v1/comments`, { method: "POST", headers: adminH, body: JSON.stringify(comment()) });
    await fetch(`${base}/v1/comments/c1/messages`, {
      method: "POST", headers: adminH,
      body: JSON.stringify({ author: { id: "bob", name: "Bob Smith" }, body: "@U hi" }),
    });
    await fetch(`${base}/v1/notifications/read`, {
      method: "POST", headers: adminH,
      body: JSON.stringify({ projectKey: "pk", recipient: "u1" }),
    });
    const after = await json(await fetch(`${base}/v1/notifications?projectKey=pk&recipient=u1`, { headers: adminH }));
    expect(after.unread).toBe(0);
    expect(after.notifications.length).toBe(1);
  });

  it("toggles a reaction at the HTTP boundary — the same call twice un-reacts", async () => {
    await fetch(`${base}/v1/comments`, { method: "POST", headers: adminH, body: JSON.stringify(comment()) });
    const msg = await json(await fetch(`${base}/v1/comments/c1/messages`, {
      method: "POST", headers: adminH,
      body: JSON.stringify({ author: { id: "bob", name: "Bob" }, body: "hi" }),
    }));

    const toggle = () => fetch(`${base}/v1/comments/c1/messages/${msg.id}/reactions`, {
      method: "POST", headers: adminH,
      body: JSON.stringify({ emoji: "👍", userId: "u1", userName: "U" }),
    });

    const first = await json(await toggle());
    expect(first.on).toBe(true);
    expect(first.reactions.length).toBe(1);

    const second = await json(await toggle());
    expect(second.on).toBe(false);
    expect(second.reactions.length).toBe(0);
  });

  it("rejects a reaction that is not an emoji, and one on a message that does not exist", async () => {
    await fetch(`${base}/v1/comments`, { method: "POST", headers: adminH, body: JSON.stringify(comment()) });
    const msg = await json(await fetch(`${base}/v1/comments/c1/messages`, {
      method: "POST", headers: adminH, body: JSON.stringify({ author: { id: "bob", name: "Bob" }, body: "hi" }),
    }));

    const bad = await fetch(`${base}/v1/comments/c1/messages/${msg.id}/reactions`, {
      method: "POST", headers: adminH, body: JSON.stringify({ emoji: "definitely not an emoji", userId: "u1" }),
    });
    expect(bad.status).toBe(400);

    const missing = await fetch(`${base}/v1/comments/c1/messages/nope/reactions`, {
      method: "POST", headers: adminH, body: JSON.stringify({ emoji: "👍", userId: "u1" }),
    });
    expect(missing.status).toBe(404);
  });

  it("retracts a message without losing the record", async () => {
    await fetch(`${base}/v1/comments`, { method: "POST", headers: adminH, body: JSON.stringify(comment()) });
    const msg = await json(await fetch(`${base}/v1/comments/c1/messages`, {
      method: "POST", headers: adminH, body: JSON.stringify({ author: { id: "bob", name: "Bob" }, body: "oops" }),
    }));

    const gone = await fetch(`${base}/v1/comments/c1/messages/${msg.id}`, { method: "DELETE", headers: adminH });
    expect(gone.status).toBe(200);
    const body = await json(gone);
    expect(body.ok).toBe(true);
    // The row comes back with the retraction on it, not a bare ok.
    expect(body.message.deletedAt).toBeTruthy();

    const listed = await json(await fetch(`${base}/v1/comments/c1/messages`, { headers: adminH }));
    expect(listed.map((m: any) => m.id)).not.toContain(msg.id);

    // …and it is still there for whoever needs the record.
    const all = await json(await fetch(`${base}/v1/comments/c1/messages?includeDeleted=1`, { headers: adminH }));
    expect(all.map((m: any) => m.id)).toContain(msg.id);
    expect(all.find((m: any) => m.id === msg.id).deletedAt).toBeTruthy();
  });

  it("treats retracting twice as a no-op, not an error", async () => {
    await fetch(`${base}/v1/comments`, { method: "POST", headers: adminH, body: JSON.stringify(comment()) });
    const msg = await json(await fetch(`${base}/v1/comments/c1/messages`, {
      method: "POST", headers: adminH, body: JSON.stringify({ author: { id: "bob", name: "Bob" }, body: "hi" }),
    }));
    const url = `${base}/v1/comments/c1/messages/${msg.id}`;
    expect((await fetch(url, { method: "DELETE", headers: adminH })).status).toBe(200);
    // A retry after a flaky network must not read as a failure…
    const again = await fetch(url, { method: "DELETE", headers: adminH });
    expect(again.status).toBe(404);
    expect((await json(again)).ok).toBe(false);
  });

  it("does not retract a message that never existed", async () => {
    await fetch(`${base}/v1/comments`, { method: "POST", headers: adminH, body: JSON.stringify(comment()) });
    expect((await fetch(`${base}/v1/comments/c1/messages/nope`, { method: "DELETE", headers: adminH })).status).toBe(404);
  });

  it("round-trips a reply's attachments", async () => {
    await fetch(`${base}/v1/comments`, { method: "POST", headers: adminH, body: JSON.stringify(comment()) });
    const attachments = [{ url: `${base}/v1/blobs/b1.png`, kind: "image", name: "shot.png", mime: "image/png" }];
    const posted = await json(await fetch(`${base}/v1/comments/c1/messages`, {
      method: "POST", headers: adminH,
      body: JSON.stringify({ author: { id: "bob", name: "Bob" }, body: "see attached", attachments }),
    }));
    expect(posted.attachments).toEqual(attachments);

    const listed = await json(await fetch(`${base}/v1/comments/c1/messages`, { headers: adminH }));
    expect(listed[0].attachments).toEqual(attachments);
  });

  it("keeps a reply with only an attachment", async () => {
    await fetch(`${base}/v1/comments`, { method: "POST", headers: adminH, body: JSON.stringify(comment()) });
    const res = await fetch(`${base}/v1/comments/c1/messages`, {
      method: "POST", headers: adminH,
      body: JSON.stringify({
        author: { id: "bob", name: "Bob" }, body: " ",
        attachments: [{ url: `${base}/v1/blobs/b2.png`, kind: "image" }],
      }),
    });
    // A blank body is still a blank body — the endpoint requires text, so this is a 400.
    expect(res.status).toBe(400);
  });

  it("lists a thread's reactions in one call", async () => {
    await fetch(`${base}/v1/comments`, { method: "POST", headers: adminH, body: JSON.stringify(comment()) });
    const msg = await json(await fetch(`${base}/v1/comments/c1/messages`, {
      method: "POST", headers: adminH, body: JSON.stringify({ author: { id: "bob", name: "Bob" }, body: "hi" }),
    }));
    await fetch(`${base}/v1/comments/c1/messages/${msg.id}/reactions`, {
      method: "POST", headers: adminH, body: JSON.stringify({ emoji: "👍", userId: "u1", userName: "U" }),
    });

    // Thread-level, which is what the client asks for — the per-message route is for
    // toggling, and a client that had to enumerate replies would need one call each.
    const res = await fetch(`${base}/v1/comments/c1/reactions`, { headers: adminH });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.reactions.length).toBe(1);
    expect(body.reactions[0]).toMatchObject({ messageId: msg.id, emoji: "👍", userId: "u1" });
  });

  it("404s a thread-level reactions request for a thread that does not exist", async () => {
    expect((await fetch(`${base}/v1/comments/nope/reactions`, { headers: adminH })).status).toBe(404);
  });

  it("keeps reactions to one project's thread only", async () => {
    await fetch(`${base}/v1/comments`, { method: "POST", headers: adminH, body: JSON.stringify(comment()) });
    const msg = await json(await fetch(`${base}/v1/comments/c1/messages`, {
      method: "POST", headers: adminH, body: JSON.stringify({ author: { id: "bob", name: "Bob" }, body: "hi" }),
    }));
    await fetch(`${base}/v1/comments/c1/messages/${msg.id}/reactions`, {
      method: "POST", headers: adminH, body: JSON.stringify({ emoji: "👍", userId: "u1" }),
    });
    const res = await json(await fetch(`${base}/v1/comments/c1/messages/${msg.id}/reactions`, { headers: adminH }));
    expect(res.reactions.length).toBe(1);
  });
});

describe("api", () => {
  it("health", async () => {
    const r = await fetch(`${base}/v1/health`);
    expect(r.status).toBe(200);
    expect((await r.json()).ok).toBe(true);
  });

  it("CORS preflight", async () => {
    const r = await fetch(`${base}/v1/comments`, { method: "OPTIONS" });
    expect(r.status).toBe(204);
    expect(r.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("list requires auth, rejects unknown/blank project", async () => {
    expect((await fetch(`${base}/v1/comments?projectKey=pk`)).status).toBe(401);
    expect((await fetch(`${base}/v1/comments?projectKey=nope`, { headers: adminH })).status).toBe(404);
    expect((await fetch(`${base}/v1/comments`, { headers: adminH })).status).toBe(400);
  });

  it("creates as user, normalizes URL, then lists", async () => {
    expect((await post(comment(), { "Content-Type": "application/json" } as any)).status).toBe(401);
    const r = await post(comment());
    expect(r.status).toBe(201);
    expect((await r.json()).url).toBe("/p");
    const list = await (await fetch(`${base}/v1/comments?projectKey=pk`, { headers: adminH })).json();
    expect(list.length).toBe(1);
  });

  it("blocks posting as another user, and missing id", async () => {
    expect((await post(comment({ author: { id: "other", name: "O" } }))).status).toBe(403);
    expect((await post(comment({ id: undefined }))).status).toBe(400);
  });

  it("filters the list by query params", async () => {
    await post(comment({ id: "k1", repo: "acme/web", branch: "main", priority: "critical", title: "Checkout" }));
    await post(comment({ id: "k2", repo: "acme/api", branch: "main", priority: "low", title: "Refund" }));

    const list = async (qs: string) =>
      (await (await fetch(`${base}/v1/comments?projectKey=pk&${qs}`, { headers: adminH })).json()) as { id: string }[];
    const ids = async (qs: string) => (await list(qs)).map((c) => c.id).sort();

    expect(await ids("")).toEqual(["k1", "k2"]);
    expect(await ids("repo=acme/web")).toEqual(["k1"]);
    expect(await ids("branch=main")).toEqual(["k1", "k2"]);
    expect(await ids("priority=critical")).toEqual(["k1"]);
    expect(await ids("q=refund")).toEqual(["k2"]);
    expect(await ids("repo=acme/web&priority=low")).toEqual([]);
  });

  it("gets, patches, and deletes by id", async () => {
    await post(comment());
    expect((await fetch(`${base}/v1/comments/c1`, { headers: adminH })).status).toBe(200);
    const patched = await (await fetch(`${base}/v1/comments/c1`, { method: "PATCH", headers: adminH, body: JSON.stringify({ status: "resolved" }) })).json();
    expect(patched.status).toBe("resolved");
    // A legacy value still lands on a board stage rather than falling off it.
    const legacy = await (await fetch(`${base}/v1/comments/c1`, { method: "PATCH", headers: adminH, body: JSON.stringify({ status: "done" }) })).json();
    expect(legacy.status).toBe("resolved");
    expect((await fetch(`${base}/v1/comments/c1`, { method: "DELETE", headers: adminH })).status).toBe(204);
    expect((await fetch(`${base}/v1/comments/c1`, { headers: adminH })).status).toBe(404);
  });

  it("uploads a blob and serves it back", async () => {
    const data = "data:image/png;base64," + Buffer.from("PNG").toString("base64");
    const up = await fetch(`${base}/v1/blobs`, { method: "POST", headers: userH, body: JSON.stringify({ projectKey: "pk", data }) });
    expect(up.status).toBe(201);
    const { url } = await up.json();
    const img = await fetch(url);
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/png");
  });

  it("guards and validates blob upload", async () => {
    expect((await fetch(`${base}/v1/blobs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectKey: "pk", data: "data:,x" }) })).status).toBe(401);
    expect((await fetch(`${base}/v1/blobs`, { method: "POST", headers: adminH, body: JSON.stringify({ projectKey: "pk", data: "notadataurl" }) })).status).toBe(400);
    expect((await fetch(`${base}/v1/blobs/missing`)).status).toBe(404);
  });

  it("serves static assets and 404s unknown files", async () => {
    const r = await fetch(`${base}/demo/`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/html");
    expect((await fetch(`${base}/demo/nope.js`)).status).toBe(404);
  });

  it("handles routing edges", async () => {
    const root = await fetch(`${base}/`, { redirect: "manual" });
    expect([301, 302]).toContain(root.status);
    expect((await fetch(`${base}/v1/nope`, { headers: adminH })).status).toBe(404);
    expect((await fetch(`${base}/nope/whatever`)).status).toBe(404);
  });

  it("returns 500 on a malformed JSON body", async () => {
    const r = await fetch(`${base}/v1/comments`, { method: "POST", headers: userH, body: "{not json" });
    expect(r.status).toBe(500);
  });
});
