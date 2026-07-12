import { domToPng } from "modern-screenshot";
import type { ElementContext, RegionRect } from "./types.js";

const STYLE_KEYS = [
  "display", "position", "width", "height", "margin", "padding",
  "color", "background-color", "font-size", "font-weight", "font-family",
  "border", "border-radius", "box-shadow", "flex", "grid-template-columns",
  "text-align", "line-height", "opacity",
];

/** outerHTML + a curated slice of computed styles — the context handed to Claude. */
export function captureElementContext(el: Element): ElementContext {
  const html = el.outerHTML.length > 6000 ? el.outerHTML.slice(0, 6000) + "…" : el.outerHTML;
  const cs = getComputedStyle(el);
  const styles: Record<string, string> = {};
  for (const k of STYLE_KEYS) {
    const v = cs.getPropertyValue(k);
    if (v) styles[k] = v.trim();
  }
  return { html, styles };
}

/** Max time (ms) any single capture may spend fetching/embedding assets. */
const CAPTURE_TIMEOUT = 6000;

/** Resolve `undefined` if `p` doesn't settle within `ms` — so a capture can never hang the UI. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([p, new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms))]);
}

/**
 * Give web fonts a brief chance to finish loading so they embed instead of
 * falling back — but NEVER block on it. On some SPAs `document.fonts.ready`
 * settles slowly (or keeps loading), which would otherwise hang the capture,
 * so we race it against a short cap.
 */
async function fontsReady(): Promise<void> {
  try {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (!fonts?.ready) return;
    await Promise.race([
      fonts.ready,
      new Promise<void>((resolve) => setTimeout(resolve, 800)),
    ]);
  } catch {
    /* FontFaceSet unsupported — carry on */
  }
}

/** Skip Loupe's own UI and redacted elements in any capture. */
function captureFilter(node: Node): boolean {
  if (!(node instanceof Element)) return true;
  if (node.id === "loupe-root") return false;
  if (node.hasAttribute("data-loupe-redact")) return false;
  return true;
}

/**
 * Screenshot the target element. Elements marked [data-loupe-redact] are
 * excluded before anything leaves the browser, and our own UI is never captured.
 */
export async function captureScreenshot(el: Element): Promise<string | undefined> {
  try {
    await fontsReady();
    return await withTimeout(
      domToPng(el as HTMLElement, {
        scale: Math.min(window.devicePixelRatio || 1, 2),
        backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
        timeout: CAPTURE_TIMEOUT,
        filter: captureFilter,
      }),
      CAPTURE_TIMEOUT + 2000,
    );
  } catch (err) {
    console.warn("[loupe] screenshot capture failed", err);
    return undefined;
  }
}

/**
 * Screenshot a free-form rectangle (the "region shot"). `rect` is in **viewport**
 * coordinates (what's on screen now). The default renders the whole page and crops;
 * the extension overrides this with a real captureVisibleTab crop. Redacted regions
 * are painted over before the pixels leave the browser.
 */
export async function captureRegionScreenshot(rect: RegionRect): Promise<string | undefined> {
  try {
    await fontsReady();
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    // Render the SMALLEST element that fully covers the selection, not the whole
    // page. Rendering document.body is heavy and its cross-origin font embedding
    // often times out (→ fallback fonts, reflow); a scoped subtree behaves like
    // the reliable element capture.
    const container = regionContainer(rect);
    const origin = container.getBoundingClientRect();
    const full = await withTimeout(
      domToPng(container, {
        scale,
        backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
        timeout: CAPTURE_TIMEOUT,
        filter: captureFilter,
      }),
      CAPTURE_TIMEOUT + 2000,
    );
    if (!full) return undefined;
    const redact = Array.from(document.querySelectorAll("[data-loupe-redact]")).map((n) =>
      (n as Element).getBoundingClientRect(),
    );
    return await cropRegion(full, rect, origin.left, origin.top, scale, redact);
  } catch (err) {
    console.warn("[loupe] region capture failed", err);
    return undefined;
  }
}

/** The smallest on-page element whose box fully covers the selection rectangle. */
function regionContainer(rect: RegionRect): HTMLElement {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  let node = document.elementFromPoint(cx, cy) as HTMLElement | null;
  if (node && node.closest("#loupe-root")) node = null; // never our own UI
  const covers = (r: DOMRect) =>
    r.left <= rect.x && r.top <= rect.y && r.right >= rect.x + rect.w && r.bottom >= rect.y + rect.h;
  while (node && node !== document.body && node !== document.documentElement) {
    if (covers(node.getBoundingClientRect())) return node;
    node = node.parentElement;
  }
  return document.body;
}

/** Crop `rect` (viewport coords) out of a full-page data URL whose origin sits at (ox, oy). */
function cropRegion(
  dataUrl: string,
  rect: RegionRect,
  ox: number,
  oy: number,
  scale: number,
  redact: DOMRect[],
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const sw = Math.max(1, Math.round(rect.w * scale));
      const sh = Math.max(1, Math.round(rect.h * scale));
      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, (rect.x - ox) * scale, (rect.y - oy) * scale, sw, sh, 0, 0, sw, sh);
      ctx.fillStyle = "#0f0f14";
      for (const r of redact) {
        ctx.fillRect((r.left - rect.x) * scale, (r.top - rect.y) * scale, r.width * scale, r.height * scale);
      }
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}
