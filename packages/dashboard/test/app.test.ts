// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const now = new Date().toISOString();
const COMMENTS = [
  { id: "1", projectKey: "pk", url: "/p", status: "open", body: "open one", author: { id: "u", name: "Sara Kim" }, anchor: { cssPath: '[data-testid="x"]', testid: "x" }, context: { html: "<b/>", styles: {} }, createdAt: now },
  { id: "2", projectKey: "pk", url: "/p", status: "done", body: "done one", author: { id: "u", name: "Dev Team" }, anchor: { cssPath: ".y", testid: null }, context: { html: "", styles: {} }, screenshot: "http://blob/x", createdAt: now },
];

function shell() {
  document.body.innerHTML = `
    <span id="project"></span>
    <select id="pageFilter"></select>
    <button id="refresh"></button>
    <div id="board"></div>
    <div id="status"></div>`;
}

let fetchMock: any;
beforeEach(() => {
  localStorage.clear();
  shell();
  fetchMock = vi.fn(async (url: string) =>
    String(url).includes("/v1/comments?")
      ? { ok: true, status: 200, json: async () => COMMENTS }
      : { ok: true, status: 200, json: async () => ({}) },
  );
  vi.stubGlobal("fetch", fetchMock);
  vi.resetModules();
});
afterEach(() => vi.restoreAllMocks());

describe("dashboard", () => {
  it("renders comments into status columns", async () => {
    await import("../app.ts");
    await new Promise((r) => setTimeout(r, 20));
    expect(document.querySelectorAll(".col").length).toBe(3);
    expect(document.querySelectorAll(".card").length).toBe(2);
    expect(document.querySelector(".col.open .n")!.textContent).toBe("1");
    expect(document.querySelector(".col.done .n")!.textContent).toBe("1");
  });

  it("moving a card forward PATCHes its status", async () => {
    await import("../app.ts");
    await new Promise((r) => setTimeout(r, 20));
    const fwd = document.querySelectorAll<HTMLElement>(".col.open .card .iconbtn")[1]!;
    fwd.click();
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock.mock.calls.some((c: any[]) => c[1]?.method === "PATCH")).toBe(true);
  });

  it("shows an authorization error on 401", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    await import("../app.ts");
    await new Promise((r) => setTimeout(r, 20));
    expect(document.querySelector("#status")!.textContent).toContain("Not authorized");
  });
});
