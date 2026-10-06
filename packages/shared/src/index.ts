/**
 * @packageDocumentation
 * Canonical types and pure helpers shared by the Loupe SDK, server, dashboard, and
 * MCP server. The package is ESM-only (`"type": "module"`, an `import`-only export):
 *
 * ```ts
 * import { normalizeUrl, normalizeStatus, type Comment } from "@loupekit/shared";
 * ```
 *
 * Terms used below are defined in the guide at
 * https://mohamed-ashraf-elsaed.github.io/loupe/ and in packages/shared/README.md.
 */

export * from "./activity.js";
export * from "./lifecycle.js";
export * from "./iteration.js";
export * from "./consent.js";
export * from "./preview.js";
export * from "./thread.js";
export * from "./timeline.js";
export * from "./mentions.js";
export * from "./needs-you.js";
export * from "./reactions.js";
export * from "./presence.js";
export * from "./companion-tray.js";

// `export *` re-exports without bringing names into this module's scope.
import type { PrInfo } from "./lifecycle.js";
import type { IterationType } from "./thread.js";

/**
 * Where a comment sits on the triage board (the dashboard's column view, one
 * column per stage). Five stages rather than three: the extra ones (Queue,
 * In Review) let a team tell "not triaged yet" apart from "waiting on me" and
 * "waiting on a preview", which a single open/in_progress/done cannot express.
 *
 * The agent handoff (an AI coding agent working a comment through the MCP
 * server) uses In Review as its finish line. The MCP tool descriptions tell
 * agents to stop at In Review and leave Resolved to a person. That is a
 * convention, not a restriction: the status-update tools accept any stage,
 * `resolved` included.
 */
export type CommentStage = "queue" | "todo" | "in_progress" | "in_review" | "resolved";

/**
 * @deprecated Use {@link CommentStage}. This alias is identical and exists only so
 * older imports keep compiling.
 */
export type CommentStatus = CommentStage;

/** Every stage, in board order from left to right. */
export const COMMENT_STAGES: readonly CommentStage[] = ["queue", "todo", "in_progress", "in_review", "resolved"];

/** Human labels for the board columns. */
export const STAGE_LABELS: Record<CommentStage, string> = {
  queue: "Queue",
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  resolved: "Resolved",
};

/**
 * Raw `status` values from before the five-stage board, mapped to a stage. Only
 * `open` and `done` are legacy; `in_progress` is a current stage and is listed
 * here because the old three-value set also used it. Still accepted on input
 * (and on rows written by an older client) so a rolling upgrade never writes a
 * value the board cannot place.
 */
const LEGACY_STATUS: Record<string, CommentStage> = {
  open: "queue",
  in_progress: "in_progress",
  done: "resolved",
};

/**
 * Coerce any accepted status — current stage or legacy alias — into a stage.
 * Anything unrecognised lands in `queue`, the untriaged inbox, rather than
 * falling off the board entirely.
 *
 * @param value - Any value, typically a raw `status` from a row or a request.
 * @returns The matching stage, or `"queue"`.
 * @example
 * ```ts
 * normalizeStatus("done");      // "resolved"
 * normalizeStatus("open");      // "queue"
 * normalizeStatus("in_review"); // "in_review"
 * normalizeStatus(42);          // "queue"
 * ```
 */
export function normalizeStatus(value: unknown): CommentStage {
  if (typeof value === "string") {
    if ((COMMENT_STAGES as readonly string[]).includes(value)) return value as CommentStage;
    if (value in LEGACY_STATUS) return LEGACY_STATUS[value];
  }
  return "queue";
}

/**
 * Whether a comment is still open work (every stage except `resolved`).
 *
 * @example
 * ```ts
 * isOpenStage("in_review"); // true
 * isOpenStage("resolved");  // false
 * ```
 */
export function isOpenStage(stage: CommentStage): boolean {
  return stage !== "resolved";
}

/**
 * Every raw `status` value that belongs to this stage — the stage itself plus any
 * legacy alias that maps onto it. A SQL filter uses this so it still finds rows
 * written before the five-stage board.
 *
 * @param stage - The stage to expand.
 * @returns The stage first, then each legacy alias that maps to it.
 * @example
 * ```ts
 * statusAliases("queue");    // ["queue", "open"]
 * statusAliases("resolved"); // ["resolved", "done"]
 * statusAliases("todo");     // ["todo"]
 * ```
 */
