/**
 * Preview URLs.
 *
 * The recurring failure this exists to prevent: an agent that "knows" a preview
 * should be at some URL, guesses one, and reports it as live. Instead a repo
 * registers its URL *patterns*, and a URL is either matched against them or the
 * answer is "not ready".
 *
 * Two halves, both pure and shared so the extension, the server and the MCP tools
 * agree: matching a real URL against a glob, and expanding a template into a
 * candidate.
 */

/**
 * Match a URL against a glob.
 *
 * `*` stays inside one path segment and `**` spans segments — the usual convention,
 * and the one that makes `https://x/**` cover every page under a host while
 * `https://x/*` covers only the first level. A trailing slash is ignored on both
 * sides, because `/pr-1` and `/pr-1/` are the same page.
 */
export function matchUrlPattern(pattern: string, url: string): boolean {
  if (!pattern || !url) return false;
  const norm = (s: string) => s.trim().replace(/\/+$/, "");
  const p = norm(pattern);
  const u = norm(url);
  if (!p || !u) return false;

  let out = "^";
  for (let i = 0; i < p.length; i++) {
    const ch = p[i]!;
    if (ch === "*") {
      if (p[i + 1] === "*") {
        // `/**` also covers the bare host: `https://x/**` must match `https://x`,
        // because "every page on this host" includes its root.
        if (out.endsWith("/")) {
          out = out.slice(0, -1) + "(?:/.*)?";
        } else {
          out += ".*";
        }
        i++;
      } else {
        out += "[^/]*";
      }
    } else if (ch === "?") {
      out += "[^/]";
    } else {
      out += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  out += "$";
  try {
    return new RegExp(out).test(u);
  } catch {
    return false;
  }
}

export interface PreviewVars {
  /** "org" */
  owner?: string;
  /** "web" */
  name?: string;
  /** "org/web" */
  repo?: string;
  branch?: string;
  /** Pull request number. */
  pr?: number | string;
}

/**
 * Expand a stored template into a concrete URL, or null when a placeholder it needs
 * has no value. Returning null rather than a half-substituted string is deliberate:
 * `https://{owner}.github.io/web/pr-preview/pr-undefined/` looks like a URL and is
 * worse than nothing.
 */
export function expandPreviewTemplate(template: string, vars: PreviewVars): string | null {
  if (!template) return null;
  const values: Record<string, string | undefined> = {
    owner: vars.owner,
    name: vars.name,
    repo: vars.repo,
    branch: vars.branch,
    pr: vars.pr === undefined ? undefined : String(vars.pr),
  };

  let missing = false;
  const out = template.replace(/\{(\w+)\}/g, (_m, key: string) => {
    const value = values[key];
    if (value === undefined || value === "") {
      missing = true;
      return "";
    }
    return value;
  });
  // An unknown placeholder is a config error, not something to pass through.
  if (missing || /[{}]/.test(out)) return null;
  return out;
}

/**
 * The GitHub Pages convention: a repository published as `org.github.io/name`
 * serves each pull request at `pr-preview/pr-<n>/`.
 *
 * Worth having as a named convention rather than just a template, because it is the
 * one pattern that works with no configuration at all — GitHub's own action writes
 * these previews, so a repo that has it enabled needs nothing registered.
 */
export function githubPagesPreviewUrl(repo: string, pr?: number | string): string | null {
  if (!repo || pr === undefined || pr === "") return null;
  const [owner, name] = repo.split("/");
  if (!owner || !name) return null;
  // `org/org.github.io` is the user/organisation site — it has no repository prefix.
  const host = `${owner.toLowerCase()}.github.io`;
  const base = name.toLowerCase() === host ? `https://${host}` : `https://${host}/${name}`;
  return `${base}/pr-preview/pr-${pr}/`;
}

/** A registered URL pattern for a repository. */
export interface RepoUrlPattern {
  repo: string;
  /** "staging" | "production" | anything the host uses. */
  environment: string;
  /** A glob the extension matches against, e.g. `https://staging.acme.test/**`. */
  pattern: string;
}

/** Do any of these patterns cover this URL, and under what environment? */
export function matchRepoUrl(patterns: RepoUrlPattern[], url: string): { pattern: RepoUrlPattern; environment: string } | null {
  for (const pattern of patterns) {
    if (matchUrlPattern(pattern.pattern, url)) return { pattern, environment: pattern.environment };
  }
  return null;
}
