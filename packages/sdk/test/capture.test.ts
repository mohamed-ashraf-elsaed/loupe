// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

vi.mock("modern-screenshot", () => ({ domToPng: vi.fn(async () => "data:image/png;base64,ZZZ") }));

import { captureElementContext, captureRegionRecording, captureScreenshot } from "../src/capture.ts";

describe("captureElementContext", () => {
  it("captures outerHTML and a curated slice of computed styles", () => {
    document.body.innerHTML = `<button id="b" style="display:block">Hi</button>`;
    const ctx = captureElementContext(document.getElementById("b")!);
    expect(ctx.html).toContain("<button");
    expect("display" in ctx.styles).toBe(true);
  });

  it("truncates very long HTML", () => {
    document.body.innerHTML = `<div id="b">${"x".repeat(7000)}</div>`;
    expect(captureElementContext(document.getElementById("b")!).html.endsWith("…")).toBe(true);
  });
});

describe("captureScreenshot", () => {
  it("returns a data URL from modern-screenshot", async () => {
    document.body.innerHTML = `<div id="b">x</div>`;
    expect(await captureScreenshot(document.getElementById("b")!)).toBe("data:image/png;base64,ZZZ");
  });

  it("returns undefined and swallows capture errors", async () => {
    const ms = await import("modern-screenshot");
    (ms.domToPng as any).mockRejectedValueOnce(new Error("boom"));
    document.body.innerHTML = `<div id="b">x</div>`;
    expect(await captureScreenshot(document.getElementById("b")!)).toBeUndefined();
  });
});

describe("captureRegionRecording", () => {
  /** happy-dom has no screen/canvas recorder — stub just enough to drive the loop. */
  function stubRecorder() {
    const track = { getSettings: () => ({ width: 200, height: 100 }), addEventListener: () => {}, stop: () => {} };
    const stream = { getVideoTracks: () => [track], getTracks: () => [track] };
    Object.defineProperty(navigator, "mediaDevices", { value: { getDisplayMedia: async () => stream }, configurable: true });
    (HTMLMediaElement.prototype as any).play = () => Promise.resolve();
    // happy-dom rejects a non-MediaStream srcObject; the recorder only needs the assignment to stick.
    Object.defineProperty(HTMLMediaElement.prototype, "srcObject", { set() {}, get() { return null; }, configurable: true });
    (HTMLCanvasElement.prototype as any).getContext = () => ({ drawImage: () => {} });
    (HTMLCanvasElement.prototype as any).captureStream = () => ({}) as any;
    class FakeMediaRecorder {
      static isTypeSupported() { return false; }
      state = "inactive";
      ondataavailable: ((e: { data: { size: number } }) => void) | null = null;
      onstop: (() => void) | null = null;
      start() { this.state = "recording"; this.ondataavailable?.({ data: { size: 100 } }); }
      stop() { this.state = "inactive"; this.onstop?.(); }
    }
    (globalThis as any).MediaRecorder = FakeMediaRecorder;
    (window as any).MediaRecorder = FakeMediaRecorder;
  }

  it("stops itself when the size guard trips, and reports why", async () => {
    stubRecorder();
    const reasons: string[] = [];
    const url = await captureRegionRecording(
      { x: 0, y: 0, w: 50, h: 50 },
      { maxMs: 5000, maxBytes: 50, onAutoStop: (r) => reasons.push(r) },
    );
    expect(url).toMatch(/^data:video\/webm/);
    expect(reasons).toEqual(["size"]);
  });
});
