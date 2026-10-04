// Canonical types + pure helpers shared across the SDK, server, dashboard, and MCP.

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
 * Where a comment sits on the triage board. Five stages rather than three: the
 * extra ones (Queue, In Review) let a team tell "not triaged yet" apart from
 * "waiting on me" and "waiting on a preview" — which a single open/in_progress/
 * done cannot express, and which the agent handoff needs (an agent may move a
 * comment to In Review; only a human resolves it).
 */
export type CommentStage = "queue" | "todo" | "in_progress" | "in_review" | "resolved";

/** @deprecated Name kept so existing imports keep compiling — now the five stages. */
export type CommentStatus = CommentStage;

/** Board order, left to right. */
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
 * Statuses this project shipped before the five-stage board. Still accepted on
 * input (and on rows written by an older client) so a rolling upgrade never
 * writes a value the board cannot place.
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
 */
export function normalizeStatus(value: unknown): CommentStage {
  if (typeof value === "string") {
    if ((COMMENT_STAGES as readonly string[]).includes(value)) return value as CommentStage;
    if (value in LEGACY_STATUS) return LEGACY_STATUS[value];
  }
  return "queue";
}

/** Whether a comment is still open work (everything except `resolved`). */
export function isOpenStage(stage: CommentStage): boolean {
  return stage !== "resolved";
}

/**
 * Every raw `status` value that belongs to this stage — the stage itself plus any
 * legacy alias that maps onto it. A SQL filter uses this so it still finds rows
 * written before the five-stage board.
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

/** Priorities, most urgent first. */
export const COMMENT_PRIORITIES: readonly CommentPriority[] = ["critical", "high", "medium", "low"];

/** Human labels for the priority chips. */
export const PRIORITY_LABELS: Record<CommentPriority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

/** Sort key: 0 is the most urgent, so `a - b` sorts correctly. */
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

/** Change types. */
export const CHANGE_TYPES: readonly ChangeType[] = ["frontend", "backend", "api", "other"];

/** Human labels for the change-type chips. */
export const CHANGE_TYPE_LABELS: Record<ChangeType, string> = {
  frontend: "Frontend",
  backend: "Backend",
  api: "API",
  other: "Other",
};

/** Defaults applied when a comment does not say. */
export const DEFAULT_PRIORITY: CommentPriority = "medium";
export const DEFAULT_CHANGE_TYPE: ChangeType = "other";

/** Coerce any value into a priority, falling back to the default. */
export function normalizePriority(value: unknown): CommentPriority {
  if (typeof value === "string" && (COMMENT_PRIORITIES as readonly string[]).includes(value)) {
    return value as CommentPriority;
  }
  return DEFAULT_PRIORITY;
}

/** Coerce any value into a change type, falling back to the default. */
export function normalizeChangeType(value: unknown): ChangeType {
  if (typeof value === "string" && (CHANGE_TYPES as readonly string[]).includes(value)) {
    return value as ChangeType;
  }
  return DEFAULT_CHANGE_TYPE;
}

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

/**
 * A UI change Claude proposes for a comment, written back through the MCP
 * `propose_change` tool (or the API). Rendered for the dev team in the dashboard
 * as copyable code plus a live preview. This is what closes the feedback loop:
 * the PM's request goes to Claude, and Claude's modified markup comes back here.
 */
export interface Proposal {
  /** The modified element markup. */
  html: string;
  /** Accompanying CSS. May be empty when the styling is inlined in `html`. */
  css?: string;
  /** Claude's explanation of what changed and why. */
  notes?: string;
  /** Who produced it, e.g. "Claude Code via MCP". */
  author?: string;
  createdAt: string;
}

/**
 * A file the reporter attached to a comment (anything they picked: a screenshot,
 * a screen recording, a document). `kind` decides how it is rendered — images
 * inline, videos with a player, anything else as a download chip. Either an
 * object-storage URL (server mode) or an inline data URL (offline mode).
 */
