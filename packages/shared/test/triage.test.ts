import { describe, expect, it } from "vitest";
import {
  CHANGE_TYPES,
  CHANGE_TYPE_LABELS,
  COMMENT_PRIORITIES,
  DEFAULT_CHANGE_TYPE,
  DEFAULT_PRIORITY,
  normalizeChangeType,
  normalizePriority,
  PRIORITY_LABELS,
  PRIORITY_RANK,
} from "../src/index.ts";

describe("priorities and change types", () => {
  it("lists priorities most urgent first, each with a label and a rank", () => {
    expect(COMMENT_PRIORITIES).toEqual(["critical", "high", "medium", "low"]);
    for (const p of COMMENT_PRIORITIES) {
      expect(PRIORITY_LABELS[p]).toBeTruthy();
      expect(PRIORITY_RANK[p]).toBe(COMMENT_PRIORITIES.indexOf(p));
    }
    // Rank is a sort key, so it must be strictly increasing down the list.
    const ranks = COMMENT_PRIORITIES.map((p) => PRIORITY_RANK[p]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it("lists every change type with a label", () => {
    expect(CHANGE_TYPES).toEqual(["frontend", "backend", "api", "other"]);
    for (const t of CHANGE_TYPES) expect(CHANGE_TYPE_LABELS[t]).toBeTruthy();
  });

  it("passes a known value through and falls back to the default", () => {
    for (const p of COMMENT_PRIORITIES) expect(normalizePriority(p)).toBe(p);
    for (const t of CHANGE_TYPES) expect(normalizeChangeType(t)).toBe(t);

    // A row written before triage metadata has neither field.
    expect(normalizePriority(undefined)).toBe(DEFAULT_PRIORITY);
    expect(normalizePriority("urgent")).toBe(DEFAULT_PRIORITY);
    expect(normalizePriority(7)).toBe(DEFAULT_PRIORITY);
    expect(normalizeChangeType(undefined)).toBe(DEFAULT_CHANGE_TYPE);
    expect(normalizeChangeType("css")).toBe(DEFAULT_CHANGE_TYPE);
  });
});
