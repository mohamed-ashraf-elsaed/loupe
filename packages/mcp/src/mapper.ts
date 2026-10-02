/**
 * Element → source file.
 *
 * This is the bridge's payoff. Loupe hands an agent raw HTML, so the agent has to
 * re-find the file that rendered it — every single time. This maps a captured
 * element to ranked `file:line` candidates instead, by walking the workspace and
 * scoring what it finds against the signals the element actually carries.
 *
 * It is a **heuristic, not a resolver**: no bundler metadata is available from a
 * page, so the honest output is a ranked list with reasons, and the agent picks.
 * Everything here is pure apart from the filesystem reads, so the scoring is unit
 * testable without a repo.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";

/** What the element gives us to search with. */
export interface ElementSignals {
  id?: string | null;
  tag?: string;
  text?: string;
  /** `aria-label`, or a `label`-ish attribute, if the element had one. */
  ariaLabel?: string | null;
  classes?: string[];
  attrs?: Record<string, string>;
}

export interface MappingCandidate {
  /** Path relative to the workspace root, with forward slashes. */
  filePath: string;
  /** 1-indexed inclusive line range around the best match. */
  lineStart: number;
  lineEnd: number;
  /** 0..1. Higher is better; the ordering is the useful part. */
  confidence: number;
  /** Why this file — shown to the agent so it can sanity-check the guess. */
  reason: string;
  matchType: "id" | "aria-label" | "text" | "class" | "plain-text" | "filename";
}

/**
 * Signal weights, in one table so they can be tuned without hunting through the
 * scorer. An element's `id` is the strongest evidence available to a page; a bare
 * class name is close to worthless on its own, which is why it sits lowest.
 */
export const SIGNAL_WEIGHTS: Record<MappingCandidate["matchType"], number> = {
  id: 0.85,
  "aria-label": 0.8,
  text: 0.7,
  class: 0.5,
  "plain-text": 0.4,
  filename: 0.6,
};

/** Directories never worth walking — build output, dependencies, caches. */
export const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "out", ".next", ".nuxt", ".svelte-kit",
  "coverage", "vendor", "__pycache__", ".venv", "venv", "target", ".cache", ".turbo",
  ".parcel-cache", ".idea", ".vscode", ".output", ".angular", "bower_components",
]);

/** Extensions worth reading. Everything else is binary or not where UI lives. */
export const SEARCH_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte", ".astro",
  ".html", ".htm", ".php", ".blade.php", ".erb", ".liquid", ".twig", ".css", ".scss",
]);

/** PascalCase basenames are very likely components; the boost reflects that. */
export function isComponentishName(filePath: string): boolean {
  const name = basename(filePath).replace(/\.[^.]+$/, "").replace(/\.blade$/, "");
  if (name.startsWith("use") && name.length > 3) return true; // a hook
  return /^[A-Z][A-Za-z0-9]*$/.test(name);
}

/** A rough read on "this file is a view". */
export function isViewFile(filePath: string): boolean {
  return /\.(tsx|jsx|vue|svelte|astro|html?|blade\.php|erb|liquid|twig)$/i.test(filePath);
}

const BARE_UTILITIES = new Set([
  "flex", "grid", "block", "inline", "inline-block", "hidden", "relative", "absolute",
  "fixed", "sticky", "static", "container", "truncate", "italic", "underline",
  "uppercase", "lowercase", "capitalize", "antialiased", "invisible", "visible",
  "contents", "isolate", "group", "peer", "clearfix", "shadow", "border", "rounded",
  "outline", "ring", "transition", "transform", "animate", "cursor-pointer", "overflow-hidden",
]);

/**
 * The tail of a utility: a number, a size word, an alignment, a border style.
 * Anything in here as the last segment of a hyphenated lowercase name means the
 * name is styling, not an identifier the source would contain.
 */
