import { LoupeApp } from "./app.js";
import type { LoupeConfig } from "./types.js";

export type { LoupeConfig, LoupeUser, Comment, Anchor } from "./types.js";

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
