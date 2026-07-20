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
    status: "open",
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
    expect((await store.listComments("pk_test", "/p?utm_source=other")).length).toBe(1);
    expect((await store.listComments("pk_test", "/nope")).length).toBe(0);
  });

  it("patches status and body; no-op patch returns the comment", async () => {
    await store.upsertComment(make());
    const p = await store.patchComment("c1", { status: "done", body: "b2" });
    expect(p!.status).toBe("done");
    expect(p!.body).toBe("b2");
    expect((await store.patchComment("c1", {}))!.id).toBe("c1");
    expect(await store.patchComment("missing", { status: "done" })).toBeNull();
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
