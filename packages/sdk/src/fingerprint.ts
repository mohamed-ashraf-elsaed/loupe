import type { Anchor, ResolveResult } from "./types.js";

// ---- config ----------------------------------------------------------------

const TEXT_MAX = 120;
const ATTR_KEYS = ["role", "aria-label", "name", "type", "alt", "href", "placeholder", "title"];
/** Minimum composite score to accept a scan match. Below this we treat the element as gone. */
const ACCEPT_THRESHOLD = 0.5;
/** Weights for the composite similarity score (sum need not be 1; we normalize). */
const W = { tag: 0.12, text: 0.34, attrs: 0.22, testid: 0.22, cssPath: 0.2, position: 0.1 };

// ---- capture ----------------------------------------------------------------

export function captureAnchor(el: Element): Anchor {
  const rect = el.getBoundingClientRect();
  return {
    tag: el.tagName.toLowerCase(),
    cssPath: cssPath(el),
    xpath: xPath(el),
    testid: stableId(el),
    text: normText(el.textContent),
    attrs: readAttrs(el),
    nthOfType: nthOfType(el),
    rect: {
      x: Math.round(rect.left + window.scrollX),
      y: Math.round(rect.top + window.scrollY),
      w: Math.round(rect.width),
      h: Math.round(rect.height),
    },
    viewport: { w: window.innerWidth, h: window.innerHeight },
  };
}

// ---- resolve ----------------------------------------------------------------

/**
 * Try to re-locate the element described by `anchor` on the current page.
 * Returns the best candidate above threshold, or null (→ caller falls back to
 * a coordinate pin on the screenshot). Never returns an element inside our own UI.
 */
