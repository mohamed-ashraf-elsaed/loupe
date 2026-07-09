// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

vi.mock("modern-screenshot", () => ({ domToPng: vi.fn(async () => "data:image/png;base64,ZZZ") }));

import { captureElementContext, captureScreenshot } from "../src/capture.ts";

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
