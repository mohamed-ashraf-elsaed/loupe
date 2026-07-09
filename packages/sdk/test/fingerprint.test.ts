// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { captureAnchor, resolveAnchor } from "../src/fingerprint.ts";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("captureAnchor", () => {
  it("captures testid, tag, and normalized text", () => {
    document.body.innerHTML = `<div id="root"><button data-testid="save">  Save   now </button></div>`;
    const a = captureAnchor(document.querySelector('[data-testid="save"]')!);
    expect(a.testid).toBe("save");
    expect(a.tag).toBe("button");
    expect(a.text).toBe("Save now");
    expect(a.cssPath).toContain('[data-testid="save"]');
  });

  it("roots the cssPath at the nearest stable ancestor", () => {
    document.body.innerHTML = `<section data-testid="card"><div class="v">100</div></section>`;
    const a = captureAnchor(document.querySelector(".v")!);
    expect(a.testid).toBeNull();
    expect(a.cssPath.startsWith('[data-testid="card"]')).toBe(true);
  });
});

describe("resolveAnchor", () => {
  it("resolves by unique testid even after move + text change", () => {
    document.body.innerHTML = `<button data-testid="save">Save</button>`;
    const a = captureAnchor(document.querySelector('[data-testid="save"]')!);
    document.body.innerHTML = `<div><button data-testid="save">Renamed</button></div>`;
    const r = resolveAnchor(a)!;
    expect(r.via).toBe("testid");
    expect((r.element as HTMLElement).getAttribute("data-testid")).toBe("save");
  });

  it("uses the stable-ancestor cssPath tier when content changes (redeploy)", () => {
    document.body.innerHTML = `<section data-testid="card"><div class="v">100</div></section>`;
    const a = captureAnchor(document.querySelector(".v")!);
    document.body.innerHTML = `<section data-testid="card"><div class="v">$1,234</div></section>`;
    const r = resolveAnchor(a)!;
    expect(r.element.textContent).toBe("$1,234");
  });

  it("falls back to the scoring scan by text when structure changes", () => {
    document.body.innerHTML = `<main><p>Unique paragraph text</p></main>`;
    const a = captureAnchor(document.querySelector("p")!);
    document.body.innerHTML = `<article><section><p>Unique paragraph text</p></section></article>`;
    const r = resolveAnchor(a);
    expect(r?.element.tagName.toLowerCase()).toBe("p");
  });

  it("disambiguates duplicate testids via scoring", () => {
    document.body.innerHTML = `<button data-testid="x">First</button><button data-testid="x">Second</button>`;
    const a = captureAnchor(document.querySelectorAll('[data-testid="x"]')[1]!);
    expect(resolveAnchor(a)!.element.textContent).toBe("Second");
  });

  it("returns null (detached) when the element is gone", () => {
    document.body.innerHTML = `<button data-testid="save">Save</button>`;
    const a = captureAnchor(document.querySelector('[data-testid="save"]')!);
    document.body.innerHTML = `<div>nothing similar here</div>`;
    expect(resolveAnchor(a)).toBeNull();
  });

  it("never resolves to elements inside the Loupe UI", () => {
    document.body.innerHTML = `<div id="loupe-root"><button data-testid="save">x</button></div>`;
    const a = captureAnchor(document.querySelector("#loupe-root button")!);
    expect(resolveAnchor(a)).toBeNull();
  });
});
