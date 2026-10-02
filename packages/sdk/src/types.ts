// Data types + helpers are canonical in @loupekit/shared; re-export so the SDK's
// internal `./types.js` imports keep working.
export * from "@loupekit/shared";

import type { ActivityEventInput, Attachment, Comment, LoupeUser, RegionRect } from "@loupekit/shared";

/**
 * What a host-registered tab gets to work with. Everything a tab needs to render
 * something useful without reaching into the panel's internals.
 */
export interface LoupeTabContext {
  /** The project this panel is bound to. */
  projectKey: string;
  /** Backend base URL, when the panel is online. */
  apiBase?: string;
  /** The user the panel is running as. */
  user: LoupeUser;
  /** Comments for the current page, already normalised. */
  comments: Comment[];
  /** The page the panel is on (path + query). */
  url: string;
  /** The running build, e.g. "0.10.14" — handy for a "you are here" line. */
  version: string;
  /** Push an event into the Activity feed. */
  track: (event: ActivityEventInput) => void;
  /** Switch to another tab by id. */
  open: (tabId: string) => void;
  /** Close the panel. */
  close: () => void;
}

/**
 * A tab the host registers through `init({ tabs: [...] })`. This is how the panel
 * is extended without forking it: `render` runs once, when the panel is built, and
 * may return markup or an element.
 */
export interface LoupeTab {
  /** Stable id — becomes `data-tab` and is persisted in the panel state. */
  id: string;
  /** Tab strip label. Keep it short; four tabs already share the panel's width. */
  label: string;
  /** Build the tab body. */
  render: (ctx: LoupeTabContext) => HTMLElement | string;
  /** An optional one-time hint card, exactly like the built-in tabs show. */
  hint?: { title: string; body: string };
}

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
  /** Start with the inspect tool already active (opens the control panel). */
  autoOpen?: boolean;
  /** Brand label shown in the control-panel header. Defaults to "Loupe". */
  label?: string;
  /**
   * The repository this product's feedback belongs to (e.g. "org/repo"). Set it
   * and every comment is filed against it, so a board can be filtered by repo.
   * The panel's project manager can also set this per browser — see `repos`.
   */
  repo?: string;
  /** The branch in play — makes threads branch-aware (e.g. "main", "feature/x"). */
  branch?: string;
  /**
   * Known repositories, for the panel's repo picker. Either a fixed list, or a
   * function the panel calls with the user's search text — which lets a host page
   * back it with its own API (e.g. the GitHub repo list) without the SDK having to
   * know anything about that provider.
   */
  repos?: string[] | ((query: string) => string[] | Promise<string[]>);
  /**
   * Environment URLs to offer for this project (e.g. dev/staging/production), for
   * the panel's project manager. Managed per browser once the user edits them, so
   * this is only the starting set.
   */
  environments?: string[];
  /**
   * Extra sidebar tabs, rendered after the built-in Home / Comments / Activity
   * pages. Each one gets a context object and returns its own markup or element, so
   * the panel can be extended without forking it.
   */
  tabs?: LoupeTab[];
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
   * Override screen-recording capture. `rect` is in viewport coordinates; `opts`
   * carries a duration cap and a `register(stop)` hook to wire a Stop button.
   * Defaults to a getDisplayMedia + canvas-crop recorder; the extension can back
   * this with a real tab-capture recorder. Returns a webm data URL (or undefined).
   */
  captureRecording?: (
    rect: RegionRect,
    opts?: { maxMs?: number; register?: (stop: () => void) => void },
  ) => Promise<string | undefined>;
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
  /**
   * Every comment for the project, across pages — powers the panel's "All"
   * scope and the timeline. Newest first.
   */
  listAll(projectKey: string): Promise<Comment[]>;
  save(comment: Comment): Promise<Comment>;
  update(id: string, patch: Partial<Comment>): Promise<void>;
  remove(id: string): Promise<void>;
  /**
   * Persist one file the reporter attached. Resolves to the stored attachment —
   * an object-storage URL in server mode, or an inline data URL offline.
   */
  upload(projectKey: string, file: File): Promise<Attachment>;
}

/** Result of trying to re-locate an anchored element on the current page. */
export interface ResolveResult {
  element: Element;
  score: number;
  via: "testid" | "id" | "cssPath" | "xpath" | "scan";
}
