// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { destroy, init } from "../src/index.ts";

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
    await new Promise((r) => setTimeout(r, 10));

    const stored = JSON.parse(localStorage.getItem(`loupe:pk:${location.pathname}${location.search}`)!);
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

  it("quick action: Connect Claude opens the panel straight on the connect page", () => {
    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    sr().querySelector<HTMLElement>('.dctl [data-role="close"]')!.click();
    sr().querySelector<HTMLElement>('[data-fab="connect"]')!.click();
    expect(sr().querySelector(".dock")!.classList.contains("open")).toBe(true);
    expect(sr().querySelector(".dock")!.classList.contains("tab-connect")).toBe(true);
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
    expect(sr().querySelectorAll(".tour-dots i").length).toBe(4);
    // It starts where the user already is — no tab switch on the first step.
    expect(sr().querySelector(".dock")!.classList.contains("tab-home")).toBe(true);

    for (let i = 0; i < 3; i++) sr().querySelector<HTMLElement>(".tour .t-next")!.click();
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
    expect(sr().querySelectorAll(".tour-dots i").length).toBe(4);
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
    sr().querySelector<HTMLElement>('.tabs [data-tab="connect"]')!.click();
    sr().querySelector<HTMLElement>(".hint-off")!.click();
    expect(sr().querySelector(".connect-view .hint")).toBeFalsy();
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

  it("does not initialize without projectKey or user id", () => {
    init({ projectKey: "", user: { id: "u", name: "U" } } as any);
    expect(document.getElementById("loupe-root")).toBeNull();
  });
});
