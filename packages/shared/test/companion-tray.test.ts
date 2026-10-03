import { describe, expect, it } from "vitest";
import {
  addToTray, clearTray, elapsedLabel, emptyTray, includedItems, moveInTray, nudgeInTray,
  removeFromTray, toggleInclude, trayCount, trayPayload, traySummary, voiceMessage, voiceSupport,
  type TrayItem,
} from "../src/companion-tray.ts";

const item = (id: string, over: Partial<TrayItem> = {}): Omit<TrayItem, "include"> => ({
  id, kind: "element", label: `.${id}`, ...over,
});

describe("the gather tray", () => {
  it("starts empty", () => {
    expect(emptyTray().items).toEqual([]);
    expect(traySummary(emptyTray())).toBe("No context gathered");
  });

  it("adds items in the order they were gathered", () => {
    let t = emptyTray();
    t = addToTray(t, item("a"));
    t = addToTray(t, item("b"));
    expect(t.items.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("replaces rather than duplicates the same reference", () => {
    // Clicking "add" twice on one element is a person confirming, not wanting it twice.
    let t = emptyTray();
    t = addToTray(t, item("a"));
    t = addToTray(t, item("a", { label: ".a-updated" }));
    expect(t.items.length).toBe(1);
    expect(t.items[0]!.label).toBe(".a-updated");
  });

  it("keeps the position when the same item is re-added", () => {
    let t = emptyTray();
    t = addToTray(t, item("a"));
    t = addToTray(t, item("b"));
    t = addToTray(t, item("c"));
    t = addToTray(t, item("a", { label: ".a2" }));
    // Re-adding must not silently undo a reorder.
    expect(t.items.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps an unchecked item's state when it is re-added", () => {
    let t = emptyTray();
    t = addToTray(t, item("a"));
    t = toggleInclude(t, "a");
    expect(t.items[0]!.include).toBe(false);
    t = addToTray(t, item("a", { label: ".a2" }));
    expect(t.items[0]!.include).toBe(false);
  });

  it("removes by id, and does nothing for an unknown one", () => {
    let t = emptyTray();
    t = addToTray(t, item("a"));
    t = addToTray(t, item("b"));
    expect(removeFromTray(t, "a").items.map((i) => i.id)).toEqual(["b"]);
    expect(removeFromTray(t, "nope").items.length).toBe(2);
  });

  it("moves an item to an absolute position, clamped rather than rejected", () => {
    let t = emptyTray();
    for (const id of ["a", "b", "c"]) t = addToTray(t, item(id));
    expect(moveInTray(t, "c", 0).items.map((i) => i.id)).toEqual(["c", "a", "b"]);
    // Out-of-range clamps to the ends instead of throwing or dropping the item.
    expect(moveInTray(t, "a", 99).items.map((i) => i.id)).toEqual(["b", "c", "a"]);
    expect(moveInTray(t, "a", -5).items.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("nudges one step, and does nothing at the ends", () => {
    let t = emptyTray();
    for (const id of ["a", "b", "c"]) t = addToTray(t, item(id));
    expect(nudgeInTray(t, "b", -1).items.map((i) => i.id)).toEqual(["b", "a", "c"]);
    expect(nudgeInTray(t, "b", 1).items.map((i) => i.id)).toEqual(["a", "c", "b"]);
    expect(nudgeInTray(t, "a", -1).items.map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(nudgeInTray(t, "c", 1).items.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("is a no-op for an unknown id when moving", () => {
    let t = emptyTray();
    t = addToTray(t, item("a"));
    expect(moveInTray(t, "nope", 0)).toBe(t);
    expect(nudgeInTray(t, "nope", 1)).toBe(t);
  });

  it("does not mutate the state it was given", () => {
    const t = addToTray(emptyTray(), item("a"));
    toggleInclude(t, "a");
    removeFromTray(t, "a");
    expect(t.items.length).toBe(1);
    expect(t.items[0]!.include).toBe(true);
  });

  it("sends only the included items, in order", () => {
    let t = emptyTray();
    t = addToTray(t, item("a"));
    t = addToTray(t, item("b"));
    t = addToTray(t, item("c"));
    t = toggleInclude(t, "b");
    expect(includedItems(t).map((i) => i.id)).toEqual(["a", "c"]);
    expect(trayCount(t)).toEqual({ total: 3, included: 2 });
    expect(traySummary(t)).toBe("2 of 3 included");
  });

  it("carries the kind, reference and url into the payload", () => {
    let t = emptyTray();
    t = addToTray(t, { id: "x", kind: "region", label: "the hero", url: "/checkout", ref: "sel_1" });
    expect(trayPayload(t)).toEqual([{ kind: "region", id: "sel_1", url: "/checkout", label: "the hero" }]);
  });

  it("says nothing when everything is excluded", () => {
    let t = addToTray(emptyTray(), item("a"));
    t = toggleInclude(t, "a");
    expect(trayPayload(t)).toEqual([]);
    expect(traySummary(t)).toBe("0 of 1 included");
  });

  it("clears", () => {
    let t = addToTray(emptyTray(), item("a"));
    expect(clearTray().items).toEqual([]);
    expect(t.items.length).toBe(1);
  });
});

describe("dictation availability", () => {
  it("is supported when the API exists on a secure page", () => {
    expect(voiceSupport({ hasCtor: true, isSecureContext: true })).toBe("supported");
    expect(voiceMessage("supported")).toBeNull();
  });

  it("distinguishes an insecure page from a browser that cannot do it", () => {
    // They need different wording: one is fixable, the other is a fact. Telling someone
    // their browser cannot do this when the real problem is http:// wastes their time.
    expect(voiceSupport({ hasCtor: true, isSecureContext: false })).toBe("insecure");
    expect(voiceMessage("insecure")).toMatch(/secure page/i);
    expect(voiceSupport({ hasCtor: false, isSecureContext: true })).toBe("unsupported");
    expect(voiceMessage("unsupported")).toMatch(/cannot dictate/i);
  });

  it("reports insecure even when the API is missing on an insecure page", () => {
    // The secure-origin problem is the one they can act on.
    expect(voiceSupport({ hasCtor: false, isSecureContext: false })).toBe("insecure");
  });
});

describe("the recording clock", () => {
  it("reads as mm:ss", () => {
    expect(elapsedLabel(0)).toBe("0:00");
    expect(elapsedLabel(5_000)).toBe("0:05");
    expect(elapsedLabel(65_000)).toBe("1:05");
    expect(elapsedLabel(600_000)).toBe("10:00");
  });

  it("never goes negative", () => {
    expect(elapsedLabel(-1000)).toBe("0:00");
  });
});
