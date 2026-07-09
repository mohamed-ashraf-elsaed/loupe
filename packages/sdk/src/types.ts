// Data types + helpers are canonical in @loupe/shared; re-export so the SDK's
// internal `./types.js` imports keep working.
export * from "@loupe/shared";

import type { Comment, LoupeUser } from "@loupe/shared";

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
