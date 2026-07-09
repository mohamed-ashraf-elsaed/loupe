import type { Comment, StorageAdapter } from "./types.js";

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

  async save(comment: Comment): Promise<Comment> {
    const all = this.readAll(comment.projectKey, comment.url);
    all.push(comment);
    this.writeAll(comment.projectKey, comment.url, all);
    return comment;
  }

  async update(id: string, patch: Partial<Comment>): Promise<void> {
    // We don't know the url here, so scan the loupe:* keys for the id.
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith("loupe:")) continue;
      const list = JSON.parse(localStorage.getItem(k) || "[]") as Comment[];
      const idx = list.findIndex((c) => c.id === id);
      if (idx >= 0) {
        list[idx] = { ...list[idx]!, ...patch };
        localStorage.setItem(k, JSON.stringify(list));
        return;
      }
    }
  }

  async remove(id: string): Promise<void> {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith("loupe:")) continue;
      const list = JSON.parse(localStorage.getItem(k) || "[]") as Comment[];
      const next = list.filter((c) => c.id !== id);
      if (next.length !== list.length) {
        localStorage.setItem(k, JSON.stringify(next));
        return;
      }
    }
  }
}
