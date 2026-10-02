import { describe, expect, it } from "vitest";
import { COMMENT_STAGES, isOpenStage, normalizeStatus, STAGE_LABELS } from "../src/index.ts";

describe("comment stages", () => {
  it("is five stages in board order, each with a label", () => {
    expect(COMMENT_STAGES).toEqual(["queue", "todo", "in_progress", "in_review", "resolved"]);
    for (const s of COMMENT_STAGES) expect(STAGE_LABELS[s]).toBeTruthy();
  });

  it("passes a current stage through unchanged", () => {
    for (const s of COMMENT_STAGES) expect(normalizeStatus(s)).toBe(s);
  });

  it("maps the legacy three-value statuses onto the board", () => {
    // Rows and clients written before the board must not fall off it.
    expect(normalizeStatus("open")).toBe("queue");
    expect(normalizeStatus("done")).toBe("resolved");
    expect(normalizeStatus("in_progress")).toBe("in_progress");
  });

  it("falls back to the untriaged queue for anything unrecognised", () => {
    expect(normalizeStatus("nonsense")).toBe("queue");
    expect(normalizeStatus("")).toBe("queue");
    expect(normalizeStatus(undefined)).toBe("queue");
    expect(normalizeStatus(42)).toBe("queue");
  });

  it("counts every stage except resolved as open work", () => {
    expect(isOpenStage("queue")).toBe(true);
    expect(isOpenStage("in_review")).toBe(true);
    expect(isOpenStage("resolved")).toBe(false);
  });
});