const SCALE_SUFFIX =
  /^(?:[0-9]+(?:\.[0-9]+)?|px|full|auto|none|screen|min|max|fit|prose|xs|sm|md|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl|tight|wide|wider|widest|loose|normal|bold|semibold|medium|light|thin|black|white|solid|dashed|dotted|double|hidden|visible|scroll|clip|ellipsis|wrap|nowrap|center|left|right|top|bottom|start|end|baseline|stretch|around|between|evenly|reverse|row|col|nowrap|\[.*\])$/;

/**
 * Whether a class name looks like a styling utility rather than something the
 * source would contain. `bg-blue-500` appears in a stylesheet, never in the JSX
 * that renders this button, so searching for it produces noise, not answers.
 */
export function isUtilityClass(name: string): boolean {
  const cls = name.trim();
  if (!cls) return true;
  // A variant prefix (`hover:`, `md:`, `dark:`) is a utility by construction.
  if (cls.includes(":")) return true;
  if (BARE_UTILITIES.has(cls)) return true;
  // Hyphenated lowercase whose tail is a scale word, e.g. `mt-4`, `bg-blue-500`,
  // `text-sm`, `w-full`, `rounded-lg`, `leading-tight`, `gap-x-2`.
  const parts = cls.split("-");
  if (parts.length >= 2 && /^[a-z]{1,12}$/.test(parts[0]!) && SCALE_SUFFIX.test(parts[parts.length - 1]!)) {
    return true;
  }
  // A known styling prefix with a free-form tail (`text-brand`, `bg-surface`).
  if (parts.length >= 2 && /^(?:bg|text|border|font|leading|tracking|from|to|via|fill|stroke|ring|shadow)$/.test(parts[0]!)) {
    return true;
  }
  return false;
}

/** Only the classes worth searching for. */
export function searchableClasses(classes: string[] | undefined): string[] {
  return [...new Set((classes ?? []).map((c) => c.trim()).filter((c) => c && !isUtilityClass(c)))];
}

/** Pull the signals out of a captured payload. */
export function signalsFrom(payload: {
  id?: string | null;
  tag?: string;
  text?: string;
  classes?: string[];
  attrs?: Record<string, string>;
}): ElementSignals {
  const attrs = payload.attrs ?? {};
  return {
    id: payload.id ?? null,
    tag: payload.tag,
    text: payload.text,
    ariaLabel: attrs["aria-label"] ?? attrs["aria-labelledby"] ?? null,
    classes: payload.classes,
    attrs,
  };
}

/**
 * A file whose longest line is this long is generated, not written by hand. The
 * skip list catches `dist/` and friends, but a bundle can sit anywhere — the
 * extension's own `content.js` is a build artifact in the package root, and it
 * ranked first for every signal until this guard existed.
 */
export const MAX_LINE_LENGTH = 1500;

/** Whether a file looks generated, judged from its longest line. */
export function looksGenerated(source: string): boolean {
  let run = 0;
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 10) {
      run = 0;
    } else if (++run > MAX_LINE_LENGTH) {
      return true;
    }
  }
  return false;
}

/** Source lives under `src/`; a file beside the package root usually does not. */
export function isSourcePath(filePath: string): boolean {
  return filePath.startsWith("src/") || filePath.includes("/src/");
}

export interface MapperOptions {
  /** Stop collecting after this many files. */
  maxFiles?: number;
  /** Skip files larger than this — a minified bundle is not source. */
  maxFileBytes?: number;
  /** Stop reading once this many bytes have been scanned. */
  maxScanBytes?: number;
  /** How long a collected file list stays warm. */
  ttlMs?: number;
  maxCandidates?: number;
  /** Lines of context either side of a match. */
  linePadding?: number;
}

const DEFAULTS: Required<MapperOptions> = {
  maxFiles: 4000,
  maxFileBytes: 512 * 1024,
  maxScanBytes: 64 * 1024 * 1024,
  ttlMs: 15_000,
  maxCandidates: 10,
  linePadding: 2,
};

export interface WalkResult {
  files: string[];
  /** True when the cap cut the walk short, so a caller knows the list is partial. */
  truncated: boolean;
}

