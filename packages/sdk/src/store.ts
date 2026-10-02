import type { Attachment, Comment, StorageAdapter } from "./types.js";
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
   * Keys that hold a comment list. `loupe:dock` also lives under `loupe:` but
   * holds an OBJECT (panel state), so treating every `loupe:` key as a list made
   * update()/remove() throw as soon as the panel persisted anything.
   */
  private commentKeys(): string[] {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("loupe:") && k !== "loupe:dock") keys.push(k);
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
}
