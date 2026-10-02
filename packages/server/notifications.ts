/**
 * Mentions and notifications.
 *
 * `@name` in a reply has to *do* something, and the way it fails is by doing nothing
 * quietly. So the message endpoint resolves mentions against everyone who has taken
 * part in the project, records a notification for each person mentioned, and reports
 * back the handles it could not resolve so the UI can say so.
 */

import { randomUUID } from "node:crypto";
import type { MentionCandidate } from "@loupekit/shared";
import { db } from "./db.ts";

export interface Notification {
  id: string;
  projectKey: string;
  recipientId: string;
  threadId: string;
  kind: string;
  body: string;
  actorName?: string;
  createdAt: string;
  readAt?: string;
}

function rowToNotification(r: any): Notification {
  return {
    id: r.id,
    projectKey: r.project_key,
    recipientId: r.recipient_id,
    threadId: r.thread_id,
    kind: r.kind,
    body: r.body,
    actorName: r.actor_name ?? undefined,
    createdAt: new Date(r.created_at).toISOString(),
    readAt: r.read_at ? new Date(r.read_at).toISOString() : undefined,
  };
}

/**
 * Everyone who has taken part in this project — the people you can mention.
 *
 * Deliberately derived from who has actually spoken rather than a members table:
 * there is no membership model yet (that is 0.17), and inventing one here would
 * either be a stub or a lie. Anyone who has filed feedback or replied is real.
 */
export async function listPeople(projectKey: string): Promise<MentionCandidate[]> {
  const d = await db();
  // `DISTINCT ON (id)` rather than `UNION`: the same person's rows differ (a comment
  // carries the author's email, a reply may not), so a plain UNION keeps both and the
  // same human would be notified twice. `email NULLS LAST` prefers the richer row.
  const { rows } = await d.query(
    `SELECT DISTINCT ON (id) id, name, email FROM (
       SELECT author->>'id' AS id, author->>'name' AS name, author->>'email' AS email
         FROM comments WHERE project_key = $1 AND author->>'id' IS NOT NULL
       UNION ALL
       SELECT author->>'id' AS id, author->>'name' AS name, author->>'email' AS email
         FROM thread_messages WHERE project_key = $1 AND author->>'id' IS NOT NULL
     ) people
     WHERE id IS NOT NULL AND name IS NOT NULL
     ORDER BY id, email NULLS LAST, name`,
    [projectKey],
  );
  return rows.map((r: any) => ({ id: r.id, name: r.name, email: r.email ?? undefined }));
}

export interface NewNotification {
  projectKey: string;
  recipientId: string;
  threadId: string;
  kind: "mention" | "handoff" | "preview" | string;
  body: string;
  actorName?: string;
}

export async function addNotification(input: NewNotification): Promise<Notification> {
  const d = await db();
  const { rows } = await d.query(
    `INSERT INTO notifications (id, project_key, recipient_id, thread_id, kind, body, actor_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [randomUUID(), input.projectKey, input.recipientId, input.threadId, input.kind, input.body, input.actorName ?? null],
  );
  return rowToNotification(rows[0]);
}

/** Notifications for one person, newest first. Read ones are included. */
export async function listNotifications(
  projectKey: string,
  recipientId: string,
  opts: { unreadOnly?: boolean } = {},
): Promise<Notification[]> {
  const d = await db();
  const { rows } = opts.unreadOnly
    ? await d.query(
        "SELECT * FROM notifications WHERE project_key = $1 AND recipient_id = $2 AND read_at IS NULL ORDER BY created_at DESC LIMIT 100",
        [projectKey, recipientId],
      )
    : await d.query(
        "SELECT * FROM notifications WHERE project_key = $1 AND recipient_id = $2 ORDER BY created_at DESC LIMIT 100",
        [projectKey, recipientId],
      );
  return rows.map(rowToNotification);
}

/** How many unread — the badge count. */
export async function unreadCount(projectKey: string, recipientId: string): Promise<number> {
  const d = await db();
  const { rows } = await d.query(
    "SELECT COUNT(*)::int AS n FROM notifications WHERE project_key = $1 AND recipient_id = $2 AND read_at IS NULL",
    [projectKey, recipientId],
  );
  return rows[0]?.n ?? 0;
}

export async function markRead(projectKey: string, recipientId: string, id?: string): Promise<number> {
  const d = await db();
  const { rows } = id
    ? await d.query(
        "UPDATE notifications SET read_at = now() WHERE project_key = $1 AND recipient_id = $2 AND id = $3 AND read_at IS NULL RETURNING id",
        [projectKey, recipientId, id],
      )
    : await d.query(
        "UPDATE notifications SET read_at = now() WHERE project_key = $1 AND recipient_id = $2 AND read_at IS NULL RETURNING id",
        [projectKey, recipientId],
      );
  return rows.length;
}
