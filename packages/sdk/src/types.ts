// Data types + helpers are canonical in @loupekit/shared; re-export so the SDK's
// internal `./types.js` imports keep working.
export * from "@loupekit/shared";

import type { Comment, LoupeUser, RegionRect } from "@loupekit/shared";

export interface LoupeConfig {
  /** Public project key issued by the backend. */
  projectKey: string;
  /** The already-authenticated host-app user. */
  user: LoupeUser;
  /**
   * HMAC-SHA256(user.id, PROJECT_SECRET) computed server-side.
   * Required in production so users can't spoof identity.
   */
  userHmac?: string;
  /** Backend base URL. Omitted → comments persist to localStorage (offline mode). */
  apiBase?: string;
  /** Start with the toolbar already active. */
  autoOpen?: boolean;
  /**
   * Override screenshot capture. The browser extension passes a function backed
   * by chrome.tabs.captureVisibleTab for pixel-perfect captures; the default is
   * DOM-based (modern-screenshot).
   */
  captureScreenshot?: (el: Element) => Promise<string | undefined>;
  /**
   * Override region ("free-size screenshot") capture. `rect` is in viewport
   * coordinates. The extension backs this with captureVisibleTab; the default is
   * DOM-based (modern-screenshot, full page then cropped).
   */
  captureRegion?: (rect: RegionRect) => Promise<string | undefined>;
  /**
   * Extra headers merged into every backend request. Use this to pass a CSRF
   * token (e.g. `{ "X-CSRF-TOKEN": "…" }`) when the backend authenticates via a
   * session cookie rather than the HMAC identity headers.
   */
  headers?: Record<string, string>;
  /**
   * `credentials` mode for backend requests. Defaults to the browser default
   * (`same-origin`). Set to `include` for cross-origin cookie auth (e.g. a
   * Sanctum SPA on a different subdomain).
   */
  credentials?: RequestCredentials;
}

export interface StorageAdapter {
  list(projectKey: string, url: string): Promise<Comment[]>;
  save(comment: Comment): Promise<Comment>;
  update(id: string, patch: Partial<Comment>): Promise<void>;
  remove(id: string): Promise<void>;
}

/** Result of trying to re-locate an anchored element on the current page. */
export interface ResolveResult {
  element: Element;
  score: number;
  via: "testid" | "id" | "cssPath" | "xpath" | "scan";
}
