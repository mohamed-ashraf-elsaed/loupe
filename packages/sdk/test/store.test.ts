// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import type { Comment } from "../src/types.ts";
import { LocalStorageAdapter } from "../src/store.ts";

const c = (id: string, over: Partial<Comment> = {}): Comment => ({
  id, projectKey: "pk", url: "/p", author: { id: "u", name: "U" }, body: "b", status: "open",
  anchor: {} as any, context: { html: "", styles: {} }, offset: { x: 0, y: 0 }, createdAt: "t", ...over,
});

const a = new LocalStorageAdapter();
beforeEach(() => localStorage.clear());

describe("LocalStorageAdapter", () => {
  it("saves and lists scoped by project + url", async () => {
    await a.save(c("1"));
    await a.save(c("2", { url: "/other" }));
    expect((await a.list("pk", "/p")).length).toBe(1);
    expect((await a.list("pk", "/other")).length).toBe(1);
  });

  it("updates by id across keys", async () => {
    await a.save(c("1"));
    await a.update("1", { status: "done" });
    expect((await a.list("pk", "/p"))[0]!.status).toBe("done");
  });

  it("removes by id", async () => {
    await a.save(c("1"));
    await a.remove("1");
    expect((await a.list("pk", "/p")).length).toBe(0);
  });

  it("returns [] for missing keys and bad JSON", async () => {
    expect((await a.list("pk", "/none")).length).toBe(0);
    localStorage.setItem("loupe:pk:/bad", "not json");
    expect((await a.list("pk", "/bad")).length).toBe(0);
  });

  it("update/remove no-op when id is absent", async () => {
    await a.save(c("1"));
    await a.update("missing", { status: "done" });
    await a.remove("missing");
    expect((await a.list("pk", "/p")).length).toBe(1);
  });
});
