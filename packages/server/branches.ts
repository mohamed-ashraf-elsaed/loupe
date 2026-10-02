/**
 * Working branches and preview URLs.
 *
 * The accumulating-PR model needs state the comment table cannot hold: which branch
 * is live for a repo, how many fixes it carries, which PR it belongs to, and whether
 * a deployment is up yet.
 *
 * The preview half answers a question agents get wrong: *is there a preview yet?*
 * A URL is matched or probed, never guessed — "not ready" is a real answer and a
 * useful one.
 */

import { db } from "./db.ts";
import { githubPagesPreviewUrl, expandPreviewTemplate, type RepoUrlPattern } from "@loupekit/shared";

export interface WorkingBranch {
  id: string;
  projectKey: string;
  repo: string;
  branch: string;
  baseBranch: string;
  status: "open" | "merged" | "closed" | "abandoned";
  headSha?: string;
  prNumber?: number;
  prUrl?: string;
  previewUrl?: string;
  /** How many fixes this branch accumulates — the whole point of one branch. */
  fixCount: number;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

const key = (projectKey: string, repo: string, branch: string) => `${projectKey}:${repo}:${branch}`;

function rowToBranch(r: any): WorkingBranch {
  return {
    id: r.id,
    projectKey: r.project_key,
    repo: r.repo,
    branch: r.branch,
    baseBranch: r.base_branch,
    status: r.status,
    headSha: r.head_sha ?? undefined,
    prNumber: r.pr_number ?? undefined,
    prUrl: r.pr_url ?? undefined,
    previewUrl: r.preview_url ?? undefined,
    fixCount: Number(r.fix_count ?? 0),
    description: r.description ?? undefined,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

export interface UpsertWorkingBranch {
  projectKey: string;
  repo: string;
  branch: string;
  baseBranch?: string;
  status?: WorkingBranch["status"];
  headSha?: string;
  prNumber?: number;
  prUrl?: string;
  previewUrl?: string;
  /** Increment the fix count — a fix just landed on this branch. */
  addFix?: boolean;
  description?: string;
}

/**
 * Create or update the working branch for a repo+branch.
 *
 * `addFix` increments rather than sets: the count is a running total, and two fixes
 * landing in the same second must not overwrite each other down to one.
 */
export async function upsertWorkingBranch(input: UpsertWorkingBranch): Promise<WorkingBranch> {
  const d = await db();
  const id = key(input.projectKey, input.repo, input.branch);
  const { rows } = await d.query(
    // `status` is NOT NULL, so the insert defaults it — but the conflict clause reads
    // the raw nullable parameter, not EXCLUDED: a plain update must not reset a
    // merged branch back to "open".
    `INSERT INTO working_branches
       (id, project_key, repo, branch, base_branch, status, head_sha, pr_number, pr_url, preview_url, fix_count, description, updated_at)
     VALUES ($1,$2,$3,$4,$5, COALESCE($6, 'open'), $7,$8,$9,$10,$11,$12, now())
     ON CONFLICT (id) DO UPDATE SET
       base_branch = COALESCE(EXCLUDED.base_branch, working_branches.base_branch),
       status = COALESCE($6, working_branches.status),
       head_sha = COALESCE(EXCLUDED.head_sha, working_branches.head_sha),
       pr_number = COALESCE(EXCLUDED.pr_number, working_branches.pr_number),
       pr_url = COALESCE(EXCLUDED.pr_url, working_branches.pr_url),
       preview_url = COALESCE(EXCLUDED.preview_url, working_branches.preview_url),
       description = COALESCE(EXCLUDED.description, working_branches.description),
       fix_count = working_branches.fix_count + $13,
       updated_at = now()
     RETURNING *`,
    [
      id, input.projectKey, input.repo, input.branch,
      input.baseBranch ?? null, input.status ?? null,
      input.headSha ?? null, input.prNumber ?? null, input.prUrl ?? null, input.previewUrl ?? null,
      input.addFix ? 1 : 0, input.description ?? null,
      input.addFix ? 1 : 0,
    ],
  );
  return rowToBranch(rows[0]);
}

export async function getWorkingBranch(projectKey: string, repo: string, branch: string): Promise<WorkingBranch | null> {
  const d = await db();
  const { rows } = await d.query("SELECT * FROM working_branches WHERE id = $1", [key(projectKey, repo, branch)]);
  return rows[0] ? rowToBranch(rows[0]) : null;
}

export async function listWorkingBranches(projectKey: string, repo?: string): Promise<WorkingBranch[]> {
  const d = await db();
  const { rows } = repo
    ? await d.query("SELECT * FROM working_branches WHERE project_key = $1 AND repo = $2 ORDER BY updated_at DESC", [projectKey, repo])
    : await d.query("SELECT * FROM working_branches WHERE project_key = $1 ORDER BY updated_at DESC", [projectKey]);
  return rows.map(rowToBranch);
}

export async function deleteWorkingBranch(projectKey: string, repo: string, branch: string): Promise<boolean> {
  const d = await db();
  // RETURNING, not rowCount: the embedded driver does not populate rowCount, so a
  // successful delete would look like a miss. (`store.removeComment` does the same.)
  const { rows } = await d.query("DELETE FROM working_branches WHERE id = $1 RETURNING id", [key(projectKey, repo, branch)]);
  return rows.length > 0;
}

// ---- repo url patterns ------------------------------------------------------

export interface RepoUrl extends RepoUrlPattern {
  id: string;
  projectKey: string;
}

function rowToRepoUrl(r: any): RepoUrl {
  return { id: r.id, projectKey: r.project_key, repo: r.repo, environment: r.environment, pattern: r.pattern };
}

export async function addRepoUrl(input: { projectKey: string; repo: string; environment: string; pattern: string }): Promise<RepoUrl> {
  const d = await db();
  const id = `${input.projectKey}:${input.repo}:${input.environment}`;
  const { rows } = await d.query(
    `INSERT INTO repo_urls (id, project_key, repo, environment, pattern, created_at)
     VALUES ($1,$2,$3,$4,$5, now())
     ON CONFLICT (id) DO UPDATE SET pattern = EXCLUDED.pattern
     RETURNING *`,
    [id, input.projectKey, input.repo, input.environment, input.pattern],
  );
  return rowToRepoUrl(rows[0]);
}

export async function listRepoUrls(projectKey: string, repo?: string): Promise<RepoUrl[]> {
  const d = await db();
  const { rows } = repo
    ? await d.query("SELECT * FROM repo_urls WHERE project_key = $1 AND repo = $2 ORDER BY environment", [projectKey, repo])
    : await d.query("SELECT * FROM repo_urls WHERE project_key = $1 ORDER BY repo, environment", [projectKey]);
  return rows.map(rowToRepoUrl);
}

export async function removeRepoUrl(projectKey: string, id: string): Promise<boolean> {
  const d = await db();
  const { rows } = await d.query("DELETE FROM repo_urls WHERE project_key = $1 AND id = $2 RETURNING id", [projectKey, id]);
  return rows.length > 0;
}

// ---- preview lookup ---------------------------------------------------------

export interface PreviewLookup {
  status: "ready" | "not_ready";
  url?: string;
  /** Every URL that was considered, in the order they were tried. */
  candidates: string[];
  reason: string;
}

/** A live URL check. Injected so tests never touch the network. */
export type PreviewProbe = (url: string) => Promise<boolean>;

const defaultProbe: PreviewProbe = async (url) => {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 5000);
  try {
    // HEAD where it works, GET where it does not — some static hosts 405 a HEAD.
    const res = await fetch(url, { method: "HEAD", signal: ctl.signal, redirect: "follow" });
    if (res.ok) return true;
    if (res.status === 405 || res.status === 501) {
      const again = await fetch(url, { method: "GET", signal: ctl.signal, redirect: "follow" });
      return again.ok;
    }
    return false;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Is there a preview for this branch yet?
 *
 * Order: a URL someone already reported on the working branch, then each registered
 * pattern (preview-ish environments first), then GitHub Pages' own convention. Each
 * is probed, so "ready" means a URL that actually responded.
 */
export async function resolvePreview(
  projectKey: string,
  repo: string,
  branch: string,
  opts: { probe?: PreviewProbe; pr?: number } = {},
): Promise<PreviewLookup> {
  const probe = opts.probe ?? defaultProbe;
  const branchRow = await getWorkingBranch(projectKey, repo, branch);
  const pr = opts.pr ?? branchRow?.prNumber;
  const vars = { repo, owner: repo.split("/")[0], name: repo.split("/")[1], branch, pr };

  const candidates: string[] = [];
  const known = branchRow?.previewUrl;
  if (known) candidates.push(known);

  const patterns = (await listRepoUrls(projectKey, repo))
    // Preview-shaped environments first: a staging pattern is far more likely to
    // answer for a branch than a production one.
    .sort((a, b) => previewRank(a.environment) - previewRank(b.environment));
  for (const p of patterns) {
    const url = expandPreviewTemplate(p.pattern, vars);
    if (url && !candidates.includes(url)) candidates.push(url);
  }

  const pages = githubPagesPreviewUrl(repo, pr);
  if (pages && !candidates.includes(pages)) candidates.push(pages);

  if (!candidates.length) {
    return {
      status: "not_ready",
      candidates: [],
      reason:
        `No preview URL is known for \`${repo}\`@\`${branch}\` and no URL patterns are registered for it.\n\n` +
        "Register one with `add_repo_url` (e.g. `https://staging.acme.test/**`), or report the URL " +
        "on the working branch once a deployment is up.",
    };
  }

  for (const url of candidates) {
    if (await probe(url)) {
      return { status: "ready", url, candidates, reason: `Preview is live at ${url}` };
    }
  }

  return {
    status: "not_ready",
    candidates,
    reason:
      `A preview for \`${repo}\`@\`${branch}\` is not up yet. Tried ${candidates.length} ` +
      `URL${candidates.length === 1 ? "" : "s"}: ${candidates.join(", ")}.\n\n` +
      "Deployments take a while — try again shortly rather than guessing a different URL.",
  };
}

/** Lower sorts first. Preview-ish environments beat production. */
function previewRank(environment: string): number {
  const e = environment.toLowerCase();
  if (e.includes("preview") || e.includes("pr-")) return 0;
  if (e.includes("stag")) return 1;
  if (e.includes("dev") || e.includes("test")) return 2;
  return 3;
}
