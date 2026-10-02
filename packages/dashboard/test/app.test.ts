// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const now = new Date().toISOString();
const COMMENTS = [
  { id: "1", projectKey: "pk", url: "/p", status: "queue", priority: "high", changeType: "frontend", repo: "acme/web", branch: "main", title: "Revenue card", body: "open one", author: { id: "u", name: "Sara Kim" }, anchor: { cssPath: '[data-testid="x"]', testid: "x" }, context: { html: "<b/>", styles: {} }, createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "2", projectKey: "pk", url: "/p", status: "resolved", priority: "low", changeType: "backend", repo: "acme/api", branch: "main", title: "Sidebar spacing", body: "done one", author: { id: "u", name: "Dev Team" }, anchor: { cssPath: ".y", testid: null }, context: { html: "", styles: {} }, screenshot: "http://blob/x", createdAt: now },
  // No triage metadata: reads as the defaults (Medium · Other) and sorts last.
  { id: "3", projectKey: "pk", url: "/p", status: "queue", title: "Tooltip copy", body: "tiny one", author: { id: "u", name: "Ali" }, anchor: { cssPath: ".z", testid: null }, context: { html: "", styles: {} }, createdAt: now },
  // Waiting on a human, and critical — the "Needs you" / "Critical" saved views.
  { id: "4", projectKey: "pk", url: "/q", status: "in_review", priority: "critical", changeType: "frontend", repo: "acme/web", branch: "feature/x", title: "Align checkmarks", body: "misaligned", author: { id: "u", name: "Mia" }, anchor: { cssPath: ".w", testid: null }, context: { html: "", styles: {} }, createdAt: now },
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
    <select id="repoFilter"></select>
    <select id="branchFilter"></select>
    <select id="viewFilter"></select>
    <button id="refresh"></button>
    <button id="density"></button>
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
    expect(document.querySelectorAll(".card").length).toBe(4);
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
    expect(document.querySelectorAll(".card").length).toBe(4);

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
    expect(cards()).toBe(4);

    const type = document.querySelector<HTMLSelectElement>("#typeFilter")!;
    type.value = "frontend";
    type.dispatchEvent(new Event("change", { bubbles: true }));
    expect(cards()).toBe(2); // ids 1 and 4
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

  it("filters by repo and by branch", async () => {
    await import("../app.ts");
    await new Promise((r) => setTimeout(r, 20));
    const cards = () => document.querySelectorAll(".card").length;

    // Options are built from the data, so a newly connected repo just appears.
    const repo = document.querySelector<HTMLSelectElement>("#repoFilter")!;
    expect([...repo.options].map((o) => o.value)).toEqual(["", "acme/api", "acme/web"]);

    repo.value = "acme/web";
    repo.dispatchEvent(new Event("change", { bubbles: true }));
    expect(cards()).toBe(2); // ids 1 and 4

    repo.value = "";
    repo.dispatchEvent(new Event("change", { bubbles: true }));

    const branch = document.querySelector<HTMLSelectElement>("#branchFilter")!;
    expect([...branch.options].map((o) => o.value)).toEqual(["", "feature/x", "main"]);
    branch.value = "main";
    branch.dispatchEvent(new Event("change", { bubbles: true }));
    expect(cards()).toBe(2); // ids 1 and 2

    // Compose with the stage board: repo + branch narrow to one card.
    repo.value = "acme/web";
    repo.dispatchEvent(new Event("change", { bubbles: true }));
    expect(cards()).toBe(1); // id 1 only (id 4 is on feature/x)
  });

  it("saved views filter the board and persist the choice", async () => {
    await import("../app.ts");
    await new Promise((r) => setTimeout(r, 20));
    const cards = () => document.querySelectorAll(".card").length;
    const view = document.querySelector<HTMLSelectElement>("#viewFilter")!;
    expect([...view.options].map((o) => o.value)).toEqual(["all", "needs_you", "critical", "unassigned"]);

    view.value = "needs_you";
    view.dispatchEvent(new Event("change", { bubbles: true }));
    expect(cards()).toBe(1); // id 4 — the only In Review, i.e. waiting on a human
    expect(localStorage.getItem("loupe_board_view")).toBe("needs_you");
    expect(location.search).toContain("view=needs_you");

    view.value = "critical";
    view.dispatchEvent(new Event("change", { bubbles: true }));
    expect(cards()).toBe(1);

    view.value = "unassigned";
    view.dispatchEvent(new Event("change", { bubbles: true }));
    expect(cards()).toBe(1); // id 3 has no repo

    view.value = "all";
    view.dispatchEvent(new Event("change", { bubbles: true }));
    expect(cards()).toBe(4);
    expect(location.search).not.toContain("view=");
  });

  it("leads the card with the screenshot and hides it in compact density", async () => {
    await import("../app.ts");
    await new Promise((r) => setTimeout(r, 20));

    // id 2 is the only fixture with a screenshot; it leads the card face.
    const shot = document.querySelector<HTMLElement>('.card[data-id="2"] .cthumb img')!;
    expect(shot.getAttribute("src")).toBe("http://blob/x");
    // A card with no media has no strip.
    expect(document.querySelector('.card[data-id="1"] .cthumb')).toBeNull();

    const board = document.getElementById("board")!;
    const density = document.querySelector<HTMLButtonElement>("#density")!;
    expect(board.dataset.density).toBe("comfortable");
    expect(density.textContent).toBe("Compact");

    density.click();
    expect(board.dataset.density).toBe("compact");
    expect(density.textContent).toBe("Comfortable");
    expect(localStorage.getItem("loupe_board_density")).toBe("compact");

    density.click();
    expect(board.dataset.density).toBe("comfortable");
  });

  it("copies a full agent brief for a card", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    await import("../app.ts");
    await new Promise((r) => setTimeout(r, 20));
    const btn = [...document.querySelectorAll<HTMLButtonElement>('.card[data-id="1"] .linkbtn')]
      .find((b) => b.textContent === "Copy for agent")!;
    btn.click();
    await new Promise((r) => setTimeout(r, 20));

    expect(writeText).toHaveBeenCalledTimes(1);
    const text = writeText.mock.calls[0][0] as string;
    expect(text).toContain("# Feedback #1");
    expect(text).toContain("**Priority:** High");
    expect(text).toContain("**Repo:** acme/web @ main");
    expect(text).toContain("**Target:** [data-testid=\"x\"]");
    expect(text).toContain("<b/>");              // the element HTML
    expect(text).toContain("## Computed styles"); // and its styles block
    expect(btn.textContent).toBe("Copied ✓");
  });

  it("expands a card from the keyboard", async () => {
    await import("../app.ts");
    await new Promise((r) => setTimeout(r, 20));
    const first = () => document.querySelector<HTMLElement>('.card[data-id="1"]')!;

    expect(first().classList.contains("collapsed")).toBe(true);
    expect(first().getAttribute("role")).toBe("button");
    expect(first().getAttribute("aria-expanded")).toBe("false");

    first().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(first().classList.contains("collapsed")).toBe(false);
    expect(first().getAttribute("aria-expanded")).toBe("true");

    first().dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    expect(first().classList.contains("collapsed")).toBe(true);
  });

  it("shows a loading state until the first fetch lands", async () => {
    await import("../app.ts");
    const status = document.querySelector<HTMLElement>("#status")!;
    expect(status.className).toBe("loading");

    await new Promise((r) => setTimeout(r, 20));
    expect(status.style.display).toBe("none");
  });

  it("shows an authorization error on 401", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    await import("../app.ts");
    await new Promise((r) => setTimeout(r, 20));
    expect(document.querySelector("#status")!.textContent).toContain("Not authorized");
  });
});
