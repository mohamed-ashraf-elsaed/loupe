// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { destroy, init } from "../src/index.ts";

const sr = () => document.getElementById("loupe-root")!.shadowRoot!;
const fire = (el: Element, type: string, extra: Record<string, number> = {}) =>
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...extra }));

async function leaveComment(text: string) {
  sr().querySelector<HTMLElement>('[data-role="inspect"]')!.click();
  const btn = document.querySelector('[data-testid="save"]')!;
  fire(btn, "mousemove", { clientX: 5, clientY: 5 });
  fire(btn, "click", { clientX: 5, clientY: 5 });
  const ta = sr().querySelector<HTMLTextAreaElement>(".composer textarea")!;
  ta.value = text;
  ta.dispatchEvent(new Event("input", { bubbles: true }));
  sr().querySelector<HTMLElement>(".composer .primary")!.click();
  await new Promise((r) => setTimeout(r, 10));
}

beforeEach(() => {
  localStorage.clear();
  (Element.prototype as any).scrollIntoView = () => {};
  document.body.innerHTML = `<main><button data-testid="save">Save</button></main>`;
  // happy-dom has no layout engine, so elementFromPoint returns null — stub it to
  // the element the inspector should select. (Real browsers use true hit-testing.)
  (document as any).elementFromPoint = () => document.querySelector('[data-testid="save"]');
});
afterEach(() => destroy());