export function statusAliases(stage: CommentStage): string[] {
  const out: string[] = [stage];
  for (const [legacy, mapped] of Object.entries(LEGACY_STATUS)) {
    if (mapped === stage && !out.includes(legacy)) out.push(legacy);
  }
  return out;
}

/**
 * How urgent a comment is. Ordered most-urgent first, so a list sorted by
 * `PRIORITY_RANK` puts what needs attention at the top.
 */
export type CommentPriority = "critical" | "high" | "medium" | "low";

/** Every priority, most urgent first. Use it to build a priority picker or filter. */
export const COMMENT_PRIORITIES: readonly CommentPriority[] = ["critical", "high", "medium", "low"];

/** Human labels for the priority chips. */
export const PRIORITY_LABELS: Record<CommentPriority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

/**
 * Sort key per priority: 0 is the most urgent. Subtract two ranks to sort most
 * urgent first. `Comment.priority` is optional, so pass it through
 * {@link normalizePriority} first, or a missing value gives `NaN`.
 *
 * @example
 * ```ts
 * comments.sort(
 *   (a, b) => PRIORITY_RANK[normalizePriority(a.priority)] - PRIORITY_RANK[normalizePriority(b.priority)],
 * );
 * ```
 */
export const PRIORITY_RANK: Record<CommentPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * Which part of the product a change touches, so a team can route the work
 * (and an agent can tell a component tweak from an endpoint change).
 */
export type ChangeType = "frontend" | "backend" | "api" | "other";

/** Every change type, in display order. Use it to build a change-type picker or filter. */
export const CHANGE_TYPES: readonly ChangeType[] = ["frontend", "backend", "api", "other"];

/** Human labels for the change-type chips. */
export const CHANGE_TYPE_LABELS: Record<ChangeType, string> = {
  frontend: "Frontend",
  backend: "Backend",
  api: "API",
  other: "Other",
};

/** The priority applied when a comment does not set one: `"medium"`. */
export const DEFAULT_PRIORITY: CommentPriority = "medium";

/** The change type applied when a comment does not set one: `"other"`. */
export const DEFAULT_CHANGE_TYPE: ChangeType = "other";

/**
 * Coerce any value into a priority, falling back to {@link DEFAULT_PRIORITY}.
 *
 * @param value - Any value, typically `Comment.priority`.
 * @returns A valid priority.
 * @example
 * ```ts
 * normalizePriority("high");    // "high"
 * normalizePriority(undefined); // "medium"
 * normalizePriority("urgent");  // "medium"
 * ```
 */
export function normalizePriority(value: unknown): CommentPriority {
  if (typeof value === "string" && (COMMENT_PRIORITIES as readonly string[]).includes(value)) {
    return value as CommentPriority;
  }
  return DEFAULT_PRIORITY;
}

/**
 * Coerce any value into a change type, falling back to {@link DEFAULT_CHANGE_TYPE}.
 *
 * @param value - Any value, typically `Comment.changeType`.
 * @returns A valid change type.
 * @example
 * ```ts
 * normalizeChangeType("api");     // "api"
 * normalizeChangeType(null);      // "other"
 * normalizeChangeType("design");  // "other"
 * ```
 */
export function normalizeChangeType(value: unknown): ChangeType {
  if (typeof value === "string" && (CHANGE_TYPES as readonly string[]).includes(value)) {
    return value as ChangeType;
  }
  return DEFAULT_CHANGE_TYPE;
}

/** The person who filed a comment, as the host app (the app that embeds Loupe) reports them. */
export interface LoupeUser {
  /** The host app's identifier for the user. */
  id: string;
  /** Display name. */
  name: string;
  /** Email address, when the host app supplies one. */
  email?: string;
}

/**
 * The fingerprint of the element a comment is pinned to: several independent
 * locators the SDK scores against the live page to find the element again after
 * the markup changes. "page" and "region" comments carry a synthetic anchor
 * (`tag` is `"page"` or `"region"`) with empty locators.
 */
