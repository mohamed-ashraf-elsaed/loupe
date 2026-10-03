/**
 * The companion gather tray.
 *
 * The point of the tray is that a visual brief is usually about *several* things at
 * once — "these three cards, not the header" — and one-click-at-a-time forces the
 * person to write what they could have shown. So the tray holds a list, and ordering is
 * part of the message: it is how you say which one matters most.
 *
 * Pure, so the reorder and include rules can be tested without a DOM.
 */

export interface TrayItem {
  id: string;
  kind: "element" | "region" | "note" | "screenshot";
  /** What to show on the chip. */
  label: string;
  /** The page it was captured from. */
  url?: string;
  /** A thumbnail, when there is one. */
  thumb?: string;
  /** The element or comment it came from. */
  ref?: string;
  /** Unchecked items stay in the tray but are not sent. */
  include: boolean;
}

export interface TrayState {
  items: TrayItem[];
}

export function emptyTray(): TrayState {
  return { items: [] };
}

/**
 * Add an item, or replace the one already there.
 *
 * Replaced rather than appended when it is the same reference: clicking "add" twice on
 * the same element is a person confirming, not a person wanting it twice. The position
 * is kept so a reorder is not undone by a re-add.
 */
export function addToTray(state: TrayState, item: Omit<TrayItem, "include"> & { include?: boolean }): TrayState {
  const full: TrayItem = { include: true, ...item };
  const at = state.items.findIndex((i) => i.id === full.id);
  if (at < 0) return { items: [...state.items, full] };
  const items = [...state.items];
  items[at] = { ...items[at]!, ...full, include: items[at]!.include };
  return { items };
}

export function removeFromTray(state: TrayState, id: string): TrayState {
  return { items: state.items.filter((i) => i.id !== id) };
}

export function toggleInclude(state: TrayState, id: string): TrayState {
  return { items: state.items.map((i) => (i.id === id ? { ...i, include: !i.include } : i)) };
}

/** Move one item to an absolute position, clamped rather than rejected. */
export function moveInTray(state: TrayState, id: string, to: number): TrayState {
  const from = state.items.findIndex((i) => i.id === id);
  if (from < 0) return state;
  const target = Math.max(0, Math.min(state.items.length - 1, to));
  if (target === from) return state;
  const items = [...state.items];
  const [moved] = items.splice(from, 1);
  items.splice(target, 0, moved!);
  return { items };
}

/** Nudge one position up or down — what an arrow button does. */
export function nudgeInTray(state: TrayState, id: string, delta: number): TrayState {
  const at = state.items.findIndex((i) => i.id === id);
  if (at < 0) return state;
  return moveInTray(state, id, at + delta);
}

/** Only what is checked. Order is preserved, because order is meaning. */
export function includedItems(state: TrayState): TrayItem[] {
  return state.items.filter((i) => i.include);
}

export function trayCount(state: TrayState): { total: number; included: number } {
  return { total: state.items.length, included: includedItems(state).length };
}

export function clearTray(): TrayState {
  return { items: [] };
}

/**
 * The payload the bridge expects.
 *
 * A flat array of contexts rather than separate element/screenshot lists: the tray is
 * ordered and the agent should read it in that order, and splitting it by kind is how
 * that ordering gets lost at the boundary.
 */
export function trayPayload(state: TrayState): { kind: string; id?: string; url?: string; label?: string }[] {
  return includedItems(state).map((i) => ({
    kind: i.kind,
    id: i.ref ?? i.id,
    url: i.url,
    label: i.label,
  }));
}

/** A one-line description of the tray, for a button label. */
export function traySummary(state: TrayState): string {
  const { total, included } = trayCount(state);
  if (!total) return "No context gathered";
  if (included === total) return `${total} context${total === 1 ? "" : "s"}`;
  return `${included} of ${total} included`;
}

// ---- voice ------------------------------------------------------------------

export type VoiceSupport = "supported" | "unsupported" | "insecure";

/**
 * Whether dictation is available.
 *
 * Two different reasons to hide the control, and they need different wording: an
 * unsupported browser is a fact, while a secure-origin failure is fixable by loading
 * the page differently. Telling someone their browser cannot do it when the real
 * problem is `http://` sends them looking in the wrong place.
 */
export function voiceSupport(env: {
  hasCtor: boolean;
  isSecureContext: boolean;
}): VoiceSupport {
  if (!env.isSecureContext) return "insecure";
  return env.hasCtor ? "supported" : "unsupported";
}

export function voiceMessage(support: VoiceSupport): string | null {
  if (support === "supported") return null;
  if (support === "insecure") return "Dictation needs a secure page (https, or localhost).";
  return "This browser cannot dictate — the Web Speech API is not available.";
}

/** mm:ss for the recording pill, so a long recording still reads. */
export function elapsedLabel(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}
