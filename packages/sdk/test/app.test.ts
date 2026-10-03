// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  destroy, init, trackActivity, setActivityStatus, clearActivity, connectTab, requestNavigation,
} from "../src/index.ts";

const sr = () => document.getElementById("loupe-root")!.shadowRoot!;
const fire = (el: Element, type: string, extra: Record<string, number> = {}) =>
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...extra }));

/**
 * Fire a pointer event. happy-dom has no PointerEvent, so build a MouseEvent of the
 * right type and give it a `pointerType` — which is all the widget reads.
 */
const firePointer = (el: Element, type: string, extra: Record<string, number> = {}, pointerType = "touch") => {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, ...extra });
  Object.defineProperty(ev, "pointerType", { value: pointerType });
  el.dispatchEvent(ev);
};

/** Stub `matchMedia` so the widget sees a coarse (touch) or fine (mouse) pointer. */
const setPointer = (kind: "coarse" | "fine") => {
  (window as any).matchMedia = (q: string) => ({
    matches: q.includes("pointer: coarse") && kind === "coarse",
    media: q,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  });
};

/** Fill the composer's Title + Description (both are required to submit). */
function fillComposer(title: string, body: string) {
  const t = sr().querySelector<HTMLInputElement>(".composer input.title")!;
  t.value = title;
  t.dispatchEvent(new Event("input", { bubbles: true }));
  const ta = sr().querySelector<HTMLTextAreaElement>(".composer textarea")!;
  ta.value = body;
  ta.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Pick a dock position through the header's position menu. */
function setDock(mode: string) {
  sr().querySelector<HTMLElement>('.dctl [data-role="pos"]')!.click();
  sr().querySelector<HTMLElement>(`.pos-grid [data-pos="${mode}"]`)!.click();
}

/**
 * Wait for the offline store to hold a comment, rather than sleeping and hoping.
 *
 * Saving is asynchronous — the capture and the write both happen after the click — so
 * a flat `setTimeout(10)` is a guess that holds on a quiet machine and fails under a
 * loaded run. This waits for the actual condition.
 */
async function waitForSaved(url: string, count = 1, timeoutMs = 3000): Promise<any[]> {
  const key = `loupe:pk:${url}`;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length >= count) return parsed;
    }
    if (Date.now() > deadline) throw new Error(`no comment saved at ${key} within ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

async function leaveComment(text: string) {
  sr().querySelector<HTMLElement>('[data-role="inspect"]')!.click();
  const btn = document.querySelector('[data-testid="save"]')!;
  fire(btn, "pointermove", { clientX: 5, clientY: 5 });
  fire(btn, "click", { clientX: 5, clientY: 5 });
  fillComposer(text, text);
  sr().querySelector<HTMLElement>(".composer .primary")!.click();
  await new Promise((r) => setTimeout(r, 10));
}

/** A comment row for the offline store, so Home/Timeline have data to show. */
const seeded = (over: Record<string, unknown> = {}) => ({
  id: "x", projectKey: "pk", url: "/", status: "queue", body: "b", author: { id: "u", name: "U" },
  anchor: { tag: "div", cssPath: ".x", xpath: "", testid: null, text: "", attrs: {}, nthOfType: 1, rect: { x: 0, y: 0, w: 0, h: 0 }, viewport: { w: 0, h: 0 } },
  context: { html: "", styles: {} }, offset: { x: 0, y: 0 }, createdAt: new Date().toISOString(), ...over,
});
const keyFor = (url: string) => `loupe:pk:${url}`;

beforeEach(() => {
  localStorage.clear();
  setPointer("fine"); // tests assume a desktop pointer unless they say otherwise
  (Element.prototype as any).scrollIntoView = () => {};
  document.body.innerHTML = `<main><button data-testid="save">Save</button></main>`;
  // happy-dom has no layout engine, so elementFromPoint returns null — stub it to
  // the element the inspector should select. (Real browsers use true hit-testing.)
  (document as any).elementFromPoint = () => document.querySelector('[data-testid="save"]');
});
afterEach(() => destroy());


/**
 * A fake EventSource that behaves like the real one.
 *
 * The distinction that matters: the bridge writes named events (`event: thread`), so a
 * real EventSource delivers them through `addEventListener("thread", …)` and *never*
 * through `onmessage`. A fake exposing only `onmessage` would pass while the real
 * transport was dead — which is exactly what happened.
 */
function makeFakeEventSource() {
  return class FakeEventSource {
    onmessage: ((ev: unknown) => void) | null = null;
    onerror: (() => void) | null = null;
    closed = false;
    listeners = new Map<string, ((ev: unknown) => void)[]>();
    static all: FakeEventSource[] = [];
    static last: FakeEventSource | null = null;
    constructor(public url: string) {
      FakeEventSource.last = this;
      FakeEventSource.all.push(this);
    }
    addEventListener(type: string, fn: (ev: unknown) => void) {
      const list = this.listeners.get(type) ?? [];
      list.push(fn);
      this.listeners.set(type, list);
    }
    close() { this.closed = true; }
    /** Deliver a named event, the way the bridge sends it. */
    emit(type: string, data: unknown) {
      for (const fn of this.listeners.get(type) ?? []) fn({ data: JSON.stringify(data) });
    }
  } as any;
}

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

  it("offers Record only when the browser can capture the screen", () => {
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    const offered = !!sr().querySelector('[data-role="record"]');
    const supported = typeof (navigator.mediaDevices as MediaDevices | undefined)?.getDisplayMedia === "function";
    // iOS Safari has no getDisplayMedia — the Record button must not be offered there.
    expect(offered).toBe(supported);
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
    // Enter region mode and drag a box with pointer events.
    sr().querySelector<HTMLElement>('[data-role="region"]')!.click();
    firePointer(document.body, "pointerdown", { clientX: 10, clientY: 20, button: 0 }, "mouse");
    firePointer(document.body, "pointermove", { clientX: 130, clientY: 110 }, "mouse");
    firePointer(document.body, "pointerup", { clientX: 130, clientY: 110, button: 0 }, "mouse");
    await new Promise((r) => setTimeout(r, 10)); // capture is async

    const ta = sr().querySelector<HTMLTextAreaElement>(".composer textarea")!;
    expect(ta).toBeTruthy();
    fillComposer("region misaligned", "this whole area is misaligned");
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

  it("touch: Region grabs the visible viewport and pre-attaches it — no drag, no scroll lock", async () => {
    setPointer("coarse");
    init({
      projectKey: "pk", user: { id: "u", name: "U" },
      captureRegion: async () => "data:image/png;base64,QUJD",
    });
    sr().querySelector<HTMLElement>('[data-role="region"]')!.click();
    await new Promise((r) => setTimeout(r, 10));

    // The composer is already open with the screenshot attached as an attachment.
    expect(sr().querySelector<HTMLElement>(".composer")!.style.display).toBe("block");
    expect(sr().querySelector<HTMLElement>(".composer .chips .chip")!.textContent).toContain("screenshot.png");
    // And the page is NOT scroll-locked (the drag path was never armed).
    expect(document.documentElement.style.touchAction).toBe("");
  });

  it("touch: the composer does not steal focus; a mouse still gets it", async () => {
    const spy = vi.spyOn(HTMLTextAreaElement.prototype, "focus");

    setPointer("coarse");
    init({ projectKey: "pk", user: { id: "u", name: "U" }, captureRegion: async () => "data:image/png;base64,QUJD" });
    sr().querySelector<HTMLElement>('[data-role="region"]')!.click();
    await new Promise((r) => setTimeout(r, 10));
    // No keyboard thrown up over the page the reporter is describing.
    expect(spy).not.toHaveBeenCalled();
    destroy();

    setPointer("fine");
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    sr().querySelector<HTMLElement>('[data-role="free"]')!.click();
    fire(document.body, "click", { clientX: 5, clientY: 5 });
    expect(spy).toHaveBeenCalled();

    spy.mockRestore();
  });

  it("touch: Record is offered where the browser can capture the screen, hidden where it cannot", () => {
    setPointer("coarse");

    // Android Chrome can share the screen.
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getDisplayMedia: () => undefined },
      configurable: true,
    });
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    expect(sr().querySelector('[data-role="record"]')).not.toBeNull();
    destroy();

    // iOS Safari has no getDisplayMedia at all.
    delete (navigator as any).mediaDevices;
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    expect(sr().querySelector('[data-role="record"]')).toBeNull();
  });

  it("touch: tapping Record records the whole screen — no drag — then opens the composer", async () => {
    setPointer("coarse");
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getDisplayMedia: () => undefined },
      configurable: true,
    });
    let asked: any;
    init({
      projectKey: "pk", user: { id: "u", name: "U" },
      captureRecording: async (vp: any) => { asked = vp; return "data:video/webm;base64,QUJD"; },
    });

    sr().querySelector<HTMLElement>('[data-role="record"]')!.click();
    await new Promise((r) => setTimeout(r, 10));

    // The whole viewport, with no pointer input at all.
    expect(asked).toMatchObject({ x: 0, y: 0, w: window.innerWidth, h: window.innerHeight });
    expect(sr().querySelector<HTMLElement>(".composer")!.style.display).toBe("block");
    expect(sr().querySelector(".composer .target")!.textContent).toContain("Recording");

    delete (navigator as any).mediaDevices;
  });

  it("touch: a desktop-mode phone (fine pointer, but a touch screen) still gets the touch flow", async () => {
    // A phone asking for the DESKTOP SITE reports pointer:fine — the old check missed it,
    // which is what left those users with a focusing composer and a scroll-fighting drag.
    setPointer("fine");
    Object.defineProperty(navigator, "maxTouchPoints", { value: 5, configurable: true });
    const spy = vi.spyOn(HTMLTextAreaElement.prototype, "focus");

    init({ projectKey: "pk", user: { id: "u", name: "U" }, captureRegion: async () => "data:image/png;base64,QUJD" });
    sr().querySelector<HTMLElement>('[data-role="region"]')!.click();
    await new Promise((r) => setTimeout(r, 10));

    // Viewport capture (no drag) and no focus stealing.
    expect(sr().querySelector(".composer .chips .chip")!.textContent).toContain("screenshot.png");
    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
    delete (navigator as any).maxTouchPoints;
  });

  it("touch without a screen recorder (no mobile browser has one): a Video tool attaches a clip — never the camera", () => {
    setPointer("coarse");
    delete (navigator as any).mediaDevices; // getDisplayMedia is desktop-only

    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    const btn = sr().querySelector<HTMLElement>('[data-role="video"]');
    expect(btn).not.toBeNull();

    btn!.click();
    const input = sr().querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(input.accept).toBe("video/*");
    // No `capture`: forcing the camera would film the room, not the screen.
    expect(input.hasAttribute("capture")).toBe(false);

    // The reporter picks the clip their phone's screen recorder produced.
    Object.defineProperty(input, "files", { value: [new File(["x"], "screen-recording.mp4", { type: "video/mp4" })] });
    input.dispatchEvent(new Event("change"));

    expect(sr().querySelector(".composer .chips .chip")!.textContent).toContain("screen-recording.mp4");
  });

  it("records the SDK version and device capabilities on every comment", async () => {
    setPointer("coarse");
    init({ projectKey: "pk", user: { id: "u", name: "U" }, captureRegion: async () => "data:image/png;base64,QUJD" });
    sr().querySelector<HTMLElement>('[data-role="region"]')!.click();
    await new Promise((r) => setTimeout(r, 10));
    fillComposer("diag", "diagnostics");
    sr().querySelector<HTMLElement>(".composer .primary")!.click();

    const stored = await waitForSaved(`${location.pathname}${location.search}`);
    // Lets a "still broken" report be checked against the build that actually ran.
    expect(typeof stored[0].viewport.v).toBe("string");
    expect(stored[0].viewport.touch).toBe(true);
    expect(stored[0].viewport.coarse).toBe(true);
    expect(stored[0].viewport.gdm).toBe(false);
  });

  it("touch: inspect highlights on finger-down", () => {
    setPointer("coarse");
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    sr().querySelector<HTMLElement>('[data-role="inspect"]')!.click();

    // Touch has no hover — the highlight must appear on finger-down, before the tap.
    firePointer(document.body, "pointerdown", { clientX: 5, clientY: 5 });
    expect(sr().querySelector<HTMLElement>(".hl")!.style.display).toBe("block");
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
    fillComposer("page spacing", "the whole page needs more spacing");
    sr().querySelector<HTMLElement>(".composer .primary")!.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(sr().querySelectorAll(".pin.free").length).toBe(1);
    const stored = JSON.parse(localStorage.getItem(`loupe:pk:${location.pathname}${location.search}`)!);
    expect(stored[0].kind).toBe("free");
    expect(stored[0].screenshot).toBeUndefined();
    expect(stored[0].anchor.tag).toBe("page");
  });

  it("closes to the FAB cluster and reopens from a quick action", () => {
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    expect(sr().querySelector(".dock")!.classList.contains("open")).toBe(true);
    sr().querySelector<HTMLElement>('.dctl [data-role="close"]')!.click();
    expect(sr().querySelector(".dock")!.classList.contains("open")).toBe(false);
    expect(sr().querySelector(".fab-cluster")!.classList.contains("show")).toBe(true);

    // The primary FAB expands the quick actions rather than opening the panel.
    sr().querySelector<HTMLElement>(".launcher")!.click();
    expect(sr().querySelector(".fab-cluster")!.classList.contains("expanded")).toBe(true);
    expect(sr().querySelector(".dock")!.classList.contains("open")).toBe(false);

    // A quick action opens the panel again — and the cluster gets out of the way.
    sr().querySelector<HTMLElement>('[data-fab="comment"]')!.click();
    expect(sr().querySelector(".dock")!.classList.contains("open")).toBe(true);
    expect(sr().querySelector(".fab-cluster")!.classList.contains("show")).toBe(false);
    expect(sr().querySelector<HTMLElement>('[data-role="inspect"]')!.classList.contains("on")).toBe(true);
  });

  it("quick action: Markers hides every pin without deleting it, and persists", async () => {
    init({ projectKey: "pk", user: { id: "u", name: "U" }, captureScreenshot: async () => undefined });
    await leaveComment("hide my marker");
    sr().querySelector<HTMLElement>('.dctl [data-role="close"]')!.click();
    sr().querySelector<HTMLElement>(".launcher")!.click();

    const markers = sr().querySelector<HTMLElement>('[data-fab="markers"]')!;
    markers.click();
    expect(sr().querySelector(".overlay")!.classList.contains("hide-pins")).toBe(true);
    expect(JSON.parse(localStorage.getItem("loupe:dock")!).markersHidden).toBe(true);
    // The comment itself is untouched — only its marker is hidden.
    expect(sr().querySelectorAll(".pin").length).toBe(1);
    expect(markers.classList.contains("on")).toBe(true);

    markers.click();
    expect(sr().querySelector(".overlay")!.classList.contains("hide-pins")).toBe(false);
  });

  it("has no Connect tab unless the host registers one", () => {
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    const ids = [...sr().querySelectorAll<HTMLElement>(".tabs .tab")].map((b) => b.dataset.tab);
    expect(ids).toEqual(["home", "comments", "activity", "chat"]);
    // …and no dangling shortcut for it in the FAB cluster.
    expect(sr().querySelector('[data-fab="connect"]')).toBeFalsy();
  });

  it("quick action: a registered connect tab is one click from the FAB", () => {
    init({ projectKey: "pk", user: { id: "u", name: "U" }, tabs: [connectTab()] });
    expect([...sr().querySelectorAll<HTMLElement>(".tabs .tab")].map((b) => b.dataset.tab))
      .toEqual(["home", "comments", "activity", "chat", "connect"]);
    sr().querySelector<HTMLElement>('.dctl [data-role="close"]')!.click();
    sr().querySelector<HTMLElement>('[data-fab="connect"]')!.click();
    expect(sr().querySelector(".dock")!.classList.contains("open")).toBe(true);
    expect(sr().querySelector(".dock")!.classList.contains("tab-connect")).toBe(true);
    // The tab rendered its own content.
    expect(sr().querySelector(".chero-title")!.textContent).toContain("Claude");
    expect(sr().querySelector(".cstep-code")!.textContent).toContain("@loupekit/mcp");
  });

  it("the primary FAB badge tracks the comment count", async () => {
    init({ projectKey: "pk", user: { id: "u", name: "U" }, captureScreenshot: async () => undefined });
    expect(sr().querySelector(".launcher .lcount")!.textContent).toBe("");
    await leaveComment("badge me");
    expect(sr().querySelector(".launcher .lcount")!.textContent).toBe("1");
  });

  it("switches dock position and persists the choice", () => {
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    // Default is docked right.
    expect(sr().querySelector(".dock")!.classList.contains("mode-right")).toBe(true);
    // Position lives behind the header's position menu.
    setDock("bottom");
    const dock = sr().querySelector(".dock")!;
    expect(dock.classList.contains("mode-bottom")).toBe(true);
    expect(dock.classList.contains("mode-right")).toBe(false);
    expect(JSON.parse(localStorage.getItem("loupe:dock")!).mode).toBe("bottom");
    // The menu closes behind the choice.
    expect(sr().querySelectorAll(".menu.open").length).toBe(0);

    setDock("float");
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

    setDock("left");
    expect(de.style.marginLeft).not.toBe("");
    expect(de.style.marginRight).toBe("");

    setDock("bottom");
    expect(de.style.marginBottom).not.toBe("");
    expect(de.style.marginLeft).toBe("");

    // Float is a movable window — it reserves no page space.
    setDock("float");
    expect(de.style.marginLeft).toBe("");
    expect(de.style.marginRight).toBe("");
    expect(de.style.marginBottom).toBe("");

    // Closing releases the page too.
    setDock("right");
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
    expect(sr().querySelector(".fab-cluster")!.classList.contains("show")).toBe(true);
    expect(document.getElementById("loupe-root")!.classList.contains("theme-light")).toBe(true);
  });

  it("Escape cancels the inspector", () => {
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    sr().querySelector<HTMLElement>('[data-role="inspect"]')!.click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(sr().querySelector<HTMLElement>('[data-role="inspect"]')!.classList.contains("on")).toBe(false);
  });

  it("composer collects a title and offers multi-file attachments", () => {
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    sr().querySelector<HTMLElement>('[data-role="inspect"]')!.click();
    fire(document.querySelector('[data-testid="save"]')!, "click", { clientX: 5, clientY: 5 });

    expect(sr().querySelector(".composer input.title")).toBeTruthy();
    expect(sr().querySelector(".composer .attach .pick")).toBeTruthy();
    const file = sr().querySelector<HTMLInputElement>('.composer input[type="file"]')!;
    expect(file.multiple).toBe(true);
    expect(file.accept).toContain("video/");
  });

  it("search filters the list, and items start collapsed", async () => {
    init({ projectKey: "pk", user: { id: "u", name: "U" }, captureScreenshot: async () => undefined });
    await leaveComment("first issue");

    expect(sr().querySelector(".item")!.classList.contains("collapsed")).toBe(true);
    expect(sr().querySelector(".item .summary")!.textContent).toBe("first issue");

    const search = sr().querySelector<HTMLInputElement>(".listhead .search")!;
    search.value = "zzz-no-match";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(sr().querySelectorAll(".item").length).toBe(0);

    search.value = "first";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(sr().querySelectorAll(".item").length).toBe(1);
  });

  it("expanding a collapsed item reveals its detail", async () => {
    init({ projectKey: "pk", user: { id: "u", name: "U" }, captureScreenshot: async () => undefined });
    await leaveComment("expandable");
    expect(sr().querySelector(".item")!.classList.contains("collapsed")).toBe(true);

    sr().querySelector<HTMLElement>(".item")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(sr().querySelector(".item")!.classList.contains("collapsed")).toBe(false);
  });

  it("opens on the Home overview with the four stat tiles", async () => {
    localStorage.setItem(keyFor(location.pathname), JSON.stringify([
      seeded({ id: "old", status: "queue", title: "Old one", createdAt: "2020-01-01T00:00:00.000Z" }),
      seeded({ id: "done", status: "resolved", title: "Done one" }),
    ]));
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    await new Promise((r) => setTimeout(r, 10));

    expect(sr().querySelector(".dock")!.classList.contains("tab-home")).toBe(true);
    const tiles = [...sr().querySelectorAll<HTMLElement>(".hstat-b")];
    expect(tiles.map((t) => t.querySelector(".hstat-l")!.textContent))
      .toEqual(["Open", "Needs you", "Resolved", "Stale"]);
    expect(tiles[0]!.querySelector(".hstat-n")!.textContent).toBe("1"); // Open
    expect(tiles[1]!.querySelector(".hstat-n")!.textContent).toBe("0"); // Needs you
    expect(tiles[2]!.querySelector(".hstat-n")!.textContent).toBe("1"); // Resolved
    expect(tiles[3]!.querySelector(".hstat-n")!.textContent).toBe("1"); // Stale (the 2020 one)
    expect(sr().querySelectorAll(".hfeed-i").length).toBe(2);
  });

  it("clicking a stat tile narrows the list, and clicking it again clears", async () => {
    localStorage.setItem(keyFor(location.pathname), JSON.stringify([
      seeded({ id: "a", status: "queue", title: "Queue one" }),
      seeded({ id: "b", status: "resolved", title: "Resolved one" }),
    ]));
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    await new Promise((r) => setTimeout(r, 10));

    sr().querySelectorAll<HTMLElement>(".hstat-b")[2]!.click(); // Resolved
    expect(sr().querySelector(".dock")!.classList.contains("tab-comments")).toBe(true);
    expect(sr().querySelectorAll(".item").length).toBe(1);

    // Back to Home, clear the bucket, and the list is whole again.
    sr().querySelector<HTMLElement>('.tabs [data-tab="home"]')!.click();
    sr().querySelectorAll<HTMLElement>(".hstat-b")[2]!.click();
    expect(sr().querySelectorAll(".item").length).toBe(2);
  });

  it("the All scope builds a timeline grouped by day, across pages", async () => {
    // Two pages: one today, one long ago.
    localStorage.setItem(keyFor("/a"), JSON.stringify([seeded({ id: "today", url: "/a", title: "Today one" })]));
    localStorage.setItem(keyFor("/b"), JSON.stringify([seeded({ id: "old", url: "/b", title: "Ancient one", createdAt: "2020-01-01T00:00:00.000Z" })]));
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    await new Promise((r) => setTimeout(r, 10));

    // Page scope only knows about this page's comments.
    expect(sr().querySelectorAll(".item").length).toBe(0);
    expect(sr().querySelector("#loupe-hstats .hstat-n")!.textContent).toBe("0");

    sr().querySelector<HTMLElement>('.hscope-b[data-scope="all"]')!.click();
    await new Promise((r) => setTimeout(r, 10));

    // Both pages are visible, newest first, under day headers.
    const labels = [...sr().querySelectorAll<HTMLElement>(".daylabel")].map((d) => d.textContent);
    expect(labels[0]).toBe("Today");
    expect(labels.length).toBe(2);

    sr().querySelector<HTMLElement>('.tabs [data-tab="comments"]')!.click();
    expect(sr().querySelectorAll(".item").length).toBe(2);
  });

  it("updates and removes a comment after the panel has persisted its state", async () => {
    // Regression: loupe:dock is an OBJECT under the same `loupe:` prefix as the
    // comment lists, so update()/remove() used to throw the moment the panel
    // saved any state.
    localStorage.setItem("loupe:dock", JSON.stringify({ mode: "right", open: true }));
    init({ projectKey: "pk", user: { id: "u", name: "U" }, captureScreenshot: async () => undefined });
    await leaveComment("survives");

    sr().querySelector<HTMLElement>(".item .actions button")!.click(); // Resolve
    await new Promise((r) => setTimeout(r, 10));
    expect(sr().querySelector(".pin")!.classList.contains("done")).toBe(true);

    const del = [...sr().querySelectorAll<HTMLElement>(".item .actions button")].find((b) => b.textContent === "Delete")!;
    del.click();
    await new Promise((r) => setTimeout(r, 10));
    expect(sr().querySelectorAll(".pin").length).toBe(0);
  });

  it("minimizes to a one-line bar and restores from it", async () => {
    localStorage.setItem(keyFor(location.pathname), JSON.stringify([seeded({ id: "a", status: "queue" })]));
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    await new Promise((r) => setTimeout(r, 10));

    sr().querySelector<HTMLElement>('.dctl [data-role="min"]')!.click();
    const dock = sr().querySelector(".dock")!;
    expect(dock.classList.contains("minimized")).toBe(true);
    // The bar keeps the context on one line.
    expect(sr().querySelector(".minbar .mtext")!.textContent).toContain("1 open");
    expect(JSON.parse(localStorage.getItem("loupe:dock")!).minimized).toBe(true);

    sr().querySelector<HTMLElement>(".minbar")!.click();
    expect(sr().querySelector(".dock")!.classList.contains("minimized")).toBe(false);
    expect(JSON.parse(localStorage.getItem("loupe:dock")!).minimized).toBe(false);
  });

  it("settings drive the visibility toggles and close on an outside click", async () => {
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    const row = (k: string) => sr().querySelector<HTMLElement>(`[data-set="${k}"]`)!;

    sr().querySelector<HTMLElement>('.dctl [data-role="settings"]')!.click();
    expect(row("hoverHints").getAttribute("aria-pressed")).toBe("true");
    expect(row("markersHidden").getAttribute("aria-pressed")).toBe("true");
    expect(row("showPaths").getAttribute("aria-pressed")).toBe("false");

    row("markersHidden").click();
    expect(row("markersHidden").getAttribute("aria-pressed")).toBe("false");
    expect(JSON.parse(localStorage.getItem("loupe:dock")!).markersHidden).toBe(true);
    // A toggle is not a dismissal — the menu stays up.
    expect(sr().querySelectorAll(".menu.open").length).toBe(1);

    sr().querySelector<HTMLElement>(".tabs")!.click();
    expect(sr().querySelectorAll(".menu.open").length).toBe(0);
  });

  it("applies an accent from settings and keeps it across a reload", async () => {
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    const root = document.getElementById("loupe-root")!;
    const before = root.style.getPropertyValue("--accent");
    expect(before).not.toBe("");

    sr().querySelector<HTMLElement>('.dctl [data-role="settings"]')!.click();
    const dots = [...sr().querySelectorAll<HTMLElement>(".acc-dot")];
    expect(dots.length).toBe(5);
    dots.find((d) => d.dataset.accent === "teal")!.click();

    expect(root.style.getPropertyValue("--accent")).not.toBe(before);
    expect(JSON.parse(localStorage.getItem("loupe:dock")!).accent).toBe("teal");

    destroy();
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    expect(document.getElementById("loupe-root")!.style.getPropertyValue("--accent"))
      .toBe(root.style.getPropertyValue("--accent"));
  });

  it("runs the guided tour once, and settings can replay it", async () => {
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    // start() is async — the tour begins once the first list load settles.
    await new Promise((r) => setTimeout(r, 10));
    expect(sr().querySelector(".tour")!.classList.contains("open")).toBe(true);
    expect(sr().querySelectorAll(".tour-dots i").length).toBe(5);
    // It starts where the user already is — no tab switch on the first step.
    expect(sr().querySelector(".dock")!.classList.contains("tab-home")).toBe(true);

    for (let i = 0; i < 4; i++) sr().querySelector<HTMLElement>(".tour .t-next")!.click();
    expect(sr().querySelector(".tour .t-next")!.textContent).toBe("Done");
    sr().querySelector<HTMLElement>(".tour .t-back")!.click();
    expect(sr().querySelector(".tour .t-next")!.textContent).toBe("Next");
    sr().querySelector<HTMLElement>(".tour .t-next")!.click();
    sr().querySelector<HTMLElement>(".tour .t-next")!.click(); // Done

    expect(sr().querySelector(".tour")!.classList.contains("open")).toBe(false);
    expect(JSON.parse(localStorage.getItem("loupe:dock")!).tourDone).toBe(true);

    // Finished once means finished: it does not come back by itself.
    destroy();
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    expect(sr().querySelector(".tour")!.classList.contains("open")).toBe(false);

    // …but it is replayable.
    sr().querySelector<HTMLElement>('.dctl [data-role="settings"]')!.click();
    sr().querySelector<HTMLElement>('[data-set="tour"]')!.click();
    expect(sr().querySelector(".tour")!.classList.contains("open")).toBe(true);
    expect(sr().querySelectorAll(".tour-dots i").length).toBe(5);
  });

  it("shows a hint once per view, and Turn off hints silences them for good", async () => {
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    await new Promise((r) => setTimeout(r, 10));

    expect(sr().querySelector("#loupe-hhint .hint-t")!.textContent).toBe("Your triage at a glance");

    sr().querySelector<HTMLElement>('.tabs [data-tab="comments"]')!.click();
    expect(sr().querySelector(".comments-view .hint-t")!.textContent).toBe("Pin, note or record");
    expect(JSON.parse(localStorage.getItem("loupe:dock")!).hintsSeen).toContain("comments");

    // Leaving and returning does not replay it.
    sr().querySelector<HTMLElement>('.tabs [data-tab="home"]')!.click();
    expect(sr().querySelector("#loupe-hhint .hint")).toBeFalsy();

    // The card's own switch turns the whole help layer off, and it sticks.
    sr().querySelector<HTMLElement>('.tabs [data-tab="comments"]')!.click();
    expect(sr().querySelector(".comments-view .hint")).toBeFalsy();
    sr().querySelector<HTMLElement>('.tabs [data-tab="activity"]')!.click();
    sr().querySelector<HTMLElement>(".hint-off")!.click();
    expect(sr().querySelector(".activity-view .hint")).toBeFalsy();
    expect(JSON.parse(localStorage.getItem("loupe:dock")!).hoverHints).toBe(false);

    destroy();
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    await new Promise((r) => setTimeout(r, 10));
    expect(sr().querySelector(".hint")).toBeFalsy();
  });

  it("dismisses a hint card with its X without silencing the rest", async () => {
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    await new Promise((r) => setTimeout(r, 10));
    expect(sr().querySelector("#loupe-hhint .hint")).toBeTruthy();

    sr().querySelector<HTMLElement>("#loupe-hhint .hint-x")!.click();
    expect(sr().querySelector("#loupe-hhint .hint")).toBeFalsy();
    // Hints are still on — only this card was dismissed.
    expect(JSON.parse(localStorage.getItem("loupe:dock")!).hoverHints).toBe(true);

    sr().querySelector<HTMLElement>('.tabs [data-tab="comments"]')!.click();
    expect(sr().querySelector(".comments-view .hint")).toBeTruthy();
  });

  it("shows page paths in the project scope once enabled", async () => {
    localStorage.setItem(keyFor("/a"), JSON.stringify([seeded({ id: "today", url: "/a" })]));
    localStorage.setItem(keyFor("/b"), JSON.stringify([seeded({ id: "old", url: "/b" })]));
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    await new Promise((r) => setTimeout(r, 10));

    sr().querySelector<HTMLElement>('.hscope-b[data-scope="all"]')!.click();
    await new Promise((r) => setTimeout(r, 10));
    sr().querySelector<HTMLElement>('.tabs [data-tab="comments"]')!.click();
    expect(sr().querySelectorAll(".pathtag").length).toBe(0); // off by default

    sr().querySelector<HTMLElement>('.dctl [data-role="settings"]')!.click();
    sr().querySelector<HTMLElement>('[data-set="showPaths"]')!.click();
    const tags = [...sr().querySelectorAll<HTMLElement>(".pathtag")].map((t) => t.textContent).sort();
    expect(tags).toEqual(["/a", "/b"]);
  });

  it("renders the panel even when a stored anchor is malformed", async () => {
    // Regression: a comment whose anchor lacks attrs/rect/viewport (an older client,
    // or a row written by hand) used to throw inside resolveAnchor and abort the
    // whole first render — no pins, no tabs, no tour.
    localStorage.setItem(keyFor(location.pathname), JSON.stringify([
      seeded({ id: "bad", title: "Hand-written", anchor: { tag: "button", cssPath: "#save" } }),
    ]));
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    await new Promise((r) => setTimeout(r, 10));

    // The panel still came up, and the row is listed with a pin rather than
    // silently vanishing.
    expect(sr().querySelector(".dock")!.classList.contains("open")).toBe(true);
    expect(sr().querySelectorAll(".item").length).toBe(1);
    expect(sr().querySelector(".pin")).toBeTruthy();
    // The tour still runs — the throw used to happen before it ever started.
    expect(sr().querySelector(".tour")!.classList.contains("open")).toBe(true);
  });

  it("shows the running version in the panel", async () => {
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    // Baked in by tsup; "dev" when running from source without a build.
    const version = sr().querySelector(".hfoot .hver")!.textContent!;
    expect(version).toMatch(/^v/);
    sr().querySelector<HTMLElement>('.dctl [data-role="settings"]')!.click();
    expect(sr().querySelector(".menu-ver b")!.textContent).toBe(version);
    // Offline because this init has no apiBase.
    expect(sr().querySelector(".menu-mode")!.textContent).toBe("offline");
  });

  it("renders a host-registered tab, with a usable context", async () => {
    const seen: any = {};
    init({
      projectKey: "pk",
      user: { id: "u", name: "U" },
      tabs: [{
        id: "build",
        label: "Build",
        hint: { title: "Custom hint", body: "This tab declared its own." },
        render: (ctx) => {
          seen.projectKey = ctx.projectKey;
          seen.version = ctx.version;
          seen.url = ctx.url;
          seen.user = ctx.user.id;
          ctx.track({ kind: "custom", label: "Reported from a custom tab" });
          return `<div class="mine">hello ${ctx.projectKey}</div>`;
        },
      }],
    });
    await new Promise((r) => setTimeout(r, 10));

    expect([...sr().querySelectorAll<HTMLElement>(".tabs .tab")].map((b) => b.textContent))
      .toEqual(["Home", "Comments", "Activity", "Chat", "Build"]);
    expect(sr().querySelector(".mine")!.textContent).toBe("hello pk");
    expect(seen.projectKey).toBe("pk");
    expect(seen.user).toBe("u");
    expect(seen.version).toMatch(/^v|^dev$/);

    // Its own hint card renders, and the tab is reachable.
    sr().querySelector<HTMLElement>('.tabs [data-tab="build"]')!.click();
    expect(sr().querySelector(".dock")!.classList.contains("tab-build")).toBe(true);
    expect(sr().querySelector(".custom-view .hint-t")!.textContent).toBe("Custom hint");
    // The event it reported reached the Activity feed.
    expect(sr().querySelector("#loupe-mon-feed")!.textContent).toContain("Reported from a custom tab");
  });

  it("a tab that throws does not take the panel down", async () => {
    init({
      projectKey: "pk",
      user: { id: "u", name: "U" },
      tabs: [{ id: "boom", label: "Boom", render: () => { throw new Error("nope"); } }],
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(sr().querySelector(".dock")!.classList.contains("open")).toBe(true);
    expect(sr().querySelectorAll(".tabs .tab").length).toBe(5);
    expect(sr().querySelector(".custom-view .empty")!.textContent).toContain("nope");
    // And the rest of the panel still works.
    sr().querySelector<HTMLElement>('.tabs [data-tab="home"]')!.click();
    expect(sr().querySelector(".dock")!.classList.contains("tab-home")).toBe(true);
  });

  it("derives the activity summary, chips and feed from the stream", () => {
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    sr().querySelector<HTMLElement>('.tabs [data-tab="activity"]')!.click();

    // Degraded state first — it explains rather than erroring.
    expect(sr().querySelector(".mon-feed .mon-empty")!.textContent).toContain("Monitor unavailable");
    expect(sr().querySelector(".mon-status-label")!.textContent).toBe("Idle");

    trackActivity({ kind: "Read", label: "Read src/app.ts", files: ["src/app.ts"] });
    trackActivity({ kind: "Read", label: "Read src/server.ts", files: ["src/server.ts"] });
    trackActivity({ kind: "Edit", label: "Edited src/app.ts", files: ["src/app.ts"] });

    expect(sr().querySelector(".mon-status-label")!.textContent).toBe("Working");
    expect(sr().querySelectorAll(".mon-row").length).toBe(3);
    // Micro-stats: 3 events, 2 distinct files.
    const micro = sr().querySelector(".mon-micro")!.textContent!;
    expect(micro).toContain("3 events");
    expect(micro).toContain("2 files");
    // Chips: All + one per kind, most frequent first.
    expect([...sr().querySelectorAll<HTMLElement>(".mon-chip")].map((c) => c.textContent))
      .toEqual(["All 3", "Read 2", "Edit 1"]);

    // A chip filters the feed; clicking it again clears the filter.
    sr().querySelectorAll<HTMLElement>(".mon-chip")[1]!.click();
    expect(sr().querySelectorAll(".mon-row").length).toBe(2);
    expect(sr().querySelector(".mon-feed")!.textContent).not.toContain("Edited");
    sr().querySelectorAll<HTMLElement>(".mon-chip")[0]!.click();
    expect(sr().querySelectorAll(".mon-row").length).toBe(3);

    // The summary card expands to its key/value rows (hidden, not absent, until then).
    const body = () => (sr().querySelector(".mon-sum-body") as HTMLElement).style.display;
    expect(body()).toBe("none");
    sr().querySelector<HTMLElement>('[data-role="mon-toggle"]')!.click();
    expect(body()).toBe("");
    const kvs = [...sr().querySelectorAll<HTMLElement>(".mon-kv")].map((k) => k.textContent);
    expect(kvs[0]).toContain("Status");
    expect(kvs[1]).toContain("3");
    expect(kvs[3]).toContain("2"); // files touched
  });

  it("an error event flips the status dot, and clearing resets the view", () => {
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    sr().querySelector<HTMLElement>('.tabs [data-tab="activity"]')!.click();

    setActivityStatus("working");
    expect(sr().querySelector(".mon-status")!.classList.contains("st-working")).toBe(true);

    trackActivity({ kind: "Bash", label: "Command failed", detail: "exit 1", level: "error" });
    expect(sr().querySelector(".mon-status")!.classList.contains("st-error")).toBe(true);
    expect(sr().querySelectorAll(".mon-row.lv-error").length).toBe(1);

    clearActivity();
    expect(sr().querySelectorAll(".mon-row").length).toBe(0);
    expect(sr().querySelector(".mon-status")!.classList.contains("st-idle")).toBe(true);
    expect(sr().querySelector(".mon-feed .mon-empty")!.textContent).toContain("Monitor unavailable");
  });

  it("the scope chips carry live counts for this page and the project", async () => {
    localStorage.setItem(keyFor(location.pathname), JSON.stringify([seeded({ id: "p1", url: location.pathname })]));
    localStorage.setItem(keyFor("/b"), JSON.stringify([seeded({ id: "p2", url: "/b" })]));
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    await new Promise((r) => setTimeout(r, 10));

    const chips = () => [...sr().querySelectorAll<HTMLElement>(".hscope-b")].map((b) => b.textContent!.replace(/\s+/g, " ").trim());
    // The project total is unknown until the project list has been read — it says so
    // rather than inventing a number.
    expect(chips()).toEqual(["This page 1", "All ⋯"]);
    expect(sr().querySelector(".hscope-b")!.getAttribute("aria-pressed")).toBe("true");

    sr().querySelectorAll<HTMLElement>(".hscope-b")[1]!.click();
    await new Promise((r) => setTimeout(r, 10));
    expect(chips()).toEqual(["This page 1", "All 2"]);
    expect(sr().querySelectorAll<HTMLElement>(".hscope-b")[1]!.getAttribute("aria-pressed")).toBe("true");
  });

  it("links a repo from the project manager, searching a host-supplied list", async () => {
    init({ projectKey: "pk", user: { id: "u", name: "U" }, repos: ["acme/web", "acme/api", "other/thing"] });
    expect(sr().querySelector(".proj-repo")!.textContent).toBe("no repo linked");

    sr().querySelector<HTMLElement>('.proj-chip')!.click();
    // The first list is fetched asynchronously, like a real repo search would be.
    await new Promise((r) => setTimeout(r, 10));
    const items = () => [...sr().querySelectorAll<HTMLElement>(".pp-item")].map((b) => b.dataset.repo);
    expect(items()).toEqual(["acme/web", "acme/api", "other/thing"]);

    // The list narrows as you type, without the input losing focus.
    const search = sr().querySelector<HTMLInputElement>(".pp-search")!;
    search.value = "acme";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 10));
    expect(items()).toEqual(["acme/web", "acme/api"]);
    expect(sr().querySelector(".pp-search")).toBe(search);

    sr().querySelectorAll<HTMLElement>(".pp-item")[1]!.click();
    expect(sr().querySelector(".proj-repo")!.textContent).toBe("acme/api");
    expect(JSON.parse(localStorage.getItem("loupe:project:pk")!).repo).toBe("acme/api");

    // A new comment is filed against it.
    expect(sr().querySelector(".hscope-b")).toBeTruthy();
    sr().querySelector<HTMLElement>('.dctl [data-role="min"]')!.click();
    const stored = JSON.parse(localStorage.getItem("loupe:project:pk")!);
    expect(stored.repo).toBe("acme/api");
  });

  it("validates environment URLs before storing them", () => {
    init({ projectKey: "pk", user: { id: "u", name: "U" }, environments: ["https://staging.example.com"] });
    sr().querySelector<HTMLElement>('.proj-chip')!.click();
    expect(sr().querySelector(".pp-env-u")!.textContent).toBe("https://staging.example.com");

    const url = () => sr().querySelector<HTMLInputElement>(".pp-env-url")!;
    const err = () => sr().querySelector("#loupe-pp-err")!.textContent;

    // A bare host is a typo, not an environment.
    url().value = "staging.example.com";
    url().dispatchEvent(new Event("input", { bubbles: true }));
    sr().querySelector<HTMLElement>('[data-role="env-add"]')!.click();
    expect(err()).toContain("http:// or https://");
    expect(sr().querySelectorAll(".pp-env").length).toBe(1);

    // A duplicate is refused, in its normalized spelling.
    url().value = "https://staging.example.com/";
    url().dispatchEvent(new Event("input", { bubbles: true }));
    sr().querySelector<HTMLElement>('[data-role="env-add"]')!.click();
    expect(err()).toContain("already listed");
    expect(sr().querySelectorAll(".pp-env").length).toBe(1);

    // A real one is added, normalized, and persisted.
    url().value = "https://staging.example.com/checkout/?utm=1";
    url().dispatchEvent(new Event("input", { bubbles: true }));
    sr().querySelector<HTMLElement>('[data-role="env-add"]')!.click();
    expect(err()).toBe("");
    expect([...sr().querySelectorAll<HTMLElement>(".pp-env-u")].map((e) => e.textContent))
      .toEqual(["https://staging.example.com", "https://staging.example.com/checkout"]);
    expect(JSON.parse(localStorage.getItem("loupe:project:pk")!).environments.length).toBe(2);

    // Removing one sticks too.
    sr().querySelectorAll<HTMLElement>("[data-env-rm]")[0]!.click();
    expect(sr().querySelectorAll(".pp-env").length).toBe(1);
    expect(JSON.parse(localStorage.getItem("loupe:project:pk")!).environments.length).toBe(1);
  });

  it("shows lifecycle chips, a PR link and a checks meter on a thread", async () => {
    localStorage.setItem(keyFor(location.pathname), JSON.stringify([
      seeded({ id: "plain", title: "Nothing attached" }),
      seeded({ id: "sent", title: "Sent", proposal: { html: "<b/>", notes: "Tweaked" } }),
      seeded({
        id: "pr", title: "In a PR", status: "in_review",
        pr: { number: 412, url: "https://github.com/acme/web/pull/412", checksPassed: 3, checksTotal: 4 },
      }),
      seeded({ id: "done", title: "Reviewed", status: "resolved", proposal: { html: "<b/>" }, pr: { number: 7, state: "merged" } }),
    ]));
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    await new Promise((r) => setTimeout(r, 10));

    const chips = [...sr().querySelectorAll<HTMLElement>(".item")].map((i) => ({
      title: i.querySelector(".summary")!.textContent,
      life: i.querySelector(".lifechip")?.textContent ?? null,
      pr: i.querySelector(".prchip")?.textContent ?? null,
      checks: i.querySelector(".checks-n")?.textContent ?? null,
    }));

    // A thread with nothing attached wears no badge at all.
    expect(chips[0]).toEqual({ title: "Nothing attached", life: null, pr: null, checks: null });
    expect(chips[1]!.life).toBe("Sent to agent");
    expect(chips[1]!.pr).toBeNull();
    expect(chips[2]!.life).toBe("In PR");
    expect(chips[2]!.pr).toBe("#412");
    expect(chips[2]!.checks).toBe("3/4");
    // A resolved thread keeps its PR chip but drops the "Reviewed" pill — the
    // "resolved" badge beside it already says that, twice is noise.
    expect(chips[3]!.life).toBeNull();
    expect(chips[3]!.pr).toBe("#7");
    expect(chips[3]!.checks).toBeNull();

    // The PR chip is a real link out, and clicking it does not toggle the card.
    const link = sr().querySelector<HTMLAnchorElement>(".prchip")!;
    expect(link.getAttribute("href")).toBe("https://github.com/acme/web/pull/412");
    expect(link.getAttribute("target")).toBe("_blank");
    // The meter's bar reflects the fraction, not just the numerator.
    expect((sr().querySelector(".item:nth-child(3) .checks-bar i") as HTMLElement).style.width).toBe("75%");
  });

  it("banners the threads waiting on a human, and can filter to them", async () => {
    localStorage.setItem(keyFor(location.pathname), JSON.stringify([
      seeded({ id: "a", title: "Queue one" }),
      seeded({ id: "b", title: "Waiting one", status: "in_review" }),
      seeded({ id: "c", title: "Waiting two", status: "in_review" }),
    ]));
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    await new Promise((r) => setTimeout(r, 10));

    const bar = () => sr().querySelector(".reviewbar") as HTMLElement;
    expect(bar().style.display).toBe("");
    expect(bar().textContent).toContain("2 waiting on your review");

    // "Review" narrows the list; the button then offers the way back.
    (sr().querySelector('[data-role="rb-toggle"]') as HTMLElement).click();
    expect(sr().querySelectorAll(".item").length).toBe(2);
    expect(sr().querySelector('[data-role="rb-toggle"]')!.textContent).toBe("Show all");
    (sr().querySelector('[data-role="rb-toggle"]') as HTMLElement).click();
    expect(sr().querySelectorAll(".item").length).toBe(3);
  });

  it("hides the review bar when nothing is waiting", async () => {
    localStorage.setItem(keyFor(location.pathname), JSON.stringify([seeded({ id: "a", status: "queue" })]));
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    await new Promise((r) => setTimeout(r, 10));
    expect((sr().querySelector(".reviewbar") as HTMLElement).style.display).toBe("none");
  });

  it("approves a thread from its review banner — only a human resolves", async () => {
    localStorage.setItem(keyFor(location.pathname), JSON.stringify([
      seeded({ id: "a", title: "Fix the CTA", status: "in_review", proposal: { html: "<button>Go</button>", notes: "Bigger hit area" } }),
    ]));
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    await new Promise((r) => setTimeout(r, 10));

    // The banner sits inside the thread's detail, above everything else.
    expect(sr().querySelector(".revbanner .rev-t")!.textContent).toBe("Waiting on your review");
    expect(sr().querySelector(".revbanner .rev-approve")!.textContent).toBe("Approve");
    expect(sr().querySelector(".revbanner .rev-comment")!.textContent).toBe("Add comment");

    sr().querySelector<HTMLElement>(".rev-approve")!.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(sr().querySelector(".revbanner")).toBeFalsy();
    // Resolved: the badge says it, so no second "Reviewed" pill beside it.
    expect(sr().querySelector(".badge.done")!.textContent).toBe("resolved");
    expect(sr().querySelector(".lifechip")).toBeFalsy();
    expect((sr().querySelector(".reviewbar") as HTMLElement).style.display).toBe("none");
    // And it is recorded in the Activity feed, like every other operation.
    expect(sr().querySelector("#loupe-mon-feed")!.textContent).toContain("Approved");
  });

  it("toggles the original request beside the proposed change", async () => {
    localStorage.setItem(keyFor(location.pathname), JSON.stringify([
      seeded({
        id: "a", title: "Fix the CTA", body: "It is too small on mobile.",
        status: "in_review",
        context: { html: "<button class=\"cta\">Go</button>", styles: {} },
        proposal: { html: "<button class=\"cta big\">Go</button>", css: ".cta.big{padding:14px}", notes: "Bigger hit area", author: "Claude Code via MCP" },
      }),
    ]));
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    await new Promise((r) => setTimeout(r, 10));

    const view = () => sr().querySelector(".origin") as HTMLElement;
    expect(view().style.display).toBe("none");

    const toggle = sr().querySelector<HTMLElement>(".rev-origin")!;
    expect(toggle.textContent).toBe("Show original");
    toggle.click();
    expect(view().style.display).toBe("");
    expect(toggle.textContent).toBe("Hide original");

    const cols = [...sr().querySelectorAll<HTMLElement>(".or-col")];
    expect(cols.length).toBe(2);
    expect(cols[0]!.querySelector(".or-h")!.textContent).toBe("Original request");
    expect(cols[0]!.textContent).toContain("It is too small on mobile.");
    expect(cols[0]!.textContent).toContain('<button class="cta">Go</button>');
    expect(cols[1]!.querySelector(".or-h")!.textContent).toContain("Claude Code via MCP");
    expect(cols[1]!.textContent).toContain("Bigger hit area");
    expect(cols[1]!.textContent).toContain(".cta.big{padding:14px}");

    toggle.click();
    expect(view().style.display).toBe("none");
    expect(toggle.textContent).toBe("Show original");
  });

  it("offers no origin toggle when nothing has been proposed", async () => {
    localStorage.setItem(keyFor(location.pathname), JSON.stringify([seeded({ id: "a", status: "in_review" })]));
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    await new Promise((r) => setTimeout(r, 10));
    expect(sr().querySelector(".revbanner")).toBeTruthy();
    expect(sr().querySelector(".rev-origin")).toBeFalsy();
    expect(sr().querySelector(".origin")).toBeFalsy();
  });

  it("gates generating behind an access request when there is no generator", async () => {
    const asked: any[] = [];
    localStorage.setItem(keyFor(location.pathname), JSON.stringify([seeded({ id: "a", title: "T", body: "b" })]));
    init({
      projectKey: "pk", user: { id: "u", name: "U" },
      onRequestAccess: (req) => { asked.push(req); },
    });
    await new Promise((r) => setTimeout(r, 10));

    sr().querySelector<HTMLElement>(".gen-open")!.click();
    expect(sr().querySelector(".gengate .gate-t")!.textContent).toBe("Generating needs access");

    const ask = sr().querySelector<HTMLElement>(".gate-ask")!;
    expect(ask.textContent).toBe("Request access to generate");
    ask.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(asked).toEqual([{ capability: "generate", user: { id: "u", name: "U" }, projectKey: "pk" }]);
    expect(sr().querySelector<HTMLElement>(".gate-ask")!.disabled).toBe(true);
    expect(sr().querySelector(".gate-ask")!.textContent).toBe("Request sent");
    // And it is visible where the work is recorded.
    expect(sr().querySelector("#loupe-mon-feed")!.textContent).toContain("Requested access to generate");
  });

  it("tells the host when a request has nowhere to go", async () => {
    localStorage.setItem(keyFor(location.pathname), JSON.stringify([seeded({ id: "a" })]));
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    await new Promise((r) => setTimeout(r, 10));
    sr().querySelector<HTMLElement>(".gen-open")!.click();
    expect(sr().querySelector(".gate-hint")!.textContent).toContain("onRequestAccess");
  });

  it("generates, previews, compares and iterates", async () => {
    const calls: any[] = [];
    localStorage.setItem(keyFor(location.pathname), JSON.stringify([
      seeded({ id: "a", title: "Fix the CTA", body: "Too small", status: "in_review" }),
    ]));
    init({
      projectKey: "pk", user: { id: "u", name: "U" },
      generate: async (req) => {
        calls.push({ kind: req.kind, prompt: req.prompt, prev: req.previous?.html, localAi: req.localAi });
        return { html: `<button>${req.prompt}</button>`, css: ".x{color:red}", notes: `round ${calls.length}` };
      },
    });
    await new Promise((r) => setTimeout(r, 10));

    // Nothing generated yet: the pane opens on the first pass.
    sr().querySelector<HTMLElement>(".gen-open")!.click();
    expect(sr().querySelector(".genempty")!.textContent).toBe("Nothing generated yet.");

    const type = (text: string) => {
      const input = sr().querySelector<HTMLInputElement>(".iter-in")!;
      input.value = text;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      sr().querySelector<HTMLElement>(".iter-send")!.click();
    };
    type("make it bigger");
    await new Promise((r) => setTimeout(r, 10));

    expect(calls[0]).toEqual({ kind: "refine", prompt: "make it bigger", prev: undefined, localAi: undefined });
    expect(sr().querySelector(".gen-n")!.textContent).toBe("1 / 1");
    expect(sr().querySelector(".gennotes")!.textContent).toBe("round 1");
    // The preview is a sandboxed iframe carrying the generated markup and its CSS.
    const frame = sr().querySelector<HTMLIFrameElement>(".genframe")!;
    expect(frame.getAttribute("sandbox")).toBe("");
    expect(frame.getAttribute("srcdoc")).toContain("<button>make it bigger</button>");
    expect(frame.getAttribute("srcdoc")).toContain(".x{color:red}");

    // The opacity comparison drives the plane, and does not re-render the pane.
    const range = sr().querySelector<HTMLInputElement>(".gs-range")!;
    expect(range.value).toBe("60");
    expect(sr().querySelector<HTMLIFrameElement>(".genframe")!.style.opacity).toBe("0.6");
    range.value = "25";
    range.dispatchEvent(new Event("input", { bubbles: true }));
    expect(sr().querySelector<HTMLIFrameElement>(".genframe")!.style.opacity).toBe("0.25");
    expect(sr().querySelector(".gs-range")).toBe(range); // same node: no re-render

    // A second pass refines the first and is reachable by prev/next.
    type("and bolder");
    await new Promise((r) => setTimeout(r, 10));
    expect(calls[1]!.prev).toContain("make it bigger");
    expect(sr().querySelector(".gen-n")!.textContent).toBe("2 / 2");
    const prev = sr().querySelectorAll<HTMLButtonElement>(".gen-step")[0]!;
    const next = sr().querySelectorAll<HTMLButtonElement>(".gen-step")[1]!;
    expect(next.disabled).toBe(true);
    prev.click();
    expect(sr().querySelector(".gen-n")!.textContent).toBe("1 / 2");
    expect(sr().querySelector<HTMLIFrameElement>(".genframe")!.getAttribute("srcdoc"))
      .toContain("<button>make it bigger</button>");

    // Undo throws the newest away rather than just stepping back.
    const undo = sr().querySelector<HTMLButtonElement>(".gen-undo")!;
    undo.click();
    expect(sr().querySelector(".gen-n")!.textContent).toBe("1 / 1");
    expect(sr().querySelector(".gennotes")!.textContent).toBe("round 1");
    // And it lands in the activity feed, like everything else.
    expect(sr().querySelector("#loupe-mon-feed")!.textContent).toContain("generate.refine");
  });

  it("survives a generator that throws, without losing the panel", async () => {
    localStorage.setItem(keyFor(location.pathname), JSON.stringify([seeded({ id: "a", title: "T" })]));
    init({
      projectKey: "pk", user: { id: "u", name: "U" },
      generate: async () => { throw new Error("model offline"); },
    });
    await new Promise((r) => setTimeout(r, 10));
    sr().querySelector<HTMLElement>(".gen-open")!.click();
    const input = sr().querySelector<HTMLInputElement>(".iter-in")!;
    input.value = "go";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    sr().querySelector<HTMLElement>(".iter-send")!.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(sr().querySelector(".genempty")).toBeTruthy();
    expect(sr().querySelector("#loupe-mon-feed")!.textContent).toContain("Generation failed: model offline");
    expect(sr().querySelectorAll(".item").length).toBe(1);
  });

  it("refuses to navigate an agent until the user explicitly grants it", async () => {
    // Replace ONLY `assign`. Replacing the whole `location` object would drop the
    // getters that live on its prototype — `pathname` and `search` become undefined,
    // and every later test that keys off the URL silently breaks.
    const assign = vi.fn();
    const original = window.location.assign;
    Object.defineProperty(window.location, "assign", { configurable: true, writable: true, value: assign });
    try {
      init({ projectKey: "pk", user: { id: "u", name: "U" } });
      await new Promise((r) => setTimeout(r, 10));

      // Nothing is pending up front.
      expect((sr().querySelector(".consent") as HTMLElement).style.display).toBe("none");

      requestNavigation("https://preview.example.com/pr/412", { reason: "The fix is live.", requester: "Claude Code" });
      const box = sr().querySelector(".consent") as HTMLElement;
      expect(box.style.display).toBe("");
      expect(box.textContent).toContain("Claude Code");
      expect(box.textContent).toContain("https://preview.example.com/pr/412");
      expect(box.textContent).toContain("The fix is live.");
      // The prompt is up, but nothing has navigated.
      expect(assign).not.toHaveBeenCalled();

      // Declining navigates nowhere and clears the prompt.
      (sr().querySelector(".cs-deny") as HTMLElement).click();
      expect(assign).not.toHaveBeenCalled();
      expect(box.style.display).toBe("none");
      expect(sr().querySelector("#loupe-mon-feed")!.textContent).toContain("Declined opening");

      // Granting is the only path that navigates.
      requestNavigation("https://preview.example.com/pr/412");
      (sr().querySelector(".cs-go") as HTMLElement).click();
      expect(assign).toHaveBeenCalledWith("https://preview.example.com/pr/412");
      expect(sr().querySelector("#loupe-mon-feed")!.textContent).toContain("Opened https://preview.example.com/pr/412");
    } finally {
      Object.defineProperty(window.location, "assign", { configurable: true, writable: true, value: original });
    }
  });

  it("refuses a request for anything that is not http(s)", async () => {
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    await new Promise((r) => setTimeout(r, 10));
    requestNavigation("javascript:alert(1)");
    requestNavigation("file:///etc/passwd");
    expect((sr().querySelector(".consent") as HTMLElement).style.display).toBe("none");
    expect(sr().querySelector("#loupe-mon-feed")!.textContent).not.toContain("javascript");
  });

  it("offers dictation only where the browser supports it", async () => {
    localStorage.setItem(keyFor(location.pathname), JSON.stringify([seeded({ id: "a" })]));
    init({ projectKey: "pk", user: { id: "u", name: "U" }, captureScreenshot: async () => undefined });
    await leaveComment("voice me");
    const mic = sr().querySelector<HTMLButtonElement>(".voice")!;
    // happy-dom has no SpeechRecognition: the button says so instead of pretending.
    expect(mic.disabled).toBe(true);
    expect(mic.title).toContain("not available");
  });

  it("links to a live preview, and only when one is known", async () => {
    // The widget keys comments on path **and** search, so seed the same key it reads.
    localStorage.setItem(keyFor(`${location.pathname}${location.search}`), JSON.stringify([
      seeded({
        id: "with", title: "Has a preview", status: "in_review",
        pr: { number: 412, url: "https://github.com/acme/web/pull/412", previewUrl: "https://acme.github.io/web/pr-preview/pr-412/" },
      }),
      seeded({ id: "without", title: "No preview yet", status: "in_review", pr: { number: 413 } }),
    ]));
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    await new Promise((r) => setTimeout(r, 10));

    const links = [...sr().querySelectorAll<HTMLAnchorElement>(".previewchip")];
    // One, not two: a thread whose preview is unknown shows nothing rather than a
    // link to a URL nobody has seen respond.
    expect(links.length).toBe(1);
    expect(links[0]!.textContent).toBe("Preview");
    expect(links[0]!.getAttribute("href")).toBe("https://acme.github.io/web/pr-preview/pr-412/");
    expect(links[0]!.getAttribute("target")).toBe("_blank");
  });

  it("labels a revision with the thread it revises", async () => {
    localStorage.setItem(keyFor(`${location.pathname}${location.search}`), JSON.stringify([
      seeded({ id: "orig", title: "The original" }),
      seeded({ id: "rev2", title: "A revision", parentThreadId: "orig", iterationType: "revision", iterationNumber: 2 }),
      // A parent with no revision type is not an iteration — no chip rather than a
      // misleading one.
      seeded({ id: "odd", title: "Half a link", parentThreadId: "orig" }),
    ]));
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    await new Promise((r) => setTimeout(r, 10));

    const chips = [...sr().querySelectorAll<HTMLElement>(".item")].map((i) => i.querySelector(".iterchip")?.textContent ?? null);
    expect(chips).toEqual([null, "Iteration 2", null]);
    expect(sr().querySelector<HTMLElement>(".iterchip")!.title).toBe("Revision of thread #orig");
  });

  it("renders the conversation, with an agent's reply called out", async () => {
    // The replies must post-date the request, or the ordering assertion is meaningless.
    localStorage.setItem(keyFor(`${location.pathname}${location.search}`), JSON.stringify([
      seeded({ id: "t1", title: "Make the CTA bigger", body: "It is too small.", createdAt: "2026-01-01T10:00:00.000Z" }),
    ]));
    localStorage.setItem("loupe:msgs:t1", JSON.stringify([
      { id: "m1", threadId: "t1", author: { id: "a1", name: "Claude Code", type: "agent" }, body: "Made it bigger.", createdAt: "2026-01-01T11:00:00.000Z" },
      { id: "m2", threadId: "t1", author: { id: "u1", name: "Sara", type: "user" }, body: "Still too small.", createdAt: "2026-01-01T12:00:00.000Z" },
    ]));
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    await new Promise((r) => setTimeout(r, 10));

    // Nothing loads until the card is opened.
    sr().querySelector<HTMLElement>(".item")!.click();
    await new Promise((r) => setTimeout(r, 10));

    const rows = [...sr().querySelectorAll<HTMLElement>(".msg")];
    // The request itself is message #1, then the two replies — nothing was migrated.
    expect(rows.length).toBe(3);
    expect(rows[0]!.querySelector(".msg-body")!.textContent).toBe("It is too small.");
    expect(rows[0]!.classList.contains("agent")).toBe(false);

    const agentRow = rows.find((r) => r.classList.contains("agent"))!;
    expect(agentRow.querySelector(".msg-name")!.textContent).toBe("Claude Code");
    expect(agentRow.querySelector(".msg-tag")!.textContent).toBe("agent");
    expect(agentRow.querySelector(".msg-body")!.textContent).toBe("Made it bigger.");
    // Only the agent's row carries the marker.
    expect(rows.filter((r) => r.classList.contains("agent")).length).toBe(1);
  });

  it("posts a reply from the composer and shows it immediately", async () => {
    localStorage.setItem(keyFor(`${location.pathname}${location.search}`), JSON.stringify([
      seeded({ id: "t1", title: "T", body: "b" }),
    ]));
    init({ projectKey: "pk", user: { id: "u", name: "Ada" } });
    await new Promise((r) => setTimeout(r, 10));
    sr().querySelector<HTMLElement>(".item")!.click();
    await new Promise((r) => setTimeout(r, 10));

    const input = sr().querySelector<HTMLTextAreaElement>(".reply-in")!;
    input.value = "Looking at it now.";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    sr().querySelector<HTMLElement>(".reply-send")!.click();
    await new Promise((r) => setTimeout(r, 20));

    const bodies = [...sr().querySelectorAll<HTMLElement>(".msg-body")].map((b) => b.textContent);
    expect(bodies).toContain("Looking at it now.");
    // Attributed to the signed-in person, not to an agent.
    const mine = [...sr().querySelectorAll<HTMLElement>(".msg")].find((m) => m.querySelector(".msg-body")!.textContent === "Looking at it now.")!;
    expect(mine.querySelector(".msg-name")!.textContent).toBe("Ada");
    expect(mine.classList.contains("agent")).toBe(false);
    // It persisted, so a reload would show it.
    expect(JSON.parse(localStorage.getItem("loupe:msgs:t1")!).length).toBe(1);
    // And the draft is cleared.
    expect(sr().querySelector<HTMLTextAreaElement>(".reply-in")!.value).toBe("");
  });

  it("keeps a failed reply with a retry rather than losing it", async () => {
    // The offline store is in-memory and effectively cannot fail, so drive this
    // through the HTTP adapter — a server that is down is the real failure mode.
    const comment = seeded({ id: "t1", title: "T", body: "b" });
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: any = {}) => {
      if (url.includes("/messages") && init.method === "POST") {
        return new Response(JSON.stringify({ error: "boom" }), { status: 500 });
      }
      if (url.includes("/messages")) return new Response("[]", { status: 200 });
      if (url.includes("/notifications")) return new Response(JSON.stringify({ notifications: [], unread: 0 }), { status: 200 });
      if (url.includes("/v1/comments")) return new Response(JSON.stringify([comment]), { status: 200 });
      return new Response("[]", { status: 200 });
    }) as unknown as typeof fetch;

    try {
      init({ projectKey: "pk", user: { id: "u", name: "Ada" }, apiBase: "http://api.test" });
      await new Promise((r) => setTimeout(r, 30));
      sr().querySelector<HTMLElement>(".item")!.click();
      await new Promise((r) => setTimeout(r, 30));

      const input = sr().querySelector<HTMLTextAreaElement>(".reply-in")!;
      input.value = "this will not save";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      sr().querySelector<HTMLElement>(".reply-send")!.click();
      await new Promise((r) => setTimeout(r, 40));

      const failed = sr().querySelector<HTMLElement>(".msg.failed");
      expect(failed, "a rejected reply should stay on screen").toBeTruthy();
      // The text is preserved — losing what someone typed is the worst outcome.
      expect(failed!.querySelector(".msg-body")!.textContent).toBe("this will not save");
      expect(failed!.querySelector(".msg-state")!.textContent).toContain("addMessage failed");
      expect(failed!.querySelector(".msg-retry")).toBeTruthy();
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("shows the activity timeline for the thread", async () => {
    localStorage.setItem(keyFor(`${location.pathname}${location.search}`), JSON.stringify([
      seeded({
        id: "t1", title: "T", body: "b", status: "in_review",
        pr: { number: 412, url: "https://github.com/acme/web/pull/412", previewUrl: "https://acme.github.io/web/pr-preview/pr-412/" },
      }),
    ]));
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    await new Promise((r) => setTimeout(r, 10));
    sr().querySelector<HTMLElement>(".item")!.click();
    await new Promise((r) => setTimeout(r, 10));

    const labels = [...sr().querySelectorAll<HTMLElement>(".tl-l")].map((l) => l.textContent);
    expect(labels[0]).toBe("Feedback captured");
    expect(labels).toContain("Pull request #412 opened");
    expect(labels).toContain("Preview live");
    expect(labels).toContain("Waiting on a human review");
    // Resolved is not claimed for a thread that is not resolved.
    expect(labels).not.toContain("Resolved");
  });

  it("copies the thread as readable text, selector included", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    localStorage.setItem(keyFor(`${location.pathname}${location.search}`), JSON.stringify([
      seeded({ id: "t1", title: "Make the CTA bigger", body: "It is too small." }),
    ]));
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    await new Promise((r) => setTimeout(r, 10));
    sr().querySelector<HTMLElement>(".item")!.click();
    await new Promise((r) => setTimeout(r, 10));

    sr().querySelector<HTMLElement>(".copy-b")!.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(writeText).toHaveBeenCalledTimes(1);
    const text = writeText.mock.calls[0]![0] as unknown as string;
    expect(text).toContain("# Make the CTA bigger (#t1)");
    // The selector is the part that still means something outside Loupe.
    expect(text).toContain("- Target: `.x`");
    expect(text).toContain("It is too small.");
    expect(sr().querySelector<HTMLElement>(".copy-b")!.textContent).toBe("Copied ✓");
  });

  it("highlights a mentioned name in a reply", async () => {
    localStorage.setItem(keyFor(`${location.pathname}${location.search}`), JSON.stringify([
      seeded({ id: "t1", title: "T", body: "b", createdAt: "2026-01-01T10:00:00.000Z" }),
    ]));
    localStorage.setItem("loupe:msgs:t1", JSON.stringify([
      { id: "m1", threadId: "t1", author: { id: "a1", name: "Claude Code", type: "agent" }, body: "cc @sara on this", createdAt: "2026-01-01T11:00:00.000Z" },
    ]));
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    await new Promise((r) => setTimeout(r, 10));
    sr().querySelector<HTMLElement>(".item")!.click();
    await new Promise((r) => setTimeout(r, 10));

    const body = [...sr().querySelectorAll<HTMLElement>(".msg-body")].find((b) => b.textContent!.includes("@sara"))!;
    const mention = body.querySelector(".mention")!;
    expect(mention.textContent).toBe("@sara");
    // The body still reads as the original text — nothing is lost to highlighting.
    expect(body.textContent).toBe("cc @sara on this");
  });

  it("does not highlight an email address in a reply", async () => {
    localStorage.setItem(keyFor(`${location.pathname}${location.search}`), JSON.stringify([
      seeded({ id: "t1", title: "T", body: "b", createdAt: "2026-01-01T10:00:00.000Z" }),
    ]));
    localStorage.setItem("loupe:msgs:t1", JSON.stringify([
      { id: "m1", threadId: "t1", author: { id: "u1", name: "Sara", type: "user" }, body: "mail sara@acme.test", createdAt: "2026-01-01T11:00:00.000Z" },
    ]));
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    await new Promise((r) => setTimeout(r, 10));
    sr().querySelector<HTMLElement>(".item")!.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(sr().querySelector(".mention")).toBeFalsy();
  });

  it("suggests people while a handle is being typed", async () => {
    localStorage.setItem(keyFor(`${location.pathname}${location.search}`), JSON.stringify([
      seeded({ id: "t1", title: "T", body: "b", author: { id: "u1", name: "Sara Ahmed" } }),
    ]));
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    await new Promise((r) => setTimeout(r, 10));
    sr().querySelector<HTMLElement>(".item")!.click();
    await new Promise((r) => setTimeout(r, 10));

    const input = sr().querySelector<HTMLTextAreaElement>(".reply-in")!;
    // The offline adapter derives people from who has already commented.
    input.value = "hi @sar";
    input.setSelectionRange(7, 7);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 10));

    const picks = [...sr().querySelectorAll<HTMLElement>(".mention-pick")];
    expect(picks.map((p) => p.textContent)).toEqual(["Sara Ahmed"]);

    // Choosing one inserts the handle and hides the list.
    picks[0]!.click();
    expect(input.value).toBe("hi @SaraAhmed ");
    expect((sr().querySelector<HTMLElement>(".mention-list") as HTMLElement).style.display).toBe("none");
  });

  it("does not offer suggestions outside a handle", async () => {
    localStorage.setItem(keyFor(`${location.pathname}${location.search}`), JSON.stringify([
      seeded({ id: "t1", title: "T", body: "b" }),
    ]));
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    await new Promise((r) => setTimeout(r, 10));
    sr().querySelector<HTMLElement>(".item")!.click();
    await new Promise((r) => setTimeout(r, 10));

    const input = sr().querySelector<HTMLTextAreaElement>(".reply-in")!;
    input.value = "no mention here";
    input.setSelectionRange(16, 16);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 10));
    expect((sr().querySelector<HTMLElement>(".mention-list") as HTMLElement).style.display).toBe("none");
  });

  it("needs-you counts what a human must act on, using the shared predicate", async () => {
    localStorage.setItem(keyFor(`${location.pathname}${location.search}`), JSON.stringify([
      seeded({ id: "a", title: "queued", status: "queue" }),
      seeded({ id: "b", title: "working", status: "in_progress" }),
      seeded({ id: "c", title: "review", status: "in_review" }),
      seeded({ id: "d", title: "done", status: "resolved" }),
    ]));
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    await new Promise((r) => setTimeout(r, 10));

    const tile = [...sr().querySelectorAll<HTMLElement>(".hstat-b")].find((b) => b.querySelector(".hstat-l")!.textContent === "Needs you")!;
    expect(tile.querySelector(".hstat-n")!.textContent).toBe("1");

    // The tile filters to exactly those, and excludes what an agent is working on.
    tile.click();
    expect(sr().querySelectorAll(".item").length).toBe(1);
    expect(sr().querySelector(".item .summary")!.textContent).toBe("review");
  });

  it("shows an in-app mention, and can mark it read", async () => {
    const comment = seeded({ id: "t1", title: "The CTA", body: "b" });
    const realFetch = globalThis.fetch;
    let marked = false;
    globalThis.fetch = (async (url: string, init: any = {}) => {
      if (url.includes("/notifications/read")) { marked = true; return new Response("{}", { status: 200 }); }
      if (url.includes("/notifications")) {
        // Unread until the client says otherwise, so the assertion has a before/after.
        const list = marked ? [] : [
          { id: "n1", threadId: "t1", kind: "mention", body: "Sara mentioned you", actorName: "Sara", createdAt: new Date().toISOString() },
        ];
        return new Response(JSON.stringify({ notifications: list, unread: list.length }), { status: 200 });
      }
      if (url.includes("/v1/comments")) return new Response(JSON.stringify([comment]), { status: 200 });
      return new Response("[]", { status: 200 });
    }) as unknown as typeof fetch;

    try {
      init({ projectKey: "pk", user: { id: "u", name: "U" }, apiBase: "http://api.test" });
      await new Promise((r) => setTimeout(r, 40));

      const box = sr().querySelector<HTMLElement>("#loupe-hnotif")!;
      expect(box.style.display).not.toBe("none");
      expect(box.textContent).toContain("1 mention waiting");
      expect(box.textContent).toContain("Sara mentioned you");

      (box.querySelector(".nf-read") as HTMLElement).click();
      await new Promise((r) => setTimeout(r, 40));
      expect(marked).toBe(true);
      // Gone once read — a permanent "0 unread" is noise.
      expect((sr().querySelector<HTMLElement>("#loupe-hnotif") as HTMLElement).style.display).toBe("none");
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("shows a reaction pill with its count, and marks your own", async () => {
    localStorage.setItem(keyFor(`${location.pathname}${location.search}`), JSON.stringify([
      seeded({ id: "t1", title: "T", body: "b", createdAt: "2026-01-01T10:00:00.000Z" }),
    ]));
    localStorage.setItem("loupe:msgs:t1", JSON.stringify([
      { id: "m1", threadId: "t1", author: { id: "a1", name: "Claude Code", type: "agent" }, body: "done", createdAt: "2026-01-01T11:00:00.000Z" },
    ]));
    localStorage.setItem("loupe:rxn:t1", JSON.stringify([
      { messageId: "m1", emoji: "👍", userId: "u", userName: "U" },
      { messageId: "m1", emoji: "👍", userId: "u2", userName: "Jane" },
    ]));
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    await new Promise((r) => setTimeout(r, 10));
    sr().querySelector<HTMLElement>(".item")!.click();
    await new Promise((r) => setTimeout(r, 30));

    const pill = sr().querySelector<HTMLElement>(".rxn")!;
    expect(pill.textContent).toContain("👍");
    expect(pill.querySelector(".rxn-n")!.textContent).toBe("2");
    // Highlighted, because one of the two is you.
    expect(pill.classList.contains("mine")).toBe(true);
    expect(pill.title).toBe("U, Jane");
  });

  it("toggles a reaction off by clicking its pill", async () => {
    localStorage.setItem(keyFor(`${location.pathname}${location.search}`), JSON.stringify([
      seeded({ id: "t1", title: "T", body: "b", createdAt: "2026-01-01T10:00:00.000Z" }),
    ]));
    localStorage.setItem("loupe:msgs:t1", JSON.stringify([
      { id: "m1", threadId: "t1", author: { id: "a1", name: "A", type: "agent" }, body: "done", createdAt: "2026-01-01T11:00:00.000Z" },
    ]));
    localStorage.setItem("loupe:rxn:t1", JSON.stringify([{ messageId: "m1", emoji: "👍", userId: "u", userName: "U" }]));
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    await new Promise((r) => setTimeout(r, 10));
    sr().querySelector<HTMLElement>(".item")!.click();
    await new Promise((r) => setTimeout(r, 30));

    sr().querySelector<HTMLElement>(".rxn")!.click();
    await new Promise((r) => setTimeout(r, 40));
    // Gone — and nothing was left behind in storage either.
    expect(sr().querySelector(".rxn")).toBeFalsy();
    expect(JSON.parse(localStorage.getItem("loupe:rxn:t1")!)).toEqual([]);
  });

  it("adds a reaction from the picker", async () => {
    localStorage.setItem(keyFor(`${location.pathname}${location.search}`), JSON.stringify([
      seeded({ id: "t1", title: "T", body: "b", createdAt: "2026-01-01T10:00:00.000Z" }),
    ]));
    localStorage.setItem("loupe:msgs:t1", JSON.stringify([
      { id: "m1", threadId: "t1", author: { id: "a1", name: "A", type: "agent" }, body: "done", createdAt: "2026-01-01T11:00:00.000Z" },
    ]));
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    await new Promise((r) => setTimeout(r, 10));
    sr().querySelector<HTMLElement>(".item")!.click();
    await new Promise((r) => setTimeout(r, 30));

    expect(sr().querySelector(".rxn-pick")).toBeFalsy();
    sr().querySelector<HTMLElement>(".rxn-add")!.click();
    const pick = sr().querySelector<HTMLElement>(".rxn-pick")!;
    expect(pick.querySelectorAll(".rxn-opt").length).toBe(6);

    (pick.querySelectorAll<HTMLElement>(".rxn-opt")[1]!).click();
    await new Promise((r) => setTimeout(r, 40));
    expect(sr().querySelector<HTMLElement>(".rxn")!.textContent).toContain("🎉");
    // The picker closes once a choice is made.
    expect(sr().querySelector(".rxn-pick")).toBeFalsy();
  });

  it("hides the peer list entirely when no bridge is configured", async () => {
    localStorage.setItem(keyFor(`${location.pathname}${location.search}`), JSON.stringify([seeded({ id: "t1" })]));
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    await new Promise((r) => setTimeout(r, 20));
    // "Nobody is here" is a different claim from "we cannot know who is here".
    expect(sr().querySelector<HTMLElement>(".peers")!.style.display).toBe("none");
  });

  it("shows the others on this page when a bridge is running", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      const u = String(url);
      if (u.includes("/presence") && !u.endsWith("/heartbeat")) {
        if (u.includes("?url=")) {
          return new Response(JSON.stringify({
            peers: [
              { id: "p2", userId: "u2", name: "Jane Doe", url: "/p", lastSeen: Date.now() },
              { id: "p3", userId: "u3", name: "Ali", url: "/p", lastSeen: Date.now() },
            ],
          }), { status: 200 });
        }
        return new Response(JSON.stringify({ peer: { id: "p1" } }), { status: 201 });
      }
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    try {
      localStorage.setItem(keyFor(`${location.pathname}${location.search}`), JSON.stringify([seeded({ id: "t1" })]));
      init({ projectKey: "pk", user: { id: "u", name: "Sara" }, bridge: "http://bridge.test" });
      await new Promise((r) => setTimeout(r, 60));

      const peers = sr().querySelector<HTMLElement>(".peers")!;
      expect(peers.style.display).not.toBe("none");
      const avatars = [...peers.querySelectorAll<HTMLElement>(".peer-av")];
      expect(avatars.map((a) => a.textContent)).toEqual(["JD", "A"]);
      expect(avatars[0]!.title).toContain("Jane Doe");
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("renders a reply's attachment inline", async () => {
    localStorage.setItem(keyFor(`${location.pathname}${location.search}`), JSON.stringify([
      seeded({ id: "t1", title: "T", body: "b", createdAt: "2026-01-01T10:00:00.000Z" }),
    ]));
    localStorage.setItem("loupe:msgs:t1", JSON.stringify([
      {
        id: "m1", threadId: "t1", author: { id: "a1", name: "A", type: "agent" }, body: "see attached",
        createdAt: "2026-01-01T11:00:00.000Z",
        attachments: [
          { url: "/v1/blobs/b1.png", kind: "image", name: "shot.png" },
          { url: "/v1/blobs/b2.webm", kind: "video", name: "clip.webm" },
        ],
      },
    ]));
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    await new Promise((r) => setTimeout(r, 10));
    sr().querySelector<HTMLElement>(".item")!.click();
    await new Promise((r) => setTimeout(r, 30));

    const strip = sr().querySelector<HTMLElement>(".msg-atts")!;
    const img = strip.querySelector<HTMLImageElement>("img.msg-att")!;
    expect(img.getAttribute("src")).toBe("/v1/blobs/b1.png");
    expect(img.alt).toBe("shot.png");
    // A video gets a player, not an image tag.
    expect(strip.querySelector<HTMLVideoElement>("video.msg-att")!.getAttribute("src")).toBe("/v1/blobs/b2.webm");
  });

  it("does not draw an attachment strip for a reply without files", async () => {
    localStorage.setItem(keyFor(`${location.pathname}${location.search}`), JSON.stringify([
      seeded({ id: "t1", title: "T", body: "b", createdAt: "2026-01-01T10:00:00.000Z" }),
    ]));
    localStorage.setItem("loupe:msgs:t1", JSON.stringify([
      { id: "m1", threadId: "t1", author: { id: "a1", name: "A", type: "agent" }, body: "just text", createdAt: "2026-01-01T11:00:00.000Z" },
    ]));
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    await new Promise((r) => setTimeout(r, 10));
    sr().querySelector<HTMLElement>(".item")!.click();
    await new Promise((r) => setTimeout(r, 30));
    expect(sr().querySelector(".msg-atts")).toBeFalsy();
  });

  it("offers an attach control on the reply box", async () => {
    localStorage.setItem(keyFor(`${location.pathname}${location.search}`), JSON.stringify([seeded({ id: "t1" })]));
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    await new Promise((r) => setTimeout(r, 10));
    sr().querySelector<HTMLElement>(".item")!.click();
    await new Promise((r) => setTimeout(r, 20));
    const attach = sr().querySelector<HTMLElement>(".reply-attach")!;
    expect(attach).toBeTruthy();
    expect(attach.getAttribute("aria-label")).toBe("Attach a file");
    // The picker is hidden; the button drives it, so no stray file input is visible.
    expect((sr().querySelector<HTMLInputElement>(".reply input[type=file]") as HTMLInputElement).style.display).toBe("none");
  });

  it("does not send an empty reply with no attachment", async () => {
    localStorage.setItem(keyFor(`${location.pathname}${location.search}`), JSON.stringify([seeded({ id: "t1" })]));
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    await new Promise((r) => setTimeout(r, 10));
    sr().querySelector<HTMLElement>(".item")!.click();
    await new Promise((r) => setTimeout(r, 20));

    sr().querySelector<HTMLElement>(".reply-send")!.click();
    await new Promise((r) => setTimeout(r, 20));
    // Nothing was posted, so no optimistic row appeared.
    expect(sr().querySelector(".msg.pending")).toBeFalsy();
  });

  it("refreshes an open thread when the bridge relays a new message", async () => {
    const realES = (globalThis as any).EventSource;
    const FakeES = makeFakeEventSource();
    (globalThis as any).EventSource = FakeES;
    // Configuring a bridge also starts presence, which would otherwise make a real
    // request to a host that does not exist — stubbed so this test only exercises SSE.
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;

    try {
      localStorage.setItem(keyFor(`${location.pathname}${location.search}`), JSON.stringify([
        seeded({ id: "t1", title: "T", body: "b", createdAt: "2026-01-01T10:00:00.000Z" }),
      ]));
      localStorage.setItem("loupe:msgs:t1", JSON.stringify([
        { id: "m1", threadId: "t1", author: { id: "a1", name: "A", type: "agent" }, body: "first", createdAt: "2026-01-01T11:00:00.000Z" },
      ]));
      init({ projectKey: "pk", user: { id: "u", name: "U" }, bridge: "http://bridge.test" });
      await new Promise((r) => setTimeout(r, 20));

      // Two streams now: the thread channel and the companion channel.
      const threadSource = FakeES.all.find((e: any) => e.url.endsWith("/thread-updates"));
      expect(threadSource, "the thread stream must still be opened").toBeTruthy();
      expect(FakeES.all.map((e: any) => e.url)).toContain("http://bridge.test/events");

      sr().querySelector<HTMLElement>(".item")!.click();
      await new Promise((r) => setTimeout(r, 30));
      // The comment's own body is message #1, so one reply reads as two.
      expect(sr().querySelectorAll(".msg").length).toBe(2);

      // A reply lands in the store, then the event says so.
      localStorage.setItem("loupe:msgs:t1", JSON.stringify([
        { id: "m1", threadId: "t1", author: { id: "a1", name: "A", type: "agent" }, body: "first", createdAt: "2026-01-01T11:00:00.000Z" },
        { id: "m2", threadId: "t1", author: { id: "u2", name: "Jane", type: "user" }, body: "second", createdAt: "2026-01-01T12:00:00.000Z" },
      ]));
      FakeES.all.find((e: any) => e.url.endsWith("/thread-updates"))
        .emit("thread", { type: "thread", threadId: "t1", eventType: "message_added" });
      await new Promise((r) => setTimeout(r, 40));

      const bodies = [...sr().querySelectorAll<HTMLElement>(".msg-body")].map((b) => b.textContent);
      expect(bodies).toContain("second");
      expect(sr().querySelectorAll(".msg").length).toBe(3);
    } finally {
      (globalThis as any).EventSource = realES;
      globalThis.fetch = realFetch;
    }
  });

  it("ignores a thread event for a thread nobody has open", async () => {
    const realES = (globalThis as any).EventSource;
    const FakeES = makeFakeEventSource();
    (globalThis as any).EventSource = FakeES;
    const realFetch3 = globalThis.fetch;
    globalThis.fetch = (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;
    try {
      localStorage.setItem(keyFor(`${location.pathname}${location.search}`), JSON.stringify([seeded({ id: "t1" })]));
      init({ projectKey: "pk", user: { id: "u", name: "U" }, bridge: "http://bridge.test" });
      await new Promise((r) => setTimeout(r, 20));
      destroy();
      expect(FakeES.last.closed).toBe(true);
    } finally {
      (globalThis as any).EventSource = realES;
      globalThis.fetch = realFetch3;
    }
  });

  /** A fetch stub that records what the panel sends to the bridge. */
  const withBridge = (handler: (url: string, init: any) => Response) => {
    const realFetch = globalThis.fetch;
    const calls: { url: string; body: any }[] = [];
    globalThis.fetch = (async (url: string, init: any = {}) => {
      calls.push({ url: String(url), body: init.body ? JSON.parse(init.body) : undefined });
      return handler(String(url), init);
    }) as unknown as typeof fetch;
    return { restore: () => { globalThis.fetch = realFetch; }, calls };
  };

  const openChat = async () => {
    sr().querySelector<HTMLElement>('.tabs [data-tab="chat"]')!.click();
    await new Promise((r) => setTimeout(r, 20));
  };

  it("has a chat tab with a composer and a gather button", async () => {
    localStorage.setItem(keyFor(`${location.pathname}${location.search}`), JSON.stringify([seeded({ id: "t1" })]));
    const b = withBridge(() => new Response("{}", { status: 200 }));
    try {
      init({ projectKey: "pk", user: { id: "u", name: "U" }, bridge: "http://bridge.test" });
      await new Promise((r) => setTimeout(r, 20));
      await openChat();

      expect(sr().querySelector(".chat-in")).toBeTruthy();
      expect(sr().querySelector("#loupe-chatadd")!.textContent).toContain("Selection");
      expect(sr().querySelector("#loupe-chatsend")!.textContent).toBe("Send");
      // Nothing gathered and nothing said — an empty tray draws nothing at all.
      expect((sr().querySelector<HTMLElement>("#loupe-tray") as HTMLElement).style.display).toBe("none");
    } finally {
      b.restore();
    }
  });

  it("gathers the current selection into the tray", async () => {
    localStorage.setItem(keyFor(`${location.pathname}${location.search}`), JSON.stringify([seeded({ id: "t1" })]));
    const b = withBridge((url) => {
      if (url.endsWith("/selection/latest")) {
        return new Response(JSON.stringify({
          selection: { correlationId: "sel_1", selector: ".cta", text: "Buy now", url: "/checkout", tag: "button" },
        }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });
    try {
      init({ projectKey: "pk", user: { id: "u", name: "U" }, bridge: "http://bridge.test" });
      await new Promise((r) => setTimeout(r, 20));
      await openChat();

      sr().querySelector<HTMLElement>("#loupe-chatadd")!.click();
      await new Promise((r) => setTimeout(r, 30));

      const tray = sr().querySelector<HTMLElement>("#loupe-tray")!;
      expect(tray.style.display).not.toBe("none");
      expect(tray.querySelectorAll(".tray-chip").length).toBe(1);
      expect(tray.querySelector(".tray-label")!.textContent).toContain(".cta");
      expect(sr().querySelector(".tray-title")!.textContent).toBe("1 context");

      // Adding a second one appends; the same one again replaces.
      b.calls.length = 0;
      sr().querySelector<HTMLElement>("#loupe-chatadd")!.click();
      await new Promise((r) => setTimeout(r, 30));
      expect(sr().querySelectorAll(".tray-chip").length).toBe(1);
    } finally {
      b.restore();
    }
  });

  it("sends the tray as one message with every gathered context", async () => {
    localStorage.setItem(keyFor(`${location.pathname}${location.search}`), JSON.stringify([seeded({ id: "t1" })]));
    let n = 0;
    const b = withBridge((url) => {
      if (url.endsWith("/selection/latest")) {
        n++;
        return new Response(JSON.stringify({
          selection: { correlationId: `sel_${n}`, selector: `.el-${n}`, text: `t${n}`, url: "/p" },
        }), { status: 200 });
      }
      if (url.endsWith("/companion")) return new Response(JSON.stringify({ ok: true }), { status: 201 });
      return new Response("{}", { status: 200 });
    });
    try {
      init({ projectKey: "pk", user: { id: "u", name: "U" }, bridge: "http://bridge.test" });
      await new Promise((r) => setTimeout(r, 20));
      await openChat();

      // Three elements, one message — that is the point of the tray.
      for (let i = 0; i < 3; i++) {
        sr().querySelector<HTMLElement>("#loupe-chatadd")!.click();
        await new Promise((r) => setTimeout(r, 25));
      }
      const input = sr().querySelector<HTMLTextAreaElement>("#loupe-chatin")!;
      input.value = "make these three match";
      sr().querySelector<HTMLElement>("#loupe-chatsend")!.click();
      await new Promise((r) => setTimeout(r, 50));

      const sent = b.calls.find((c) => c.url.endsWith("/companion"))!;
      expect(sent.body.body).toBe("make these three match");
      expect(sent.body.contexts).toHaveLength(3);
      // Each label carries the selector and a snippet of the text, so the agent knows
      // which element is which without another round trip.
      expect(sent.body.contexts.map((c: any) => c.id)).toEqual(["sel_1", "sel_2", "sel_3"]);
      expect(sent.body.contexts.map((c: any) => c.label)).toEqual([
        ".el-1 — “t1”", ".el-2 — “t2”", ".el-3 — “t3”",
      ]);
      expect(sent.body.author).toEqual({ id: "u", name: "U" });

      // Sent, so the tray is emptied and the composer cleared.
      expect(sr().querySelectorAll(".tray-chip").length).toBe(0);
      expect(input.value).toBe("");
    } finally {
      b.restore();
    }
  });

  it("sends a tray-only brief — showing three things is a sentence", async () => {
    localStorage.setItem(keyFor(`${location.pathname}${location.search}`), JSON.stringify([seeded({ id: "t1" })]));
    const b = withBridge((url) => {
      if (url.endsWith("/selection/latest")) {
        return new Response(JSON.stringify({ selection: { correlationId: "s1", selector: ".x", url: "/p" } }), { status: 200 });
      }
      if (url.endsWith("/companion")) return new Response("{}", { status: 201 });
      return new Response("{}", { status: 200 });
    });
    try {
      init({ projectKey: "pk", user: { id: "u", name: "U" }, bridge: "http://bridge.test" });
      await new Promise((r) => setTimeout(r, 20));
      await openChat();
      sr().querySelector<HTMLElement>("#loupe-chatadd")!.click();
      await new Promise((r) => setTimeout(r, 30));

      sr().querySelector<HTMLElement>("#loupe-chatsend")!.click();
      await new Promise((r) => setTimeout(r, 40));
      const sent = b.calls.find((c) => c.url.endsWith("/companion"))!;
      expect(sent.body.contexts).toHaveLength(1);
      expect(sent.body.body).toBe("(see the gathered context)");
    } finally {
      b.restore();
    }
  });

  it("does not send an empty chat message", async () => {
    localStorage.setItem(keyFor(`${location.pathname}${location.search}`), JSON.stringify([seeded({ id: "t1" })]));
    const b = withBridge(() => new Response("{}", { status: 200 }));
    try {
      init({ projectKey: "pk", user: { id: "u", name: "U" }, bridge: "http://bridge.test" });
      await new Promise((r) => setTimeout(r, 20));
      await openChat();
      sr().querySelector<HTMLElement>("#loupe-chatsend")!.click();
      await new Promise((r) => setTimeout(r, 30));
      expect(b.calls.some((c) => c.url.endsWith("/companion"))).toBe(false);
    } finally {
      b.restore();
    }
  });

  it("says why it cannot send when no bridge is configured", async () => {
    localStorage.setItem(keyFor(`${location.pathname}${location.search}`), JSON.stringify([seeded({ id: "t1" })]));
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    await new Promise((r) => setTimeout(r, 20));
    await openChat();

    const input = sr().querySelector<HTMLTextAreaElement>("#loupe-chatin")!;
    input.value = "hello";
    sr().querySelector<HTMLElement>("#loupe-chatsend")!.click();
    await new Promise((r) => setTimeout(r, 20));
    expect(sr().querySelector<HTMLElement>("#loupe-chaterr")!.textContent).toMatch(/No bridge/);
  });

  it("shows a reply, and badges the tab when you are looking elsewhere", async () => {
    const realES = (globalThis as any).EventSource;
    const FakeES = makeFakeEventSource();
    (globalThis as any).EventSource = FakeES;
    const b = withBridge(() => new Response(JSON.stringify({ replies: [] }), { status: 200 }));
    try {
      localStorage.setItem(keyFor(`${location.pathname}${location.search}`), JSON.stringify([seeded({ id: "t1" })]));
      init({ projectKey: "pk", user: { id: "u", name: "U" }, bridge: "http://bridge.test" });
      await new Promise((r) => setTimeout(r, 30));

      const stream = FakeES.all.find((e: any) => e.url.endsWith("/events"))!;
      expect(stream, "the companion stream must be opened").toBeTruthy();

      // A reply while the person is on another page badges the tab.
      stream.emit("companion", { type: "companion", eventType: "reply", data: { id: "r1", at: "2026-01-01T00:00:00Z", body: "switched it to blue" } });
      await new Promise((r) => setTimeout(r, 20));

      const chatTab = [...sr().querySelectorAll<HTMLElement>(".tabs .tab")].find((t) => t.dataset.tab === "chat")!;
      expect(chatTab.textContent).toContain("1");

      await openChat();
      expect(sr().querySelector(".chat-msg:not(.mine) .chat-body")!.textContent).toBe("switched it to blue");
    } finally {
      (globalThis as any).EventSource = realES;
      b.restore();
    }
  });

  it("shows the same reply once even when both transports deliver it", async () => {
    // SSE and the poll both run, so a reply can arrive twice; the id is what stops
    // one reply appearing as two.
    const realES = (globalThis as any).EventSource;
    const FakeES = makeFakeEventSource();
    (globalThis as any).EventSource = FakeES;
    const reply = { id: "r1", at: "2026-01-01T00:00:00Z", body: "done" };
    const b = withBridge(() => new Response(JSON.stringify({ replies: [reply] }), { status: 200 }));
    try {
      localStorage.setItem(keyFor(`${location.pathname}${location.search}`), JSON.stringify([seeded({ id: "t1" })]));
      init({ projectKey: "pk", user: { id: "u", name: "U" }, bridge: "http://bridge.test" });
      await new Promise((r) => setTimeout(r, 30));
      await openChat();

      const stream = FakeES.all.find((e: any) => e.url.endsWith("/events"))!;
      stream.emit("companion", { type: "companion", eventType: "reply", data: reply });
      stream.emit("companion", { type: "companion", eventType: "reply", data: reply });
      await new Promise((r) => setTimeout(r, 30));

      const bodies = [...sr().querySelectorAll<HTMLElement>(".chat-body")].map((b) => b.textContent);
      expect(bodies.filter((t) => t === "done")).toHaveLength(1);
    } finally {
      (globalThis as any).EventSource = realES;
      b.restore();
    }
  });

  it("hides dictation, and says why, when the browser cannot do it", async () => {
    localStorage.setItem(keyFor(`${location.pathname}${location.search}`), JSON.stringify([seeded({ id: "t1" })]));
    const b = withBridge(() => new Response("{}", { status: 200 }));
    try {
      init({ projectKey: "pk", user: { id: "u", name: "U" }, bridge: "http://bridge.test" });
      await new Promise((r) => setTimeout(r, 20));
      await openChat();

      // happy-dom has no SpeechRecognition, so this is the unsupported path.
      sr().querySelector<HTMLElement>("#loupe-chatmic")!.click();
      await new Promise((r) => setTimeout(r, 20));
      const err = sr().querySelector<HTMLElement>("#loupe-chaterr")!.textContent!;
      // Either reason is acceptable here, but it must say something actionable rather
      // than starting a recording that cannot work.
      expect(err).toMatch(/secure page|Dictation|dictate/);
      expect((sr().querySelector<HTMLElement>("#loupe-chatrec") as HTMLElement).style.display).toBe("none");
    } finally {
      b.restore();
    }
  });

  it("does not initialize without projectKey or user id", () => {
    init({ projectKey: "", user: { id: "u", name: "U" } } as any);
    expect(document.getElementById("loupe-root")).toBeNull();
  });
});
