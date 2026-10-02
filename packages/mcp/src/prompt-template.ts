/**
 * The edit prompt.
 *
 * An agent handed a screenshot and some HTML will happily rewrite the whole
 * component. This template exists to stop that: it pins the work to the smallest
 * diff, tells the agent to keep the codebase's own conventions, and — most
 * importantly — asks it to *say why* it picked the file it picked, so a wrong guess
 * is visible immediately instead of silently plausible.
 */

import type { MappingCandidate } from "./mapper.ts";

export interface PromptContext {
  /** The element, in the agent's terms. */
  tag?: string;
  selector?: string;
  testid?: string | null;
  text?: string;
  classes?: string[];
  /** The PM's own words, when this came from a thread. */
  request?: string;
  pageUrl?: string;
  /** Ranked source candidates, best first. */
  candidates?: MappingCandidate[];
  /** True when this is a stored thread rather than a live selection. */
  isThread?: boolean;
  /** The thread id, when there is one. */
  threadId?: string;
  /** True when the agent has already submitted a proposal for this thread. */
  hasProposal?: boolean;
}

/** "a button with text “Complete checkout”" — how a person would name it. */
export function describeElement(ctx: PromptContext): string {
  const parts: string[] = [];
  parts.push(ctx.tag ? `a <${ctx.tag}>` : "an element");
  if (ctx.testid) parts.push(`with data-testid="${ctx.testid}"`);
  else if (ctx.selector) parts.push(`matching ${ctx.selector}`);
  if (ctx.text) parts.push(`containing “${ctx.text.slice(0, 80)}”`);
  return parts.join(" ");
}

export function generateEditPrompt(ctx: PromptContext): string {
  const lines: string[] = [];

  lines.push("# Task");
  if (ctx.request) {
    lines.push("");
    lines.push(`The request, in the reporter's words:`);
    lines.push("");
    lines.push(`> ${ctx.request.replace(/\n/g, "\n> ")}`);
    lines.push("");
  }
  lines.push(
    `Implement this for ${describeElement(ctx)}` +
    (ctx.pageUrl ? ` on ${ctx.pageUrl}` : "") + ".",
  );

  if (ctx.candidates?.length) {
    lines.push("");
    lines.push("## Where it probably lives");
    lines.push("");
    lines.push("Ranked by how well each file matched the captured element. **Check the top one before editing it** — this is a heuristic from the built page, not a resolver:");
    lines.push("");
    for (const c of ctx.candidates) {
      lines.push(`- \`${c.filePath}:${c.lineStart}\` — ${(c.confidence * 100).toFixed(0)}% · ${c.reason}`);
    }
    lines.push("");
    lines.push(dedent(`
      If none of these is the component that renders the element, say so and name the
      file you did find, rather than editing the closest-looking candidate. A confident
      edit to the wrong file is worse than a question.
    `));
  } else {
    lines.push("");
    lines.push("## Where it lives");
    lines.push("");
    lines.push("No source candidates were found for this element. Locate the component yourself before editing, and say which file you chose.");
  }

  lines.push("");
  lines.push("## How to make the change");
  lines.push("");
  lines.push(dedent(`
    - **Smallest diff that satisfies the request.** Do not reformat, rename, reorder or
      "tidy" anything you were not asked to touch. If a one-line change does it, that is
      the change.
    - **Follow the file's own conventions** — its naming, its styling approach, its
      component patterns. If the file uses utility classes, use them; if it uses a
      stylesheet, use that. Match what is there rather than what you would have written.
    - **Keep the element's existing behaviour and accessibility.** Preserve the test id,
      the aria attributes and the event handlers unless the request is about them.
    - **Do not touch unrelated files.**
  `));

  if (ctx.isThread && ctx.threadId) {
    lines.push("");
    lines.push("## What happens next");
    lines.push("");
    lines.push(dedent(`
      1. Edit the file.
      2. Call \`propose_change(id: "${ctx.threadId}", html, css?, notes?)\` with the element's
         rewritten markup, so a human can review the change against the original request.
      3. Call \`update_status(id: "${ctx.threadId}", status: "in_review")\` when it is ready.
         **Never set it to resolved** — only a person closes a thread. Moving it to In
         Review is what puts it in front of a reviewer.
      4. If the work lands in a pull request, that is what the panel's PR chip is for; keep
         the diff reviewable.
    `));
    if (ctx.hasProposal) {
      lines.push("");
      lines.push("A proposal already exists for this thread — call `get_comment` first if you are iterating on it, rather than starting over.");
    }
  }

  return lines.join("\n");
}

/** Trim the leading indentation a template literal gives, so the output reads plain. */
function dedent(text: string): string {
  const lines = text.replace(/^\n/, "").replace(/\n\s*$/, "").split("\n");
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)![0].length));
  return lines.map((l) => l.slice(indent)).join("\n");
}