export function resolveAnchor(anchor: Anchor, root: ParentNode = document): ResolveResult | null {
  // 1. Stable id / testid — the strongest signal. Accept immediately if unique.
  if (anchor.testid) {
    const byTestid = safeQueryAll(root, `[data-testid="${cssStr(anchor.testid)}"], [data-test="${cssStr(anchor.testid)}"]`);
    const byId = document.getElementById(anchor.testid);
    const hits = dedupe([...byTestid, ...(byId ? [byId] : [])]).filter(usable);
    if (hits.length === 1) return { element: hits[0]!, score: 0.98, via: "testid" };
    // Multiple matches → fall through to scoring to disambiguate.
  }

  // 1.5. A cssPath rooted at a stable id/testid + structural position is
  // high-confidence even when the element's own text/content has changed
  // (e.g. a value that updates on redeploy). Require the tag to still match.
  if (/^(\[data-testid=|#)/.test(anchor.cssPath)) {
    const hits = safeQueryAll(root, anchor.cssPath).filter(usable);
    if (hits.length === 1 && hits[0]!.tagName.toLowerCase() === anchor.tag) {
      return { element: hits[0]!, score: 0.9, via: "cssPath" };
    }
  }

  const candidates = new Map<Element, ResolveResult["via"]>();
  const consider = (el: Element | null, via: ResolveResult["via"]) => {
    if (el && usable(el) && !candidates.has(el)) candidates.set(el, via);
  };

  // 2. Exact locators.
  consider(safeQuery(root, anchor.cssPath), "cssPath");
  consider(byXPath(anchor.xpath), "xpath");
  for (const el of safeQueryAll(root, anchor.tag)) consider(el, "scan");

  // 3. Broaden by text when the tag scan is too narrow (e.g. wrapper changed tag).
  if (anchor.text) {
    for (const el of safeQueryAll(root, "*")) {
      if (candidates.size > 4000) break; // safety cap on huge pages
      if (normText(el.textContent) === anchor.text) consider(el, "scan");
    }
  }

  let best: ResolveResult | null = null;
  for (const [el, via] of candidates) {
    const score = similarity(anchor, el, via);
    if (!best || score > best.score) best = { element: el, score, via };
  }
  return best && best.score >= ACCEPT_THRESHOLD ? best : null;
}

function similarity(a: Anchor, el: Element, via: ResolveResult["via"]): number {
  let sum = 0;
  let total = 0;

  const add = (w: number, v: number) => { sum += w * v; total += w; };

  add(W.tag, el.tagName.toLowerCase() === a.tag ? 1 : 0);

  if (a.text) {
    const t = normText(el.textContent);
    add(W.text, t === a.text ? 1 : t && (t.includes(a.text) || a.text.includes(t)) ? 0.5 : 0);
  }

  const attrKeys = Object.keys(a.attrs);
  if (attrKeys.length) {
    let matched = 0;
    for (const k of attrKeys) if (el.getAttribute(k) === a.attrs[k]) matched++;
    add(W.attrs, matched / attrKeys.length);
  }

  if (a.testid) add(W.testid, stableId(el) === a.testid ? 1 : 0);

  add(W.cssPath, via === "cssPath" ? 1 : 0);

  // Positional proximity — normalized by the (possibly changed) viewport diagonal.
  const r = el.getBoundingClientRect();
  const cx = r.left + window.scrollX + r.width / 2;
  const cy = r.top + window.scrollY + r.height / 2;
  const ax = a.rect.x + a.rect.w / 2;
  const ay = a.rect.y + a.rect.h / 2;
  const diag = Math.hypot(a.viewport.w, a.viewport.h) || 1;
  const dist = Math.hypot(cx - ax, cy - ay);
  add(W.position, Math.max(0, 1 - dist / diag));

  return total ? sum / total : 0;
}

// ---- locator builders -------------------------------------------------------

function cssPath(el: Element): string {
  const segs: string[] = [];
  let node: Element | null = el;
  while (node && node.nodeType === 1 && node !== document.documentElement) {
    const id = node.getAttribute("id");
    const testid = node.getAttribute("data-testid") || node.getAttribute("data-test");
    if (id && isStable(id)) { segs.unshift(`#${cssEsc(id)}`); break; }
    if (testid) { segs.unshift(`[data-testid="${cssStr(testid)}"]`); break; }
    segs.unshift(`${node.tagName.toLowerCase()}:nth-of-type(${nthOfType(node)})`);
    node = node.parentElement;
    if (node === document.body) { segs.unshift("body"); break; }
  }
  return segs.join(" > ");
}

function xPath(el: Element): string {
  const segs: string[] = [];
  let node: Element | null = el;
  while (node && node.nodeType === 1 && node !== document.documentElement) {
    segs.unshift(`${node.tagName.toLowerCase()}[${nthOfType(node)}]`);
    node = node.parentElement;
  }
  return "/html/" + segs.join("/");
}

// ---- small helpers ----------------------------------------------------------

function nthOfType(el: Element): number {
  let i = 1;
  let sib = el.previousElementSibling;
  while (sib) {
    if (sib.tagName === el.tagName) i++;
    sib = sib.previousElementSibling;
  }
  return i;
}

function stableId(el: Element): string | null {
  const testid = el.getAttribute("data-testid") || el.getAttribute("data-test");
  if (testid) return testid;
  const id = el.getAttribute("id");
  return id && isStable(id) ? id : null;
}

/** Reject framework-generated ids (e.g. ":r3:", "ember42", long hashes). */
function isStable(id: string): boolean {
  if (id.length > 40) return false;
  if (/^(ember|react|radix|headlessui|:r)/i.test(id)) return false;
  if (/[:]/.test(id)) return false;
  return true;
}

function readAttrs(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of ATTR_KEYS) {
    const v = el.getAttribute(k);
    if (v != null && v !== "") out[k] = v.length > 200 ? v.slice(0, 200) : v;
  }
  return out;
}

function normText(t: string | null): string {
  return (t || "").replace(/\s+/g, " ").trim().slice(0, TEXT_MAX);
}

/** Exclude anything inside our own Shadow-DOM host and non-visible nodes. */
function usable(el: Element): boolean {
  if (el.id === "loupe-root" || el.closest("#loupe-root")) return false;
  if (el === document.body || el === document.documentElement) return false;
  return true;
}

function byXPath(xp: string): Element | null {
  try {
    const r = document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    return r.singleNodeValue instanceof Element ? r.singleNodeValue : null;
  } catch {
    return null;
  }
}

function safeQuery(root: ParentNode, sel: string): Element | null {
  try { return sel ? root.querySelector(sel) : null; } catch { return null; }
}
function safeQueryAll(root: ParentNode, sel: string): Element[] {
  try { return sel ? Array.from(root.querySelectorAll(sel)) : []; } catch { return []; }
}
function dedupe(els: Element[]): Element[] {
  return Array.from(new Set(els));
}
function cssEsc(s: string): string {
  return (window.CSS && CSS.escape) ? CSS.escape(s) : s.replace(/["\\]/g, "\\$&");
}
/** Escape a value for use inside a double-quoted attribute selector. */
function cssStr(s: string): string {
  return s.replace(/["\\]/g, "\\$&");
}
