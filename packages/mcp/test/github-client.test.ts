import { describe, expect, it, vi } from "vitest";
import {
  GitHubClient, GitHubError, isPlaceholderToken, resolveGitHubToken,
} from "../src/github/github-client.ts";

const TOKEN = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";

/** A fetch double that records every call and replies from a route table. */
function mockFetch(routes: Record<string, (body: any, call: { method: string; url: string }) => any>) {
  const calls: { method: string; url: string; body: any }[] = [];
  const impl = (async (url: string, init: any = {}) => {
    const method = init.method ?? "GET";
    const parsed = url.replace("https://api.github.com", "");
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, url: parsed, body });
    const route = Object.entries(routes).find(([key]) => {
      const [m, path] = key.split(" ");
      return m === method && parsed.split("?")[0]!.startsWith(path!);
    });
    if (!route) return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
    const out = route[1](body, { method, url: parsed });
    if (out instanceof Response) return out;
    const status = out?.__status ?? 200;
    const payload = out?.__status ? out.body : out;
    return new Response(JSON.stringify(payload), { status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("placeholder tokens", () => {
  it("rejects the things people copy out of a README", () => {
    for (const bad of [
      undefined, null, "", "   ", "<your token>", "<GITHUB_TOKEN>",
      "your token", "your-token-here", "YOUR_GITHUB_PAT", "my token",
      "xxxxxxxxxxxx", "xxxxxxxxxxxxxxxxxxxxxxxx", "....................",
      "change me", "changeme", "placeholder-token-value", "todo",
      "ghp_...", "ghp_abcdefghij...", "short",
    ]) {
      expect(isPlaceholderToken(bad as any), String(bad)).toBe(true);
    }
  });

  it("accepts a real-looking token", () => {
    expect(isPlaceholderToken(TOKEN)).toBe(false);
    expect(isPlaceholderToken("github_pat_11ABCDEFG0abcdefghijklmnop")).toBe(false);
  });
});

describe("token resolution", () => {
  it("prefers the environment", () => {
    const r = resolveGitHubToken({ env: { GITHUB_TOKEN: TOKEN } as any, readGhToken: () => "gho_other" });
    expect(r).toMatchObject({ token: TOKEN, source: "env" });
  });

  it("falls back to the gh CLI", () => {
    const r = resolveGitHubToken({ env: {} as any, readGhToken: () => "gho_fromcli0123456789abcd" });
    expect(r).toMatchObject({ token: "gho_fromcli0123456789abcd", source: "gh-cli" });
  });

  it("ignores a placeholder and says so, without leaking it", () => {
    const r = resolveGitHubToken({ env: { GITHUB_TOKEN: "<your token>" } as any, readGhToken: () => null });
    expect(r.token).toBeNull();
    expect(r.message).toContain("placeholder");
    expect(r.message).not.toContain("<your token>");
  });

  it("explains what to do when there is no token at all", () => {
    const r = resolveGitHubToken({ env: {} as any, readGhToken: () => null });
    expect(r).toMatchObject({ token: null, source: "none" });
    expect(r.message).toContain("GITHUB_TOKEN");
    expect(r.message).toContain("gh auth login");
    // The point of the message: the agent should know this is not fatal.
    expect(r.message).toContain("still recorded");
  });

  it("refuses to construct a client with a placeholder", () => {
    expect(() => new GitHubClient("<your token>")).toThrow(GitHubError);
  });
});

describe("committing", () => {
  const files = [
    { path: "src/a.ts", content: "export const a = 1;\n" },
    { path: "src/b.ts", content: "export const b = 2;\n" },
    { path: "src/c.ts", content: "export const c = 3;\n" },
  ];

  it("lands three files as exactly one commit, in the documented order", async () => {
    const { impl, calls } = mockFetch({
      "GET /repos/acme/web/git/ref/heads/feature": () => ({ object: { sha: "parent-sha" } }),
      "GET /repos/acme/web/git/commits/parent-sha": () => ({ tree: { sha: "base-tree" } }),
      "POST /repos/acme/web/git/blobs": (body) => ({ sha: `blob-${body.content.trim().slice(-2)}` }),
      "POST /repos/acme/web/git/trees": () => ({ sha: "new-tree" }),
      "POST /repos/acme/web/git/commits": () => ({ sha: "commit-sha" }),
      "PATCH /repos/acme/web/git/refs/heads/feature": () => ({ object: { sha: "commit-sha" } }),
    });
    const gh = new GitHubClient(TOKEN, { fetchImpl: impl });

    const result = await gh.commitChanges("acme/web", "feature", "fix: the CTA", files);

    expect(result).toEqual({ sha: "commit-sha", created: false, files: 3 });
    // One commit, three blobs — that is the whole point.
    expect(calls.filter((c) => c.method === "POST" && c.url.endsWith("/git/commits")).length).toBe(1);
    expect(calls.filter((c) => c.url.endsWith("/git/blobs")).length).toBe(3);
    // The ref is updated, never force-created, on an existing branch.
    expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/git/refs"))).toBe(false);

    const order = calls.map((c) => `${c.method} ${c.url}`);
    expect(order[0]).toContain("/git/ref/heads/feature");
    expect(order.at(-1)).toBe("PATCH /repos/acme/web/git/refs/heads/feature");

    const tree = calls.find((c) => c.url.endsWith("/git/trees"))!.body;
    expect(tree.base_tree).toBe("base-tree");
    expect(tree.tree.map((t: any) => t.path)).toEqual(["src/a.ts", "src/b.ts", "src/c.ts"]);
    const commit = calls.find((c) => c.url.endsWith("/git/commits"))!.body;
    expect(commit.parents).toEqual(["parent-sha"]);
    expect(commit.message).toBe("fix: the CTA");
  });

  it("creates the branch from its base when it does not exist yet", async () => {
    const { impl, calls } = mockFetch({
      "GET /repos/acme/web/git/ref/heads/feature": () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
      "GET /repos/acme/web/git/ref/heads/main": () => ({ object: { sha: "main-sha" } }),
      "POST /repos/acme/web/git/refs": () => ({ ref: "refs/heads/feature" }),
      "GET /repos/acme/web/git/commits/main-sha": () => ({ tree: { sha: "main-tree" } }),
      "POST /repos/acme/web/git/blobs": () => ({ sha: "blob" }),
      "POST /repos/acme/web/git/trees": () => ({ sha: "tree" }),
      "POST /repos/acme/web/git/commits": () => ({ sha: "commit" }),
      "PATCH /repos/acme/web/git/refs/heads/feature": () => ({}),
    });
    const gh = new GitHubClient(TOKEN, { fetchImpl: impl });

    const result = await gh.commitChanges("acme/web", "feature", "fix", files.slice(0, 1), { base: "main" });
    expect(result.created).toBe(true);
    const created = calls.find((c) => c.url.endsWith("/git/refs"))!;
    expect(created.body).toEqual({ ref: "refs/heads/feature", sha: "main-sha" });
  });

  it("refuses an empty change set rather than creating an empty commit", async () => {
    const { impl } = mockFetch({});
    const gh = new GitHubClient(TOKEN, { fetchImpl: impl });
    await expect(gh.commitChanges("acme/web", "feature", "nothing", [])).rejects.toThrow(/no file changes/);
  });

  it("refuses to invent a branch with no base", async () => {
    const { impl } = mockFetch({
      "GET /repos/acme/web/git/ref/heads/feature": () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
    });
    const gh = new GitHubClient(TOKEN, { fetchImpl: impl });
    await expect(gh.commitChanges("acme/web", "feature", "x", files)).rejects.toThrow(/no base was given/);
  });

  it("reports a branch as absent on a 404, and rethrows anything else", async () => {
    const { impl } = mockFetch({
      "GET /repos/acme/web/git/ref/heads/gone": () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
      "GET /repos/acme/web/git/ref/heads/boom": () => new Response(JSON.stringify({ message: "Server Error" }), { status: 500 }),
    });
    const gh = new GitHubClient(TOKEN, { fetchImpl: impl });
    expect(await gh.branchExists("acme/web", "gone")).toBe(false);
    await expect(gh.branchExists("acme/web", "boom")).rejects.toThrow(GitHubError);
  });
});

describe("pull requests", () => {
  const pr = (over: any = {}) => ({
    number: 412, url: "https://api.github.com/repos/acme/web/pulls/412",
    html_url: "https://github.com/acme/web/pull/412", state: "open",
    head: { ref: "loupe/fixes" }, base: { ref: "main" }, title: "Fixes", body: "body", ...over,
  });

  it("creates one and normalises the response", async () => {
    const { impl, calls } = mockFetch({ "POST /repos/acme/web/pulls": () => pr() });
    const gh = new GitHubClient(TOKEN, { fetchImpl: impl });
    const out = await gh.createPullRequest("acme/web", { title: "Fixes", head: "loupe/fixes", base: "main", body: "body" });
    expect(out).toMatchObject({ number: 412, htmlUrl: "https://github.com/acme/web/pull/412", state: "open", head: "loupe/fixes" });
    expect(calls[0]!.body).toMatchObject({ head: "loupe/fixes", base: "main", draft: false });
  });

  it("reads and appends to a body", async () => {
    const { impl, calls } = mockFetch({ "GET /repos/acme/web/pulls/412": () => pr(), "PATCH /repos/acme/web/pulls/412": () => pr() });
    const gh = new GitHubClient(TOKEN, { fetchImpl: impl });
    expect(await gh.getPullRequestBody("acme/web", 412)).toBe("body");
    await gh.updatePullRequestBody("acme/web", 412, "body\n- another fix");
    expect(calls.at(-1)!.body).toEqual({ body: "body\n- another fix" });
  });

  it("knows whether a PR is still open", async () => {
    const open = mockFetch({ "GET /repos/acme/web/pulls/1": () => pr() });
    expect(await new GitHubClient(TOKEN, { fetchImpl: open.impl }).isPullRequestOpen("acme/web", 1)).toBe(true);
    const merged = mockFetch({ "GET /repos/acme/web/pulls/1": () => pr({ state: "closed" }) });
    expect(await new GitHubClient(TOKEN, { fetchImpl: merged.impl }).isPullRequestOpen("acme/web", 1)).toBe(false);
  });

  it("finds an open PR for a branch, and returns null when there is none", async () => {
    const found = mockFetch({ "GET /repos/acme/web/pulls": () => [pr()] });
    const none = mockFetch({ "GET /repos/acme/web/pulls": () => [] });
    expect((await new GitHubClient(TOKEN, { fetchImpl: found.impl }).findOpenPullRequest("acme/web", "loupe/fixes"))!.number).toBe(412);
    expect(await new GitHubClient(TOKEN, { fetchImpl: none.impl }).findOpenPullRequest("acme/web", "loupe/fixes")).toBeNull();
    // The head filter is namespaced by owner, which is what the API requires.
    expect(found.calls[0]!.url).toContain("head=acme%3Aloupe%2Ffixes");
  });
});

describe("keeping the token out of sight", () => {
  it("redacts the token from an error message", async () => {
    // GitHub echoes the request back on some errors; make sure we scrub it.
    const { impl } = mockFetch({
      "POST /repos/acme/web/pulls": () => new Response(JSON.stringify({ message: `Bad credentials for ${TOKEN}` }), { status: 401 }),
    });
    const gh = new GitHubClient(TOKEN, { fetchImpl: impl });
    await expect(gh.createPullRequest("acme/web", { title: "t", head: "h", base: "b" })).rejects.toThrow(/\[redacted\]/);
    try {
      await gh.createPullRequest("acme/web", { title: "t", head: "h", base: "b" });
    } catch (e) {
      expect((e as Error).message).not.toContain(TOKEN);
      expect((e as GitHubError).status).toBe(401);
    }
  });

  it("sends the token only in the Authorization header", async () => {
    const seen: any[] = [];
    const impl = (async (url: string, init: any) => {
      seen.push({ url, headers: init.headers });
      return new Response(JSON.stringify(pr()), { status: 200 });
    }) as unknown as typeof fetch;
    await new GitHubClient(TOKEN, { fetchImpl: impl }).getPullRequest("acme/web", 1);
    expect(seen[0].headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(seen[0].url).not.toContain(TOKEN);
    // A User-Agent is mandatory; GitHub 403s without one.
    expect(seen[0].headers["User-Agent"]).toContain("loupe");
  });
});

function pr(over: any = {}) {
  return {
    number: 412, url: "u", html_url: "h", state: "open",
    head: { ref: "loupe/fixes" }, base: { ref: "main" }, title: "t", body: "b", ...over,
  };
}
