/**
 * "Needs you".
 *
 * A board that shows everything is a board nobody reads. This is the one predicate
 * that answers *what is blocked on a person right now* — and it lives in shared so
 * the panel, the dashboard and the MCP tools cannot disagree about it.
 *
 * The exclusion matters as much as the match: a thread where an **agent is still
 * working** is not waiting on a human, and counting it would train people to ignore
 * the filter.
 */

export type NeedsYouReason = "review" | "question" | "failed";

export const NEEDS_YOU_LABELS: Record<NeedsYouReason, string> = {
  review: "Waiting on your review",
  question: "The agent asked you something",
  failed: "The agent's run failed",
};

export interface NeedsYouInput {
  /** The thread's stage. */
  status: string;
  /** The newest reply, when there is one. */
  last?: { fromAgent: boolean; body: string } | null;
  /**
   * Set by the caller when the most recent agent run for this thread failed. The
   * message model does not carry it — the Activity stream does, and that is where a
   * caller can read it from.
   */
  agentFailed?: boolean;
}

export interface NeedsYou {
  needs: boolean;
  reason?: NeedsYouReason;
  label?: string;
}

/** Does this look like the agent asking for an answer rather than reporting one? */
export function looksLikeQuestion(body: string): boolean {
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  const last = lines[lines.length - 1];
  if (!last) return false;
  // A question mark at the end of the last line, ignoring a trailing quote or bracket.
  return /\?["')\]]*$/.test(last);
}

/**
 * Whether a human needs to do something.
 *
 * Precedence is deliberate: a failed run outranks an unanswered question (fix the
 * breakage first), and both outrank a routine review, because a review is the normal
 * state of work moving and a failure is not.
 */
export function needsYou(input: NeedsYouInput): NeedsYou {
  const stage = normalizeStage(input.status);

  // Resolved threads need nobody, whatever else is true of them.
  if (stage === "resolved") return { needs: false };

  if (input.agentFailed) return { needs: true, reason: "failed", label: NEEDS_YOU_LABELS.failed };

  // An agent's question is addressed to a person; a *person's* question is addressed to
  // the agent, so it must not land here.
  if (input.last?.fromAgent && looksLikeQuestion(input.last.body)) {
    return { needs: true, reason: "question", label: NEEDS_YOU_LABELS.question };
  }

  if (stage === "in_review") return { needs: true, reason: "review", label: NEEDS_YOU_LABELS.review };

  return { needs: false };
}

/** Threads a human has to act on, in board order. */
export function needsYouThreads<T extends NeedsYouInput>(threads: T[]): T[] {
  return threads.filter((t) => needsYou(t).needs);
}

function normalizeStage(status: string): string {
  if (status === "open") return "queue";
  if (status === "done") return "resolved";
  return status;
}
