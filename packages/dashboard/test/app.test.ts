// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const now = new Date().toISOString();
const COMMENTS = [
  { id: "1", projectKey: "pk", url: "/p", status: "queue", priority: "high", changeType: "frontend", title: "Revenue card", body: "open one", author: { id: "u", name: "Sara Kim" }, anchor: { cssPath: '[data-testid="x"]', testid: "x" }, context: { html: "<b/>", styles: {} }, createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "2", projectKey: "pk", url: "/p", status: "resolved", priority: "low", changeType: "backend", title: "Sidebar spacing", body: "done one", author: { id: "u", name: "Dev Team" }, anchor: { cssPath: ".y", testid: null }, context: { html: "", styles: {} }, screenshot: "http://blob/x", createdAt: now },
  // No triage metadata: reads as the defaults (Medium · Other) and sorts last.
  { id: "3", projectKey: "pk", url: "/p", status: "queue", title: "Tooltip copy", body: "tiny one", author: { id: "u", name: "Ali" }, anchor: { cssPath: ".z", testid: null }, context: { html: "", styles: {} }, createdAt: now },
];

function shell() {
  document.body.innerHTML = `
    <span id="project"></span>
    <input id="search" />
    <select id="pageFilter"></select>
    <select id="kindFilter"></select>
    <select id="deviceFilter"></select>
    <!-- Options mirror index.html: a <select> whose value has no matching option
         silently reads back as "". -->
    <select id="priorityFilter">
      <option value="">All</option>
      <option value="critical">Critical</option>
      <option value="high">High</option>
      <option value="medium">Medium</option>
      <option value="low">Low</option>
    </select>
    <select id="typeFilter">
      <option value="">All</option>
      <option value="frontend">Frontend</option>
      <option value="backend">Backend</option>
      <option value="api">API</option>
      <option value="other">Other</option>
    </select>
    <select id="sortOrder">
      <option value="newest">Newest</option>
      <option value="oldest">Oldest</option>
      <option value="priority">Priority</option>
    </select>
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
    expect(document.querySelectorAll(".card").length).toBe(3);
    expect(document.querySelector(".col.stage-queue .n")!.textContent).toBe("2");
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
    const card = document.querySelector<HTMLElement>('.col.stage-queue .card[data-id="1"]')!;
    expect(card.classList.contains("collapsed")).toBe(true);
    expect(card.querySelector(".ctitle")!.textContent).toBe("Revenue card");
  });

  it("search narrows the board to matching cards", async () => {
    await import("../app.ts");
    await new Promise((r) => setTimeout(r, 20));
    expect(document.querySelectorAll(".card").length).toBe(3);

    const search = document.querySelector<HTMLInputElement>("#search")!;
    search.value = "sidebar";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(document.querySelectorAll(".card").length).toBe(1);
  });

  it("shows priority and change-type chips on the card", async () => {
    await import("../app.ts");
    await new Promise((r) => setTimeout(r, 20));
    const card = (id: string) => document.querySelector<HTMLElement>(`.card[data-id="${id}"]`)!;
    expect(card("1").querySelector(".chip.prio")!.textContent).toBe("High");
    expect(card("1").querySelector(".chip.ctype")!.textContent).toBe("Frontend");
    // Filed without triage metadata → the defaults.
    expect(card("3").querySelector(".chip.prio")!.textContent).toBe("Medium");
    expect(card("3").querySelector(".chip.ctype")!.textContent).toBe("Other");
  });

  it("filters by priority and by change type", async () => {
    await import("../app.ts");
    await new Promise((r) => setTimeout(r, 20));
    const cards = () => document.querySelectorAll(".card").length;

    const prio = document.querySelector<HTMLSelectElement>("#priorityFilter")!;
    prio.value = "low";
    prio.dispatchEvent(new Event("change", { bubbles: true }));
    expect(cards()).toBe(1); // only the resolved card

    prio.value = "";
    prio.dispatchEvent(new Event("change", { bubbles: true }));
    expect(cards()).toBe(3);

    const type = document.querySelector<HTMLSelectElement>("#typeFilter")!;
    type.value = "frontend";
    type.dispatchEvent(new Event("change", { bubbles: true }));
    expect(cards()).toBe(1);
  });

  it("sorts by priority, most urgent first", async () => {
    await import("../app.ts");
    await new Promise((r) => setTimeout(r, 20));
    const queueTitles = () =>
      [...document.querySelectorAll<HTMLElement>(".col.stage-queue .ctitle")].map((n) => n.textContent);

    // Newest first by default: the older, higher-priority card comes last.
    expect(queueTitles()).toEqual(["Tooltip copy", "Revenue card"]);

    const sort = document.querySelector<HTMLSelectElement>("#sortOrder")!;
    sort.value = "priority";
    sort.dispatchEvent(new Event("change", { bubbles: true }));
    expect(queueTitles()).toEqual(["Revenue card", "Tooltip copy"]);
  });

  it("re-triages from the card without opening it", async () => {
    await import("../app.ts");
    await new Promise((r) => setTimeout(r, 20));
    const sel = document.querySelector<HTMLSelectElement>(".col.stage-queue .card select.mini")!;
    sel.value = "critical";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 20));
    const patch = fetchMock.mock.calls.find((c: any[]) => c[1]?.method === "PATCH" && /priority/.test(String(c[1].body)))!;
    expect(patch).toBeTruthy();
    expect(JSON.parse(patch[1].body)).toEqual({ priority: "critical" });
  });

  it("shows an authorization error on 401", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    await import("../app.ts");
    await new Promise((r) => setTimeout(r, 20));
    expect(document.querySelector("#status")!.textContent).toContain("Not authorized");
  });
});
