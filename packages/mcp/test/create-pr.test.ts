import { describe, expect, it, vi } from "vitest";
import {
  FIXES_SENTINEL, appendFixRow, branchNameFor, countFixRows, createPrForThread, fixRow,
  initialPrBody, PR_TITLE, CreatePrError,
} from "../src/tools/create-pr.ts";
import type { GitHubClient } from "../src/github/github-client.ts";
import type { Comment } from "@loupekit/shared";

const row = (id: string, description = "a fix", commit = "abcdef1234567") => ({ threadId: id, description, commit });

describe("the fixes table", () => {
  it("starts with a header and the sentinel", () => {
    const body = initialPrBody({ rows: [row("t1")] });
    expect(body).toContain("| Thread | Fix | Commit |");
    expect(body).toContain("`t1`");
    expect(body).toContain("`abcdef1`");
    expect(body).toContain(FIXES_SENTINEL);
    // The sentinel is the insert anchor; it must be its own line.
    expect(body.split("\n")).toContain(FIXES_SENTINEL);
  });

  it("inserts a row before the sentinel, not after", () => {
    let body = initialPrBody({ rows: [row("t1")] });
    body = appendFixRow(body, row("t2", "the second fix"));
    const lines = body.split("\n");
    expect(lines.indexOf(FIXES_SENTINEL)).toBeGreaterThan(lines.findIndex((l) => l.includes("`t2`")));
    expect(countFixRows(body)).toBe(2);
  });

  it("keeps appending in order", () => {
    let body = initialPrBody({ rows: [row("t1")] });
    for (const id of ["t2", "t3", "t4"]) body = appendFixRow(body, row(id));
    expect(countFixRows(body)).toBe(4);
    // Newest last, so the table reads as a history.
    const order = ["t1", "t2", "t3", "t4"].map((id) => body.indexOf(`\`${id}\``));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("re-anchors when someone deleted the sentinel by hand", () => {
    const body = appendFixRow("A hand-written PR body.", row("t1"));
    expect(body).toContain("`t1`");
    expect(body).toContain(FIXES_SENTINEL);
    // …and the next insert works, because the anchor is back.
    expect(countFixRows(appendFixRow(body, row("t2")))).toBe(2);
  });

  it("escapes a description that would break the table", () => {
    const line = fixRow({ threadId: "t1", description: "a | b\nc", commit: "abc" });
    // The pipe is escaped, which is what Markdown needs; a raw one would split the cell.
    expect(line).toContain("a \\| b c");
    expect(line).not.toContain("a | b");
    expect(line).not.toContain("\n");
    // Count the *unescaped* pipes: they are what the table splits on.
    const cellBreaks = line.split("").filter((ch, i) => ch === "|" && line[i - 1] !== "\\").length;
    expect(cellBreaks).toBe(4);
  });

  it("shows a dash for a fix with no commit yet", () => {
    expect(fixRow({ threadId: "t1", description: "pending" })).toContain("| — |");
  });

  it("counts only table rows, not prose", () => {
    expect(countFixRows(initialPrBody())).toBe(0);
    expect(countFixRows("no table here")).toBe(0);
  });
});

describe("which branch a fix belongs on", () => {
  it("accumulates on one branch per repo", () => {
    expect(branchNameFor({ threadId: "t1" })).toBe("loupe/fixes");
    expect(branchNameFor({ threadId: "t2" })).toBe("loupe/fixes");
  });

  it("gives a revision its own branch — it must not join an approved PR", () => {
    expect(branchNameFor({ threadId: "t3", revisionOf: "t1" })).toBe("revision-t1");
  });

  it("honours an explicit override", () => {
    expect(branchNameFor({ threadId: "t1", branchName: "custom" })).toBe("custom");
    expect(branchNameFor({ threadId: "t1", branchName: "custom", revisionOf: "t9" })).toBe("custom");
  });
});

// ---- the flow ---------------------------------------------------------------

interface FetchCall { method: string; path: string; body: any }

function harness(opts: {
  branches?: any[];
  prOpen?: boolean;
  prBody?: string;
  createPrNumber?: number;
} = {}) {
  const calls: FetchCall[] = [];
  const branches = opts.branches ? [...opts.branches] : [];
  const github = {
    isPullRequestOpen: vi.fn(async () => opts.prOpen ?? true),
    commitChanges: vi.fn(async () => ({ sha: "c0ffee1234567", created: false, files: 1 })),
    createPullRequest: vi.fn(async () => ({
      number: opts.createPrNumber ?? 500, url: "u", htmlUrl: "https://github.com/acme/web/pull/500",
      state: "open", head: "loupe/fixes", base: "main", title: PR_TITLE, body: "",
    })),
    getPullRequest: vi.fn(async () => ({
      number: 412, url: "u", htmlUrl: "https://github.com/acme/web/pull/412", state: "open",
      head: "loupe/fixes", base: "main", title: PR_TITLE, body: opts.prBody ?? initialPrBody({ rows: [row("t1")] }),
    })),
    updatePullRequestBody: vi.fn(async () => undefined),
  } as unknown as GitHubClient;

  const fetchImpl = (async (url: string, init: any = {}) => {
    const path = url.replace("http://api.test", "");
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method: init.method ?? "GET", path, body });
    if (path.startsWith("/v1/working-branches") && (init.method ?? "GET") === "GET") {
      return new Response(JSON.stringify(branches), { status: 200 });
    }
    if (path === "/v1/working-branches" && init.method === "POST") {
      branches.push({ ...body, fixCount: (branches.find((b) => b.branch === body.branch)?.fixCount ?? 0) + (body.addFix ? 1 : 0) });
      return new Response(JSON.stringify(branches.at(-1)), { status: 201 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  }) as unknown as typeof fetch;

  return {
    github, calls, branches,
    deps: { github, apiBase: "http://api.test", adminKey: "k", projectKey: "pk", fetchImpl },
  };
}

const args = { repo: "acme/web", threadId: "t1", description: "larger CTA", files: [{ path: "a.ts", content: "x" }] };

describe("create_pr_for_thread", () => {
  it("opens one branch and one PR for the first fix", async () => {
    const h = harness();
    const out = await createPrForThread(h.deps, args);

    expect(out.outcome).toBe("created");
    expect(out.prNumber).toBe(500);
    expect(out.branch).toBe("loupe/fixes");
    expect(out.fixCount).toBe(1);
    expect(h.github.createPullRequest).toHaveBeenCalledTimes(1);
    expect((h.github.createPullRequest as any).mock.calls[0][1].title).toBe(PR_TITLE);
    // Registered with the server, counting the fix.
    const post = h.calls.find((c) => c.method === "POST")!;
    expect(post.body).toMatchObject({ repo: "acme/web", branch: "loupe/fixes", addFix: true, status: "open", prNumber: 500 });
  });

  it("appends to the SAME PR for a second fix, on the same branch", async () => {
    const h = harness({
      branches: [{ repo: "acme/web", branch: "loupe/fixes", prNumber: 412, prUrl: "https://github.com/acme/web/pull/412", status: "open", fixCount: 1 }],
      prOpen: true,
    });
    const out = await createPrForThread(h.deps, { ...args, threadId: "t2", description: "the second fix" });

    expect(out.outcome).toBe("appended");
    expect(out.prNumber).toBe(412);
    expect(out.fixCount).toBe(2);
    // No new PR, no branch creation — one commit and a body edit.
    expect(h.github.createPullRequest).not.toHaveBeenCalled();
    expect(h.github.commitChanges).toHaveBeenCalledTimes(1);
    const body = (h.github.updatePullRequestBody as any).mock.calls[0][2] as string;
    expect(body).toContain("`t2`");
    expect(body).toContain("the second fix");
    expect(countFixRows(body)).toBe(2);
  });

  it("starts a fresh branch when the tracked PR is no longer open", async () => {
    const h = harness({
      branches: [{ repo: "acme/web", branch: "loupe/fixes", prNumber: 412, status: "open", fixCount: 3 }],
      prOpen: false,
    });
    const out = await createPrForThread(h.deps, { ...args, threadId: "t9" });

    expect(out.outcome).toBe("restarted");
    expect(h.github.createPullRequest).toHaveBeenCalledTimes(1);
    // The stale record is closed before the new one is written, or the next caller
    // would find it and try to append to a dead PR.
    const closed = h.calls.find((c) => c.method === "POST" && c.body.status === "merged")!;
    expect(closed.body).toMatchObject({ branch: "loupe/fixes", prNumber: 412 });
    const opened = h.calls.find((c) => c.method === "POST" && c.body.status === "open")!;
    expect(opened.body.prNumber).toBe(500);
  });

  it("gives a revision its own branch with parent context", async () => {
    const h = harness({
      branches: [{ repo: "acme/web", branch: "loupe/fixes", prNumber: 412, status: "open", fixCount: 2 }],
      prOpen: true,
    });
    const out = await createPrForThread(h.deps, { ...args, threadId: "t3", revisionOf: "t1" });

    // Ignored the open PR on purpose: a revision must not join a PR already approved.
    expect(out.outcome).toBe("created");
    expect(out.branch).toBe("revision-t1");
    expect(h.github.isPullRequestOpen).not.toHaveBeenCalled();
    const body = (h.github.createPullRequest as any).mock.calls[0][1].body as string;
    expect(body).toContain("Revision of thread `t1`");
  });

  it("refuses an empty change set rather than opening an empty PR", async () => {
    const h = harness();
    await expect(createPrForThread(h.deps, { ...args, files: [] })).rejects.toThrow(CreatePrError);
    expect(h.github.createPullRequest).not.toHaveBeenCalled();
  });

  it("says what happened, so the caller does not have to assume", async () => {
    const h = harness();
    const out = await createPrForThread(h.deps, args);
    expect(out.note).toContain("new branch");
    const h2 = harness({
      branches: [{ repo: "acme/web", branch: "loupe/fixes", prNumber: 412, prUrl: "u", status: "open", fixCount: 1 }],
    });
    const out2 = await createPrForThread(h2.deps, args);
    expect(out2.note).toContain("one PR");
    expect(out2.note).toContain("2 fixes");
  });

  it("writes a commit message that names the thread", async () => {
    const h = harness();
    await createPrForThread(h.deps, args);
    const message = (h.github.commitChanges as any).mock.calls[0][2] as string;
    expect(message).toContain("larger CTA");
    expect(message).toContain("thread t1");
  });
});