/**
 * Collect the files worth searching, breadth-first, respecting the cap.
 *
 * Breadth-first rather than depth-first on purpose: a huge `src/some/old/nested`
 * subtree should not be able to exhaust the budget before `src/components` is
 * reached.
 */
export async function collectFiles(root: string, opts: MapperOptions = {}): Promise<WalkResult> {
  const { maxFiles } = { ...DEFAULTS, ...opts };
  const files: string[] = [];
  const queue: string[] = [root];
  let truncated = false;

  while (queue.length) {
    const dir = queue.shift()!;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue; // unreadable directory — skip it, never fail the whole map
    }
    for (const entry of entries) {
      if (files.length >= maxFiles) { truncated = true; break; }
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
        queue.push(full);
      } else if (entry.isFile()) {
        if (entry.name.endsWith(".d.ts")) continue;
        const ext = entry.name.includes(".blade.php") ? ".blade.php" : entry.name.slice(entry.name.lastIndexOf("."));
        if (!SEARCH_EXTENSIONS.has(ext)) continue;
        files.push(full);
      }
    }
  }
  return { files, truncated };
}

/** A warm file list, so repeated lookups in one session do not re-walk the tree. */
const listCache = new Map<string, { at: number; result: WalkResult }>();

export function clearFileListCache(): void {
  listCache.clear();
}

async function cachedFiles(root: string, opts: MapperOptions): Promise<WalkResult> {
  const ttl = opts.ttlMs ?? DEFAULTS.ttlMs;
  const hit = listCache.get(root);
  if (hit && Date.now() - hit.at < ttl) return hit.result;
  const result = await collectFiles(root, opts);
  listCache.set(root, { at: Date.now(), result });
  return result;
}

interface RawMatch {
  filePath: string;
  line: number;
  matchType: MappingCandidate["matchType"];
  needle: string;
}

/** The line number (1-indexed) of the first occurrence, or 0. */
function lineOf(source: string, needle: string): number {
  const at = source.indexOf(needle);
  if (at < 0) return 0;
  return source.slice(0, at).split("\n").length;
}

/** How many times the needle appears — an element rendered in a map/loop hits more. */
function countOf(source: string, needle: string): number {
  let n = 0;
  let from = 0;
  for (;;) {
    const at = source.indexOf(needle, from);
    if (at < 0) return n;
    n++;
    from = at + needle.length;
  }
}

/**
 * Rank the source files for an element.
 *
 * Resolves to an empty list when nothing matches or the root does not exist —
 * "I could not find it" is an answer, not an error, and the caller can say so.
 */
export async function mapElementToSource(
  signals: ElementSignals,
  workspaceRoot: string,
  opts: MapperOptions = {},
): Promise<MappingCandidate[]> {
  const o = { ...DEFAULTS, ...opts };
  if (!workspaceRoot || !signals) return [];

  // Searchable signals, strongest first. Short text is noise (`a`, `x`), so it is
  // dropped rather than allowed to match everywhere.
  const needles: { value: string; type: MappingCandidate["matchType"] }[] = [];
  const id = signals.id?.trim();
  if (id && id.length >= 3) needles.push({ value: id, type: "id" });
  const aria = signals.ariaLabel?.trim();
  if (aria && aria.length >= 3) needles.push({ value: aria, type: "aria-label" });
  const text = signals.text?.trim();
  if (text && text.length >= 3) needles.push({ value: text, type: "text" });
  for (const cls of searchableClasses(signals.classes)) {
    if (cls.length >= 4) needles.push({ value: cls, type: "class" });
  }
  if (!needles.length) return [];

  let outcome: WalkResult;
  try {
    const rootStat = await stat(workspaceRoot);
    if (!rootStat.isDirectory()) return [];
    outcome = await cachedFiles(workspaceRoot, o);
  } catch {
    return [];
  }

  const matches: RawMatch[] = [];
  let scanned = 0;

  // Bounded concurrency: a sequential read of thousands of files is slow, and an
  // unbounded one exhausts the file descriptor table.
  const CONCURRENCY = 16;
  for (let i = 0; i < outcome.files.length; i += CONCURRENCY) {
    if (scanned > o.maxScanBytes) break;
    const batch = outcome.files.slice(i, i + CONCURRENCY);
    const read = await Promise.all(batch.map(async (file) => {
      try {
        const info = await stat(file);
        if (info.size > o.maxFileBytes) return null;
        const source = await readFile(file, "utf8");
        return { file, source };
      } catch {
        return null;
      }
    }));
    for (const entry of read) {
      if (!entry) continue;
      scanned += entry.source.length;
      // A bundle is not source, wherever it happens to live.
      if (looksGenerated(entry.source)) continue;
      const rel = relative(workspaceRoot, entry.file).split(sep).join("/");
      for (const needle of needles) {
        if (!entry.source.includes(needle.value)) continue;
        matches.push({ filePath: rel, line: lineOf(entry.source, needle.value), matchType: needle.type, needle: needle.value });
      }
      // The filename itself is evidence: `CheckoutButton.tsx` for a button the user
      // described as "Checkout".
      if (text && text.length >= 4) {
        const stem = basename(rel).replace(/\.[^.]+$/, "");
        if (stem.toLowerCase().includes(text.toLowerCase().replace(/\s+/g, ""))) {
          matches.push({ filePath: rel, line: 1, matchType: "filename", needle: stem });
        }
      }
    }
  }

  return rankMatches(matches, o);
}

