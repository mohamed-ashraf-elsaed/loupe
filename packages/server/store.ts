import { db } from "./db.ts";
import { normalizeUrl, type Comment } from "@loupekit/shared";

export interface Project {
  project_key: string;
  name: string;
  secret: string;
  allowed_origins: string[];
}

// ---- projects ----

export async function getProject(projectKey: string): Promise<Project | null> {
  const d = await db();
  const { rows } = await d.query<Project>(`SELECT * FROM projects WHERE project_key = $1`, [projectKey]);
  return rows[0] ?? null;
}

export async function upsertProject(p: Project): Promise<void> {
  const d = await db();
  await d.query(
    `INSERT INTO projects (project_key, name, secret, allowed_origins)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (project_key) DO UPDATE SET name = EXCLUDED.name, secret = EXCLUDED.secret, allowed_origins = EXCLUDED.allowed_origins`,
    [p.project_key, p.name, p.secret, p.allowed_origins],
  );
}

// ---- comments ----

function rowToComment(r: any): Comment {
  return {
    id: r.id,
    projectKey: r.project_key,
    url: r.url,
    status: r.status,
    body: r.body,
    kind: r.kind ?? "element",
    author: r.author,
    anchor: r.anchor,
    context: r.context,
    offset: r.offset,
    region: r.region ?? undefined,
    screenshot: r.screenshot_url ?? undefined,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

export async function listComments(projectKey: string, url?: string): Promise<Comment[]> {
  const d = await db();
  if (url) {
    const { rows } = await d.query(
      `SELECT * FROM comments WHERE project_key = $1 AND url = $2 ORDER BY created_at DESC`,
      [projectKey, normalizeUrl(url)],
    );
    return rows.map(rowToComment);
  }
  const { rows } = await d.query(`SELECT * FROM comments WHERE project_key = $1 ORDER BY created_at DESC`, [projectKey]);
  return rows.map(rowToComment);
}

export async function getComment(id: string): Promise<Comment | null> {
  const d = await db();
  const { rows } = await d.query(`SELECT * FROM comments WHERE id = $1`, [id]);
  return rows[0] ? rowToComment(rows[0]) : null;
}

/** Insert or replace a comment. URL is normalized so comments don't fragment. */
export async function upsertComment(c: Comment): Promise<Comment> {
  const d = await db();
  const url = normalizeUrl(c.url);
  const { rows } = await d.query(
    `INSERT INTO comments (id, project_key, url, status, body, kind, author, anchor, context, "offset", region, screenshot_url, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, COALESCE($13::timestamptz, now()))
     ON CONFLICT (id) DO UPDATE SET
       url = EXCLUDED.url, status = EXCLUDED.status, body = EXCLUDED.body, kind = EXCLUDED.kind,
       author = EXCLUDED.author, anchor = EXCLUDED.anchor, context = EXCLUDED.context,
       "offset" = EXCLUDED."offset", region = EXCLUDED.region, screenshot_url = EXCLUDED.screenshot_url
     RETURNING *`,
    [
      c.id, c.projectKey, url, c.status ?? "open", c.body, c.kind ?? "element",
      JSON.stringify(c.author), JSON.stringify(c.anchor), JSON.stringify(c.context),
      JSON.stringify(c.offset), c.region ? JSON.stringify(c.region) : null,
      c.screenshot ?? null, c.createdAt ?? null,
    ],
  );
  return rowToComment(rows[0]);
}

export async function patchComment(id: string, patch: Partial<Comment>): Promise<Comment | null> {
  const d = await db();
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (patch.status !== undefined) { sets.push(`status = $${i++}`); vals.push(patch.status); }
  if (patch.body !== undefined) { sets.push(`body = $${i++}`); vals.push(patch.body); }
  if (!sets.length) return getComment(id);
  vals.push(id);
  const { rows } = await d.query(`UPDATE comments SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`, vals);
  return rows[0] ? rowToComment(rows[0]) : null;
}

export async function removeComment(id: string): Promise<boolean> {
  const d = await db();
  const { rows } = await d.query(`DELETE FROM comments WHERE id = $1 RETURNING id`, [id]);
  return rows.length > 0;
}
