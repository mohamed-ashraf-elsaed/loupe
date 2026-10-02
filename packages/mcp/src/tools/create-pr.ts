/**
 * One pull request per repo, not one per comment.
 *
 * The alternative — a PR per fix — buries a reviewer in PRs that each change one
 * line. So a repo keeps a single **working branch**, each fix is a commit on it, and
 * the PR body carries a table of every fix with its commit. When that PR is merged or
 * closed, the next fix starts a fresh branch.
 *
 * The table is edited by inserting before a fixed sentinel rather than by regexing
 * the existing rows, so rows cannot be lost or reordered by a formatting change.
 */

import type { GitHubClient, FileChange, PullRequest } from "../github/github-client.ts";

/** The marker the table grows against. Never remove it — inserts anchor to it. */
export const FIXES_SENTINEL = "<!-- loupe:fixes -->";

export const PR_TITLE = "Feedback Fixes";

export interface FixRow {
  /** The thread this fix came from. */
  threadId: string;
  description: string;
  /** The commit that carries it, when known. */
  commit?: string;
}

/** A table cell that cannot break the table: pipes escaped, newlines flattened. */
export function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

export function fixRow(row: FixRow): string {
  const commit = row.commit ? `\`${row.commit.slice(0, 7)}\`` : "—";
  return `| \`${cell(row.threadId)}\` | ${cell(row.description)} | ${commit} |`;
}

const TABLE_HEADER = ["| Thread | Fix | Commit |", "| --- | --- | --- |"].join("\n");

/** The body a brand-new PR starts with. */
export function initialPrBody(opts: { rows?: FixRow[]; intro?: string } = {}): string {
  const rows = opts.rows ?? [];
  return [
    opts.intro ?? "Fixes from your team's feedback. Each row is one thread.",
    "",
    "## Fixes",
    "",
    TABLE_HEADER,
    ...rows.map(fixRow),
    "",
    FIXES_SENTINEL,
    "",
  ].join("\n");
}

/**
 * Add a row to an existing body.
 *
 * Inserts immediately before the sentinel. If the sentinel is missing — someone
 * edited the body by hand — it appends one rather than dropping the row on the floor.
 */
export function appendFixRow(body: string, row: FixRow, opts: { revisionNote?: string } = {}): string {
  const line = fixRow(row);
  const at = body.indexOf(FIXES_SENTINEL);
  const withNote = opts.revisionNote ? `${line}\n\n> ${opts.revisionNote}` : line;

  if (at < 0) {
    // No sentinel: rebuild the tail so the next insert has an anchor.
    return `${body.replace(/\s*$/, "")}\n\n${withNote}\n\n${FIXES_SENTINEL}\n`;
  }
  const before = body.slice(0, at);
  const after = body.slice(at);
  // Trim the blank line the header block leaves, so the insert sits in the table.
  return `${before.replace(/\s*$/, "")}\n${withNote}\n\n${after}`;
}

