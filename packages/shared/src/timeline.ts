/**
 * The thread timeline.
 *
 * "Agent activity on your feedback" — what actually happened, in order. Built from
 * what the thread already carries (its stage, its PR, its proposal, its replies)
 * rather than from a separate event log, so it cannot drift from the truth: if the
 * timeline says a PR was opened, there is a `pr` on the comment saying so.
 *
 * Pure, so the panel and the dashboard render the same story.
 */

export interface TimelineEntry {
  at: string;
  /** The step, e.g. "Sent to Claude Code". */
  label: string;
  /** An extra line when there is something specific to say. */
  detail?: string;
  /** Who caused it, when it was not the reporter. */
  actor?: string;
  kind: "captured" | "message" | "sent" | "pr" | "preview" | "review" | "resolved";
}

export interface TimelineInput {
  createdAt: string;
  status: string;
  kind?: string;
  /** Was this an element, a region, a free note? */
  anchor?: { selector?: string; tag?: string; text?: string };
  proposal?: { author?: string; createdAt?: string } | null;
  pr?: { number?: number; url?: string; state?: string; previewUrl?: string } | null;
  title?: string;
}

/** "a <button> “Complete checkout”" — how the captured thing reads in a timeline. */
export function describeTarget(input: TimelineInput): string {
  const parts: string[] = [];
  if (input.anchor?.tag) parts.push(`a <${input.anchor.tag}>`);
  if (input.anchor?.selector) parts.push(`\`${input.anchor.selector}\``);
  return parts.length ? parts.join(" ") : input.kind === "free" ? "a page note" : "an element";
}

/**
 * The story of a thread, oldest first.
 *
 * Stages are read from the thread's *current* state, so a step that was skipped does
 * not appear — there is no "preview live" row for a thread that never had one. The
 * timestamps for those steps are not stored, so they borrow the newest message's time;
 * that is a real limitation and the reason the entries are ordered by stage rather
 * than pretending to a precision we do not have.
 */
export function threadTimeline(
  input: TimelineInput,
  messages: { at: string; authorName: string; fromAgent: boolean }[] = [],
): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  const latest = messages.length ? messages[messages.length - 1]!.at : input.createdAt;

  out.push({
    at: input.createdAt,
    kind: "captured",
    label: "Feedback captured",
    detail: [input.title, describeTarget(input)].filter(Boolean).join(" · "),
  });

  for (const m of messages) {
    out.push({
      at: m.at,
      kind: "message",
      label: `${m.authorName} replied`,
      actor: m.fromAgent ? m.authorName : undefined,
    });
  }

  const stage = normalizeStage(input.status);
  const reached = (s: string) => STAGE_ORDER.indexOf(stage) >= STAGE_ORDER.indexOf(s);

  if (input.proposal || reached("in_review")) {
    const agent = input.proposal?.author ?? "Claude Code";
    out.push({
      at: input.proposal?.createdAt ?? latest,
      kind: "sent",
      label: `Change ready from ${agent}`,
      detail: "The rewritten markup is on the thread.",
      actor: agent,
    });
  }

  if (input.pr) {
    out.push({
      at: latest,
      kind: "pr",
      label: input.pr.number ? `Pull request #${input.pr.number} opened` : "Pull request opened",
      detail: input.pr.state === "merged" ? "Merged." : input.pr.state === "closed" ? "Closed without merging." : "Waiting on review.",
    });
    // Only when a URL is actually known — a preview is never inferred.
    if (input.pr.previewUrl) {
      out.push({ at: latest, kind: "preview", label: "Preview live", detail: input.pr.previewUrl });
    }
  }

  if (reached("in_review")) {
    out.push({ at: latest, kind: "review", label: "Waiting on a human review", detail: "Only a person can close this." });
  }
  if (stage === "resolved") {
    out.push({ at: latest, kind: "resolved", label: "Resolved", detail: "A person closed this." });
  }

  return out;
}

const STAGE_ORDER = ["queue", "todo", "in_progress", "in_review", "resolved"];

/** Legacy names map onto the same stages, so an old row still renders a timeline. */
function normalizeStage(status: string): string {
  if (status === "open") return "queue";
  if (status === "done") return "resolved";
  return status;
}

/**
 * A thread as plain text, for pasting into a chat or a ticket.
 *
 * Deliberately starts with the element selector: pasted somewhere without Loupe, the
 * selector is the only part that still identifies *what* is being talked about.
 */
export function threadAsText(
  input: TimelineInput & { id: string; body: string; url?: string; authorName?: string },
  messages: { at: string; authorName: string; body: string; fromAgent: boolean }[] = [],
): string {
  const lines = [
    `# ${input.title ?? "Feedback"} (#${input.id})`,
    "",
    `- Stage: ${normalizeStage(input.status)}`,
    `- Page: ${input.url ?? "—"}`,
  ];
  if (input.anchor?.selector) lines.push(`- Target: \`${input.anchor.selector}\``);
  if (input.pr?.number) lines.push(`- PR: #${input.pr.number}${input.pr.previewUrl ? ` · preview ${input.pr.previewUrl}` : ""}`);
  lines.push("", "## Request", "", input.body);
  if (messages.length) {
    lines.push("", "## Conversation", "");
    for (const m of messages) lines.push(`**${m.authorName}**${m.fromAgent ? " (agent)" : ""} — ${m.at}`, "", m.body, "");
  }
  return lines.join("\n");
}
