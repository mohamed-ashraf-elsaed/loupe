/**
 * Iteration history for a generated change.
 *
 * Generating a change is not a one-shot: you generate, look at it, ask for a
 * refinement, look again. This is the pure model of that stack, so the panel's
 * preview pane and anything else agree on what "the current iteration" is — and so
 * the undo/prev/next rules can be tested without a DOM.
 */

export type IterationKind = "generate" | "refine" | "revise";

export interface Iteration {
  id: string;
  /** ISO timestamp. */
  at: string;
  /** The generated markup. */
  html: string;
  css?: string;
  /** The model's own explanation of what it changed. */
  notes?: string;
  /** What the user asked for — the original request, or the follow-up. */
  prompt?: string;
  kind: IterationKind;
}

export interface IterationState {
  /** Oldest first. Never reordered. */
  items: Iteration[];
  /** Which item is being previewed; -1 when there is nothing. */
  index: number;
}

export function emptyIterations(): IterationState {
  return { items: [], index: -1 };
}

/** The iteration currently being previewed, or null when there is none. */
export function current(state: IterationState): Iteration | null {
  return state.index >= 0 ? state.items[state.index] ?? null : null;
}

/**
 * Push a new iteration and preview it.
 *
 * A new iteration is appended **after** the current one rather than always at the
 * end, so generating from a point in the history branches there instead of silently
 * discarding what came later. The tail beyond the current index is dropped, because
 * a preview must always describe a real lineage.
 */
export function addIteration(state: IterationState, iteration: Iteration): IterationState {
  const head = state.items.slice(0, state.index + 1);
  const items = [...head, iteration].slice(-MAX_ITERATIONS);
  return { items, index: items.length - 1 };
}

/** Cap the stack — this is a working history, not an archive. */
export const MAX_ITERATIONS = 20;

export function canUndo(state: IterationState): boolean {
  return state.items.length > 0;
}

/**
 * Discard the newest iteration and preview the one before it. Distinct from
 * stepping back: undo throws the work away, `move(-1)` keeps it for the redo.
 */
export function undo(state: IterationState): IterationState {
  if (!state.items.length) return state;
  const items = state.items.slice(0, -1);
  return { items, index: items.length - 1 };
}

export function canMove(state: IterationState, delta: number): boolean {
  const next = state.index + delta;
  return next >= 0 && next < state.items.length;
}

/** Step through the history without discarding anything. */
export function move(state: IterationState, delta: number): IterationState {
  return canMove(state, delta) ? { ...state, index: state.index + delta } : state;
}

/** "2 / 3" for the navigation counter, or "" when there is nothing to navigate. */
export function stackLabel(state: IterationState): string {
  return state.items.length ? `${state.index + 1} / ${state.items.length}` : "";
}
