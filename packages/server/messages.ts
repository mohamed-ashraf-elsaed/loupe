/**
 * Thread messages.
 *
 * Replies on a thread. The comment's own `body` is deliberately **not** copied in
 * here — it is presented as message #1 by `firstMessageFromComment`, so there is no
 * backfill to run and no window where a thread renders with nothing in it.
 */

import { randomUUID } from "node:crypto";
import type { ThreadAuthor, ThreadMessage, ThreadMessageInput } from "@loupekit/shared";
import { db } from "./db.ts";

function rowToMessage(r: any): ThreadMessage {
  return {
    id: r.id,
    threadId: r.thread_id,
    author: r.author,
    body: r.body,
    attachments: r.attachments ?? undefined,
    createdAt: new Date(r.created_at).toISOString(),
    deletedAt: r.deleted_at ? new Date(r.deleted_at).toISOString() : undefined,
  };
}

/** Replies on a thread, oldest first. The comment body is not included — see above. */
/**
 * A thread's replies, oldest first.
 *
 * Retracted messages are excluded by default — a conversation with holes punched in it
 * is a conversation nobody can audit, but it is also not what a reader should see. The
 * dashboard and the MCP can ask for them with `includeDeleted` when the record matters.
 */
export async function listMessages(
  threadId: string,
  opts: { includeDeleted?: boolean } = {},
): Promise<ThreadMessage[]> {
  const d = await db();
  const { rows } = opts.includeDeleted
    ? await d.query(
        "SELECT * FROM thread_messages WHERE thread_id = $1 ORDER BY created_at ASC, id ASC",
        [threadId],
      )
    : await d.query(
        "SELECT * FROM thread_messages WHERE thread_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC, id ASC",
        [threadId],
      );
  return rows.map(rowToMessage);
}

export async function addMessage(
  threadId: string,
  projectKey: string,
  input: ThreadMessageInput,
): Promise<ThreadMessage> {
  const d = await db();
  const { rows } = await d.query(
    `INSERT INTO thread_messages (id, thread_id, project_key, author, body, attachments, created_at)
     VALUES ($1,$2,$3,$4,$5,$6, COALESCE($7::timestamptz, now()))
     RETURNING *`,
    [
      input.id ?? randomUUID(), threadId, projectKey,
      JSON.stringify(input.author), input.body,
      input.attachments?.length ? JSON.stringify(input.attachments) : null,
      input.createdAt ?? null,
    ],
  );
  // Recorded on write, so a notification can target participants without walking the
  // conversation each time.
  await recordParticipant(threadId, projectKey, input.author);
  return rowToMessage(rows[0]);
}

/** Add or refresh a participant. Speaking again moves `last_seen_at`. */
export async function recordParticipant(
  threadId: string,
  projectKey: string,
  author: ThreadAuthor,
): Promise<void> {
  const d = await db();
  await d.query(
    `INSERT INTO thread_participants (thread_id, project_key, author_id, name, email, type)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (thread_id, author_id) DO UPDATE SET
       name = EXCLUDED.name, email = EXCLUDED.email, type = EXCLUDED.type, last_seen_at = now()`,
    [threadId, projectKey, author.id, author.name, author.email ?? null, author.type],
  );
}

/**
 * Everyone who took part, in the order they first spoke.
 *
 * The thread's own author is folded in even when the table has no row for them — a
 * reporter who has never replied is still a participant, and leaving them out of a
 * notification list would be a silent bug.
 */
export async function listParticipants(
  threadId: string,
  fallbackAuthor?: { id: string; name: string; email?: string; type?: string },
): Promise<ThreadAuthor[]> {
  const d = await db();
  const { rows } = await d.query(
    "SELECT * FROM thread_participants WHERE thread_id = $1 ORDER BY first_seen_at ASC, author_id ASC",
    [threadId],
  );
  const out: ThreadAuthor[] = rows.map((r) => ({
    id: r.author_id, name: r.name, email: r.email ?? undefined, type: r.type,
  }));
  if (fallbackAuthor && !out.some((p) => p.id === fallbackAuthor.id)) {
    out.unshift({ ...fallbackAuthor, type: (fallbackAuthor.type as ThreadAuthor["type"]) ?? "user" });
  }
  return out;
}

/**
 * Retract a message.
 *
 * Soft, and it stays soft: the row survives with `deleted_at` set, so the thread's
 * history is intact for anyone auditing it and a second delete is a no-op rather than
 * an error. Returns the message as it now stands, or null if there is nothing to
 * retract — including one already retracted, so a retry is safe.
 */
export async function deleteMessage(threadId: string, id: string): Promise<ThreadMessage | null> {
  const d = await db();
  const { rows } = await d.query(
    `UPDATE thread_messages SET deleted_at = now()
      WHERE thread_id = $1 AND id = $2 AND deleted_at IS NULL
      RETURNING *`,
    [threadId, id],
  );
  return rows.length ? rowToMessage(rows[0]) : null;
}
