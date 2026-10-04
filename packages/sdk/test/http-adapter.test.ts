import { afterEach, describe, expect, it, vi } from "vitest";
import type { Comment } from "../src/types.ts";
import { HttpAdapter } from "../src/http-adapter.ts";

const user = { id: "u1", name: "U" };
const res = (status: number, json: unknown) => ({ ok: status < 400, status, json: async () => json });
const comment = (over: Partial<Comment> = {}): Comment => ({
  id: "c1", projectKey: "pk", url: "/p", author: user, body: "b", status: "open",
  anchor: {} as any, context: { html: "", styles: {} }, offset: { x: 0, y: 0 }, createdAt: "t", ...over,
});

afterEach(() => vi.restoreAllMocks());

describe("HttpAdapter", () => {
  it("sends identity headers on list", async () => {
    const f = vi.fn().mockResolvedValue(res(200, []));
    vi.stubGlobal("fetch", f);
    await new HttpAdapter("http://api/", user, "hmac123").list("pk", "/p");
    const [url, init] = f.mock.calls[0]!;
    expect(url).toContain("/v1/comments?");
    expect(init.headers["X-Loupe-User"]).toBe("u1");
    expect(init.headers["X-Loupe-Hmac"]).toBe("hmac123");
  });

  it("uploads the screenshot blob first, then saves with the URL", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(res(201, { url: "http://api/v1/blobs/x" }))
      .mockResolvedValueOnce(res(201, { id: "c1" }));
    vi.stubGlobal("fetch", f);
    await new HttpAdapter("http://api", user).save(comment({ screenshot: "data:image/png;base64,AAAA" }));
    expect(f.mock.calls[0]![0]).toContain("/v1/blobs");
    expect(JSON.parse(f.mock.calls[1]![1].body).screenshot).toBe("http://api/v1/blobs/x");
  });

  it("falls back to inlining when the blob upload fails", async () => {
    const f = vi.fn().mockResolvedValueOnce(res(500, {})).mockResolvedValueOnce(res(201, { id: "c1" }));
    vi.stubGlobal("fetch", f);
    await new HttpAdapter("http://api", user).save(comment({ screenshot: "data:image/png;base64,AAAA" }));
    expect(JSON.parse(f.mock.calls[1]![1].body).screenshot).toBe("data:image/png;base64,AAAA");
  });

  it("skips the blob upload when there is no screenshot", async () => {
    const f = vi.fn().mockResolvedValue(res(201, { id: "c1" }));
    vi.stubGlobal("fetch", f);
    await new HttpAdapter("http://api", user).save(comment());
    expect(f.mock.calls.length).toBe(1);
    expect(f.mock.calls[0]![0]).toContain("/v1/comments");
  });

  it("PATCHes on update and DELETEs on remove (tolerating 404)", async () => {
    const f = vi.fn().mockResolvedValue(res(200, {}));
    vi.stubGlobal("fetch", f);
    const a = new HttpAdapter("http://api", user);
    await a.update("c1", { status: "done" });
    expect(f.mock.calls[0]![1].method).toBe("PATCH");
    f.mockResolvedValue(res(404, {}));
    await expect(a.remove("c1")).resolves.toBeUndefined();
  });

  it("throws on list/save/update failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res(500, {})));
    const a = new HttpAdapter("http://api", user);
    await expect(a.list("pk", "/p")).rejects.toThrow();
    await expect(a.save(comment())).rejects.toThrow();
    await expect(a.update("c1", { status: "done" })).rejects.toThrow();
  });

  it("reads the organization, and treats a 404 as no endpoint", async () => {
    const org = { organization: { id: "o", name: "Acme" }, project: { name: "Shop", destination: null }, projects: [] };
    const f = vi.fn().mockResolvedValueOnce(res(200, org)).mockResolvedValueOnce(res(404, {}));
    vi.stubGlobal("fetch", f);
    const a = new HttpAdapter("http://api", user, "h");
    await expect(a.getOrg()).resolves.toEqual(org);
    expect(f.mock.calls[0]![0]).toBe("http://api/v1/org");
    expect(f.mock.calls[0]![1].headers["X-Loupe-User"]).toBe("u1");
    await expect(a.getOrg()).resolves.toBeNull();
  });

  it("refuses an organization answer of the wrong shape, and a failed read", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(res(200, [])).mockResolvedValueOnce(res(500, {})));
    const a = new HttpAdapter("http://api", user);
    await expect(a.getOrg()).rejects.toThrow(/not an organization/);
    await expect(a.getOrg()).rejects.toThrow(/getOrg failed: 500/);
  });

  it("reads the activity feed with an optional since, and treats a 404 as no feed", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(res(200, [{ id: "e1", at: "t", kind: "k", label: "l" }]))
      .mockResolvedValueOnce(res(200, []))
      .mockResolvedValueOnce(res(404, {}));
    vi.stubGlobal("fetch", f);
    const a = new HttpAdapter("http://api", user);
    await expect(a.listActivity("pk")).resolves.toHaveLength(1);
    expect(f.mock.calls[0]![0]).toBe("http://api/v1/activity?projectKey=pk");
    await a.listActivity("pk", "2026-10-01T10:00:00Z");
    expect(f.mock.calls[1]![0]).toBe("http://api/v1/activity?projectKey=pk&since=2026-10-01T10%3A00%3A00Z");
    await expect(a.listActivity("pk")).resolves.toBeNull();
  });

  it("refuses an activity answer that is not a list, and a failed read", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(res(200, { error: "x" })).mockResolvedValueOnce(res(500, {})));
    const a = new HttpAdapter("http://api", user);
    await expect(a.listActivity("pk")).rejects.toThrow(/not a list/);
    await expect(a.listActivity("pk")).rejects.toThrow(/listActivity failed: 500/);
  });
});