export interface Attachment {
  url: string;
  /** Original filename, for the download chip / alt text. */
  name?: string;
  /** The file's MIME type, e.g. "image/png", "video/webm". */
  mime?: string;
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
 * - "element" (default) → anchored to a DOM element via its fingerprint.
 * - "region"  → a free-form rectangle the user dragged out; carries `region`.
 * - "free"    → a page-level note dropped at a point, tied to no element and
 *               carrying no screenshot. Its drop point lives in `offset`,
 *               stored as a fraction of the document (x,y ∈ [0,1]).
 */
export type CommentKind = "element" | "region" | "free";

/** Device class the feedback was captured on, derived from the viewport width. */
export type DeviceType = "mobile" | "tablet" | "desktop";

/** Classify a viewport width into a device bucket (mobile < 768 ≤ tablet < 1024 ≤ desktop). */
export function deviceType(width: number): DeviceType {
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

/** Where a ticket came from, when another project in the organization sent it. */
export interface TicketSource {
  projectId: string;
  projectName?: string | null;
  organizationId?: string | null;
  organizationName?: string | null;
  deliveryId?: string | null;
  receivedAt?: string | null;
  reporter?: { email: string; name?: string };
}

/** The outcome of sending a ticket to Loupe Hub. */
export type TicketForwardStatus = "ok" | "none" | "failed" | "unknown" | "rejected" | "unreachable";

export interface TicketForward {
  status: TicketForwardStatus;
  deliveryId?: string | null;
  destinationProjectId?: string | null;
  /** The project that received it. Null when Hub delivered to an external webhook. */
  destinationName?: string | null;
  error?: string;
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

/** The organization this project belongs to, read from Loupe Hub through the host app. */
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

export interface Comment {
  id: string;
  projectKey: string;
  url: string;
  author: LoupeUser;
  /** One-line summary of the issue. Falls back to the first line of `body` when absent. */
  title?: string;
  /** The reporter's description of the issue. */
  body: string;
  status: CommentStatus;
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
  anchor: Anchor;
  context: ElementContext;
  offset: { x: number; y: number };
  /** Present for region comments: the dragged rectangle in document coords. */
  region?: RegionRect;
  /**
   * The viewport the feedback was captured on — use deviceType(viewport.w) for the
   * device class. The rest is diagnostic: which SDK build reported it, and what the
   * browser could do (`touch`/`coarse` decide the capture flow, `gdm` whether screen
   * recording is possible at all). Kept so a support question can be answered from the
   * row itself instead of guessing at the reporter's device.
   */
  viewport?: {
    w: number;
    h: number;
    /** SDK version that created the comment, e.g. "0.10.2". */
    v?: string;
    /** The browser reports a touch-capable screen. */
    touch?: boolean;
    /** `(pointer: coarse)` matched. */
    coarse?: boolean;
    /** `getDisplayMedia` exists (screen recording is possible). */
    gdm?: boolean;
  };
  /** A URL (object storage) in server mode, or an inline data URL in offline mode. */
  screenshot?: string;
  /**
   * A screen recording of the selected region (webm). A URL in server mode, or an
   * inline data URL offline. Present for "region" comments made with the Record tool.
   */
  recording?: string;
  /**
   * Files the reporter attached by hand (images and/or videos, several of each).
   * Separate from `screenshot` / `recording`, which Loupe captures itself.
   */
  attachments?: Attachment[];
  /** Claude's proposed UI change, written back via MCP. Shown to devs in the dashboard. */
  proposal?: Proposal;
  /**
   * The pull request carrying this thread's fix, when there is one. Drives the
   * panel's lifecycle chip and checks meter.
   */
  pr?: PrInfo;
  /**
   * Set when this thread is a revision of another: the reviewer reopened a resolved
   * thread rather than filing a new one, so the conversation carries over.
   */
  parentThreadId?: string;
  iterationType?: IterationType;
  iterationNumber?: number;
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
