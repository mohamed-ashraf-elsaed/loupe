/**
 * @mentions.
 *
 * The failure mode that matters here is a *silent* one: a mention that looks like it
 * notified someone and did not. So parsing is conservative and the caller is told
 * which handles it could not resolve, rather than dropping them quietly.
 */

export interface Mention {
  /** The handle without the `@`, as written. */
  handle: string;
  /** Index of the `@` in the body. */
  start: number;
  /** Length including the `@`. */
  length: number;
}

/** A handle: letters, digits, and the punctuation people actually use in names. */
const HANDLE = /^[A-Za-z0-9][A-Za-z0-9._-]*/;

/**
 * Ranges in the body that must not be searched: fenced blocks, inline code, and
 * `mailto:`-style text. A name inside a code sample is documentation, not a mention.
 */
function excludedRanges(body: string): [number, number][] {
  const ranges: [number, number][] = [];
  // Fenced blocks first, so an inline-code match inside one is not double counted.
  for (const m of body.matchAll(/```[\s\S]*?```/g)) ranges.push([m.index!, m.index! + m[0].length]);
  const fenced = (i: number) => ranges.some(([a, b]) => i >= a && i < b);
  for (const m of body.matchAll(/`[^`\n]*`/g)) {
    if (!fenced(m.index!)) ranges.push([m.index!, m.index! + m[0].length]);
  }
  return ranges;
}

/**
 * Every mention in a body.
 *
 * Deliberately *not* matched: an email address (`sara@acme.test`) — the `@` is
 * preceded by a word character, which no mention ever is. Trailing punctuation is
 * not part of the handle, so `@sara,` mentions `sara`.
 */
export function parseMentions(body: string): Mention[] {
  if (!body) return [];
  const excluded = excludedRanges(body);
  const inExcluded = (i: number) => excluded.some(([a, b]) => i >= a && i < b);

  const out: Mention[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== "@") continue;
    if (inExcluded(i)) continue;
    // A mention starts at the beginning of the body or after whitespace/opening
    // punctuation — never in the middle of a word, which is what rules out emails.
    const prev = i > 0 ? body[i - 1]! : "";
    if (prev && !/[\s([{<"'*_~]/.test(prev)) continue;

    const match = HANDLE.exec(body.slice(i + 1));
    if (!match) continue;
    const raw = match[0];
    // `@sara.` and `@sara,` end the handle at the punctuation; a dot *inside* a handle
    // (`@jane.doe`) is kept.
    const handle = raw.replace(/[._-]+$/, "");
    if (!handle) continue;

    const key = handle.toLowerCase();
    // The same person mentioned twice is one mention, but the first position wins so
    // highlighting stays stable.
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ handle, start: i, length: handle.length + 1 });
  }
  return out;
}

export interface MentionCandidate {
  id: string;
  name: string;
  email?: string;
}

export interface ResolvedMention {
  mention: Mention;
  user: MentionCandidate;
}

export interface MentionResolution {
  /** Handles that matched somebody. */
  resolved: ResolvedMention[];
  /**
   * Handles that matched nobody. Returned rather than discarded — the caller is
   * expected to say so, because a mention that quietly does nothing is the bug this
   * whole module exists to avoid.
   */
  unknown: string[];
}

/** Handles compare case-insensitively; a display name's first word also works. */
export function resolveMentions(
  body: string,
  candidates: MentionCandidate[],
): MentionResolution {
  const byKey = new Map<string, MentionCandidate>();
  for (const c of candidates) {
    byKey.set(c.name.toLowerCase(), c);
    byKey.set(c.name.toLowerCase().replace(/\s+/g, ""), c);
    const first = c.name.split(/\s+/)[0];
    if (first) byKey.set(first.toLowerCase(), c);
    if (c.email) byKey.set(c.email.split("@")[0]!.toLowerCase(), c);
    byKey.set(c.id.toLowerCase(), c);
  }

  const resolved: ResolvedMention[] = [];
  const unknown: string[] = [];
  for (const mention of parseMentions(body)) {
    const user = byKey.get(mention.handle.toLowerCase());
    if (user && !resolved.some((r) => r.user.id === user.id)) resolved.push({ mention, user });
    else if (!user) unknown.push(mention.handle);
  }
  return { resolved, unknown };
}

/**
 * Split a body into text and mention segments, so a renderer can highlight names
 * without re-parsing (and without highlighting the wrong occurrence).
 */
export function mentionSegments(body: string, mentions: Mention[]): { text: string; mention: boolean }[] {
  if (!mentions.length) return [{ text: body, mention: false }];
  const sorted = [...mentions].sort((a, b) => a.start - b.start);
  const out: { text: string; mention: boolean }[] = [];
  let at = 0;
  for (const m of sorted) {
    if (m.start > at) out.push({ text: body.slice(at, m.start), mention: false });
    out.push({ text: body.slice(m.start, m.start + m.length), mention: true });
    at = m.start + m.length;
  }
  if (at < body.length) out.push({ text: body.slice(at), mention: false });
  return out;
}

/** The handles someone could type, for an autocomplete list. */
export function mentionSuggestions(
  body: string,
  caret: number,
  candidates: MentionCandidate[],
): MentionCandidate[] {
  // The handle being typed: from the last `@` before the caret to the caret.
  const before = body.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0) return [];
  const typed = before.slice(at + 1);
  // Bail once they have typed a space — the mention is finished, or was never one.
  if (/\s/.test(typed)) return [];
  const q = typed.toLowerCase();
  return candidates
    .filter((c) => !q || c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q))
    .slice(0, 6);
}
