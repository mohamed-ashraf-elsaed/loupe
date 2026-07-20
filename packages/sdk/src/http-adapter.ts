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

  /** Upload an inline data-URL asset to object storage; return its URL (or the data URL on failure). */
  private async uploadBlob(projectKey: string, data: string): Promise<string> {
    try {
      const up = await fetch(`${this.base}/v1/blobs`, this.opts({
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ projectKey, data }),
      }));
      if (up.ok) return (await up.json()).url as string;
    } catch {
      /* fall back to inlining below */
    }
    return data;
  }

  async save(comment: Comment): Promise<Comment> {
    // Upload media to object storage first, then store only the URL — keeps the
    // comment row (and every later list/read) small.
    if (comment.screenshot?.startsWith("data:")) {
      comment = { ...comment, screenshot: await this.uploadBlob(comment.projectKey, comment.screenshot) };
    }
    if (comment.recording?.startsWith("data:")) {
      comment = { ...comment, recording: await this.uploadBlob(comment.projectKey, comment.recording) };
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
