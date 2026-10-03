import { mkdtempSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CompanionQueue, companionPreamble, prependToResult } from "../src/bridge/companion-queue.ts";
import { HOOK_EVENTS, HOOK_MARKER, hookCommand, installHooks, installHooksFile } from "../src/hooks/hook-installer.ts";

describe("the companion queue", () => {
  it("queues in order and peeks without consuming", () => {
    const q = new CompanionQueue();
    q.push({ body: "one" });
    q.push({ body: "two" });
    expect(q.peek().map((m) => m.body)).toEqual(["one", "two"]);
    // Peeking twice must not change anything.
    expect(q.peek().map((m) => m.body)).toEqual(["one", "two"]);
    expect(q.size()).toBe(2);
  });

  it("takes everything exactly once", () => {
    const q = new CompanionQueue();
    q.push({ body: "one" });
    q.push({ body: "two" });

    const taken = q.take();
    expect(taken.map((m) => m.body)).toEqual(["one", "two"]);
    // The queue is empty and stays empty — the "never delivered twice" half.
    expect(q.peek()).toEqual([]);
    expect(q.take()).toEqual([]);
  });

  it("does not lose a message when delivery fails", () => {
    const q = new CompanionQueue();
    q.push({ body: "important" });
    q.take();
    expect(q.peek()).toEqual([]); // taken…
    q.requeue(); // …but the tool call threw
    expect(q.peek().map((m) => m.body)).toEqual(["important"]);
  });

  it("keeps order when requeueing onto a queue that gained a message", () => {
    const q = new CompanionQueue();
    q.push({ body: "first" });
    q.take();
    q.push({ body: "second" });
    q.requeue();
    // Front, not back: the conversation should read in the order it was written.
    expect(q.peek().map((m) => m.body)).toEqual(["first", "second"]);
  });

  it("only drops what was acknowledged", () => {
    const q = new CompanionQueue();
    const a = q.push({ body: "a" });
    q.push({ body: "b" });
    q.take();
    q.ack([a.id]);
    expect(q.pending()).toBe(1);
    q.requeue();
    expect(q.peek().map((m) => m.body)).toEqual(["b"]);
  });

  it("shows queued and in-flight together, which is what the panel renders", () => {
    const q = new CompanionQueue();
    q.push({ body: "a" });
    q.push({ body: "b" });
    q.take();
    q.push({ body: "c" });
    expect(q.list().map((m) => m.body)).toEqual(["a", "b", "c"]);
  });

  it("gives each message a stable id and a timestamp", () => {
    const q = new CompanionQueue();
    const m = q.push({ body: "hi" });
    expect(m.id).toMatch(/^cm_/);
    expect(() => new Date(m.at).toISOString()).not.toThrow();
  });

  it("carries multiple contexts and attachments", () => {
    const q = new CompanionQueue();
    const m = q.push({
      body: "these two",
      contexts: [{ kind: "element", id: "e1", label: ".btn" }, { kind: "element", id: "e2" }],
      attachments: [{ url: "/b.png", kind: "image" }],
      voice: true,
    });
    expect(m.contexts!.length).toBe(2);
    expect(m.attachments!.length).toBe(1);
    expect(m.voice).toBe(true);
  });

  it("keeps replies bounded", () => {
    const q = new CompanionQueue(3);
    for (let i = 0; i < 6; i++) q.addReply({ body: `r${i}` });
    expect(q.listReplies().map((r) => r.body)).toEqual(["r3", "r4", "r5"]);
  });

  it("clear() drops everything waiting", () => {
    const q = new CompanionQueue();
    q.push({ body: "a" });
    q.clear();
    expect(q.size()).toBe(0);
  });
});

describe("delivering messages with a tool result", () => {
  it("prepends a preamble and keeps the original content", () => {
    const result = { content: [{ type: "text", text: "the real answer" }] };
    const out = prependToResult(result, [{ id: "m1", at: "t", body: "please use blue" }] as any);
    // The preamble is first…
    expect((out.content![0] as any).text).toContain("please use blue");
    // …and the original is intact and still there. Dropping it is the failure here.
    expect(out.content).toHaveLength(2);
    expect(out.content![1]).toEqual({ type: "text", text: "the real answer" });
  });

  it("returns the result untouched when there is nothing to deliver", () => {
    const result = { content: [{ type: "text", text: "answer" }] };
    expect(prependToResult(result, [])).toBe(result);
  });

  it("does not mutate the result it was given", () => {
    const result = { content: [{ type: "text", text: "answer" }] };
    prependToResult(result, [{ id: "m", at: "t", body: "hi" }] as any);
    expect(result.content).toHaveLength(1);
  });

  it("copes with a result that has no content array", () => {
    const out = prependToResult({} as any, [{ id: "m", at: "t", body: "hi" }] as any);
    expect(out.content).toHaveLength(1);
  });

  it("names the sender, the context and the attachments", () => {
    const text = companionPreamble([{
      id: "m", at: "t", body: "make this bigger",
      author: { id: "u1", name: "Sara" },
      contexts: [{ kind: "element", label: ".cta" }],
      attachments: [{ url: "/a.png", kind: "image" }],
    }] as any);
    expect(text).toContain("Sara: make this bigger");
    expect(text).toContain(".cta");
    expect(text).toContain("1 attachment");
    // It has to be unmissable and it has to say how to answer.
    expect(text).toContain("reply_to_companion");
  });

  it("says 'messages' only when there is more than one", () => {
    const one = companionPreamble([{ id: "m", at: "t", body: "x" }] as any);
    const two = companionPreamble([{ id: "a", at: "t", body: "x" }, { id: "b", at: "t", body: "y" }] as any);
    expect(one).toContain("1 message ");
    expect(two).toContain("2 messages");
  });
});

