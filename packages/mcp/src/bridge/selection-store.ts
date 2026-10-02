/**
 * The selection store: what the browser last had selected.
 *
 * The extension (or the embedded widget) POSTs an element's context here, and the
 * MCP tools read it back — that is the whole point of the bridge, since a page and
 * an agent process otherwise have no way to see each other.
 *
 * A **bounded ring**, deliberately: this is a live hand-off, not an archive. An
 * agent that has not looked at the newest selection in fifty selections' time is
 * not going to want the first one.
 */

export interface SelectionBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The canonical shape a browser sends. Only the first three are required. */
export interface SelectionPayload {
  /** Caller-generated id, so a tool can look up one specific selection. */
  correlationId: string;
  /** The page the selection was made on. */
  url: string;
  /** The element's tag, lower-cased. */
  tag: string;
  selector?: string;
  testid?: string | null;
  text?: string;
  id?: string | null;
  classes?: string[];
  attrs?: Record<string, string>;
  styles?: Record<string, string>;
  box?: SelectionBox;
  /** Object-storage URL or data URL, when the client captured one. */
  screenshot?: string;
  /** ISO timestamp; filled in by the store when absent. */
  at?: string;
}

export type ValidationResult =
  | { ok: true; value: SelectionPayload }
  | { ok: false; error: string };

const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

const isStringMap = (v: unknown): v is Record<string, string> =>
  !!v && typeof v === "object" && !Array.isArray(v) &&
  Object.values(v as Record<string, unknown>).every((x) => typeof x === "string");

const isBox = (v: unknown): v is SelectionBox => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const b = v as Record<string, unknown>;
  return (["x", "y", "w", "h"] as const).every((k) => typeof b[k] === "number" && Number.isFinite(b[k]));
};

/**
 * Validate an ingest body.
 *
 * Strict on purpose: a half-formed selection is worse than a rejected one, because
 * the agent would act on a payload that silently lacks the selector it needs. Every
 * optional field is still type-checked — "optional" is not "anything".
 */
export function validateSelection(input: unknown): ValidationResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "body must be a JSON object" };
  }
  const p = input as Record<string, unknown>;

  for (const key of ["correlationId", "url", "tag"] as const) {
    if (!isNonEmptyString(p[key])) return { ok: false, error: `${key} is required` };
  }
  for (const key of ["selector", "text", "at"] as const) {
    if (p[key] !== undefined && typeof p[key] !== "string") return { ok: false, error: `${key} must be a string` };
  }
  for (const key of ["testid", "id"] as const) {
    if (p[key] !== undefined && p[key] !== null && typeof p[key] !== "string") {
      return { ok: false, error: `${key} must be a string or null` };
    }
  }
  if (p.attrs !== undefined && !isStringMap(p.attrs)) return { ok: false, error: "attrs must be a string map" };
  if (p.styles !== undefined && !isStringMap(p.styles)) return { ok: false, error: "styles must be a string map" };
  if (p.box !== undefined && !isBox(p.box)) return { ok: false, error: "box must be { x, y, w, h }" };
  if (p.screenshot !== undefined && typeof p.screenshot !== "string") {
    return { ok: false, error: "screenshot must be a string" };
  }
  if (p.classes !== undefined && (!Array.isArray(p.classes) || !p.classes.every((c) => typeof c === "string"))) {
    return { ok: false, error: "classes must be a string array" };
  }

  // Rebuilt field by field rather than spread, so an unknown key cannot sneak into
  // what the tools later hand an agent as "the element context".
  return {
    ok: true,
    value: {
      correlationId: p.correlationId as string,
      url: p.url as string,
      tag: p.tag as string,
      selector: p.selector as string | undefined,
      testid: (p.testid as string | null | undefined) ?? null,
      text: p.text as string | undefined,
      id: (p.id as string | null | undefined) ?? null,
      classes: p.classes as string[] | undefined,
      attrs: p.attrs as Record<string, string> | undefined,
      styles: p.styles as Record<string, string> | undefined,
      box: p.box as SelectionBox | undefined,
      screenshot: p.screenshot as string | undefined,
      at: p.at as string | undefined,
    },
  };
}

export class SelectionStore {
  private items: SelectionPayload[] = [];
  private readonly capacity: number;

  // Declared and assigned explicitly rather than as a constructor parameter
  // property: Node runs these files with type-stripping only, and
  // `constructor(private x)` is not supported in strip-only mode.
  constructor(capacity: number = 50) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error("capacity must be a positive integer");
    this.capacity = capacity;
  }

  /** Add a selection, evicting the oldest once the ring is full. Newest last. */
  add(selection: SelectionPayload): SelectionPayload {
    const stored: SelectionPayload = { ...selection, at: selection.at ?? new Date().toISOString() };
    this.items.push(stored);
    if (this.items.length > this.capacity) this.items.splice(0, this.items.length - this.capacity);
    return stored;
  }

  latest(): SelectionPayload | null {
    return this.items.length ? this.items[this.items.length - 1]! : null;
  }

  /** Newest first — the order a caller wants them in. */
  history(limit: number = this.capacity): SelectionPayload[] {
    const n = Math.max(0, Math.min(limit, this.items.length));
    return this.items.slice(-n).reverse();
  }

  get(correlationId: string): SelectionPayload | null {
    return this.items.find((s) => s.correlationId === correlationId) ?? null;
  }

  size(): number {
    return this.items.length;
  }

  clear(): void {
    this.items = [];
  }
}
