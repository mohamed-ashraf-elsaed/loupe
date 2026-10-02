/**
 * The element-context tools.
 *
 * These are what make the bridge worth having: an agent can ask "what am I looking
 * at?" and get the element, its computed styles, the files most likely to render
 * it, and a ready-made prompt — without opening a browser or grepping for markup.
 *
 * Every tool takes either a **live selection** (something just clicked, via the
 * bridge) or a **thread id** (a stored comment), and normalises both into the same
 * payload, so an agent does not have to care which it got.
 */

import type { Comment } from "@loupekit/shared";
import { mapElementToSource, type MapperOptions, type MappingCandidate } from "../mapper.ts";
import { generateEditPrompt } from "../prompt-template.ts";
import type { SelectionPayload, SelectionStore } from "../bridge/selection-store.ts";

export interface ElementContextPayload {
  /** Where this came from — a live selection or a stored thread. */
  source: "selection" | "thread";
  correlationId?: string;
  threadId?: string;
  page: { url: string; title?: string };
  element: {
    tag: string;
    selector?: string;
    testid?: string | null;
    id?: string | null;
    text?: string;
    classes?: string[];
    attrs?: Record<string, string>;
    box?: { x: number; y: number; w: number; h: number };
  };
  /** The curated computed styles a change usually needs. */
  styles: Record<string, string>;
  screenshot?: string;
  sourceCandidates?: MappingCandidate[];
  editPrompt?: string;
}

/**
 * Normalise a stored comment into the shape a live selection produces.
 *
 * The whole point is that the agent gets one shape: rehydrating a thread must not
 * quietly drop a field the live path has, or an agent would behave differently
 * depending on where the context came from.
 */
export function threadContextToPayload(thread: Comment): ElementContextPayload {
  const anchor = thread.anchor as Comment["anchor"] | undefined;
  const attrs = (thread as { context?: { styles?: Record<string, string> } }).context;
  return {
    source: "thread",
    threadId: thread.id,
    page: { url: thread.url, title: thread.title },
    element: {
      tag: anchor?.tag ?? "unknown",
      selector: anchor?.cssPath,
      testid: anchor?.testid ?? null,
      id: null,
      text: anchor?.text,
      classes: undefined,
      attrs: anchor?.attrs,
      box: anchor?.rect,
    },
    styles: attrs?.styles ?? {},
    screenshot: thread.screenshot,
  };
}

export function selectionToPayload(selection: SelectionPayload): ElementContextPayload {
  return {
    source: "selection",
    correlationId: selection.correlationId,
    page: { url: selection.url },
    element: {
      tag: selection.tag,
      selector: selection.selector,
      testid: selection.testid ?? null,
      id: selection.id ?? null,
      text: selection.text,
      classes: selection.classes,
      attrs: selection.attrs,
      box: selection.box,
    },
    styles: selection.styles ?? {},
    screenshot: selection.screenshot,
  };
}

/** The agent-facing text for a payload. */
export function formatElementContext(payload: ElementContextPayload): string {
  const e = payload.element;
  const lines: string[] = [];

  lines.push(`# Selected element`);
  lines.push("");
  lines.push(`- **Where**: ${payload.page.url}${payload.page.title ? ` — “${payload.page.title}”` : ""}`);
  lines.push(`- **Tag**: \`<${e.tag}>\``);
  if (e.selector) lines.push(`- **Selector**: \`${e.selector}\``);
  if (e.testid) lines.push(`- **Test id**: \`${e.testid}\``);
  if (e.id) lines.push(`- **Id**: \`${e.id}\``);
  if (e.text) lines.push(`- **Text**: “${e.text}”`);
  if (e.classes?.length) lines.push(`- **Classes**: \`${e.classes.join(" ")}\``);
  if (e.box) lines.push(`- **Box**: ${Math.round(e.box.w)}×${Math.round(e.box.h)} at ${Math.round(e.box.x)},${Math.round(e.box.y)}`);
  if (payload.source === "thread" && payload.threadId) lines.push(`- **Thread**: #${payload.threadId}`);

  const styleKeys = Object.keys(payload.styles);
  if (styleKeys.length) {
    lines.push("");
    lines.push("## Computed styles");
    lines.push("");
    for (const key of styleKeys) lines.push(`- \`${key}: ${payload.styles[key]}\``);
  }

  if (payload.sourceCandidates) {
    lines.push("");
    lines.push("## Source candidates");
    lines.push("");
    if (payload.sourceCandidates.length) {
      for (const c of payload.sourceCandidates) {
        lines.push(`- \`${c.filePath}:${c.lineStart}-${c.lineEnd}\` — ${(c.confidence * 100).toFixed(0)}% · ${c.reason}`);
      }
    } else {
      lines.push("_No source candidates found for this element in the workspace._");
    }
  }

  if (payload.editPrompt) {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push(payload.editPrompt);
  }
  return lines.join("\n");
}

export interface ElementToolDeps {
  store: SelectionStore;
  /** Fetch a stored comment. Injected so the tools stay testable without an API. */
  fetchThread: (id: string) => Promise<Comment | null>;
  /** Where to search for source. Defaults to the process cwd. */
  workspaceRoot: string;
  mapperOptions?: MapperOptions;
}

export interface ElementToolResult {
  text: string;
  /** Set when the tool could not do its job — still a normal result, never a throw. */
  unavailable?: boolean;
}

/**
 * Resolve the thing the caller meant: an explicit thread, an explicit selection, or
 * whatever was selected last.
 */
