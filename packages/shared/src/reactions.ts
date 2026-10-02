/**
 * Reactions.
 *
 * A reaction is a toggle, not an increment: pressing the same emoji twice must leave
 * you having reacted once. That is the whole correctness question, and it is why the
 * toggle lives here as a pure function rather than being inferred from counts at the
 * call site.
 */

/** A person's reaction to one message. */
export interface Reaction {
  /** The message reacted to. */
  messageId: string;
  emoji: string;
  userId: string;
  userName?: string;
}

/** The emoji offered in the picker. Deliberately short — a long list is a decision nobody makes. */
export const REACTION_CHOICES = ["👍", "🎉", "👀", "🙏", "❤️", "🚀"] as const;

export interface ReactionSummary {
  emoji: string;
  count: number;
  /** Whether the viewer is one of them, for the highlighted state. */
  mine: boolean;
  /** Names for a tooltip, in the order they reacted. */
  users: string[];
}

/**
 * Aggregate one message's reactions for a viewer.
 *
 * Ordered by count (most reacted first), then by the picker's own order so the row
 * does not reshuffle between renders when counts tie.
 */
export function summarizeReactions(reactions: Reaction[], viewerId?: string): ReactionSummary[] {
  const byEmoji = new Map<string, Reaction[]>();
  for (const r of reactions) {
    const list = byEmoji.get(r.emoji) ?? [];
    list.push(r);
    byEmoji.set(r.emoji, list);
  }

  const rank = (emoji: string) => {
    const at = (REACTION_CHOICES as readonly string[]).indexOf(emoji);
    return at < 0 ? REACTION_CHOICES.length : at;
  };

  return [...byEmoji.entries()]
    .map(([emoji, list]) => ({
      emoji,
      count: list.length,
      mine: viewerId ? list.some((r) => r.userId === viewerId) : false,
      users: list.map((r) => r.userName ?? r.userId),
    }))
    .sort((a, b) => b.count - a.count || rank(a.emoji) - rank(b.emoji) || a.emoji.localeCompare(b.emoji));
}

/**
 * Toggle one person's reaction, returning the new set.
 *
 * Idempotent in both directions: toggling on twice adds one, toggling off twice removes
 * one and then does nothing. Applying the same toggle to an already-toggled set is
 * therefore safe to retry, which matters because a flaky network will.
 */
export function toggleReaction(reactions: Reaction[], next: Reaction): Reaction[] {
  const has = reactions.some((r) => r.messageId === next.messageId && r.emoji === next.emoji && r.userId === next.userId);
  if (has) {
    return reactions.filter((r) => !(r.messageId === next.messageId && r.emoji === next.emoji && r.userId === next.userId));
  }
  return [...reactions, next];
}

/** Reactions grouped per message, for rendering a whole conversation at once. */
export function reactionsByMessage(reactions: Reaction[], viewerId?: string): Map<string, ReactionSummary[]> {
  const byMessage = new Map<string, Reaction[]>();
  for (const r of reactions) {
    const list = byMessage.get(r.messageId) ?? [];
    list.push(r);
    byMessage.set(r.messageId, list);
  }
  const out = new Map<string, ReactionSummary[]>();
  for (const [messageId, list] of byMessage) out.set(messageId, summarizeReactions(list, viewerId));
  return out;
}
