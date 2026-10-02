// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const now = new Date().toISOString();
const COMMENTS = [
  { id: "1", projectKey: "pk", url: "/p", status: "queue", title: "Revenue card", body: "open one", author: { id: "u", name: "Sara Kim" }, anchor: { cssPath: '[data-testid="x"]', testid: "x" }, context: { html: "<b/>", styles: {} }, createdAt: now },
  { id: "2", projectKey: "pk", url: "/p", status: "resolved", title: "Sidebar spacing", body: "done one", author: { id: "u", name: "Dev Team" }, anchor: { cssPath: ".y", testid: null }, context: { html: "", styles: {} }, screenshot: "http://blob/x", createdAt: now },
];

function shell() {
  document.body.innerHTML = `
    <span id="project"></span>
    <input id="search" />
    <select id="pageFilter"></select>
    <select id="kindFilter"></select>
    <select id="deviceFilter"></select>
    <select id="sortOrder"></select>
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
      ? { ok: true, status: 200, json: async () => structuredClone(COMMENTS) }
      : { ok: true, status: 200, json: async () => ({}) },
  );
  vi.stubGlobal("fetch", fetchMock);
  vi.resetModules();
});
afterEach(() => vi.restoreAllMocks());

describe("dashboard", () => {
  it("renders comments into the five board stages", async () => {
    await import("../app.ts");
    await new Promise((r) => setTimeout(r, 20));
    expect(document.querySelectorAll(".col").length).toBe(5);
    expect([...document.querySelectorAll(".col-head h2")].map((h) => h.textContent)).toEqual([
      "Queue", "To Do", "In Progress", "In Review", "Resolved",
    ]);
    expect(document.querySelectorAll(".card").length).toBe(2);
    expect(document.querySelector(".col.stage-queue .n")!.textContent).toBe("1");
    expect(document.querySelector(".col.stage-resolved .n")!.textContent).toBe("1");
  });

  it("moving a card forward PATCHes its status", async () => {
    await import("../app.ts");
    await new Promise((r) => setTimeout(r, 20));
    const fwd = document.querySelectorAll<HTMLElement>(".col.stage-queue .card .iconbtn")[1]!;
    fwd.click();
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock.mock.calls.some((c: any[]) => c[1]?.method === "PATCH")).toBe(true);
    // Queue → To Do, the next stage, not the old open → in_progress jump.
    const patch = fetchMock.mock.calls.find((c: any[]) => c[1]?.method === "PATCH")!;
    expect(JSON.parse(patch[1].body).status).toBe("todo");
  });

  it("shows the title as a summary and collapses the card by default", async () => {
    await import("../app.ts");
    await new Promise((r) => setTimeout(r, 20));
    const card = document.querySelector<HTMLElement>(".col.stage-queue .card")!;
    expect(card.classList.contains("collapsed")).toBe(true);
    expect(card.querySelector(".ctitle")!.textContent).toBe("Revenue card");
  });

  it("search narrows the board to matching cards", async () => {
    await import("../app.ts");
    await new Promise((r) => setTimeout(r, 20));
    expect(document.querySelectorAll(".card").length).toBe(2);

    const search = document.querySelector<HTMLInputElement>("#search")!;
    search.value = "sidebar";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(document.querySelectorAll(".card").length).toBe(1);
  });

  it("shows an authorization error on 401", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    await import("../app.ts");
    await new Promise((r) => setTimeout(r, 20));
    expect(document.querySelector("#status")!.textContent).toContain("Not authorized");
  });
});
