import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EVENT_CAP, EventStore, PAYLOAD_CHAR_CAP, shrinkPayload, truncate } from "../src/bridge/event-store.ts";
import { SESSION_IDLE_MS, extractFiles, sessionSummaryText, sessionsFromEvents } from "../src/bridge/session-manager.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "loupe-ev-"));

describe("truncating a payload", () => {
  it("leaves a short string alone", () => {
    expect(truncate("hello")).toBe("hello");
    expect(truncate("x".repeat(PAYLOAD_CHAR_CAP))).toHaveLength(PAYLOAD_CHAR_CAP);
  });

  it("says how much it cut rather than silently shortening", () => {
    const long = "x".repeat(PAYLOAD_CHAR_CAP + 500);
    const cut = truncate(long);
    expect(cut).toContain("[truncated 500 chars]");
    expect(cut.startsWith("x".repeat(PAYLOAD_CHAR_CAP))).toBe(true);
  });

  it("shrinks deep structures without losing the shape", () => {
    const out = shrinkPayload({ a: { b: { c: { d: { e: "deep" } } } } }) as any;
    // Four levels in the content is replaced by a marker; the path to it survives, so
    // the shape still tells you what the payload was.
    expect(out.a.b.c.d).toBe("[deeper]");
    expect(Object.keys(out)).toEqual(["a"]);
  });

  it("caps a long array and says how many were dropped", () => {
    const out = shrinkPayload(Array.from({ length: 30 }, (_, i) => i)) as any[];
    expect(out.length).toBe(21);
    expect(out.at(-1)).toBe("… 10 more");
  });

  it("caps an object's key count", () => {
    const big: Record<string, number> = {};
    for (let i = 0; i < 50; i++) big[`k${i}`] = i;
    expect(Object.keys(shrinkPayload(big) as object).length).toBe(30);
  });

  it("leaves primitives and null alone", () => {
    expect(shrinkPayload(1)).toBe(1);
    expect(shrinkPayload(true)).toBe(true);
    expect(shrinkPayload(null)).toBeNull();
  });
});

describe("the event store", () => {
  it("keeps the newest and drops the oldest past the cap", () => {
    const store = new EventStore({ cap: 5 });
    for (let i = 0; i < 8; i++) store.add({ type: "tool_use", summary: `e${i}` });
    expect(store.size()).toBe(5);
    expect(store.recent().map((e) => e.summary)).toEqual(["e3", "e4", "e5", "e6", "e7"]);
  });

  it("defaults to the documented cap", () => {
    const store = new EventStore();
    for (let i = 0; i < EVENT_CAP + 10; i++) store.add({ type: "tool_use" });
    expect(store.size()).toBe(EVENT_CAP);
  });

  it("returns newest first from latest()", () => {
    const store = new EventStore();
    store.add({ type: "tool_use", summary: "first" });
    store.add({ type: "tool_use", summary: "second" });
    expect(store.latest().map((e) => e.summary)).toEqual(["second", "first"]);
  });

  it("truncates a tool name and summary rather than storing them whole", () => {
    const store = new EventStore();
    const e = store.add({ type: "tool_use", tool: "T".repeat(500), summary: "S".repeat(900) });
    expect(e.tool!.length).toBeLessThan(300);
    expect(e.summary!.length).toBeLessThan(600);
  });

  it("de-duplicates the files on one event", () => {
    const store = new EventStore();
    const e = store.add({ type: "tool_use", files: ["a.ts", "a.ts", "b.ts"] });
    expect(e.files).toEqual(["a.ts", "b.ts"]);
  });

  it("survives a reload from disk", () => {
    const file = join(tmp(), "events.json");
    const store = new EventStore({ file });
    store.add({ type: "prompt_submit", summary: "hello" });
    store.flush();

    const reloaded = new EventStore({ file });
    expect(reloaded.size()).toBe(1);
    expect(reloaded.recent()[0]!.summary).toBe("hello");
  });

  it("ignores a corrupt file instead of failing to start", () => {
    const dir = tmp();
    const file = join(dir, "events.json");
    writeFileSync(file, "{ this is not json");
    const store = new EventStore({ file });
    expect(store.size()).toBe(0);
    // …and it recovers by overwriting on the next write.
    store.add({ type: "tool_use" });
    store.flush();
    expect(JSON.parse(readFileSync(file, "utf8")).length).toBe(1);
  });

  it("drops entries that are not events when loading", () => {
    const file = join(tmp(), "events.json");
    writeFileSync(file, JSON.stringify([{ id: "ok", type: "tool_use" }, { nonsense: true }, null, "string"]));
    expect(new EventStore({ file }).size()).toBe(1);
  });

  it("writes atomically, leaving no half-written file behind", () => {
    const file = join(tmp(), "events.json");
    const store = new EventStore({ file });
    store.add({ type: "tool_use" });
    store.flush();
    // Parses cleanly, which a truncated write would not.
    expect(Array.isArray(JSON.parse(readFileSync(file, "utf8")))).toBe(true);
  });

  it("clear() empties it", () => {
    const store = new EventStore();
    store.add({ type: "tool_use" });
    store.clear();
    expect(store.size()).toBe(0);
  });
});

