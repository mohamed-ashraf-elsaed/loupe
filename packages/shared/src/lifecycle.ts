/**
 * The lifecycle of a thread's change.
 *
 * A thread does not just sit on a board — its fix moves through an agent, a pull
 * request and a preview. This module is the single definition of that progression,
 * so the panel's chips, the dashboard and anything else agree on what "In PR" means.
 *
 * The rule the whole flow rests on: **only a human resolves a thread.** An agent
 * moves work to In Review; a person approves it from there.
 */

import type { CommentStage } from "./index.js";

/** The pull request a thread's change is riding on. */
export interface PrInfo {
  /** The PR number, e.g. 412. */
  number: number;
  /** Where to open it, when the host knows. */
  url?: string;
  state?: "open" | "merged" | "closed";
  /** Check runs that passed, and how many there are — the progress meter. */
  checksPassed?: number;
  checksTotal?: number;
}

export type LifecycleStage = "sent" | "in_pr" | "preview" | "reviewed";

export const LIFECYCLE_LABELS: Record<LifecycleStage, string> = {
  sent: "Sent to agent",
  in_pr: "In PR",
  preview: "Review preview",
  reviewed: "Reviewed",
};

export interface Lifecycle {
  stage: LifecycleStage;
  label: string;
  /** The PR chip, when the thread has one. */
  pr?: PrInfo;
  /** The checks meter: "3/4" plus the fraction for the bar's width. */
  checks?: { text: string; ratio: number };
}

/**
 * Derive the chip for a thread, or `null` when there is nothing to say — an
 * untouched thread in Queue should not wear a badge explaining that.
 *
 * Precedence is deliberate: a merged PR outranks the board stage, because "Reviewed"
 * on a resolved thread and "In PR" on an open one are both more specific than the
 * column it sits in.
 */
export function lifecycle(c: {
  status: CommentStage;
  proposal?: unknown;
  pr?: PrInfo | null;
}): Lifecycle | null {
  const hasProposal = !!c.proposal;
  const pr = c.pr ?? undefined;

  const withPr = (stage: LifecycleStage): Lifecycle => {
    const out: Lifecycle = { stage, label: LIFECYCLE_LABELS[stage] };
    if (pr) {
      out.pr = pr;
      if (typeof pr.checksTotal === "number" && pr.checksTotal > 0) {
        const passed = Math.max(0, Math.min(pr.checksTotal, pr.checksPassed ?? 0));
        out.checks = {
          text: `${passed}/${pr.checksTotal}`,
          ratio: passed / pr.checksTotal,
        };
      }
    }
    return out;
  };

  if (c.status === "resolved") return hasProposal || pr ? withPr("reviewed") : null;
  if (pr) return withPr("in_pr");
  if (c.status === "in_review") return { stage: "preview", label: LIFECYCLE_LABELS.preview };
  if (hasProposal) return { stage: "sent", label: LIFECYCLE_LABELS.sent };
  return null;
}

/** Threads a reviewer still has to look at. */
export function awaitingReview<T extends { status: CommentStage }>(comments: T[]): T[] {
  return comments.filter((c) => c.status === "in_review");
}
