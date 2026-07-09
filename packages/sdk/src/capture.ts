import { domToPng } from "modern-screenshot";
import type { ElementContext } from "./types.js";

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

/**
 * Screenshot the target element. Elements marked [data-loupe-redact] are
 * excluded before anything leaves the browser, and our own UI is never captured.
 */
export async function captureScreenshot(el: Element): Promise<string | undefined> {
  try {
    return await domToPng(el as HTMLElement, {
      scale: Math.min(window.devicePixelRatio || 1, 2),
      backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
      filter: (node: Node) => {
        if (!(node instanceof Element)) return true;
        if (node.id === "loupe-root") return false;
        if (node.hasAttribute("data-loupe-redact")) return false;
        return true;
      },
    });
  } catch (err) {
    console.warn("[loupe] screenshot capture failed", err);
    return undefined;
  }
}