export interface Anchor {
  /** Lower-case tag name, e.g. `"button"`. */
  tag: string;
  /**
   * CSS selector of `:nth-of-type()` steps, walked up from the element. It stops at
   * the nearest ancestor with a stable `id` or a `data-testid`/`data-test`, else at `body`.
   */
  cssPath: string;
  /** Absolute XPath from `/html`, one `tag[n]` step per level. */
  xpath: string;
  /**
   * The element's `data-testid`, else `data-test`, else its `id` when that id
   * looks hand-written (not framework-generated). `null` when none applies.
   */
  testid: string | null;
  /** Text content with whitespace collapsed, truncated to 120 characters. */
  text: string;
  /**
   * The non-empty values of `role`, `aria-label`, `name`, `type`, `alt`, `href`,
   * `placeholder` and `title`, each truncated to 200 characters.
   */
  attrs: Record<string, string>;
  /** 1-based position among same-tag siblings. */
  nthOfType: number;
  /** The element's box in **document** coordinates (page px, scroll included), rounded. */
  rect: { x: number; y: number; w: number; h: number };
  /** `window.innerWidth`/`innerHeight` when the anchor was captured. */
  viewport: { w: number; h: number };
}

/** The element's source, handed to an agent so it can rewrite the UI. */
export interface ElementContext {
  /** The element's `outerHTML`, truncated to 6000 characters (with a trailing `…`). Empty for "free" comments. */
  html: string;
  /**
   * A fixed set of **computed** styles (display, position, size, spacing, colour,
   * font, border, shadow, flex/grid, text-align, line-height, opacity), keyed by
   * CSS property name. Empty for "free" comments and for regions with no element.
   */
  styles: Record<string, string>;
}

/**
 * A UI change an agent proposes for a comment, written back through the MCP
 * (Model Context Protocol) `propose_change` tool or the API. Any MCP client can
 * write one. The dashboard renders it for the dev team as copyable code plus a
 * live preview. This closes the feedback loop: the reporter's request goes to the
 * agent, and the agent's modified markup comes back here.
 */
export interface Proposal {
  /** The modified element markup. */
  html: string;
  /** Accompanying CSS. May be empty when the styling is inlined in `html`. */
  css?: string;
  /** The agent's explanation of what changed and why. */
  notes?: string;
  /** Who produced it, e.g. "Claude Code via MCP". */
  author?: string;
  /** When the proposal was written, as an ISO 8601 timestamp. */
  createdAt: string;
}

/**
 * An image or video the reporter attached to a comment by hand. The SDK file
 * pickers accept `image/*` and `video/*`. Videos render with a player; images
 * render inline.
 */
