/**
 * A small GitHub client for one job: turn a set of file changes into **one atomic
 * commit** on a branch, and open a pull request for it.
 *
 * Why the tree/blob dance rather than the contents API: the contents API writes one
 * file per commit. A fix that touches three files would then be three commits, which
 * is a worse review and a worse revert. The Git Data API lets us build the whole tree
 * and commit it once.
 *
 * Nothing here logs the token, and errors are redacted before they are returned.
 */

import { execFileSync } from "node:child_process";

export interface FileChange {
  /** Path within the repository, forward slashes. */
  path: string;
  /** Full new contents. */
  content: string;
}

export interface PullRequest {
  number: number;
  url: string;
  htmlUrl: string;
  state: "open" | "closed";
  head: string;
  base: string;
  title: string;
  body: string;
}

export interface GitHubClientOptions {
  /** API root — override for GitHub Enterprise. */
  baseUrl?: string;
  /** Injected for tests. */
  fetchImpl?: typeof fetch;
  userAgent?: string;
}

/** Every GitHub API call needs a User-Agent; a missing one is a 403. */
const DEFAULT_UA = "loupe-mcp (+https://github.com/mohamed-ashraf-elsaed/loupe)";

const PLACEHOLDER_PATTERNS: RegExp[] = [
  /^<.*>$/, // <your token>
  /(your|my|the)[\s._-]*(gh|github)?[\s._-]*(pat|token|key|secret)/,
  /^(?:x{4,}|y{4,}|z{4,}|0{4,}|\.{3,}|-{4,}|\*{4,})$/,
  /(change[\s._-]?me|placeholder|replace[\s._-]?me|todo|tbd)/,
  /\.\.\./,
];

/**
 * Whether a token is really a placeholder.
 *
 * This matters more than it sounds: a config copied from a README contains
 * `<your token>`, and treating that as real produces a 401 from GitHub at the moment
 * an agent tries to open a PR — far from the cause, and confusing. Better to say
 * "no token configured" at the point of use.
 */
export function isPlaceholderToken(token: string | null | undefined): boolean {
  if (token == null) return true;
  const t = token.trim();
  if (!t) return true;
  // No GitHub token is this short; `ghp_x` and friends are all far longer.
  if (t.length < 20) return true;
  const lower = t.toLowerCase();
  return PLACEHOLDER_PATTERNS.some((re) => re.test(lower));
}

export interface TokenResolution {
  token: string | null;
  source: "env" | "gh-cli" | "none";
  /** Actionable, shown to the agent — never contains the token itself. */
  message: string;
}

const NO_TOKEN_MESSAGE =
  "No GitHub token is configured, so I cannot open a pull request.\n\n" +
  "Set `GITHUB_TOKEN` in the MCP server's environment (a fine-grained PAT with " +
  "Contents and Pull requests: read and write on the repository), or run `gh auth login`. " +
  "Everything else works without it — the fix is still recorded on the thread.";

export interface ResolveTokenOptions {
  env?: NodeJS.ProcessEnv;
  /** Injected so tests do not shell out to `gh`. */
  readGhToken?: () => string | null;
}

/** The token, or an explanation of why there is not one. */
export function resolveGitHubToken(opts: ResolveTokenOptions = {}): TokenResolution {
  const env = opts.env ?? process.env;
  const explicit = env.GITHUB_TOKEN ?? env.GH_TOKEN;
  if (explicit && !isPlaceholderToken(explicit)) {
    return { token: explicit.trim(), source: "env", message: "Using GITHUB_TOKEN from the environment." };
  }

  const read = opts.readGhToken ?? readGhCliToken;
  const fromCli = read();
  if (fromCli && !isPlaceholderToken(fromCli)) {
    return { token: fromCli.trim(), source: "gh-cli", message: "Using the token from `gh auth token`." };
  }

  if (explicit) {
    return {
      token: null,
      source: "none",
      message: `GITHUB_TOKEN looks like a placeholder, so it was ignored. ${NO_TOKEN_MESSAGE}`,
    };
  }
  return { token: null, source: "none", message: NO_TOKEN_MESSAGE };
}

