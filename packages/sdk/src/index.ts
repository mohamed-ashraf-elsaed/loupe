import { LoupeApp } from "./app.js";
import type { ActivityEventInput, ActivityStatus, LoupeConfig } from "./types.js";

export { connectTab } from "./connect.js";
export type { LoupeConfig, LoupeUser, Comment, Anchor, RegionRect } from "./types.js";
export type {
  ActivityEvent, ActivityEventInput, ActivityStatus, ActivityLevel, LoupeTab, LoupeTabContext,
} from "./types.js";

let app: LoupeApp | null = null;

/**
 * Initialize Loupe on the current page. Call once, after your app knows who the
 * user is. The toolbar renders only for the identified user.
 *
 *   Loupe.init({ projectKey: "pk_live_…", user: { id, name, email }, userHmac });
 */
export function init(config: LoupeConfig): void {
  if (app) return; // idempotent
  if (!config?.projectKey) { console.error("[loupe] init requires a projectKey"); return; }
  if (!config.user?.id) { console.error("[loupe] init requires user.id"); return; }
  // NOTE: in production the backend verifies config.userHmac before serving data.
  app = new LoupeApp(config);
  const boot = () => app!.start();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
}

/** Tear down the toolbar and all listeners. */
export function destroy(): void {
  app?.destroy();
  app = null;
}

/**
 * Push one event into the panel's Activity view — the seam an agent bridge (or the
 * host application) uses to make its work visible without leaving the page.
 * Loupe's own operations feed the same stream, so the view is never empty.
 *
 *   Loupe.trackActivity({ kind: "Read", label: "Read src/app.ts", files: ["src/app.ts"] });
 */
export function trackActivity(event: ActivityEventInput): void {
  app?.addActivity(event);
}

/** Set the Activity view's status dot — idle, working, or error. */
export function setActivityStatus(status: ActivityStatus): void {
  app?.setActivityStatus(status);
}

/** Drop everything currently in the Activity view. */
export function clearActivity(): void {
  app?.clearActivity();
}
