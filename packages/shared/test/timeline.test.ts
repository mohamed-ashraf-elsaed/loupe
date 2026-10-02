import { describe, expect, it } from "vitest";
import { describeTarget, threadAsText, threadTimeline } from "../src/timeline.ts";

const base = {
  createdAt: "2026-01-01T10:00:00.000Z",
  status: "queue",
  title: "Make the CTA bigger",
  body: "It is too small on mobile.",
  id: "t1",
  url: "/checkout",
  anchor: { tag: "button", selector: "#save" },
};

describe("describing the captured thing", () => {
  it("names the tag and selector", () => {
    expect(describeTarget(base)).toBe("a <button> `#save`");
  });

  it("falls back to the kind when there is no anchor", () => {
    expect(describeTarget({ createdAt: base.createdAt, status: "queue", kind: "free" })).toBe("a page note");
    expect(describeTarget({ createdAt: base.createdAt, status: "queue" })).toBe("an element");
  });
});

describe("the timeline", () => {
  it("starts with the capture, whatever else happened", () => {
    const [first] = threadTimeline(base);
    expect(first!.kind).toBe("captured");
    expect(first!.at).toBe(base.createdAt);
    expect(first!.detail).toContain("Make the CTA bigger");
    expect(first!.detail).toContain("#save");
  });

  it("does not invent steps that were skipped", () => {
    // A brand-new thread has been captured and nothing else.
    expect(threadTimeline(base).map((e) => e.kind)).toEqual(["captured"]);
  });

  it("adds the replies in order", () => {
    const entries = threadTimeline(base, [
      { at: "2026-01-01T11:00:00.000Z", authorName: "Claude Code", fromAgent: true },
      { at: "2026-01-01T12:00:00.000Z", authorName: "Sara", fromAgent: false },
    ]);
    expect(entries.map((e) => e.kind)).toEqual(["captured", "message", "message"]);
    expect(entries[1]!.label).toBe("Claude Code replied");
    // An agent's reply is attributed; a person's is not marked.
    expect(entries[1]!.actor).toBe("Claude Code");
    expect(entries[2]!.actor).toBeUndefined();
  });

  it("shows a PR, and a preview only when a URL is known", () => {
    const withPreview = threadTimeline({ ...base, status: "in_review", pr: { number: 412, previewUrl: "https://p.test/pr-412/" } });
    expect(withPreview.map((e) => e.kind)).toContain("pr");
    expect(withPreview.map((e) => e.kind)).toContain("preview");
    expect(withPreview.find((e) => e.kind === "pr")!.label).toContain("#412");

    const withoutPreview = threadTimeline({ ...base, status: "in_review", pr: { number: 412 } });
    expect(withoutPreview.map((e) => e.kind)).not.toContain("preview");
  });

  it("says what a merged or closed PR means", () => {
    expect(threadTimeline({ ...base, pr: { number: 1, state: "merged" } }).find((e) => e.kind === "pr")!.detail).toBe("Merged.");
    expect(threadTimeline({ ...base, pr: { number: 1, state: "closed" } }).find((e) => e.kind === "pr")!.detail).toContain("without merging");
    expect(threadTimeline({ ...base, pr: { number: 1, state: "open" } }).find((e) => e.kind === "pr")!.detail).toBe("Waiting on review.");
  });

  it("reads the stage in order, including legacy names", () => {
    const resolved = threadTimeline({ ...base, status: "resolved" });
    expect(resolved.map((e) => e.kind)).toContain("review");
    expect(resolved.find((e) => e.kind === "resolved")!.detail).toContain("A person closed this");

    // A row written before the five-stage board still produces a sensible story.
    expect(threadTimeline({ ...base, status: "done" }).map((e) => e.kind)).toContain("resolved");
    expect(threadTimeline({ ...base, status: "open" }).map((e) => e.kind)).toEqual(["captured"]);
  });

  it("attributes a proposal to whoever made it", () => {
    const entries = threadTimeline({ ...base, proposal: { author: "Claude Code via MCP", createdAt: "2026-01-01T11:00:00.000Z" } });
    const sent = entries.find((e) => e.kind === "sent")!;
    expect(sent.label).toContain("Claude Code via MCP");
    expect(sent.at).toBe("2026-01-01T11:00:00.000Z");
  });

  it("marks the review step as waiting on a person, not the agent", () => {
    const review = threadTimeline({ ...base, status: "in_review" }).find((e) => e.kind === "review")!;
    expect(review.detail).toContain("Only a person can close this");
  });
});

describe("copying a thread as text", () => {
  it("leads with the selector, so it still means something outside Loupe", () => {
    const text = threadAsText(base);
    expect(text).toContain("# Make the CTA bigger (#t1)");
    expect(text).toContain("- Target: `#save`");
    expect(text).toContain("- Page: /checkout");
  });

  it("includes the conversation when there is one", () => {
    const text = threadAsText(base, [
      { at: "2026-01-01T11:00:00.000Z", authorName: "Claude Code", body: "Made it bigger.", fromAgent: true },
      { at: "2026-01-01T12:00:00.000Z", authorName: "Sara", body: "Still too small.", fromAgent: false },
    ]);
    expect(text).toContain("## Conversation");
    expect(text).toContain("**Claude Code** (agent)");
    expect(text).toContain("**Sara** —");
    expect(text).toContain("Still too small.");
  });

  it("omits the conversation section when nobody replied", () => {
    expect(threadAsText(base)).not.toContain("## Conversation");
  });

  it("includes the PR and its preview when there are any", () => {
    const text = threadAsText({ ...base, pr: { number: 412, previewUrl: "https://p.test/pr-412/" } });
    expect(text).toContain("- PR: #412 · preview https://p.test/pr-412/");
  });
});
