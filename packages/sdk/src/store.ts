import type { ActivityEvent, Attachment, Comment, MessageAttachment, OrgInfo, Reaction, StorageAdapter, ThreadAuthor, ThreadMessage } from "./types.js";
import { toggleReaction } from "./types.js";
import { attachmentKind, fileToDataUrl } from "./capture.js";

/**
 * Prototype storage: everything lives in localStorage, keyed by project + path.
 * The production adapter swaps this for HTTP calls to the backend — the SDK
 * only depends on the StorageAdapter interface, so nothing else changes.
 */
export class LocalStorageAdapter implements StorageAdapter {
  private key(projectKey: string, url: string) {
    return `loupe:${projectKey}:${url}`;
  }

  private readAll(projectKey: string, url: string): Comment[] {
    try {
      const raw = localStorage.getItem(this.key(projectKey, url));
      return raw ? (JSON.parse(raw) as Comment[]) : [];
    } catch {
      return [];
    }
  }

  private writeAll(projectKey: string, url: string, comments: Comment[]) {
    localStorage.setItem(this.key(projectKey, url), JSON.stringify(comments));
  }

  async list(projectKey: string, url: string): Promise<Comment[]> {
    return this.readAll(projectKey, url);
  }

  /** Every page's comments for this project, newest first — the "All" scope. */
  async listAll(projectKey: string): Promise<Comment[]> {
    const prefix = `loupe:${projectKey}:`;
    const out: Comment[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      try {
        out.push(...(JSON.parse(localStorage.getItem(k) || "[]") as Comment[]));
      } catch { /* skip an unreadable key */ }
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async save(comment: Comment): Promise<Comment> {
    const all = this.readAll(comment.projectKey, comment.url);
    all.push(comment);
    this.writeAll(comment.projectKey, comment.url, all);
    return comment;
  }

  /**
   * Offline mode: keep the file inline. localStorage is only a few MB, so refuse
   * anything that would blow the quota rather than silently dropping it.
   */
  async upload(_projectKey: string, file: File): Promise<Attachment> {
    if (file.size > 3_000_000) throw new Error("attachment too large for offline mode");
    return {
      url: await fileToDataUrl(file),
      name: file.name,
      mime: file.type || undefined,
      kind: attachmentKind(file.type),
      size: file.size,
    };
  }

  /**
   * Keys that hold a comment list. `loupe:dock` (panel state) and `loupe:msgs:*`
   * (replies) share the prefix but are not comment lists — treating them as one made
   * update()/remove() throw, and would have it hunt a comment id among messages.
   */
  private commentKeys(): string[] {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("loupe:") && k !== "loupe:dock" && !k.startsWith("loupe:msgs:")) keys.push(k);
    }
    return keys;
  }

  private parseList(key: string): Comment[] {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? (value as Comment[]) : [];
    } catch {
      return [];
    }
  }

  /** Replies, kept under their own key so they survive a comment being re-saved. */
  private msgKey(threadId: string) {
    return `loupe:msgs:${threadId}`;
  }

  async listMessages(threadId: string): Promise<ThreadMessage[]> {
    try {
      const raw = localStorage.getItem(this.msgKey(threadId));
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? (parsed as ThreadMessage[]) : [];
    } catch {
      return [];
    }
  }

  async addMessage(
    threadId: string,
    message: { author: ThreadAuthor; body: string; attachments?: MessageAttachment[] },
  ): Promise<ThreadMessage> {
    const stored: ThreadMessage = {
      id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      threadId,
      author: message.author,
      body: message.body,
      attachments: message.attachments?.length ? message.attachments : undefined,
      createdAt: new Date().toISOString(),
    };
    const all = await this.listMessages(threadId);
    all.push(stored);
    localStorage.setItem(this.msgKey(threadId), JSON.stringify(all));
    return stored;
  }

  /** Offline reactions, keyed per thread. */
  async listReactions(threadId: string): Promise<Reaction[]> {
    try {
      const raw = localStorage.getItem(`loupe:rxn:${threadId}`);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async toggleReaction(input: { threadId: string; messageId: string; emoji: string; userId: string; userName?: string }): Promise<Reaction[]> {
    const current = await this.listReactions(input.threadId);
    // The same pure toggle the server uses, so offline and online behave identically.
    const next = toggleReaction(current, {
      messageId: input.messageId, emoji: input.emoji, userId: input.userId, userName: input.userName,
    });
    localStorage.setItem(`loupe:rxn:${input.threadId}`, JSON.stringify(next));
    return next;
  }

  /** Offline: the people are whoever has already commented locally. */
  async listPeople(projectKey: string): Promise<{ id: string; name: string; email?: string }[]> {
    const prefix = `loupe:${projectKey}:`;
    const seen = new Map<string, { id: string; name: string; email?: string }>();
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      for (const c of this.parseList(k)) {
        if (c.author?.id && !seen.has(c.author.id)) seen.set(c.author.id, c.author);
      }
    }
    return [...seen.values()];
  }

  /** Offline mode has no server to notify anyone from. */
  async listNotifications(): Promise<any[]> {
    return [];
  }

  async markNotificationsRead(): Promise<void> {
    /* nothing to mark offline */
  }

  async update(id: string, patch: Partial<Comment>): Promise<void> {
    // We don't know the url here, so scan the loupe:* list keys for the id.
    for (const k of this.commentKeys()) {
      const list = this.parseList(k);
      const idx = list.findIndex((c) => c.id === id);
      if (idx >= 0) {
        list[idx] = { ...list[idx]!, ...patch };
        localStorage.setItem(k, JSON.stringify(list));
        return;
      }
    }
  }

  async remove(id: string): Promise<void> {
    for (const k of this.commentKeys()) {
      const list = this.parseList(k);
      const next = list.filter((c) => c.id !== id);
      if (next.length !== list.length) {
        localStorage.setItem(k, JSON.stringify(next));
        return;
      }
    }
  }

  /** Offline: there is no organization to read. */
  async getOrg(): Promise<OrgInfo | null> {
    return null;
  }

  /** Offline: no server feed; the panel shows only what this browser reports. */
  async listActivity(_projectKey: string, _since?: string): Promise<ActivityEvent[] | null> {
    return null;
  }
}
