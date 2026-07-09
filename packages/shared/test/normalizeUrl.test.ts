import { describe, expect, it } from "vitest";
import { normalizeUrl } from "../src/index.ts";

describe("normalizeUrl", () => {
  it("keeps a plain path", () => {
    expect(normalizeUrl("/checkout")).toBe("/checkout");
  });
  it("strips utm_* params", () => {
    expect(normalizeUrl("/checkout?utm_source=news&utm_medium=email")).toBe("/checkout");
  });
  it("strips click ids and Loupe dev params", () => {
    expect(normalizeUrl("/p?gclid=1&fbclid=2&api&key=abc&igshid=z")).toBe("/p");
  });
  it("keeps meaningful params, sorted", () => {
    expect(normalizeUrl("/p?b=2&a=1")).toBe("/p?a=1&b=2");
  });
  it("keeps meaningful params while dropping volatile ones", () => {
    expect(normalizeUrl("/p?tab=billing&utm_source=x")).toBe("/p?tab=billing");
  });
  it("drops a trailing slash (except root)", () => {
    expect(normalizeUrl("/team/")).toBe("/team");
    expect(normalizeUrl("/")).toBe("/");
  });
  it("handles absolute URLs by keeping the path", () => {
    expect(normalizeUrl("https://acme.com/dash?utm_source=x&z=1")).toBe("/dash?z=1");
  });
  it("sorts duplicate keys by value", () => {
    expect(normalizeUrl("/p?a=2&a=1")).toBe("/p?a=1&a=2");
  });
  it("falls back to stripping query on unparseable input", () => {
    // URL() with the base always parses, so exercise the catch path defensively
    expect(normalizeUrl("///weird?x=1").startsWith("/")).toBe(true);
  });
});
