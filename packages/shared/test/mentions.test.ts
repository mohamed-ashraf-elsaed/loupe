import { describe, expect, it } from "vitest";
import {
  mentionSegments, mentionSuggestions, parseMentions, resolveMentions,
  type MentionCandidate,
} from "../src/mentions.ts";

const people: MentionCandidate[] = [
  { id: "u1", name: "Sara Ahmed", email: "sara@acme.test" },
  { id: "u2", name: "Jane Doe", email: "jane.doe@acme.test" },
  { id: "u3", name: "Claude Code" },
];

const handles = (body: string) => parseMentions(body).map((m) => m.handle);

describe("parsing mentions", () => {
  it("finds a simple mention", () => {
    expect(handles("hey @sara can you look?")).toEqual(["sara"]);
  });

  it("finds several, and only counts each person once", () => {
    expect(handles("@sara and @jane and @sara again")).toEqual(["sara", "jane"]);
  });

  it("does not match an email address", () => {
    // The whole reason for the preceding-character rule.
    expect(handles("mail me at sara@acme.test")).toEqual([]);
    expect(handles("a@b")).toEqual([]);
  });

  it("still matches a mention that follows an email", () => {
    expect(handles("sara@acme.test — or ask @jane")).toEqual(["jane"]);
  });

  it("keeps a dot inside a handle but not a trailing one", () => {
    expect(handles("@jane.doe please")).toEqual(["jane.doe"]);
    expect(handles("thanks @jane.")).toEqual(["jane"]);
    expect(handles("cc @sara, @jane; and @claude!")).toEqual(["sara", "jane", "claude"]);
  });

  it("matches at the start of a body and after punctuation", () => {
    expect(handles("@sara")).toEqual(["sara"]);
    expect(handles("(@sara)")).toEqual(["sara"]);
    expect(handles("- @sara")).toEqual(["sara"]);
    expect(handles("> @sara")).toEqual(["sara"]);
  });

  it("ignores names inside code", () => {
    expect(handles("use `@sara` as the handle")).toEqual([]);
    expect(handles("```\n@sara\n```")).toEqual([]);
    // …but a real mention beside code still counts.
    expect(handles("use `@x` — cc @sara")).toEqual(["sara"]);
  });

  it("returns the position and length so a renderer can highlight it", () => {
    const [m] = parseMentions("hi @sara!");
    expect(m!.start).toBe(3);
    expect(m!.length).toBe(5);
  });

  it("copes with an empty or mention-free body", () => {
    expect(parseMentions("")).toEqual([]);
    expect(parseMentions("nothing here")).toEqual([]);
    expect(parseMentions("just an @ on its own")).toEqual([]);
  });
});

describe("resolving mentions", () => {
  it("matches by first name, full name, squashed name, email local part and id", () => {
    for (const text of ["@sara", "@Sara", "@saraahmed", "@SARA", "@u1"]) {
      const r = resolveMentions(`ping ${text}`, people);
      expect(r.resolved[0]?.user.id, text).toBe("u1");
    }
  });

  it("reports an unknown handle rather than dropping it", () => {
    const r = resolveMentions("cc @nobody", people);
    expect(r.resolved).toEqual([]);
    expect(r.unknown).toEqual(["nobody"]);
  });

  it("does not produce a phantom for something that was not a mention", () => {
    const r = resolveMentions("email sara@acme.test", people);
    expect(r.resolved).toEqual([]);
    expect(r.unknown).toEqual([]);
  });

  it("resolves one entry per person even when mentioned twice", () => {
    const r = resolveMentions("@sara and @SARA and @saraahmed", people);
    expect(r.resolved.length).toBe(1);
    expect(r.unknown).toEqual([]);
  });

  it("separates known from unknown in one pass", () => {
    const r = resolveMentions("@sara @ghost @jane", people);
    expect(r.resolved.map((x) => x.user.id)).toEqual(["u1", "u2"]);
    expect(r.unknown).toEqual(["ghost"]);
  });
});

describe("rendering mentions", () => {
  it("splits a body into plain and mention segments", () => {
    const body = "hi @sara please";
    const segs = mentionSegments(body, parseMentions(body));
    expect(segs).toEqual([
      { text: "hi ", mention: false },
      { text: "@sara", mention: true },
      { text: " please", mention: false },
    ]);
    // The segments reassemble to the original, so nothing is lost in rendering.
    expect(segs.map((s) => s.text).join("")).toBe(body);
  });

  it("returns one plain segment when there is nothing to highlight", () => {
    expect(mentionSegments("plain", [])).toEqual([{ text: "plain", mention: false }]);
  });

  it("handles a mention at each end", () => {
    const body = "@sara ok @jane";
    const segs = mentionSegments(body, parseMentions(body));
    expect(segs[0]).toEqual({ text: "@sara", mention: true });
    expect(segs.at(-1)).toEqual({ text: "@jane", mention: true });
    expect(segs.map((s) => s.text).join("")).toBe(body);
  });
});

describe("mention autocomplete", () => {
  it("suggests everyone while the handle is empty", () => {
    expect(mentionSuggestions("hi @", 4, people).length).toBe(3);
  });

  it("narrows as the handle is typed", () => {
    expect(mentionSuggestions("hi @sar", 7, people).map((c) => c.id)).toEqual(["u1"]);
    expect(mentionSuggestions("hi @doe", 7, people).map((c) => c.id)).toEqual(["u2"]);
  });

  it("is case-insensitive and matches on id too", () => {
    expect(mentionSuggestions("@U1", 3, people).map((c) => c.id)).toEqual(["u1"]);
  });

  it("stops once the mention is finished", () => {
    // A space means the handle is done, or was never one.
    expect(mentionSuggestions("hi @sara there", 13, people)).toEqual([]);
  });

  it("says nothing when there is no @ before the caret", () => {
    expect(mentionSuggestions("no mention", 10, people)).toEqual([]);
  });

  it("caps the list rather than returning everyone", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `u${i}`, name: `Person ${i}` }));
    expect(mentionSuggestions("@", 1, many).length).toBe(6);
  });
});
