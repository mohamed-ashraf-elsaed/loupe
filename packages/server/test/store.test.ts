process.env.LOUPE_PG_DIR = "memory://";
import { beforeEach, describe, expect, it } from "vitest";
import type { Comment } from "@loupekit/shared";
import { db, migrate } from "../db.ts";
import * as store from "../store.ts";

const project = { project_key: "pk_test", name: "Test", secret: "s3cr3t", allowed_origins: ["*"] };

function make(over: Partial<Comment> = {}): Comment {
  return {
    id: "c1",
    projectKey: "pk_test",
    url: "/p?utm_source=x",
    status: "queue",
    body: "hi",
    author: { id: "u1", name: "U" },
    anchor: { tag: "div", cssPath: "", xpath: "", testid: null, text: "", attrs: {}, nthOfType: 1, rect: { x: 0, y: 0, w: 0, h: 0 }, viewport: { w: 0, h: 0 } },
    context: { html: "<div/>", styles: {} },
    offset: { x: 0.5, y: 0.5 },
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

beforeEach(async () => {
  await migrate();
  const d = await db();
  await d.query("TRUNCATE comments, projects CASCADE");
  await store.upsertProject(project);
});

describe("store", () => {
  it("upsert normalizes the URL and round-trips the comment", async () => {
    const c = await store.upsertComment(make());
    expect(c.url).toBe("/p"); // utm_source stripped
    expect(c.screenshot).toBeUndefined();
    expect((await store.getComment("c1"))!.body).toBe("hi");
  });

  it("defaults kind to 'element' and round-trips a region comment", async () => {
    const el = await store.upsertComment(make());
    expect(el.kind).toBe("element");
    expect(el.region).toBeUndefined();

    const region = await store.upsertComment(make({
      id: "c2", kind: "region", region: { x: 40, y: 120, w: 300, h: 180 },
    }));
    expect(region.kind).toBe("region");
    expect(region.region).toEqual({ x: 40, y: 120, w: 300, h: 180 });
    expect((await store.getComment("c2"))!.region).toEqual({ x: 40, y: 120, w: 300, h: 180 });
  });

  it("upsert replaces on conflicting id", async () => {
    await store.upsertComment(make());
    await store.upsertComment(make({ body: "updated", screenshot: "http://x/y.png" }));
    const c = await store.getComment("c1");
    expect(c!.body).toBe("updated");
    expect(c!.screenshot).toBe("http://x/y.png");
  });

  it("lists by project and normalized URL", async () => {
    await store.upsertComment(make());
    expect((await store.listComments("pk_test")).length).toBe(1);
    expect((await store.listComments("pk_test", { url: "/p?utm_source=other" })).length).toBe(1);
    expect((await store.listComments("pk_test", { url: "/nope" })).length).toBe(0);
  });

  it("filters in SQL by repo, branch, stage, priority, type, kind and text", async () => {
    const withRepo = await store.upsertComment(make({ id: "r0", repo: "acme/web", branch: "main" }));
    expect(withRepo.repo).toBe("acme/web");
    expect(withRepo.branch).toBe("main");

    await store.upsertComment(make({ id: "f1", repo: "acme/web", branch: "main", priority: "critical", changeType: "frontend", title: "Checkout total", body: "overlaps the footer" }));
    await store.upsertComment(make({ id: "f2", repo: "acme/web", branch: "feature/x", priority: "low", changeType: "api", title: "Refund 500", body: "server error" }));
    await store.upsertComment(make({ id: "f3", repo: "acme/api", branch: "main", kind: "free", title: "Docs typo", body: "cramped" }));

    const ids = async (f: store.CommentFilters) =>
      (await store.listComments("pk_test", f)).map((c) => c.id).sort();

    expect(await ids({ repo: "acme/web" })).toEqual(["f1", "f2", "r0"]);
    expect(await ids({ repo: "acme/web", branch: "main" })).toEqual(["f1", "r0"]);
    expect(await ids({ priority: "critical" })).toEqual(["f1"]);
    expect(await ids({ changeType: "api" })).toEqual(["f2"]);
    expect(await ids({ kind: "free" })).toEqual(["f3"]);
    // Text search is case-insensitive and matches the title as well as the body.
    expect(await ids({ q: "refund" })).toEqual(["f2"]);
    expect(await ids({ q: "REFUND" })).toEqual(["f2"]);
    expect(await ids({ q: "overlaps" })).toEqual(["f1"]);
    // Legacy stage names still match board rows.
    expect(await ids({ status: "open" })).toEqual(["f1", "f2", "f3", "r0"]);
    // Filters compose.
    expect(await ids({ repo: "acme/web", priority: "critical", q: "checkout" })).toEqual(["f1"]);
  });

  it("patches status and body; no-op patch returns the comment", async () => {
    await store.upsertComment(make());
    const p = await store.patchComment("c1", { status: "resolved", body: "b2" });
    expect(p!.status).toBe("resolved");
    expect(p!.body).toBe("b2");
    expect((await store.patchComment("c1", {}))!.id).toBe("c1");
    expect(await store.patchComment("missing", { status: "resolved" })).toBeNull();
  });

  it("accepts the legacy three-value statuses and stores the canonical stage", async () => {
    // A rolling upgrade: an older client (or an older row) still writes `open` / `done`.
    const opened = await store.upsertComment(make({ id: "legacy1", status: "open" as any }));
    expect(opened.status).toBe("queue");
    const done = await store.upsertComment(make({ id: "legacy2", status: "done" as any }));
    expect(done.status).toBe("resolved");
    const patched = await store.patchComment("legacy1", { status: "done" as any });
    expect(patched!.status).toBe("resolved");
  });

  it("round-trips priority and change type, defaulting when absent", async () => {
    const set = await store.upsertComment(make({ id: "t1", priority: "critical", changeType: "api" }));
    expect(set.priority).toBe("critical");
    expect(set.changeType).toBe("api");

    // A comment filed without triage metadata reads as the defaults, not undefined.
    const bare = await store.upsertComment(make({ id: "t2" }));
    expect(bare.priority).toBe("medium");
    expect(bare.changeType).toBe("other");

    // Unknown values are coerced rather than stored raw.
    const junk = await store.upsertComment(make({ id: "t3", priority: "urgent" as any, changeType: "css" as any }));
    expect(junk.priority).toBe("medium");
    expect(junk.changeType).toBe("other");
  });

  it("patches priority and change type", async () => {
    await store.upsertComment(make());
    const p = await store.patchComment("c1", { priority: "low" as any, changeType: "backend" as any });
    expect(p!.priority).toBe("low");
    expect(p!.changeType).toBe("backend");
  });

  it("round-trips a screen recording URL", async () => {
    const c = await store.upsertComment(make({
      id: "c3", kind: "region", recording: "http://x/rec.webm",
    }));
    expect(c.recording).toBe("http://x/rec.webm");
    expect((await store.getComment("c3"))!.recording).toBe("http://x/rec.webm");
  });

  it("patches a proposal (Claude's modified UI) back onto a comment", async () => {
    await store.upsertComment(make());
    const proposal = { html: "<b>new</b>", css: ".x{color:red}", notes: "tightened", author: "Claude Code via MCP", createdAt: "2026-01-02T00:00:00.000Z" };
    const p = await store.patchComment("c1", { proposal });
    expect(p!.proposal).toEqual(proposal);
    expect((await store.getComment("c1"))!.proposal).toEqual(proposal);
  });

  it("removes a comment", async () => {
    await store.upsertComment(make());
    expect(await store.removeComment("c1")).toBe(true);
    expect(await store.removeComment("c1")).toBe(false);
    expect(await store.getComment("c1")).toBeNull();
  });

  it("gets and upserts projects", async () => {
    expect((await store.getProject("pk_test"))!.secret).toBe("s3cr3t");
    await store.upsertProject({ ...project, name: "Renamed" });
    expect((await store.getProject("pk_test"))!.name).toBe("Renamed");
    expect(await store.getProject("nope")).toBeNull();
  });
});