async function resolvePayload(
  deps: ElementToolDeps,
  args: { thread_id?: string; selection_id?: string },
): Promise<ElementContextPayload | null> {
  if (args.thread_id) {
    const thread = await deps.fetchThread(args.thread_id);
    return thread ? threadContextToPayload(thread) : null;
  }
  if (args.selection_id) {
    const found = deps.store.get(args.selection_id);
    return found ? selectionToPayload(found) : null;
  }
  const latest = deps.store.latest();
  return latest ? selectionToPayload(latest) : null;
}

/** Nothing selected yet is a normal state — say what to do, do not error. */
const NOTHING_SELECTED =
  "Nothing has been selected yet.\n\n" +
  "Click an element in the browser with the Loupe widget open, then call this tool again — " +
  "the selection reaches the bridge automatically. You can also pass `thread_id` to work from a " +
  "stored thread instead (see `list_comments`).";

const NOT_FOUND = (what: string, id: string) =>
  `No ${what} found for \`${id}\`.\n\n` +
  (what === "thread"
    ? "Use `list_comments` to see the available ids."
    : "It may have been evicted — the bridge keeps the most recent 50 selections.");

export function createElementContextTools(deps: ElementToolDeps) {
  const withSource = async (payload: ElementContextPayload): Promise<ElementContextPayload> => {
    const signals = {
      tag: payload.element.tag,
      id: payload.element.id,
      text: payload.element.text,
      classes: payload.element.classes,
      attrs: payload.element.attrs,
    };
    try {
      payload.sourceCandidates = await mapElementToSource(signals, deps.workspaceRoot, deps.mapperOptions);
    } catch {
      // The mapper never throws by design; if it somehow does, the context is still
      // useful without candidates.
      payload.sourceCandidates = [];
    }
    return payload;
  };

  return {
    /** The most recent selection. */
    async getLatestSelection(): Promise<ElementToolResult> {
      const latest = deps.store.latest();
      if (!latest) return { text: NOTHING_SELECTED, unavailable: true };
      return { text: formatElementContext(await withSource(selectionToPayload(latest))) };
    },

    /** Recent selections, newest first. */
    async getSelectionHistory({ limit }: { limit?: number } = {}): Promise<ElementToolResult> {
      const history = deps.store.history(limit ?? 10);
      if (!history.length) return { text: NOTHING_SELECTED, unavailable: true };
      const lines = [`# Recent selections (${history.length})`, ""];
      for (const s of history) {
        lines.push(`- \`${s.correlationId}\` — \`<${s.tag}>\` ${s.selector ? `\`${s.selector}\`` : ""} ${s.text ? `“${s.text.slice(0, 60)}”` : ""} on ${s.url} (${s.at})`);
      }
      lines.push("");
      lines.push("Pass any correlation id to `get_element_context` for the full context.");
      return { text: lines.join("\n") };
    },

    /** Everything about one element: payload, styles, candidates and the prompt. */
    async getElementContext(
      args: { thread_id?: string; selection_id?: string } = {},
      opts: { include_prompt?: boolean } = {},
    ): Promise<ElementToolResult> {
      const payload = await resolvePayload(deps, args);
      if (!payload) {
        if (args.thread_id) return { text: NOT_FOUND("thread", args.thread_id), unavailable: true };
        if (args.selection_id) return { text: NOT_FOUND("selection", args.selection_id), unavailable: true };
        return { text: NOTHING_SELECTED, unavailable: true };
      }
      await withSource(payload);
      if (opts.include_prompt !== false) {
        payload.editPrompt = generateEditPrompt({
          tag: payload.element.tag,
          selector: payload.element.selector,
          testid: payload.element.testid,
          text: payload.element.text,
          classes: payload.element.classes,
          pageUrl: payload.page.url,
          candidates: payload.sourceCandidates,
          isThread: payload.source === "thread",
          threadId: payload.threadId,
        });
      }
      return { text: formatElementContext(payload) };
    },

    /** Just the ranked files, for when the agent only needs to know where to look. */
    async findSourceForSelection(
      args: { thread_id?: string; selection_id?: string } = {},
    ): Promise<ElementToolResult> {
      const payload = await resolvePayload(deps, args);
      if (!payload) {
        if (args.thread_id) return { text: NOT_FOUND("thread", args.thread_id), unavailable: true };
        if (args.selection_id) return { text: NOT_FOUND("selection", args.selection_id), unavailable: true };
        return { text: NOTHING_SELECTED, unavailable: true };
      }
      await withSource(payload);
      const candidates = payload.sourceCandidates ?? [];
      if (!candidates.length) {
        return {
          text:
            `No source candidates for ${payload.element.tag} in \`${deps.workspaceRoot}\`.\n\n` +
            "The element's text, id, aria-label and non-utility classes were all searched. " +
            "If the component lives outside this workspace, the agent will have to find it another way.",
          unavailable: true,
        };
      }
      const lines = [
        `# Source candidates (${candidates.length})`,
        "",
        `Searched \`${deps.workspaceRoot}\` using the element's id, aria-label, text and app classes.`,
        "",
      ];
      for (const c of candidates) lines.push(`- \`${c.filePath}:${c.lineStart}-${c.lineEnd}\` — ${(c.confidence * 100).toFixed(0)}% · ${c.reason}`);
      lines.push("");
      lines.push("This is a heuristic from the built page, not a resolver — verify before editing.");
      return { text: lines.join("\n") };
    },
  };
}
