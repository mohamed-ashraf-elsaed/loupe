/**
 * Reactions, stored one row per (message, emoji, person).
 *
 * The primary key *is* the toggle: reacting twice cannot produce two rows, so the
 * uniqueness rule is enforced by the database rather than by hoping the client
 * de-duplicates. Counting is then a GROUP BY and a count can never drift.
 */

import { db } from "./db.ts";

export interface StoredReaction {
  messageId: string;
  threadId: string;
  emoji: string;
  userId: string;
  userName?: string;
  createdAt: string;
}

export interface ReactionCount {
  emoji: string;
  count: number;
  userIds: string[];
  /** Whether the caller is one of them. */
  mine: boolean;
}

function rowToReaction(r: any): StoredReaction {
  return {
    messageId: r.message_id,
    threadId: r.thread_id,
    emoji: r.emoji,
    userId: r.user_id,
    userName: r.user_name ?? undefined,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

/** Toggle one person's reaction. Returns whether it is now on. */
export async function toggleReaction(input: {
  threadId: string;
  messageId: string;
  emoji: string;
  userId: string;
  userName?: string;
}): Promise<{ on: boolean }> {
  const d = await db();
  // DELETE … RETURNING first: if a row was there, this toggle turns it off and there is
  // nothing left to insert. One statement decides, so two concurrent toggles cannot both
  // insert (the PK would reject the second anyway) and cannot both delete.
  const { rows: removed } = await d.query(
    `DELETE FROM reactions
      WHERE thread_id = $1 AND message_id = $2 AND emoji = $3 AND user_id = $4
      RETURNING emoji`,
    [input.threadId, input.messageId, input.emoji, input.userId],
  );
  if (removed.length) return { on: false };

  await d.query(
    `INSERT INTO reactions (thread_id, message_id, emoji, user_id, user_name)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (thread_id, message_id, emoji, user_id) DO NOTHING`,
    [input.threadId, input.messageId, input.emoji, input.userId, input.userName ?? null],
  );
  return { on: true };
}

/** Every reaction on a thread, oldest first — enough for the client to aggregate. */
export async function listReactions(threadId: string, viewerId?: string): Promise<StoredReaction[]> {
  const d = await db();
  const { rows } = await d.query(
    "SELECT * FROM reactions WHERE thread_id = $1 ORDER BY created_at ASC",
    [threadId],
  );
  const all = rows.map(rowToReaction);
  // `viewerId` is accepted so a caller cannot forget it exists; the per-user state is
  // derived by the shared summary rather than duplicated here.
  void viewerId;
  return all;
}

/** Counts per message, for a board that does not want the raw rows. */
export async function reactionCounts(threadId: string, viewerId?: string): Promise<Map<string, ReactionCount[]>> {
  const all = await listReactions(threadId);
  const byMessage = new Map<string, Map<string, string[]>>();
  for (const r of all) {
    const emoji = byMessage.get(r.messageId) ?? new Map<string, string[]>();
    const users = emoji.get(r.emoji) ?? [];
    users.push(r.userId);
    emoji.set(r.emoji, users);
    byMessage.set(r.messageId, emoji);
  }
  const out = new Map<string, ReactionCount[]>();
  for (const [messageId, emoji] of byMessage) {
    out.set(
      messageId,
      [...emoji.entries()]
        .map(([e, users]) => ({ emoji: e, count: users.length, userIds: users, mine: viewerId ? users.includes(viewerId) : false }))
        .sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji)),
    );
  }
  return out;
}
