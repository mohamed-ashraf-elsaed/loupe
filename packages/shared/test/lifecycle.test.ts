import { describe, expect, it } from "vitest";
import { awaitingReview, lifecycle, LIFECYCLE_LABELS } from "../src/lifecycle.ts";

describe("lifecycle", () => {
  it("says nothing about an untouched thread", () => {
    expect(lifecycle({ status: "queue" })).toBeNull();
    expect(lifecycle({ status: "todo" })).toBeNull();
    expect(lifecycle({ status: "in_progress" })).toBeNull();
  });

  it("marks a thread whose change an agent has proposed", () => {
    const l = lifecycle({ status: "in_progress", proposal: { html: "<b/>" } });
    expect(l).toEqual({ stage: "sent", label: LIFECYCLE_LABELS.sent });
  });

  it("marks a thread waiting on review even without a proposal", () => {
    expect(lifecycle({ status: "in_review" })).toEqual({ stage: "preview", label: "Review preview" });
  });

  it("prefers the PR over the board stage while the thread is open", () => {
    const l = lifecycle({ status: "in_review", proposal: {}, pr: { number: 412, url: "https://x/412" } });
    expect(l!.stage).toBe("in_pr");
    expect(l!.label).toBe("In PR");
    expect(l!.pr).toEqual({ number: 412, url: "https://x/412" });
    expect(l!.checks).toBeUndefined();
  });

  it("builds the checks meter, clamped to the total", () => {
    expect(lifecycle({ status: "in_review", pr: { number: 1, checksPassed: 3, checksTotal: 4 } })!.checks)
      .toEqual({ text: "3/4", ratio: 0.75 });
    expect(lifecycle({ status: "in_review", pr: { number: 1, checksPassed: 9, checksTotal: 4 } })!.checks)
      .toEqual({ text: "4/4", ratio: 1 });
    expect(lifecycle({ status: "in_review", pr: { number: 1, checksPassed: -2, checksTotal: 4 } })!.checks)
      .toEqual({ text: "0/4", ratio: 0 });
    // A zero total is not a meter.
    expect(lifecycle({ status: "in_review", pr: { number: 1, checksTotal: 0 } })!.checks).toBeUndefined();
  });

  it("calls a resolved thread reviewed once there was a change", () => {
    expect(lifecycle({ status: "resolved", proposal: {} })!.stage).toBe("reviewed");
    expect(lifecycle({ status: "resolved", pr: { number: 7 } })!.stage).toBe("reviewed");
    // Resolved with nothing attached says nothing.
    expect(lifecycle({ status: "resolved" })).toBeNull();
  });

  it("keeps the PR on a reviewed thread", () => {
    const l = lifecycle({ status: "resolved", pr: { number: 7, state: "merged", checksPassed: 2, checksTotal: 2 } });
    expect(l!.stage).toBe("reviewed");
    expect(l!.pr!.state).toBe("merged");
    expect(l!.checks!.text).toBe("2/2");
  });
});

describe("awaitingReview", () => {
  it("returns only the threads in review", () => {
    const rows = [{ status: "queue" as const }, { status: "in_review" as const }, { status: "resolved" as const }];
    expect(awaitingReview(rows)).toEqual([{ status: "in_review" }]);
  });
});