describe("merging hooks into settings", () => {
  const script = "/opt/loupe/hooks/loupe-hook.mjs";

  it("adds every event to an empty file", () => {
    const r = installHooks({}, script);
    expect(r.changed).toBe(true);
    expect(r.added).toEqual([...HOOK_EVENTS]);
    expect(r.repaired).toEqual([]);
    for (const e of HOOK_EVENTS) {
      expect(r.settings.hooks![e]![0]!.hooks[0]!.command).toContain(HOOK_MARKER);
    }
  });

  it("copes with a missing or null settings object", () => {
    expect(installHooks(null, script).added).toEqual([...HOOK_EVENTS]);
    expect(installHooks(undefined, script).added).toEqual([...HOOK_EVENTS]);
  });

  it("is idempotent — the second run changes nothing", () => {
    // The acceptance test, literally: run it twice, get one entry.
    const first = installHooks({}, script);
    const second = installHooks(first.settings, script);
    expect(second.changed).toBe(false);
    expect(second.added).toEqual([]);
    expect(second.preserved).toEqual([...HOOK_EVENTS]);
    expect(JSON.stringify(second.settings)).toBe(JSON.stringify(first.settings));
  });

  it("never touches somebody else's hooks", () => {
    const theirs = { matcher: "Bash", hooks: [{ type: "command" as const, command: "echo mine" }] };
    const r = installHooks({ hooks: { PreToolUse: [theirs] } }, script);
    expect(r.settings.hooks!.PreToolUse![0]).toEqual(theirs);
    // Ours is appended, so a hook that must run first still does.
    expect(r.settings.hooks!.PreToolUse!.length).toBe(2);
    expect(r.settings.hooks!.PreToolUse![1]!.hooks[0]!.command).toContain(HOOK_MARKER);
  });

  it("preserves every unrelated key in the file", () => {
    const settings = { model: "opus", permissions: { allow: ["Bash"] }, hooks: {} };
    const r = installHooks(settings, script);
    expect(r.settings.model).toBe("opus");
    expect(r.settings.permissions).toEqual({ allow: ["Bash"] });
  });

  it("repairs our own stale entry instead of adding a second", () => {
    const stale = hookCommand("/old/path/loupe-hook.mjs", "PreToolUse");
    const r = installHooks({ hooks: { PreToolUse: [{ hooks: [{ type: "command", command: stale }] }] } }, script);
    expect(r.repaired).toContain("PreToolUse");
    expect(r.settings.hooks!.PreToolUse!.length).toBe(1);
    expect(r.settings.hooks!.PreToolUse![0]!.hooks[0]!.command).toBe(hookCommand(script, "PreToolUse"));
  });

  it("survives malformed shapes without dropping what it cannot read", () => {
    const r = installHooks({ hooks: { PreToolUse: "not an array" as any, PostToolUse: [{ noHooks: true } as any] } }, script);
    // The unusable value is replaced by a valid list, and the recognisable-but-odd
    // entry is kept as-is rather than discarded.
    expect(Array.isArray(r.settings.hooks!.PreToolUse)).toBe(true);
    expect(r.settings.hooks!.PostToolUse![0]).toEqual({ noHooks: true });
  });

  it("treats a non-object settings value as an empty file", () => {
    expect(installHooks([] as any, script).added).toEqual([...HOOK_EVENTS]);
  });
});

describe("writing the hooks file", () => {
  const script = "/opt/loupe/hooks/loupe-hook.mjs";
  const tmp = () => mkdtempSync(join(tmpdir(), "loupe-hooks-"));

  it("creates the file and reports what it did", () => {
    const path = join(tmp(), ".claude", "settings.json");
    const r = installHooksFile(path, script);
    expect(r.wrote).toBe(true);
    expect(r.error).toBeUndefined();
    expect(JSON.parse(readFileSync(path, "utf8")).hooks.PreToolUse[0].hooks[0].command).toContain(HOOK_MARKER);
  });

  it("does not write at all when there is nothing to change", () => {
    const path = join(tmp(), "settings.json");
    installHooksFile(path, script);
    const before = readFileSync(path, "utf8");
    const again = installHooksFile(path, script);
    expect(again.wrote).toBe(false);
    expect(again.changed).toBe(false);
    expect(readFileSync(path, "utf8")).toBe(before);
  });

  it("takes a backup before modifying an existing file", () => {
    const dir = tmp();
    const path = join(dir, "settings.json");
    writeFileSync(path, JSON.stringify({ model: "opus" }, null, 2));
    const r = installHooksFile(path, script);
    expect(r.backup).toBe(`${path}.loupe-backup`);
    expect(JSON.parse(readFileSync(r.backup!, "utf8"))).toEqual({ model: "opus" });
  });

  it("refuses to overwrite a file it cannot parse", () => {
    const path = join(tmp(), "settings.json");
    writeFileSync(path, "{ definitely not json");
    const r = installHooksFile(path, script);
    expect(r.wrote).toBe(false);
    expect(r.error).toMatch(/not valid JSON/);
    // Left exactly as it was — it may hold settings we would destroy.
    expect(readFileSync(path, "utf8")).toBe("{ definitely not json");
    expect(existsSync(`${path}.loupe-backup`)).toBe(false);
  });

  it("never throws, whatever it is pointed at", () => {
    // A path under a regular file cannot be created; the failure must be reported,
    // not raised, because startup must not depend on this.
    const dir = tmp();
    const blocker = join(dir, "blocker");
    writeFileSync(blocker, "x");
    const r = installHooksFile(join(blocker, "nested", "settings.json"), script);
    expect(r.wrote).toBe(false);
    expect(typeof r.error).toBe("string");
  });
});
