/**
 * Thread messages.
 *
 * Replies on a thread. The comment's own `body` is deliberately **not** copied in
 * here — it is presented as message #1 by `firstMessageFromComment`, so there is no
 * backfill to run and no window where a thread renders with nothing in it.
 */

import { randomUUID } from "node:crypto";
import type { ThreadMessage, ThreadMessageInput } from "@loupekit/shared";
import { db } from "./db.ts";

function rowToMessage(r: any): ThreadMessage {
  return {
    id: r.id,
    threadId: r.thread_id,
    author: r.author,
    body: r.body,
    attachments: r.attachments ?? undefined,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

/** Replies on a thread, oldest first. The comment body is not included — see above. */
export async function listMessages(threadId: string): Promise<ThreadMessage[]> {
  const d = await db();
  const { rows } = await d.query(
    "SELECT * FROM thread_messages WHERE thread_id = $1 ORDER BY created_at ASC, id ASC",
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
  return rowToMessage(rows[0]);
}

export async function deleteMessage(threadId: string, id: string): Promise<boolean> {
  const d = await db();
  const { rows } = await d.query(
    "DELETE FROM thread_messages WHERE thread_id = $1 AND id = $2 RETURNING id",
    [threadId, id],
  );
  return rows.length > 0;
}