/**
 * Score and consolidate raw matches.
 *
 * Exported so the ranking can be tested on fixtures without touching a filesystem.
 */
export function rankMatches(raw: RawMatch[], opts: MapperOptions = {}): MappingCandidate[] {
  const o = { ...DEFAULTS, ...opts };
  if (!raw.length) return [];

  // Boosts, kept here so the whole model reads in one place.
  const perFile = new Map<string, RawMatch[]>();
  for (const m of raw) {
    const list = perFile.get(m.filePath) ?? [];
    list.push(m);
    perFile.set(m.filePath, list);
  }

  const candidates: MappingCandidate[] = [];
  const seen = new Set<string>();

  for (const [filePath, list] of perFile) {
    const best = list.reduce((a, b) => (SIGNAL_WEIGHTS[b.matchType] > SIGNAL_WEIGHTS[a.matchType] ? b : a));
    const key = `${filePath}:${best.line}`;
    if (seen.has(key)) continue;
    seen.add(key);

    let score = SIGNAL_WEIGHTS[best.matchType];
    const boosts: string[] = [];
    if (isComponentishName(filePath)) { score += 0.12; boosts.push("component filename"); }
    if (isViewFile(filePath)) { score += 0.08; boosts.push("view file"); }
    // Source beats something sitting beside the package root.
    if (isSourcePath(filePath)) { score += 0.05; boosts.push("src"); }
    // Several distinct signals agreeing on one file is the strongest evidence there is.
    const distinct = new Set(list.map((m) => m.matchType)).size;
    if (distinct > 1) { score += Math.min(0.12, 0.06 * (distinct - 1)); boosts.push(`${distinct} signals agree`); }
    if (list.length > 1) { score += Math.min(0.06, 0.02 * (list.length - 1)); boosts.push(`${list.length} matches`); }

    const reason =
      `matched ${best.matchType} “${best.needle}”` + (boosts.length ? ` · ${boosts.join(", ")}` : "");

    candidates.push({
      filePath,
      lineStart: best.line,
      lineEnd: best.line,
      confidence: Math.max(0, Math.min(1, score)),
      reason,
      matchType: best.matchType,
    });
  }

  // Sort by score desc, then path asc — a stable order makes the output diffable.
  candidates.sort((a, b) => b.confidence - a.confidence || a.filePath.localeCompare(b.filePath));

  // Line ranges are applied after the cut, so the padding never costs a candidate.
  return candidates.slice(0, o.maxCandidates).map((c) => ({
    ...c,
    lineStart: Math.max(1, c.lineStart - o.linePadding),
    lineEnd: c.lineEnd + o.linePadding,
  }));
}
