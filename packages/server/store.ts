import { db } from "./db.ts";
import { normalizeUrl, normalizeStatus, normalizePriority, normalizeChangeType, statusAliases, type Comment } from "@loupekit/shared";

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
    status: normalizeStatus(r.status),
    priority: normalizePriority(r.priority),
    changeType: normalizeChangeType(r.change_type),
    repo: r.repo ?? undefined,
    branch: r.branch ?? undefined,
    body: r.body,
    title: r.title ?? undefined,
    kind: r.kind ?? "element",
    author: r.author,
    anchor: r.anchor,
    context: r.context,
    offset: r.offset,
    region: r.region ?? undefined,
    viewport: r.viewport ?? undefined,
    screenshot: r.screenshot_url ?? undefined,
    recording: r.recording_url ?? undefined,
    attachments: r.attachments ?? undefined,
    proposal: r.proposal ?? undefined,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

/** The filter set `GET /v1/comments` accepts. Every field is optional. */
export interface CommentFilters {
  /** Page path — normalized before matching, so query-string variants agree. */
  url?: string;
  repo?: string;
  branch?: string;
  /** Board stage. The legacy `open` / `done` names are accepted too. */
  status?: string;
  priority?: string;
  changeType?: string;
  /** "element" | "region" | "free". */
  kind?: string;
  /** Free text over the title and body. */
  q?: string;
}

/**
 * List a project's comments, newest first, filtered in SQL so a board with
 * thousands of rows never ships them all to the client.
 */
export async function listComments(projectKey: string, filters: CommentFilters = {}): Promise<Comment[]> {
  const d = await db();
  const where: string[] = ["project_key = $1"];
  const vals: unknown[] = [projectKey];
  const push = (v: unknown) => { vals.push(v); return `$${vals.length}`; };

  if (filters.url) where.push(`url = ${push(normalizeUrl(filters.url))}`);
  if (filters.repo) where.push(`repo = ${push(filters.repo)}`);
  if (filters.branch) where.push(`branch = ${push(filters.branch)}`);
  // Match the stage AND any legacy alias, so a pre-board row is not missed.
  if (filters.status) where.push(`status = ANY(${push(statusAliases(normalizeStatus(filters.status)))})`);
  if (filters.priority) where.push(`priority = ${push(normalizePriority(filters.priority))}`);
  if (filters.changeType) where.push(`change_type = ${push(normalizeChangeType(filters.changeType))}`);
  if (filters.kind) where.push(`kind = ${push(filters.kind)}`);
  if (filters.q) {
    const like = push(`%${filters.q.toLowerCase()}%`);
    where.push(`(lower(coalesce(title, '')) LIKE ${like} OR lower(body) LIKE ${like})`);
  }

  const { rows } = await d.query(
    `SELECT * FROM comments WHERE ${where.join(" AND ")} ORDER BY created_at DESC`,
    vals,
  );
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
    `INSERT INTO comments (id, project_key, url, status, priority, change_type, repo, branch, body, title, kind, author, anchor, context, "offset", region, viewport, screenshot_url, recording_url, attachments, proposal, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21, COALESCE($22::timestamptz, now()))
     ON CONFLICT (id) DO UPDATE SET
       url = EXCLUDED.url, status = EXCLUDED.status,
       priority = EXCLUDED.priority, change_type = EXCLUDED.change_type,
       repo = EXCLUDED.repo, branch = EXCLUDED.branch,
       body = EXCLUDED.body, title = EXCLUDED.title,
       kind = EXCLUDED.kind,
       author = EXCLUDED.author, anchor = EXCLUDED.anchor, context = EXCLUDED.context,
       "offset" = EXCLUDED."offset", region = EXCLUDED.region, viewport = EXCLUDED.viewport,
       screenshot_url = EXCLUDED.screenshot_url, recording_url = EXCLUDED.recording_url,
       attachments = EXCLUDED.attachments, proposal = EXCLUDED.proposal
     RETURNING *`,
    [
      c.id, c.projectKey, url, normalizeStatus(c.status),
      normalizePriority(c.priority), normalizeChangeType(c.changeType),
      c.repo ?? null, c.branch ?? null,
      c.body, c.title ?? null, c.kind ?? "element",
      JSON.stringify(c.author), JSON.stringify(c.anchor), JSON.stringify(c.context),
      JSON.stringify(c.offset), c.region ? JSON.stringify(c.region) : null,
      c.viewport ? JSON.stringify(c.viewport) : null,
      c.screenshot ?? null, c.recording ?? null,
      c.attachments ? JSON.stringify(c.attachments) : null,
      c.proposal ? JSON.stringify(c.proposal) : null, c.createdAt ?? null,
    ],
  );
  return rowToComment(rows[0]);
}

export async function patchComment(id: string, patch: Partial<Comment>): Promise<Comment | null> {
  const d = await db();
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (patch.status !== undefined) { sets.push(`status = $${i++}`); vals.push(normalizeStatus(patch.status)); }
  if (patch.priority !== undefined) { sets.push(`priority = $${i++}`); vals.push(normalizePriority(patch.priority)); }
  if (patch.changeType !== undefined) { sets.push(`change_type = $${i++}`); vals.push(normalizeChangeType(patch.changeType)); }
  if (patch.body !== undefined) { sets.push(`body = $${i++}`); vals.push(patch.body); }
  if (patch.title !== undefined) { sets.push(`title = $${i++}`); vals.push(patch.title); }
  // Claude writes its modified UI back here (via MCP propose_change / the API).
  if (patch.proposal !== undefined) { sets.push(`proposal = $${i++}`); vals.push(JSON.stringify(patch.proposal)); }
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
