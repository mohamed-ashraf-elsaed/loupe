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

async function leaveComment(text: string) {
  sr().querySelector<HTMLElement>('[data-role="inspect"]')!.click();
  const btn = document.querySelector('[data-testid="save"]')!;
  fire(btn, "pointermove", { clientX: 5, clientY: 5 });
  fire(btn, "click", { clientX: 5, clientY: 5 });
  fillComposer(text, text);
  sr().querySelector<HTMLElement>(".composer .primary")!.click();
  await new Promise((r) => setTimeout(r, 10));
}

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

  it("touch without a screen recorder (every iOS browser): a Camera tool attaches a filmed clip", () => {
    setPointer("coarse");
    delete (navigator as any).mediaDevices; // iOS: no getDisplayMedia

    init({ projectKey: "pk", user: { id: "u", name: "U" } });
    const cam = sr().querySelector<HTMLElement>('[data-role="camera"]');
    expect(cam).not.toBeNull();

    cam!.click();
    const input = sr().querySelector<HTMLInputElement>('input[type="file"][capture]')!;
    expect(input.accept).toBe("video/*");

    // The native recorder hands back a clip → it lands in the composer, pre-attached.
    Object.defineProperty(input, "files", { value: [new File(["x"], "clip.mp4", { type: "video/mp4" })] });
    input.dispatchEvent(new Event("change"));

    expect(sr().querySelector(".composer .chips .chip")!.textContent).toContain("clip.mp4");
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

  it("does not initialize without projectKey or user id", () => {
    init({ projectKey: "", user: { id: "u", name: "U" } } as any);
    expect(document.getElementById("loupe-root")).toBeNull();
  });
});
