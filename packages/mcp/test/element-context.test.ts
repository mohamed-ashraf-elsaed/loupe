import { describe, expect, it } from "vitest";
import {
  createElementContextTools, formatElementContext, selectionToPayload, threadContextToPayload,
  type ElementContextPayload,
} from "../src/tools/element-context.ts";
import { generateEditPrompt } from "../src/prompt-template.ts";
import { SelectionStore, type SelectionPayload } from "../src/bridge/selection-store.ts";
import type { Comment } from "@loupekit/shared";

const thread = (over: Partial<Comment> = {}): Comment => ({
  id: "t1",
  projectKey: "pk",
  url: "/checkout",
  title: "Make the CTA bigger",
  body: "It is too small on mobile.",
  status: "in_review",
  author: { id: "u", name: "Sara" },
  kind: "element",
  anchor: {
    tag: "button", cssPath: "#save", xpath: "/html/body/button", testid: "save", text: "Complete checkout",
    attrs: { "aria-label": "Place your order" }, nthOfType: 1,
    rect: { x: 980, y: 520, w: 120, h: 38 }, viewport: { w: 1280, h: 820 },
  },
  context: { html: '<button id="save">Complete checkout</button>', styles: { padding: "8px 12px", color: "rgb(255, 255, 255)" } },
  offset: { x: 0, y: 0 },
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
} as Comment);

const selection = (over: Partial<SelectionPayload> = {}): SelectionPayload => ({
  correlationId: "c1", url: "https://acme.test/checkout", tag: "button",
  selector: "#save", testid: "save", text: "Complete checkout", classes: ["cta", "flex"],
  attrs: { "aria-label": "Place your order" }, styles: { padding: "8px 12px" },
  box: { x: 1, y: 2, w: 3, h: 4 }, at: "2026-01-01T00:00:00.000Z", ...over,
});

describe("thread hydration", () => {
  it("maps every field a live selection would have", () => {
    const p = threadContextToPayload(thread());
    expect(p.source).toBe("thread");
    expect(p.threadId).toBe("t1");
    expect(p.page).toEqual({ url: "/checkout", title: "Make the CTA bigger" });
    expect(p.element.tag).toBe("button");
    expect(p.element.selector).toBe("#save");
    expect(p.element.testid).toBe("save");
    expect(p.element.text).toBe("Complete checkout");
    expect(p.element.attrs).toEqual({ "aria-label": "Place your order" });
    expect(p.element.box).toEqual({ x: 980, y: 520, w: 120, h: 38 });
    // Styles come off the stored element context, not the anchor.
    expect(p.styles).toEqual({ padding: "8px 12px", color: "rgb(255, 255, 255)" });
    expect(p.screenshot).toBeUndefined();
  });

  it("copes with a comment whose anchor is bare", () => {
    // Rows written by an older client can be missing most of the anchor — the same
    // shape that once blanked the panel.
    const p = threadContextToPayload(thread({ anchor: { tag: "div", cssPath: ".x" } as any, context: undefined as any }));
    expect(p.element.tag).toBe("div");
    expect(p.element.selector).toBe(".x");
    expect(p.element.testid).toBeNull();
    expect(p.styles).toEqual({});
  });

  it("produces the same shape for a selection, so an agent cannot tell them apart", () => {
    const p = selectionToPayload(selection());
    const t = threadContextToPayload(thread());
    expect(p.source).toBe("selection");
    expect(p.correlationId).toBe("c1");
    // The element block is identical in shape — that is what an agent reads.
    expect(Object.keys(p.element).sort()).toEqual(Object.keys(t.element).sort());
    // The only top-level differences are the two source discriminators.
    const keys = (o: object) => Object.keys(o).sort();
    expect(keys(p)).toEqual([...keys(t).filter((k) => k !== "threadId"), "correlationId"].sort());
  });
});

describe("the edit prompt", () => {
  const candidates = [
    { filePath: "src/components/CheckoutButton.tsx", lineStart: 6, lineEnd: 10, confidence: 0.92, reason: "matched text · component filename", matchType: "text" as const },
  ];

  it("lists the candidates with their confidence and reason", () => {
    const prompt = generateEditPrompt({ tag: "button", text: "Complete checkout", candidates });
    expect(prompt).toContain("## Where it probably lives");
    expect(prompt).toContain("src/components/CheckoutButton.tsx:6");
    expect(prompt).toContain("92%");
    expect(prompt).toContain("component filename");
    // It must be honest about being a guess.
    expect(prompt).toContain("heuristic");
  });

  it("always carries the constraints that keep the diff small", () => {
    const prompt = generateEditPrompt({ tag: "button", candidates });
    expect(prompt).toContain("Smallest diff");
    expect(prompt).toContain("Follow the file's own conventions");
    expect(prompt).toContain("Do not touch unrelated files");
  });

  it("says so when there are no candidates rather than inventing one", () => {
    const prompt = generateEditPrompt({ tag: "button", candidates: [] });
    expect(prompt).toContain("No source candidates were found");
    expect(prompt).not.toContain("## Where it probably lives");
  });

  it("includes the reporter's own words", () => {
    const prompt = generateEditPrompt({ tag: "button", request: "Make the CTA bigger\nIt is too small on mobile." });
    expect(prompt).toContain("> Make the CTA bigger");
    expect(prompt).toContain("> It is too small on mobile.");
  });

  it("spells out the workflow for a thread — and that only a human resolves", () => {
    const prompt = generateEditPrompt({ tag: "button", isThread: true, threadId: "t1", candidates });
    expect(prompt).toContain("## What happens next");
    expect(prompt).toContain('propose_change(id: "t1"');
    expect(prompt).toContain('update_status(id: "t1", status: "in_review")');
    expect(prompt).toContain("Never set it to resolved");
  });

  it("omits the workflow when this is not a thread", () => {
    expect(generateEditPrompt({ tag: "button", candidates })).not.toContain("## What happens next");
  });

  it("tells the agent not to start over when a proposal already exists", () => {
    const prompt = generateEditPrompt({ tag: "button", isThread: true, threadId: "t1", hasProposal: true });
    expect(prompt).toContain("A proposal already exists");
  });

  it("names the element the way a person would", () => {
    const prompt = generateEditPrompt({ tag: "button", testid: "save", text: "Complete checkout", pageUrl: "/checkout" });
    expect(prompt).toContain("a <button>");
    expect(prompt).toContain('data-testid="save"');
    expect(prompt).toContain("Complete checkout");
    expect(prompt).toContain("/checkout");
  });
});

