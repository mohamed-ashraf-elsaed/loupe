import { describe, expect, it } from "vitest";
import { looksLikeQuestion, needsYou, needsYouThreads } from "../src/needs-you.ts";

const agent = (body: string) => ({ fromAgent: true, body });
const person = (body: string) => ({ fromAgent: false, body });

describe("does this look like a question", () => {
  it("is true when the last line asks", () => {
    expect(looksLikeQuestion("Should I use the wider padding?")).toBe(true);
    expect(looksLikeQuestion("Done.\n\nWant me to also fix the header?")).toBe(true);
    // A trailing quote or bracket after the mark still counts.
    expect(looksLikeQuestion('It says "are you sure?"')).toBe(true);
    expect(looksLikeQuestion("(which one?)")).toBe(true);
  });

  it("ignores a question that is not the last thing said", () => {
    expect(looksLikeQuestion("Should I use this?\n\nI went ahead with it.")).toBe(false);
  });

  it("is false for a statement", () => {
    expect(looksLikeQuestion("Done — merged.")).toBe(false);
    expect(looksLikeQuestion("")).toBe(false);
  });
});

describe("the needs-you predicate", () => {
  it("flags a thread waiting on review", () => {
    expect(needsYou({ status: "in_review" })).toMatchObject({ needs: true, reason: "review" });
  });

  it("flags an agent's unanswered question", () => {
    expect(needsYou({ status: "in_progress", last: agent("Want me to also fix the header?") }))
      .toMatchObject({ needs: true, reason: "question" });
  });

  it("does NOT flag a person's question — that one is for the agent", () => {
    expect(needsYou({ status: "in_progress", last: person("Can you make it bigger?") }).needs).toBe(false);
  });

  it("flags a failed agent run", () => {
    expect(needsYou({ status: "in_progress", agentFailed: true }))
      .toMatchObject({ needs: true, reason: "failed" });
  });

  it("does NOT flag a thread an agent is still working on", () => {
    // The exclusion that keeps the filter worth reading.
    expect(needsYou({ status: "in_progress" }).needs).toBe(false);
    expect(needsYou({ status: "in_progress", last: agent("Working on it.") }).needs).toBe(false);
    expect(needsYou({ status: "todo" }).needs).toBe(false);
    expect(needsYou({ status: "queue" }).needs).toBe(false);
  });

  it("never flags a resolved thread, whatever else is true", () => {
    expect(needsYou({ status: "resolved", agentFailed: true }).needs).toBe(false);
    expect(needsYou({ status: "resolved", last: agent("anything?") }).needs).toBe(false);
    expect(needsYou({ status: "done" }).needs).toBe(false);
  });

  it("puts a failure above a question, and both above a review", () => {
    // A broken run is more urgent than a routine approval.
    expect(needsYou({ status: "in_review", agentFailed: true }).reason).toBe("failed");
    expect(needsYou({ status: "in_review", last: agent("ok?") }).reason).toBe("question");
    expect(needsYou({ status: "in_review" }).reason).toBe("review");
  });

  it("carries a label a person can read", () => {
    expect(needsYou({ status: "in_review" }).label).toBe("Waiting on your review");
    expect(needsYou({ status: "queue", agentFailed: true }).label).toBe("The agent's run failed");
  });

  it("reads legacy stage names", () => {
    expect(needsYou({ status: "open" }).needs).toBe(false);
    // `done` is resolved, so it needs nobody.
    expect(needsYou({ status: "done" }).needs).toBe(false);
  });
});

describe("filtering a board", () => {
  it("keeps only what a human has to act on", () => {
    const board = [
      { id: "a", status: "queue" },
      { id: "b", status: "in_progress" },
      { id: "c", status: "in_review" },
      { id: "d", status: "resolved" },
      { id: "e", status: "in_review", agentFailed: true },
    ];
    expect(needsYouThreads(board).map((t) => t.id)).toEqual(["c", "e"]);
  });

  it("is empty for a board with nothing waiting", () => {
    expect(needsYouThreads([{ status: "queue" }, { status: "in_progress" }])).toEqual([]);
  });
});

describe("the truth table, all of it", () => {
  const rows: [string, { status: string; last?: any; agentFailed?: boolean }, boolean][] = [
    ["queue, nothing", { status: "queue" }, false],
    ["queue, agent failed", { status: "queue", agentFailed: true }, true],
    ["todo, agent working", { status: "todo", last: agent("on it") }, false],
    ["in_progress, agent asks", { status: "in_progress", last: agent("which?") }, true],
    ["in_progress, person asks", { status: "in_progress", last: person("which?") }, false],
    ["in_progress, agent reports", { status: "in_progress", last: agent("done") }, false],
    ["in_review, nothing else", { status: "in_review" }, true],
    ["in_review, agent asks", { status: "in_review", last: agent("ok?") }, true],
    ["resolved, agent failed", { status: "resolved", agentFailed: true }, false],
    ["resolved, agent asks", { status: "resolved", last: agent("ok?") }, false],
  ];
  for (const [name, input, expected] of rows) {
    it(`${name} → ${expected ? "needs you" : "does not"}`, () => {
      expect(needsYou(input).needs).toBe(expected);
    });
  }
});