export interface Attachment {
  /**
   * An object-storage URL in server mode (comments saved through a backend), or an
   * inline data URL in offline mode (comments kept in the browser's localStorage).
   */
  url: string;
  /** Original filename, used as the image's alt text. */
  name?: string;
  /** The file's MIME type, e.g. "image/png", "video/webm". */
  mime?: string;
  /** `"video"` for a `video/*` MIME type; `"image"` for everything else. */
  kind: "image" | "video";
  /** Size in bytes, when known. */
  size?: number;
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
 * - "element" (default) → anchored to a DOM element via its fingerprint ({@link Anchor}).
 * - "region"  → a free-form rectangle the user dragged out; carries `region`.
 * - "free"    → a page-level note dropped at a point, tied to no element and
 *               carrying no screenshot. Its drop point lives in `offset`,
 *               stored as a fraction of the document (x,y ∈ [0,1]).
 */
export type CommentKind = "element" | "region" | "free";

/** Device class the feedback was captured on, derived from the viewport width. */
export type DeviceType = "mobile" | "tablet" | "desktop";

/**
 * Classify a viewport width into a device bucket (mobile < 768 ≤ tablet < 1024 ≤ desktop).
 *
 * @param width - Viewport width in CSS px, typically `Comment.viewport.w`.
 * @example
 * ```ts
 * deviceType(390);  // "mobile"
 * deviceType(768);  // "tablet"
 * deviceType(1440); // "desktop"
 * ```
 */
export function deviceType(width: number): DeviceType {
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

/**
 * Where a ticket came from, when another project in the organization sent it.
 *
 * Loupe Hub is the service that routes tickets between apps. An organization
 * groups projects in Hub; each project is one app. A project that has an inbound
 * URL can receive tickets, and a project's destination is the project its
 * tickets are sent to.
 */
export interface TicketSource {
  /** The sending project's Hub id. */
  projectId: string;
  projectName?: string | null;
  organizationId?: string | null;
  organizationName?: string | null;
  /** Hub's id for this delivery (the `X-Loupe-Hub-Delivery` header). */
  deliveryId?: string | null;
  /** When Hub received the ticket, as an ISO 8601 timestamp. */
  receivedAt?: string | null;
  /** The person who filed it in the sending project. */
  reporter?: { email: string; name?: string };
}

/**
 * The outcome of sending a ticket to Loupe Hub.
 *
 * | Value           | Meaning |
 * |-----------------|---------|
 * | `"ok"`          | Hub accepted the ticket and delivered it to the destination project or the external webhook. |
 * | `"none"`        | Hub accepted the ticket but has nowhere to send it: no destination with an inbound URL and no webhook. |
 * | `"failed"`      | Hub accepted the ticket, but delivery to the destination or webhook failed after retries. |
 * | `"unknown"`     | Hub accepted the ticket, but its response did not say how delivery went. |
 * | `"rejected"`    | Hub answered with an HTTP error and did not accept the ticket; `error` holds the reason. |
 * | `"unreachable"` | The request to Hub itself failed (network error or timeout); `error` holds the message. |
 */
export type TicketForwardStatus = "ok" | "none" | "failed" | "unknown" | "rejected" | "unreachable";

/** What happened when this app sent a ticket to Loupe Hub. */
export interface TicketForward {
  status: TicketForwardStatus;
  /** Hub's id for the delivery, when Hub accepted the ticket. */
  deliveryId?: string | null;
  destinationProjectId?: string | null;
  /** The project that received it. Null when Hub delivered to an external webhook. */
  destinationName?: string | null;
  /** Why it was rejected or unreachable. */
  error?: string;
  /** When the outcome was recorded, as an ISO 8601 timestamp. */
  at?: string;
  /**
   * Where the ticket stands in the project that received it, as that project last
   * reported through Loupe Hub. Absent until the receiver changes its status.
   */
  remote?: TicketRemoteState;
}

/** The receiving project's view of a forwarded ticket. */
export interface TicketRemoteState {
  /** The board stage this app mapped the receiver's state to. */
  status: CommentStage;
  /** The receiver's own words for the state ("Ready for testing"). */
  label?: string;
  /** The receiver's reference for the ticket ("TCK-42"). */
  reference?: string;
  /** A link to the ticket in the receiver. */
  url?: string;
  projectName?: string;
  /** When the receiver reported this state, as an ISO 8601 timestamp. */
  at?: string;
}

/** A project in the organization, as Loupe Hub describes it. Never carries a secret. */
export interface OrgProject {
  id: string;
  name: string;
  /** The project has an inbound URL, so other projects can send it tickets. */
  receives: boolean;
  /** This is where the current project's tickets go. */
  isDestination?: boolean;
}

/**
 * The organization this project belongs to, read from Loupe Hub through the host
 * app (the app that embeds Loupe and holds the Hub credentials).
 */
export interface OrgInfo {
  /** Null when the app is not connected to Hub, or Hub could not be reached. */
  organization: { id: string; name: string } | null;
  project: {
    id?: string;
    key?: string;
    name: string | null;
    destination: { id: string; name: string } | null;
    receives?: boolean;
  };
  /** The other projects in the organization. */
  projects: OrgProject[];
  error?: string;
}

/** One piece of feedback: a note pinned to a page, an element, or a region. */
export interface Comment {
  /** Unique id. The SDK uses `crypto.randomUUID()`, falling back to a `c_`-prefixed base-36 string. */
  id: string;
  /** The Loupe project this comment belongs to: the `projectKey` the SDK was started with. */
  projectKey: string;
  /**
   * The page, as a path plus query string (no origin). The SDK sends
   * `location.pathname + location.search`; the servers store it passed through
   * {@link normalizeUrl}.
   */
  url: string;
  author: LoupeUser;
  /** One-line summary of the issue. Falls back to the first line of `body` when absent. */
  title?: string;
  /** The reporter's description of the issue. */
  body: string;
  /** The board stage. New comments start in `"queue"`. */
  status: CommentStage;
  /** How urgent this is. Absent on rows written before priorities; defaults to "medium". */
  priority?: CommentPriority;
  /** Which part of the product it touches. Absent on older rows; defaults to "other". */
  changeType?: ChangeType;
  /**
   * The repository this was filed against. The SDK stopped writing it in 0.12.0;
   * older rows still carry it, so readers keep the field.
   */
  repo?: string;
  /** The branch in play when the comment was made. Legacy, like `repo`. */
  branch?: string;
  /** Set when another project in the organization sent this ticket here through Loupe Hub. */
  source?: TicketSource;
  /** What Loupe Hub did with this ticket after it was filed here. */
  forwarded?: TicketForward;
  /** Defaults to "element" when absent (back-compat with pre-region comments). */
  kind?: CommentKind;
  /**
   * Always present. For "free" comments, and for regions with no element under
   * their center, it is a synthetic anchor (see {@link Anchor}).
   */
  anchor: Anchor;
  /** Always present; empty `html`/`styles` when there is no element to describe. */
  context: ElementContext;
  /**
   * Where the pin sits, as fractions in [0, 1]:
   * - "element": the click point within the element's box (0.5, 0.5 is its center).
   * - "free": the drop point within the whole document.
   * - "region": always `{ x: 0, y: 0 }`; the position is in `region`.
   */
  offset: { x: number; y: number };
  /** Present for region comments: the dragged rectangle in document coords. */
  region?: RegionRect;
  /**
   * The viewport the feedback was captured on — use deviceType(viewport.w) for the
   * device class. The rest is diagnostic: which SDK build reported it, and what the
   * browser could do (`touch` reflects the touch check that drives the capture flow,
   * `coarse` is diagnostic only, `gdm` says whether screen recording is possible at
   * all). Kept so a support question can be answered from the row itself instead of
   * guessing at the reporter's device.
   */
  viewport?: {
    /** `window.innerWidth` in CSS px. */
    w: number;
    /** `window.innerHeight` in CSS px. */
    h: number;
    /** SDK version that created the comment, e.g. "0.10.2". */
    v?: string;
    /** The SDK judged this a touch device (coarse pointer, no hover, or touch points). */
    touch?: boolean;
    /** `(pointer: coarse)` matched. Diagnostic only. */
    coarse?: boolean;
    /** `getDisplayMedia` exists (screen recording is possible). */
    gdm?: boolean;
  };
  /** A URL (object storage) in server mode, or an inline data URL in offline mode. */
  screenshot?: string;
  /**
   * A screen recording of the selected region (webm). A URL in server mode, or an
   * inline data URL offline. Present for "region" comments made with the Record tool
   * (the widget toolbar button that captures video of a dragged region).
   */
  recording?: string;
  /**
   * Files the reporter attached by hand (images and/or videos, several of each).
   * Separate from `screenshot` / `recording`, which Loupe captures itself.
   */
  attachments?: Attachment[];
  /** The agent's proposed UI change, written back via MCP or the API. Shown to devs in the dashboard. */
  proposal?: Proposal;
  /**
   * The pull request carrying this thread's fix, when there is one. Drives the
   * panel's lifecycle chip and its checks meter (check runs passed out of total;
   * see {@link PrInfo}).
   */
  pr?: PrInfo;
  /**
   * Set when this thread is a revision of another: the reviewer reopened a resolved
   * thread rather than filing a new one, so the conversation carries over.
   */
  parentThreadId?: string;
  iterationType?: IterationType;
  iterationNumber?: number;
  /** When the comment was filed, as an ISO 8601 timestamp. */
  createdAt: string;
}

const DROP_EXACT = new Set([
  "api", "key", "fbclid", "gclid", "gbraid", "wbraid", "msclkid",
  "ref", "ref_src", "mc_cid", "mc_eid", "_hsenc", "_hsmi", "igshid",
]);

/**
 * Normalize a page URL so comments don't fragment across tracking params.
 *
 * - Returns the path plus a filtered query, sorted by key then value. The origin
 *   and the `#hash` are dropped.
 * - Removes a trailing slash (except on `/`).
 * - Drops, matching keys case-insensitively: every `utm_*` param; the ad click
 *   ids `fbclid`, `gclid`, `gbraid`, `wbraid`, `msclkid`; the referral and
 *   newsletter params `ref`, `ref_src`, `mc_cid`, `mc_eid`, `_hsenc`, `_hsmi`,
 *   `igshid`; and the dashboard's `api` and `key` params.
 * - Accepts a full URL or a path+search string. If the input cannot be parsed,
 *   returns everything before the first `?`.
 *
 * @param input - A full URL or a path with an optional query.
 * @returns The normalized path and query.
 * @example
 * ```ts
 * normalizeUrl("https://shop.example.com/cart/?utm_source=x&b=2&a=1#top"); // "/cart?a=1&b=2"
 * ```
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