describe("formatting the context for an agent", () => {
  const payload: ElementContextPayload = {
    source: "thread", threadId: "t1",
    page: { url: "/checkout", title: "Make the CTA bigger" },
    element: { tag: "button", selector: "#save", testid: "save", id: null, text: "Complete checkout", classes: ["cta"], box: { x: 1, y: 2, w: 3, h: 4 } },
    styles: { padding: "8px 12px" },
    sourceCandidates: [],
  };

  it("renders every section an agent needs", () => {
    const out = formatElementContext(payload);
    expect(out).toContain("# Selected element");
    expect(out).toContain("- **Where**: /checkout");
    expect(out).toContain("`<button>`");
    expect(out).toContain("- **Test id**: `save`");
    expect(out).toContain("## Computed styles");
    expect(out).toContain("`padding: 8px 12px`");
    expect(out).toContain("## Source candidates");
    // An empty candidate list must say so, not render a blank heading.
    expect(out).toContain("No source candidates found");
    // No prompt means no rule.
    expect(out).not.toContain("\n---\n");
  });

  it("appends the prompt under a rule when there is one", () => {
    const out = formatElementContext({ ...payload, editPrompt: "# Task\n\nDo the thing." });
    expect(out).toContain("\n---\n");
    expect(out).toContain("# Task");
  });
});

describe("the tools", () => {
  const build = (opts: { latest?: SelectionPayload; threads?: Record<string, Comment>; root?: string } = {}) => {
    const store = new SelectionStore(10);
    if (opts.latest) store.add(opts.latest);
    return {
      store,
      tools: createElementContextTools({
        store,
        workspaceRoot: opts.root ?? "/definitely/not/here",
        fetchThread: async (id) => opts.threads?.[id] ?? null,
      }),
    };
  };

  it("explains the empty state instead of failing", async () => {
    const { tools } = build();
    expect((await tools.getLatestSelection()).unavailable).toBe(true);
    expect((await tools.getSelectionHistory()).text).toContain("Nothing has been selected");
    expect((await tools.getElementContext()).unavailable).toBe(true);
    expect((await tools.findSourceForSelection()).unavailable).toBe(true);
    // A missing id is specific about which id was missing.
    expect((await tools.getElementContext({ thread_id: "x" })).text).toContain("No thread found");
    expect((await tools.getElementContext({ selection_id: "x" })).text).toContain("No selection found");
  });

  it("serves the latest selection", async () => {
    const { tools } = build({ latest: selection() });
    const out = await tools.getLatestSelection();
    expect(out.unavailable).toBeUndefined();
    expect(out.text).toContain("Complete checkout");
    expect(out.text).toContain("- **Test id**: `save`");
    // The workspace does not exist, so candidates are empty and it says so.
    expect(out.text).toContain("No source candidates found");
    // The prompt belongs to get_element_context, which is where an agent asks for it.
    expect(out.text).not.toContain("# Task");
  });

  it("serves the latest selection with its prompt when asked for context", async () => {
    const { tools } = build({ latest: selection() });
    const out = await tools.getElementContext();
    expect(out.text).toContain("# Task");
    expect(out.text).toContain("## How to make the change");
    // Utility classes are displayed but never searched, so no candidate cites one.
    expect(out.text).toContain("**Classes**");
    expect(out.text).not.toContain("matched class “flex”");
  });

  it("serves a thread through the same shape", async () => {
    const { tools } = build({ threads: { t1: thread() } });
    const out = await tools.getElementContext({ thread_id: "t1" });
    expect(out.text).toContain("Make the CTA bigger");
    expect(out.text).toContain("- **Thread**: #t1");
    // A stored thread gets the full workflow, since a person is waiting on it.
    expect(out.text).toContain("## What happens next");
  });

  it("can omit the prompt when the caller only wants the facts", async () => {
    const { tools } = build({ latest: selection() });
    const out = await tools.getElementContext({}, { include_prompt: false });
    expect(out.text).toContain("Complete checkout");
    expect(out.text).not.toContain("# Task");
  });

  it("lists history newest first and points at the next call", async () => {
    const { tools, store } = build();
    store.add(selection({ correlationId: "old", text: "Old one" }));
    store.add(selection({ correlationId: "new", text: "New one" }));
    const out = await tools.getSelectionHistory({ limit: 5 });
    expect(out.text.indexOf("new")).toBeLessThan(out.text.indexOf("old"));
    expect(out.text).toContain("get_element_context");
  });

  it("finds source for a selection and is honest about the limits", async () => {
    const { tools } = build({ latest: selection() });
    const out = await tools.findSourceForSelection();
    // No workspace on disk → an explanation, not a crash and not a fake candidate.
    expect(out.text).toContain("No source candidates");
    expect(out.text).toContain("/definitely/not/here");
  });
});
