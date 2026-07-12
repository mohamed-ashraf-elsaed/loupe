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

/** Wait for the page's web fonts to finish loading so they get embedded, not
 * substituted with a fallback (which reflows the capture). Best-effort. */
async function fontsReady(): Promise<void> {
  try {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts?.ready) await fonts.ready;
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
    return await domToPng(el as HTMLElement, {
      scale: Math.min(window.devicePixelRatio || 1, 2),
      backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
      // Give cross-origin font/asset fetches time to embed (default is short) so
      // the capture matches the page instead of falling back to system fonts.
      timeout: 30000,
      filter: captureFilter,
    });
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
    const full = await domToPng(document.body, {
      scale,
      backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
      timeout: 30000,
      filter: captureFilter,
    });
    // Map the viewport rect into the body image (body's box-origin is bodyRect).
    const bodyRect = document.body.getBoundingClientRect();
    const redact = Array.from(document.querySelectorAll("[data-loupe-redact]")).map((n) =>
      (n as Element).getBoundingClientRect(),
    );
    return await cropRegion(full, rect, bodyRect.left, bodyRect.top, scale, redact);
  } catch (err) {
    console.warn("[loupe] region capture failed", err);
    return undefined;
  }
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
