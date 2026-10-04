// Data types + helpers are canonical in @loupekit/shared; re-export so the SDK's
// internal `./types.js` imports keep working.
export * from "@loupekit/shared";

import type {
  ActivityEvent,
  OrgInfo,
  MessageAttachment,
  Reaction,
  ActivityEventInput, Attachment, Comment, Iteration, IterationKind, LoupeUser, RegionRect,
  ThreadAuthor, ThreadMessage,
} from "@loupekit/shared";

/** Local-AI settings the user configured in the panel (any OpenAI-compatible server). */
export interface LocalAiConfig {
  /** Base URL, e.g. "http://localhost:11434" for Ollama. */
  url: string;
  /** Model name, e.g. "llama3.2". */
  model: string;
}

/**
 * What a generator is asked for. Bring your own model — the panel owns the preview,
 * the comparison and the iteration history; producing the markup is the host's job.
 */
export interface GenerateRequest {
  /** The thread being worked on. */
  comment: Comment;
  /** The original request on the first pass, the follow-up after that. */
  prompt: string;
  kind: IterationKind;
  /** The iteration being refined, when there is one. */
  previous?: Iteration;
  /** Local-AI settings, when the user configured them. */
  localAi?: LocalAiConfig;
}

export interface GenerateResult {
  html: string;
  css?: string;
  notes?: string;
}

/** Asked for when a user without a generator reaches for one. */
export interface AccessRequest {
  capability: "generate";
  user: LoupeUser;
  projectKey: string;
}

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
  /**
   * Base URL of the Loupe agent bridge, when one is running. Presence is the only
   * thing that needs it, and with none configured the panel hides the peer list
   * entirely rather than showing an empty one — "nobody is here" is a different claim
   * from "we cannot know who is here".
   */
  bridge?: string;
  /** Backend base URL. Omitted → comments persist to localStorage (offline mode). */
  apiBase?: string;
  /** Start with the inspect tool already active (opens the control panel). */
  autoOpen?: boolean;
  /**
   * Which tool `autoOpen` arms. "inspect" (the default) picks an element; "note"
   * drops a page-level comment. The extension's context menus use this to land the
   * right tool for what was clicked.
   */
  tool?: "inspect" | "note";
  /** Brand label shown in the control-panel header. Defaults to "Loupe". */
  label?: string;
  /**
   * Show the Chat tab. Experimental and off by default: without it the tab is shown
   * dimmed and cannot be opened, and the panel never connects to the bridge's reply
   * stream.
   */
  chat?: boolean;
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
   * Produce a change for a captured element. Given this, the panel renders a
   * preview plane with an opacity comparison, iteration history and undo. Without
   * it, the panel offers "Request access" instead — see `onRequestAccess`.
   */
  generate?: (req: GenerateRequest) => Promise<GenerateResult>;
  /**
   * Called when someone reaches for a capability they do not have. The host
   * decides what to do with it (queue it, email an admin, open a form).
   */
  onRequestAccess?: (req: AccessRequest) => void | Promise<void>;
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
   * IANA time zone every absolute timestamp in the panel is rendered in, e.g.
   * "Africa/Cairo". Defaults to the browser's zone. A team that sits in one place
   * sets it so everyone reads the same clock whatever their laptop says. An
   * unknown zone falls back to the browser's and is reported once in the console.
   */
  timeZone?: string;
  /** BCP 47 locale for dates (e.g. "en-GB" for day-first). Defaults to the browser's. */
  locale?: string;
  /**
   * Version of the host-side package that serves this bundle — the Laravel package
   * passes its Composer version. Shown beside the SDK build, and flagged when the
   * two differ: that gap is exactly the "I updated the package and nothing changed"
   * trap, where the package was upgraded but the published JS was not.
   */
  packageVersion?: string;
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
  /** Replies on a thread, oldest first. The comment's own body is message #1. */
  listMessages(threadId: string): Promise<ThreadMessage[]>;
  /**
   * Post a reply. Resolves to the stored message, plus any mentions the server
   * resolved and — importantly — the handles it could not, so the UI can say so
   * instead of leaving a mention that silently did nothing.
   */
  addMessage(
    threadId: string,
    message: { author: ThreadAuthor; body: string; attachments?: MessageAttachment[] },
  ): Promise<ThreadMessage & { mentions?: string[]; unknownMentions?: string[] }>;
  /** Everyone who has taken part in the project — the people you can mention. */
  listPeople(projectKey: string): Promise<{ id: string; name: string; email?: string }[]>;
  /** In-app notifications for this user. */
  listNotifications(projectKey: string, recipient: string): Promise<{ id: string; threadId: string; kind: string; body: string; actorName?: string; createdAt: string; readAt?: string }[]>;
  markNotificationsRead(projectKey: string, recipient: string, id?: string): Promise<void>;
  /** Every reaction on a thread, so the client can aggregate them itself. */
  listReactions(threadId: string): Promise<Reaction[]>;
  /** Toggle one reaction. Returns the whole new set — never guess the new count. */
  toggleReaction(input: { threadId: string; messageId: string; emoji: string; userId: string; userName?: string }): Promise<Reaction[]>;
  /**
   * The organization this project belongs to and its other projects. Null when the
   * backend has no such endpoint. Optional so custom adapters keep compiling.
   */
  getOrg?(): Promise<OrgInfo | null>;
  /**
   * The server's activity feed for the project, newest first. Null when the backend
   * does not keep one, which the panel shows as "Monitor unavailable".
   */
  listActivity?(projectKey: string, since?: string): Promise<ActivityEvent[] | null>;
}

/** Result of trying to re-locate an anchored element on the current page. */
export interface ResolveResult {
  element: Element;
  score: number;
  via: "testid" | "id" | "cssPath" | "xpath" | "scan";
}
