import { describe, expect, it } from "vitest";
import {
  expandPreviewTemplate, githubPagesPreviewUrl, matchRepoUrl, matchUrlPattern,
} from "../src/preview.ts";

describe("url pattern matching", () => {
  it("matches an exact url, ignoring a trailing slash", () => {
    expect(matchUrlPattern("https://acme.test/checkout", "https://acme.test/checkout")).toBe(true);
    expect(matchUrlPattern("https://acme.test/checkout/", "https://acme.test/checkout")).toBe(true);
    expect(matchUrlPattern("https://acme.test/a", "https://acme.test/b")).toBe(false);
  });

  it("keeps * inside one segment and lets ** span them", () => {
    const one = "https://acme.test/*";
    expect(matchUrlPattern(one, "https://acme.test/checkout")).toBe(true);
    expect(matchUrlPattern(one, "https://acme.test/checkout/success")).toBe(false);

    const many = "https://acme.test/**";
    expect(matchUrlPattern(many, "https://acme.test/checkout")).toBe(true);
    expect(matchUrlPattern(many, "https://acme.test/a/b/c?q=1")).toBe(true);
    expect(matchUrlPattern(many, "https://other.test/a")).toBe(false);
  });

  it("handles a bare host and a * inside a segment", () => {
    expect(matchUrlPattern("https://acme.test/**", "https://acme.test")).toBe(true);
    expect(matchUrlPattern("https://acme.test/pr-*", "https://acme.test/pr-412")).toBe(true);
    expect(matchUrlPattern("https://acme.test/pr-*", "https://acme.test/pr-412/x")).toBe(false);
  });

  it("treats a single ? as one character, not a wildcard", () => {
    expect(matchUrlPattern("https://acme.test/p?", "https://acme.test/px")).toBe(true);
    expect(matchUrlPattern("https://acme.test/p?", "https://acme.test/pxy")).toBe(false);
  });

  it("does not let regex metacharacters in a pattern misbehave", () => {
    // A hostname's dots must be literal, or `acmeXtest` would match.
    expect(matchUrlPattern("https://acme.test/**", "https://acmeXtest/a")).toBe(false);
    expect(matchUrlPattern("https://acme.test/a+b", "https://acme.test/a+b")).toBe(true);
    expect(matchUrlPattern("https://acme.test/a+b", "https://acme.test/aab")).toBe(false);
  });

  it("refuses empty input rather than matching everything", () => {
    expect(matchUrlPattern("", "https://acme.test")).toBe(false);
    expect(matchUrlPattern("https://acme.test", "")).toBe(false);
    expect(matchUrlPattern("   ", "https://acme.test")).toBe(false);
  });
});

describe("expanding a template", () => {
  it("fills the placeholders it has", () => {
    expect(expandPreviewTemplate("https://{owner}.preview.test/{name}/{branch}", {
      owner: "acme", name: "web", branch: "loupe/fixes",
    })).toBe("https://acme.preview.test/web/loupe/fixes");
    expect(expandPreviewTemplate("https://x.test/pr-{pr}/", { pr: 412 })).toBe("https://x.test/pr-412/");
  });

  it("returns null rather than a half-substituted URL", () => {
    // The failure this prevents: "https://undefined.github.io/..." looks like a URL.
    expect(expandPreviewTemplate("https://{owner}.test/{branch}", { owner: "acme" })).toBeNull();
    expect(expandPreviewTemplate("https://x.test/pr-{pr}/", {})).toBeNull();
    expect(expandPreviewTemplate("https://x.test/pr-{pr}/", { pr: "" })).toBeNull();
  });

  it("rejects an unknown placeholder", () => {
    expect(expandPreviewTemplate("https://x.test/{nonsense}/", { owner: "acme" })).toBeNull();
  });

  it("passes through a template with no placeholders", () => {
    expect(expandPreviewTemplate("https://acme.test/**", {})).toBe("https://acme.test/**");
    expect(expandPreviewTemplate("", {})).toBeNull();
  });
});

describe("the github pages convention", () => {
  it("builds the pr-preview URL", () => {
    expect(githubPagesPreviewUrl("acme/web", 412)).toBe("https://acme.github.io/web/pr-preview/pr-412/");
  });

  it("knows the organisation site has no repository prefix", () => {
    expect(githubPagesPreviewUrl("acme/acme.github.io", 7)).toBe("https://acme.github.io/pr-preview/pr-7/");
  });

  it("refuses to build one without a repo or a PR", () => {
    expect(githubPagesPreviewUrl("", 7)).toBeNull();
    expect(githubPagesPreviewUrl("acme/web", undefined)).toBeNull();
    expect(githubPagesPreviewUrl("not-a-repo", 7)).toBeNull();
  });
});

describe("matching a repo url to its environment", () => {
  const patterns = [
    { repo: "acme/web", environment: "staging", pattern: "https://staging.acme.test/**" },
    { repo: "acme/web", environment: "production", pattern: "https://acme.test/**" },
  ];

  it("reports which environment a URL belongs to", () => {
    expect(matchRepoUrl(patterns, "https://staging.acme.test/checkout")?.environment).toBe("staging");
    expect(matchRepoUrl(patterns, "https://acme.test/checkout")?.environment).toBe("production");
  });

  it("returns null for a URL nothing recognises", () => {
    expect(matchRepoUrl(patterns, "https://local.test/checkout")).toBeNull();
    expect(matchRepoUrl([], "https://acme.test/")).toBeNull();
  });
});
