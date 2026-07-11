// Canonical types + pure helpers shared across the SDK, server, dashboard, and MCP.

export type CommentStatus = "open" | "in_progress" | "done";

export interface LoupeUser {
  id: string;
  name: string;
  email?: string;
}

export interface Anchor {
  tag: string;
  cssPath: string;
  xpath: string;
  testid: string | null;
  text: string;
  attrs: Record<string, string>;
  nthOfType: number;
  rect: { x: number; y: number; w: number; h: number };
  viewport: { w: number; h: number };
}

export interface ElementContext {
  html: string;
  styles: Record<string, string>;
}

/** A rectangle in **document** coordinates (page px, scroll included). */
export interface RegionRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * The same rectangle expressed as fractions of the region's anchor element
   * (the element under the region's center). Present when an anchor element was
   * found. Used to re-place the region across responsive reflow / different
   * viewports — absolute x/y/w/h are only a fallback when the anchor is gone.
   */
  rel?: { fx: number; fy: number; fw: number; fh: number };
}

/**
 * How a comment is pinned to the page:
 * - "element" (default) → anchored to a DOM element via its fingerprint.
 * - "region"  → a free-form rectangle the user dragged out; carries `region`.
 */
export type CommentKind = "element" | "region";

export interface Comment {
  id: string;
  projectKey: string;
  url: string;
  author: LoupeUser;
  body: string;
  status: CommentStatus;
  /** Defaults to "element" when absent (back-compat with pre-region comments). */
  kind?: CommentKind;
  anchor: Anchor;
  context: ElementContext;
  offset: { x: number; y: number };
  /** Present for region comments: the dragged rectangle in document coords. */
  region?: RegionRect;
  /** A URL (object storage) in server mode, or an inline data URL in offline mode. */
  screenshot?: string;
  createdAt: string;
}

const DROP_EXACT = new Set([
  "api", "key", "fbclid", "gclid", "gbraid", "wbraid", "msclkid",
  "ref", "ref_src", "mc_cid", "mc_eid", "_hsenc", "_hsmi", "igshid",
]);

/**
 * Normalize a page URL so comments don't fragment across tracking/volatile params.
 * Keeps the path + a filtered, sorted query. Drops utm_*, click ids, and Loupe's
 * own dev params (api/key). Accepts a full URL or a path+search string.
 */
export function normalizeUrl(input: string): string {
  try {
    const u = new URL(input, "http://loupe.local");
    let path = u.pathname;
    const kept: [string, string][] = [];
    for (const [k, v] of u.searchParams) {
      const key = k.toLowerCase();
      if (DROP_EXACT.has(key) || key.startsWith("utm_")) continue;
      kept.push([k, v]);
    }
    kept.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
    const qs = new URLSearchParams(kept).toString();
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    return path + (qs ? `?${qs}` : "");
  } catch {
    const i = input.indexOf("?");
    return i >= 0 ? input.slice(0, i) : input;
  }
}
