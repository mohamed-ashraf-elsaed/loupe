/**
 * Thread messages.
 *
 * A comment used to be one body. That is not a conversation: an agent has to be able
 * to reply, a reviewer to answer, and each message to carry its own attachments. This
 * is the model everything downstream (mentions, activity, notification) depends on.
 *
 * The legacy single `body` stays exactly as it was and is *also* message #1 — see
 * `firstMessageFromComment`. Nothing had to be migrated to make replies work.
 */

export type ThreadAuthorType = "user" | "agent" | "guest";

export interface ThreadAuthor {
  id: string;
  name: string;
  email?: string;
  /** Who is speaking. Drives the avatar and whether it reads as a person. */
  type: ThreadAuthorType;
}

export interface MessageAttachment {
  url: string;
  name?: string;
  mime?: string;
  kind: "image" | "video" | "file";
  size?: number;
}

export interface ThreadMessage {
  id: string;
  threadId: string;
  author: ThreadAuthor;
  /** Markdown. */
  body: string;
  attachments?: MessageAttachment[];
  createdAt: string;
  /**
   * Set when the message was retracted.
   *
   * Deleting is soft on purpose: a conversation with holes punched in it is a
   * conversation nobody can audit, and an agent reading the thread later cannot tell
   * "this was removed" from "this never existed". `threadConversation` filters these
   * out for display; a caller that needs the record passes `includeDeleted`.
   */
  deletedAt?: string;
}

/** A new message, before the store assigns an id. */
export type ThreadMessageInput = Omit<ThreadMessage, "id" | "threadId" | "createdAt"> & {
  id?: string;
  createdAt?: string;
};

/**
 * The comment's own body, presented as the first message of its thread.
 *
 * Synthesised rather than stored, so there is no backfill to run and no window where
 * a thread renders with no messages. The id is derived from the comment so it is
 * stable across calls — a UI list keyed on it does not flicker.
 */
export function firstMessageFromComment(comment: {
  id: string;
  body: string;
  author: { id: string; name: string; email?: string };
  createdAt: string;
  attachments?: MessageAttachment[];
}): ThreadMessage {
  return {
    id: `${comment.id}:0`,
    threadId: comment.id,
    author: { ...comment.author, type: "user" },
    body: comment.body,
    attachments: comment.attachments?.length ? comment.attachments : undefined,
    createdAt: comment.createdAt,
  };
}

/** The first message plus every reply, oldest first. */
export function threadConversation(
  comment: Parameters<typeof firstMessageFromComment>[0],
  replies: ThreadMessage[],
  opts: { includeDeleted?: boolean } = {},
): ThreadMessage[] {
  // A retracted message is not part of the conversation as anyone reads it. The
  // record survives in the store for whoever needs it.
  const visible = opts.includeDeleted ? replies : replies.filter((m) => !m.deletedAt);
  return [firstMessageFromComment(comment), ...visible].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Replies a reader should see — never the retracted ones. */
export function visibleMessages(messages: ThreadMessage[]): ThreadMessage[] {
  return messages.filter((m) => !m.deletedAt);
}

/** Who has taken part, in the order they first spoke. */
export function participantsOf(messages: ThreadMessage[]): ThreadAuthor[] {
  const seen = new Map<string, ThreadAuthor>();
  for (const m of messages) if (!seen.has(m.author.id)) seen.set(m.author.id, m.author);
  return [...seen.values()];
}

/** Whether a message came from an agent rather than a person. */
export function isAgentMessage(m: ThreadMessage): boolean {
  return m.author.type === "agent";
}

/**
 * Revisions.
 *
 * A reviewer reopens a resolved thread as a *revision* rather than filing a new one,
 * so the conversation and the original element context carry over. The iteration
 * number is a count within the family, not a global.
 */
export type IterationType = "original" | "revision";

export interface RevisionLink {
  /** The thread this one revises, when it is a revision. */
  parentThreadId?: string;
  iterationType?: IterationType;
  /** 1 for the original, 2 for the first revision, and so on. */
  iterationNumber?: number;
}

/** "Iteration 2" — or nothing at all for an original thread. */
export function iterationLabel(link: RevisionLink): string | null {
  if (!link.parentThreadId || link.iterationType !== "revision") return null;
  return `Iteration ${link.iterationNumber ?? 2}`;
}


/** The event a new reply publishes, so an open thread can refresh itself. */
export const THREAD_MESSAGE_ADDED = "message_added";
/** …and a retraction, so the other side stops showing it. */
export const THREAD_MESSAGE_DELETED = "message_deleted";
