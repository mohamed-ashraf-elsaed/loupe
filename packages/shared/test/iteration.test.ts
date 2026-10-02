import { describe, expect, it } from "vitest";
import {
  addIteration, canMove, canUndo, current, emptyIterations, MAX_ITERATIONS, move, stackLabel, undo,
} from "../src/iteration.ts";

const it0 = (id: string) => ({ id, at: "2026-01-01T00:00:00.000Z", html: `<${id}>`, kind: "generate" as const });

describe("iteration history", () => {
  it("starts empty and previews nothing", () => {
    const s = emptyIterations();
    expect(current(s)).toBeNull();
    expect(canUndo(s)).toBe(false);
    expect(stackLabel(s)).toBe("");
    expect(move(s, 1)).toEqual(s); // moving nowhere is a no-op, not a crash
    expect(undo(s)).toEqual(s);
  });

  it("previews each new iteration as it arrives", () => {
    let s = addIteration(emptyIterations(), it0("a"));
    expect(current(s)!.id).toBe("a");
    expect(stackLabel(s)).toBe("1 / 1");
    s = addIteration(s, it0("b"));
    expect(current(s)!.id).toBe("b");
    expect(stackLabel(s)).toBe("2 / 2");
  });

  it("steps back and forward without discarding", () => {
    let s = addIteration(addIteration(emptyIterations(), it0("a")), it0("b"));
    expect(canMove(s, -1)).toBe(true);
    expect(canMove(s, 1)).toBe(false); // already at the newest
    s = move(s, -1);
    expect(current(s)!.id).toBe("a");
    expect(s.items.length).toBe(2); // nothing lost
    s = move(s, 1);
    expect(current(s)!.id).toBe("b");
  });

  it("undo throws the newest away — distinct from stepping back", () => {
    let s = addIteration(addIteration(emptyIterations(), it0("a")), it0("b"));
    s = undo(s);
    expect(s.items.map((i) => i.id)).toEqual(["a"]);
    expect(current(s)!.id).toBe("a");
    expect(s.index).toBe(0);
  });

  it("branches from the previewed point, dropping the abandoned tail", () => {
    let s = addIteration(addIteration(addIteration(emptyIterations(), it0("a")), it0("b")), it0("c"));
    s = move(move(s, -1), -1); // viewing "a"
    s = addIteration(s, it0("d"));
    expect(s.items.map((i) => i.id)).toEqual(["a", "d"]);
    expect(current(s)!.id).toBe("d");
  });

  it("caps the stack so a long session cannot grow without bound", () => {
    let s = emptyIterations();
    for (let i = 0; i < MAX_ITERATIONS + 5; i++) s = addIteration(s, it0(`i${i}`));
    expect(s.items.length).toBe(MAX_ITERATIONS);
    // The newest survives and is previewed; the oldest are the ones dropped.
    expect(current(s)!.id).toBe(`i${MAX_ITERATIONS + 4}`);
    expect(s.items[0]!.id).toBe("i5");
  });
});