/** How many fixes a body currently lists — used to sanity-check a merge. */
export function countFixRows(body: string): number {
  const at = body.indexOf(FIXES_SENTINEL);
  const scope = at >= 0 ? body.slice(0, at) : body;
  return scope.split("\n").filter((l) => /^\|\s*`[^`]+`\s*\|/.test(l)).length;
}

export interface CreatePrDeps {
  github: GitHubClient;
  /** Server API base, e.g. http://localhost:8787 */
  apiBase: string;
  adminKey: string;
  projectKey: string;
  /** Inject for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export interface WorkingBranchRecord {
  repo: string;
  branch: string;
  baseBranch?: string;
  prNumber?: number;
  prUrl?: string;
  headSha?: string;
  status: "open" | "merged" | "closed" | "abandoned";
  fixCount: number;
}

export interface CreatePrArgs {
  repo: string;
  /** The thread the fix answers. */
  threadId: string;
  description: string;
  files: FileChange[];
  /** Base branch to branch from. Default "main". */
  baseBranch?: string;
  /** Override the branch name. */
  branchName?: string;
  /** Set for a revision: forces a `revision-*` branch and adds parent context. */
  revisionOf?: string;
}

/** The branch a fix belongs on. A revision never joins the accumulating branch. */
export function branchNameFor(args: Pick<CreatePrArgs, "branchName" | "revisionOf" | "threadId">): string {
  if (args.branchName) return args.branchName;
  if (args.revisionOf) return `revision-${args.revisionOf}`;
  return "loupe/fixes";
}

export interface CreatePrResult {
  outcome: "created" | "appended" | "restarted";
  repo: string;
  branch: string;
  commit: string;
  prNumber: number;
  prUrl: string;
  /** How many fixes the PR now lists. */
  fixCount: number;
  note: string;
}

export class CreatePrError extends Error {}

/**
 * Land a fix on the repo's working branch, creating the branch and PR when needed.
 *
 * Resolves to what happened — `created`, `appended` or `restarted` — so the caller can
 * report it plainly rather than assuming.
 */
export async function createPrForThread(deps: CreatePrDeps, args: CreatePrArgs): Promise<CreatePrResult> {
  const doFetch = deps.fetchImpl ?? fetch;
  if (!args.files.length) throw new CreatePrError("no file changes were given, so there is nothing to open a PR for");
  const base = args.baseBranch ?? "main";
  const branch = branchNameFor(args);

  const api = async (path: string, init?: RequestInit) => {
    const res = await doFetch(`${deps.apiBase.replace(/\/$/, "")}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", "X-Loupe-Admin": deps.adminKey, ...(init?.headers ?? {}) },
    });
    if (!res.ok) throw new CreatePrError(`${init?.method ?? "GET"} ${path} → ${res.status}`);
    return res.status === 204 ? null : res.json();
  };

  const existing = (await api(
    `/v1/working-branches?projectKey=${encodeURIComponent(deps.projectKey)}&repo=${encodeURIComponent(args.repo)}`,
  )) as WorkingBranchRecord[];
  const tracked = existing.find((b) => b.branch === branch) ?? null;

  // A revision always starts its own branch: it must not add to a PR a reviewer
  // already approved.
  let startFresh = tracked === null || !!args.revisionOf;
  let outcome: CreatePrResult["outcome"] = "created";

  if (tracked && !args.revisionOf) {
    const stillOpen = tracked.prNumber ? await deps.github.isPullRequestOpen(args.repo, tracked.prNumber) : false;
    if (stillOpen) {
      startFresh = false;
      outcome = "appended";
    } else {
      // Close the stale record before starting a new one, so the next caller does not
      // find it and try to append to a dead PR.
      await api("/v1/working-branches", {
        method: "POST",
        body: JSON.stringify({
          projectKey: deps.projectKey, repo: args.repo, branch,
          status: "merged", prNumber: tracked.prNumber,
        }),
      });
      // And actually start fresh. Setting the outcome alone left `startFresh` false,
      // so the fix was committed to the branch of a merged PR.
      startFresh = true;
      outcome = "restarted";
    }
  }

  const row: FixRow = { threadId: args.threadId, description: args.description };

  if (startFresh) {
    const commit = await deps.github.commitChanges(args.repo, branch, commitMessage(args, false), args.files, { base });
    row.commit = commit.sha;
    const intro = args.revisionOf
      ? `Revision of thread \`${args.revisionOf}\`. The conversation and the original element context carry over.`
      : undefined;
    const pr = await deps.github.createPullRequest(args.repo, {
      title: PR_TITLE,
      head: branch,
      base,
      body: initialPrBody({ rows: [row], intro }),
    });
    await api("/v1/working-branches", {
      method: "POST",
      body: JSON.stringify({
        projectKey: deps.projectKey, repo: args.repo, branch, baseBranch: base,
        status: "open", headSha: commit.sha, prNumber: pr.number, prUrl: pr.htmlUrl,
        addFix: true, description: args.description,
      }),
    });
    return {
      outcome, repo: args.repo, branch, commit: commit.sha,
      prNumber: pr.number, prUrl: pr.htmlUrl, fixCount: 1,
      note: `Opened ${pr.htmlUrl} on a new branch \`${branch}\` with this fix as its first commit.`,
    };
  }

  // Append to the PR that is already open.
  const commit = await deps.github.commitChanges(args.repo, branch, commitMessage(args, true), args.files);
  row.commit = commit.sha;
  const pr: PullRequest = await deps.github.getPullRequest(args.repo, tracked!.prNumber!);
  const body = appendFixRow(
    pr.body,
    row,
    args.revisionOf ? { revisionNote: `Revision of thread \`${args.revisionOf}\`.` } : {},
  );
  await deps.github.updatePullRequestBody(args.repo, pr.number, body);

  const record = await api("/v1/working-branches", {
    method: "POST",
    body: JSON.stringify({
      projectKey: deps.projectKey, repo: args.repo, branch,
      status: "open", headSha: commit.sha, addFix: true, description: args.description,
    }),
  }) as WorkingBranchRecord;

  return {
    outcome, repo: args.repo, branch, commit: commit.sha,
    prNumber: pr.number, prUrl: pr.htmlUrl,
    fixCount: countFixRows(body) || record.fixCount,
    note: `Appended this fix to ${pr.htmlUrl} as commit \`${commit.sha.slice(0, 7)}\` — one PR, now ${countFixRows(body) || record.fixCount} fix${(countFixRows(body) || record.fixCount) === 1 ? "" : "es"}.`,
  };
}

function commitMessage(args: CreatePrArgs, appending: boolean): string {
  const verb = appending ? "fix" : "feat";
  const scope = args.repo.split("/")[1] ?? "app";
  return `${verb}(${scope}): ${args.description}\n\nAddresses feedback thread ${args.threadId}.`;
}