/** `gh auth token`, or null when the CLI is absent or not logged in. */
function readGhCliToken(): string | null {
  try {
    const out = execFileSync("gh", ["auth", "token"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return out.trim() || null;
  } catch {
    return null;
  }
}

/** An error carrying GitHub's own message, with the token scrubbed out. */
export class GitHubError extends Error {
  readonly status: number;
  readonly path: string;

  // Explicit fields, not constructor parameter properties: Node runs these files with
  // type-stripping only, and `constructor(private x)` is rejected there. There is a
  // test that scans for this pattern, because it has bitten twice.
  constructor(message: string, status: number, path: string) {
    super(message);
    this.name = "GitHubError";
    this.status = status;
    this.path = path;
  }
}

export class GitHubClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;
  private readonly token: string;

  constructor(token: string, opts: GitHubClientOptions = {}) {
    if (isPlaceholderToken(token)) throw new GitHubError("a real GitHub token is required", 0, "constructor");
    this.token = token.trim();
    this.baseUrl = (opts.baseUrl ?? "https://api.github.com").replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.userAgent = opts.userAgent ?? DEFAULT_UA;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": this.userAgent,
        Authorization: `Bearer ${this.token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await res.text();
    if (!res.ok) {
      let detail = text;
      try {
        detail = (JSON.parse(text) as { message?: string }).message ?? text;
      } catch { /* keep the raw text */ }
      throw new GitHubError(this.redact(`${method} ${path} → ${res.status}: ${detail}`), res.status, path);
    }
    return (text ? JSON.parse(text) : null) as T;
  }

  /** Belt and braces: the token must never reach a log or a tool result. */
  redact(text: string): string {
    return this.token ? text.split(this.token).join("[redacted]") : text;
  }

  // ---- branches -------------------------------------------------------------

  async branchExists(repo: string, branch: string): Promise<boolean> {
    try {
      await this.request("GET", `/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
      return true;
    } catch (e) {
      if (e instanceof GitHubError && e.status === 404) return false;
      throw e;
    }
  }

  /** The commit sha a branch points at. */
  async branchHead(repo: string, branch: string): Promise<string> {
    const ref = await this.request<{ object: { sha: string } }>(
      "GET", `/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
    );
    return ref.object.sha;
  }

  /** Create a branch from another, resolving the base to its current commit. */
  async createBranchFromBase(repo: string, branch: string, base: string): Promise<string> {
    const sha = await this.branchHead(repo, base);
    await this.request("POST", `/repos/${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha });
    return sha;
  }

  // ---- commits --------------------------------------------------------------

  /**
   * Land every file change as exactly **one** commit on `branch`, creating the branch
   * from `base` first when it does not exist.
   *
   * blob(s) → tree → commit → ref, in that order, so a partial failure leaves the
   * repository untouched rather than half-updated.
   */
  async commitChanges(
    repo: string,
    branch: string,
    message: string,
    changes: FileChange[],
    opts: { base?: string } = {},
  ): Promise<{ sha: string; created: boolean; files: number }> {
    if (!changes.length) throw new GitHubError("no file changes to commit", 0, "commitChanges");

    const created = !(await this.branchExists(repo, branch));
    let parentSha: string;
    if (created) {
      const base = opts.base;
      if (!base) throw new GitHubError(`branch ${branch} does not exist and no base was given`, 0, "commitChanges");
      parentSha = await this.createBranchFromBase(repo, branch, base);
    } else {
      parentSha = await this.branchHead(repo, branch);
    }

    const parent = await this.request<{ tree: { sha: string } }>("GET", `/repos/${repo}/git/commits/${parentSha}`);

    const blobs = await Promise.all(changes.map(async (change) => {
      const blob = await this.request<{ sha: string }>("POST", `/repos/${repo}/git/blobs`, {
        content: change.content,
        encoding: "utf-8",
      });
      return { path: change.path, mode: "100644" as const, type: "blob" as const, sha: blob.sha };
    }));

    const tree = await this.request<{ sha: string }>("POST", `/repos/${repo}/git/trees`, {
      base_tree: parent.tree.sha,
      tree: blobs,
    });
    const commit = await this.request<{ sha: string }>("POST", `/repos/${repo}/git/commits`, {
      message,
      tree: tree.sha,
      parents: [parentSha],
    });
    await this.request("PATCH", `/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, { sha: commit.sha });

    return { sha: commit.sha, created, files: changes.length };
  }

  // ---- pull requests --------------------------------------------------------

  async createPullRequest(
    repo: string,
    opts: { title: string; head: string; base: string; body?: string; draft?: boolean },
  ): Promise<PullRequest> {
    const pr = await this.request<any>("POST", `/repos/${repo}/pulls`, {
      title: opts.title,
      head: opts.head,
      base: opts.base,
      body: opts.body ?? "",
      draft: opts.draft ?? false,
    });
    return toPullRequest(pr);
  }

  async getPullRequest(repo: string, number: number): Promise<PullRequest> {
    return toPullRequest(await this.request<any>("GET", `/repos/${repo}/pulls/${number}`));
  }

  /** The PR body, for appending a fix to an accumulating PR. */
  async getPullRequestBody(repo: string, number: number): Promise<string> {
    return (await this.getPullRequest(repo, number)).body;
  }

  async updatePullRequestBody(repo: string, number: number, body: string): Promise<void> {
    await this.request("PATCH", `/repos/${repo}/pulls/${number}`, { body });
  }

  async isPullRequestOpen(repo: string, number: number): Promise<boolean> {
    return (await this.getPullRequest(repo, number)).state === "open";
  }

  /** Find an open PR for a branch, if there is one. */
  async findOpenPullRequest(repo: string, head: string, base?: string): Promise<PullRequest | null> {
    const q = new URLSearchParams({ head: `${repo.split("/")[0]}:${head}`, state: "open" });
    if (base) q.set("base", base);
    const list = await this.request<any[]>("GET", `/repos/${repo}/pulls?${q}`);
    return list.length ? toPullRequest(list[0]) : null;
  }
}

function toPullRequest(raw: any): PullRequest {
  return {
    number: raw.number,
    url: raw.url,
    htmlUrl: raw.html_url,
    state: raw.state,
    head: raw.head?.ref ?? "",
    base: raw.base?.ref ?? "",
    title: raw.title ?? "",
    body: raw.body ?? "",
  };
}
