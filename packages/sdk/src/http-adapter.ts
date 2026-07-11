import type { Comment, LoupeUser, StorageAdapter } from "./types.js";

/**
 * Talks to the Loupe backend. Selected automatically when `apiBase` is set in
 * init(). Sends the identity headers the backend verifies (HMAC in production).
 */
export class HttpAdapter implements StorageAdapter {
  constructor(
    private base: string,
    private user: LoupeUser,
    private userHmac?: string,
    private extraHeaders?: Record<string, string>,
    private credentials?: RequestCredentials,
  ) {
    this.base = base.replace(/\/$/, "");
  }

  private headers(): HeadersInit {
    const h: Record<string, string> = { "Content-Type": "application/json", "X-Loupe-User": this.user.id };
    if (this.userHmac) h["X-Loupe-Hmac"] = this.userHmac;
    if (this.extraHeaders) Object.assign(h, this.extraHeaders);
    return h;
  }

  /** Base fetch options shared by every request (credentials mode, if set). */
  private opts(init?: RequestInit): RequestInit {
    return this.credentials ? { credentials: this.credentials, ...init } : { ...init };
  }

  async list(projectKey: string, url: string): Promise<Comment[]> {
    const q = new URLSearchParams({ projectKey, url });
    const res = await fetch(`${this.base}/v1/comments?${q}`, this.opts({ headers: this.headers() }));
    if (!res.ok) throw new Error(`list failed: ${res.status}`);
    return (await res.json()) as Comment[];
  }

  async save(comment: Comment): Promise<Comment> {
    // Upload the screenshot to object storage first, then store only its URL —
    // keeps the comment row (and every later list/read) small.
    if (comment.screenshot?.startsWith("data:")) {
      try {
        const up = await fetch(`${this.base}/v1/blobs`, this.opts({
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({ projectKey: comment.projectKey, data: comment.screenshot }),
        }));
        if (up.ok) comment = { ...comment, screenshot: (await up.json()).url };
      } catch {
        /* fall back to inlining the data URL if upload fails */
      }
    }
    const res = await fetch(`${this.base}/v1/comments`, this.opts({
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(comment),
    }));
    if (!res.ok) throw new Error(`save failed: ${res.status}`);
    return (await res.json()) as Comment;
  }

  async update(id: string, patch: Partial<Comment>): Promise<void> {
    const res = await fetch(`${this.base}/v1/comments/${encodeURIComponent(id)}`, this.opts({
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify(patch),
    }));
    if (!res.ok) throw new Error(`update failed: ${res.status}`);
  }

  async remove(id: string): Promise<void> {
    const res = await fetch(`${this.base}/v1/comments/${encodeURIComponent(id)}`, this.opts({
      method: "DELETE",
      headers: this.headers(),
    }));
    if (!res.ok && res.status !== 404) throw new Error(`remove failed: ${res.status}`);
  }
}