describe("LoupeApp", () => {
  it("mounts a Shadow-DOM control panel for the identified user", () => {
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    expect(document.getElementById("loupe-root")).toBeTruthy();
    expect(sr().querySelector('[data-role="inspect"]')).toBeTruthy();
    expect(sr().querySelector(".dock")!.classList.contains("open")).toBe(true);
    expect(sr().querySelector(".count")!.textContent).toBe("0");
  });

  it("is idempotent — init twice mounts one root", () => {
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    expect(document.querySelectorAll("#loupe-root").length).toBe(1);
  });

  it("inspect → comment creates a persisted, anchored pin", async () => {
    init({ projectKey: "pk", user: { id: "u", name: "U" }, captureScreenshot: async () => undefined });
    await leaveComment("make it blue");
    expect(sr().querySelectorAll(".pin").length).toBe(1);
    const stored = JSON.parse(localStorage.getItem(`loupe:pk:${location.pathname}${location.search}`)!);
    expect(stored.length).toBe(1);
    expect(stored[0].body).toBe("make it blue");
    expect(stored[0].anchor.testid).toBe("save");
  });

  it("re-loads and re-anchors existing comments on init", async () => {
    init({ projectKey: "pk", user: { id: "u", name: "U" }, captureScreenshot: async () => undefined });
    await leaveComment("persisted");
    destroy();
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    await new Promise((r) => setTimeout(r, 10)); // start() loads from storage async
    expect(sr().querySelectorAll(".pin").length).toBe(1);
    expect(sr().querySelector(".count")!.textContent).toBe("1");
  });

  it("lists the comment in the panel and can mark it done then delete it", async () => {
    init({ projectKey: "pk", user: { id: "u", name: "U" }, captureScreenshot: async () => undefined });
    await leaveComment("triage me");
    // The panel is a single always-open dock; the comment list renders inline.
    expect(sr().querySelector(".dock")!.classList.contains("open")).toBe(true);
    expect(sr().querySelector(".item .body")!.textContent).toBe("triage me");

    sr().querySelector<HTMLElement>(".item .actions button")!.click(); // Mark done
    await new Promise((r) => setTimeout(r, 5));
    expect(sr().querySelector(".pin")!.classList.contains("done")).toBe(true);

    const del = [...sr().querySelectorAll<HTMLElement>(".item .actions button")].find((b) => b.textContent === "Delete")!;
    del.click();
    await new Promise((r) => setTimeout(r, 5));
    expect(sr().querySelectorAll(".pin").length).toBe(0);
  });

  it("region shot → drag creates a persisted region comment with a screenshot", async () => {
    init({
      projectKey: "pk", user: { id: "u", name: "U" },
      captureRegion: async () => "data:image/png;base64,REGION",
    });
    // Enter region mode, then drag a box.
    sr().querySelector<HTMLElement>('[data-role="region"]')!.click();
    fire(document.body, "mousedown", { clientX: 10, clientY: 20, button: 0 });
    fire(document.body, "mousemove", { clientX: 130, clientY: 110 });
    fire(document.body, "mouseup", { clientX: 130, clientY: 110, button: 0 });
    await new Promise((r) => setTimeout(r, 10)); // capture is async

    const ta = sr().querySelector<HTMLTextAreaElement>(".composer textarea")!;
    expect(ta).toBeTruthy();
    ta.value = "this whole area is misaligned";
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    sr().querySelector<HTMLElement>(".composer .primary")!.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(sr().querySelectorAll(".pin").length).toBe(1);
    const stored = JSON.parse(localStorage.getItem(`loupe:pk:${location.pathname}${location.search}`)!);
    expect(stored[0].kind).toBe("region");
    expect(stored[0].region).toMatchObject({ x: 10, y: 20, w: 120, h: 90 });
    expect(stored[0].screenshot).toBe("data:image/png;base64,REGION");
    // The region anchors to the element under its center (survives reflow), so it
    // carries that element's real fingerprint rather than a synthetic one.
    expect(stored[0].anchor.testid).toBe("save");
  });

  it("free note → click drops a page-level comment with no element or screenshot", async () => {
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    sr().querySelector<HTMLElement>('[data-role="free"]')!.click();
    // Click anywhere on the page — no element selection needed.
    fire(document.body, "click", { clientX: 40, clientY: 60 });
    const ta = sr().querySelector<HTMLTextAreaElement>(".composer textarea")!;
    expect(ta).toBeTruthy();
    // Free notes never offer a screenshot checkbox.
    expect(sr().querySelector(".composer .chk")).toBeNull();
    ta.value = "the whole page needs more spacing";
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    sr().querySelector<HTMLElement>(".composer .primary")!.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(sr().querySelectorAll(".pin.free").length).toBe(1);
    const stored = JSON.parse(localStorage.getItem(`loupe:pk:${location.pathname}${location.search}`)!);
    expect(stored[0].kind).toBe("free");
    expect(stored[0].screenshot).toBeUndefined();
    expect(stored[0].anchor.tag).toBe("page");
  });

  it("closes to a launcher and reopens", () => {
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    expect(sr().querySelector(".dock")!.classList.contains("open")).toBe(true);
    sr().querySelector<HTMLElement>('.dctl [data-role="close"]')!.click();
    expect(sr().querySelector(".dock")!.classList.contains("open")).toBe(false);
    expect(sr().querySelector(".launcher")!.classList.contains("show")).toBe(true);
    sr().querySelector<HTMLElement>(".launcher")!.click();
    expect(sr().querySelector(".dock")!.classList.contains("open")).toBe(true);
    expect(sr().querySelector(".launcher")!.classList.contains("show")).toBe(false);
  });

  it("switches dock position and persists the choice", () => {
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    // Default is docked right.
    expect(sr().querySelector(".dock")!.classList.contains("mode-right")).toBe(true);
    sr().querySelector<HTMLElement>('.dctl [data-dock="bottom"]')!.click();
    const dock = sr().querySelector(".dock")!;
    expect(dock.classList.contains("mode-bottom")).toBe(true);
    expect(dock.classList.contains("mode-right")).toBe(false);
    expect(JSON.parse(localStorage.getItem("loupe:dock")!).mode).toBe("bottom");

    sr().querySelector<HTMLElement>('.dctl [data-dock="float"]')!.click();
    expect(sr().querySelector(".dock")!.classList.contains("mode-float")).toBe(true);
    // Float mode gets explicit geometry so it renders as a movable window.
    expect((sr().querySelector<HTMLElement>(".dock")!).style.width).toMatch(/px$/);
  });

  it("toggles between dark and light themes and persists it", () => {
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    const root = document.getElementById("loupe-root")!;
    expect(root.classList.contains("theme-light")).toBe(false); // dark by default
    sr().querySelector<HTMLElement>('.dctl [data-role="theme"]')!.click();
    expect(root.classList.contains("theme-light")).toBe(true);
    expect(JSON.parse(localStorage.getItem("loupe:dock")!).theme).toBe("light");
  });

  it("pushes the host page for docked modes and releases it when floating or closed", () => {
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    const de = document.documentElement;
    // Default is docked right → the page is pushed in from the right edge.
    expect(de.style.marginRight).not.toBe("");
    expect(de.style.marginLeft).toBe("");

    sr().querySelector<HTMLElement>('.dctl [data-dock="left"]')!.click();
    expect(de.style.marginLeft).not.toBe("");
    expect(de.style.marginRight).toBe("");

    sr().querySelector<HTMLElement>('.dctl [data-dock="bottom"]')!.click();
    expect(de.style.marginBottom).not.toBe("");
    expect(de.style.marginLeft).toBe("");

    // Float is a movable window — it reserves no page space.
    sr().querySelector<HTMLElement>('.dctl [data-dock="float"]')!.click();
    expect(de.style.marginLeft).toBe("");
    expect(de.style.marginRight).toBe("");
    expect(de.style.marginBottom).toBe("");

    // Closing releases the page too.
    sr().querySelector<HTMLElement>('.dctl [data-dock="right"]')!.click();
    expect(de.style.marginRight).not.toBe("");
    sr().querySelector<HTMLElement>('.dctl [data-role="close"]')!.click();
    expect(de.style.marginRight).toBe("");
  });

  it("marks the panel 'inspecting' while a tool is active (mobile shrinks the sheet)", () => {
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    const dock = () => sr().querySelector(".dock")!;
    expect(dock().classList.contains("inspecting")).toBe(false);
    sr().querySelector<HTMLElement>('[data-role="inspect"]')!.click();
    expect(dock().classList.contains("inspecting")).toBe(true);
    // Leaving the tool restores the full sheet.
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(dock().classList.contains("inspecting")).toBe(false);
  });

  it("restores the persisted dock mode, open state and theme on init", async () => {
    localStorage.setItem("loupe:dock", JSON.stringify({ mode: "left", open: false, theme: "light" }));
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    await new Promise((r) => setTimeout(r, 10));
    expect(sr().querySelector(".dock")!.classList.contains("mode-left")).toBe(true);
    expect(sr().querySelector(".dock")!.classList.contains("open")).toBe(false);
    expect(sr().querySelector(".launcher")!.classList.contains("show")).toBe(true);
    expect(document.getElementById("loupe-root")!.classList.contains("theme-light")).toBe(true);
  });

  it("Escape cancels the inspector", () => {
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    sr().querySelector<HTMLElement>('[data-role="inspect"]')!.click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(sr().querySelector<HTMLElement>('[data-role="inspect"]')!.classList.contains("on")).toBe(false);
  });

  it("does not initialize without projectKey or user id", () => {
    init({ projectKey: "", user: { id: "u", name: "U" } } as any);
    expect(document.getElementById("loupe-root")).toBeNull();
  });
});