describe("extracting files from a tool payload", () => {
  it("takes an explicit file key", () => {
    expect(extractFiles({ file_path: "src/app.ts" })).toEqual(["src/app.ts"]);
    expect(extractFiles({ path: "lib/util.ts" })).toEqual(["lib/util.ts"]);
  });

  it("takes a path-shaped value on its own", () => {
    expect(extractFiles({ whatever: "packages/sdk/src/app.ts" })).toContain("packages/sdk/src/app.ts");
  });

  it("walks arrays and nested objects", () => {
    const out = extractFiles({ edits: [{ file_path: "a.ts" }, { file_path: "b.ts" }] });
    expect(out).toEqual(["a.ts", "b.ts"]);
  });

  it("ignores prose that merely contains a dot or slash", () => {
    // A false positive makes the file list untrustworthy, which is worse than a miss.
    expect(extractFiles({ note: "see the docs for this" })).toEqual([]);
    expect(extractFiles({ note: "run it like this: a / b" })).toEqual([]);
  });

  it("is unbothered by primitives and null", () => {
    expect(extractFiles(null)).toEqual([]);
    expect(extractFiles("a.ts")).toEqual([]);
    expect(extractFiles(42)).toEqual([]);
  });

  it("stops walking eventually", () => {
    let deep: any = { file_path: "deep.ts" };
    for (let i = 0; i < 10; i++) deep = { nested: deep };
    expect(extractFiles(deep)).toEqual([]);
  });
});

describe("folding sessions", () => {
  const at = (n: number) => new Date(1_700_000_000_000 + n * 1000).toISOString();
  const ev = (over: Record<string, unknown>) => ({ id: `e${Math.random()}`, at: at(0), type: "tool_use", ...over }) as any;

  it("groups by session and counts tools per name, most used first", () => {
    const sessions = sessionsFromEvents([
      ev({ sessionId: "s1", tool: "Read", at: at(1) }),
      ev({ sessionId: "s1", tool: "Edit", at: at(2) }),
      ev({ sessionId: "s1", tool: "Read", at: at(3) }),
    ], Date.parse(at(4)));
    expect(sessions.length).toBe(1);
    expect(sessions[0]!.tools).toBe(3);
    expect(sessions[0]!.toolCounts).toEqual([{ tool: "Read", count: 2 }, { tool: "Edit", count: 1 }]);
  });

  it("counts prompts separately from tools", () => {
    const [s] = sessionsFromEvents([
      ev({ sessionId: "s1", type: "prompt_submit", at: at(1) }),
      ev({ sessionId: "s1", type: "prompt_submit", at: at(2) }),
      ev({ sessionId: "s1", tool: "Read", at: at(3) }),
    ], Date.parse(at(4)));
    expect(s!.prompts).toBe(2);
    expect(s!.tools).toBe(1);
  });

  it("collects files in first-seen order, without duplicates", () => {
    const [s] = sessionsFromEvents([
      ev({ sessionId: "s1", files: ["a.ts"], at: at(1) }),
      ev({ sessionId: "s1", files: ["b.ts", "a.ts"], at: at(2) }),
    ], Date.parse(at(3)));
    expect(s!.files).toEqual(["a.ts", "b.ts"]);
  });

  it("picks files out of a tool payload too", () => {
    const [s] = sessionsFromEvents([
      ev({ sessionId: "s1", tool: "Edit", payload: { file_path: "src/x.ts" }, at: at(1) }),
    ], Date.parse(at(2)));
    expect(s!.files).toEqual(["src/x.ts"]);
  });

  it("treats an explicit end as ended, and a quiet session as not live", () => {
    const [ended] = sessionsFromEvents([
      ev({ sessionId: "s1", at: at(1) }),
      ev({ sessionId: "s1", type: "session_end", at: at(2) }),
    ], Date.parse(at(3)));
    expect(ended!.active).toBe(false);
    expect(ended!.endedAt).toBe(at(2));

    // A killed terminal never says goodbye, so silence has to mean ended too.
    const [quiet] = sessionsFromEvents([ev({ sessionId: "s2", at: at(1) })], Date.parse(at(2)) + SESSION_IDLE_MS + 1000);
    expect(quiet!.active).toBe(false);

    const [live] = sessionsFromEvents([ev({ sessionId: "s3", at: at(1) })], Date.parse(at(1)) + 1000);
    expect(live!.active).toBe(true);
  });

  it("keeps an event with no session id rather than dropping it", () => {
    // Losing them would hide the hook bug that caused it.
    const sessions = sessionsFromEvents([{ id: "e1", at: at(1), type: "tool_use" } as any], Date.parse(at(2)));
    expect(sessions[0]!.id).toBe("unattributed");
  });

  it("orders sessions newest first", () => {
    const sessions = sessionsFromEvents([
      ev({ sessionId: "old", at: at(1) }),
      ev({ sessionId: "new", at: at(9) }),
    ], Date.parse(at(10)));
    expect(sessions.map((s) => s.id)).toEqual(["new", "old"]);
  });

  it("is empty for no events", () => {
    expect(sessionsFromEvents([])).toEqual([]);
  });

  it("reads as a line a person can act on", () => {
    const [s] = sessionsFromEvents([
      ev({ sessionId: "s1", type: "prompt_submit", at: at(1) }),
      ev({ sessionId: "s1", tool: "Read", files: ["a.ts"], at: at(2) }),
    ], Date.parse(at(1)) + 1000);
    const text = sessionSummaryText(s!);
    expect(text).toContain("live");
    expect(text).toContain("1 prompt ·");
    // Singular, not "1 tool calls" — the line is read by a person.
    expect(text).toContain("1 tool call");
    expect(text).not.toContain("1 tool calls");
    expect(text).toContain("1 file touched");
    expect(text).toContain("Read ×1");
  });
});
