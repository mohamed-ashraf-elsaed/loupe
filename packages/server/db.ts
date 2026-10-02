import { fileURLToPath } from "node:url";

/**
 * One tiny query() seam over Postgres. Uses node-postgres (`pg`) when DATABASE_URL
 * is set (real/hosted Postgres), otherwise an embedded PGlite database on disk —
 * same SQL, same `$1` placeholders, so nothing else in the server changes.
 */
export interface QueryResult<T = any> {
  rows: T[];
}
export interface Db {
  query<T = any>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
}

let dbPromise: Promise<Db> | null = null;

async function create(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: url });
    console.log("[loupe] Postgres via DATABASE_URL");
    return { query: (text, params) => pool.query(text, params as any[]) as any };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.LOUPE_PG_DIR || fileURLToPath(new URL("./data/pg", import.meta.url));
  // "memory://" (or "memory") → ephemeral in-memory DB, used by the test suite.
  const inMemory = dir.startsWith("memory");
  if (!inMemory) {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(dir, { recursive: true });
  }
  const pg = new PGlite(inMemory ? "memory://" : dir);
  await pg.waitReady;
  console.log(`[loupe] embedded Postgres (PGlite) at ${dir}`);
  return { query: (text, params) => pg.query(text, params as any[]) as any };
}

export function db(): Promise<Db> {
  if (!dbPromise) dbPromise = create();
  return dbPromise;
}

/** Idempotent schema — run on startup. */
export async function migrate(): Promise<void> {
  const d = await db();
  await d.query(`
    CREATE TABLE IF NOT EXISTS projects (
      project_key     TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      secret          TEXT NOT NULL,
      allowed_origins TEXT[] NOT NULL DEFAULT '{}',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await d.query(`
    CREATE TABLE IF NOT EXISTS comments (
      id             TEXT PRIMARY KEY,
      project_key    TEXT NOT NULL REFERENCES projects(project_key) ON DELETE CASCADE,
      url            TEXT NOT NULL,
      status         TEXT NOT NULL DEFAULT 'queue',
      priority       TEXT NOT NULL DEFAULT 'medium',
      change_type    TEXT NOT NULL DEFAULT 'other',
      repo           TEXT,
      branch         TEXT,
      body           TEXT NOT NULL,
      author         JSONB NOT NULL,
      anchor         JSONB NOT NULL,
      context        JSONB NOT NULL,
      "offset"       JSONB NOT NULL,
      screenshot_url TEXT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await d.query(`CREATE INDEX IF NOT EXISTS comments_project_url ON comments (project_key, url);`);
  // Additive columns for free-region comments (older tables predate them).
  await d.query(`ALTER TABLE comments ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'element';`);
  await d.query(`ALTER TABLE comments ADD COLUMN IF NOT EXISTS region JSONB;`);
  // Viewport the feedback was captured on (→ desktop / tablet / mobile).
  await d.query(`ALTER TABLE comments ADD COLUMN IF NOT EXISTS viewport JSONB;`);
  // A screen recording of the region (webm object-storage URL).
  await d.query(`ALTER TABLE comments ADD COLUMN IF NOT EXISTS recording_url TEXT;`);
  // Claude's proposed UI change, written back via MCP (see shared Proposal type).
  await d.query(`ALTER TABLE comments ADD COLUMN IF NOT EXISTS proposal JSONB;`);
  // One-line summary of the issue (falls back to the first line of `body`).
  await d.query(`ALTER TABLE comments ADD COLUMN IF NOT EXISTS title TEXT;`);
  // Files the reporter attached — a JSONB array of the shared `Attachment` type.
  await d.query(`ALTER TABLE comments ADD COLUMN IF NOT EXISTS attachments JSONB;`);
  // Triage metadata: how urgent (critical→low) and what it touches (frontend/…).
  await d.query(`ALTER TABLE comments ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium';`);
  await d.query(`ALTER TABLE comments ADD COLUMN IF NOT EXISTS change_type TEXT NOT NULL DEFAULT 'other';`);
  // Which repo/branch the feedback was filed against (branch-aware threads).
  await d.query(`ALTER TABLE comments ADD COLUMN IF NOT EXISTS repo TEXT;`);
  await d.query(`ALTER TABLE comments ADD COLUMN IF NOT EXISTS branch TEXT;`);
  // The pull request carrying a thread's fix: { number, url, state, checksPassed,
  // checksTotal }. Drives the panel's lifecycle chip and checks meter.
  await d.query(`ALTER TABLE comments ADD COLUMN IF NOT EXISTS pr JSONB;`);
  // Working branches: which branch accumulates a repo's fixes, and what it became.
  await d.query(`
    CREATE TABLE IF NOT EXISTS working_branches (
      id TEXT PRIMARY KEY,
      project_key TEXT NOT NULL,
      repo TEXT NOT NULL,
      branch TEXT NOT NULL,
      base_branch TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      head_sha TEXT,
      pr_number INTEGER,
      pr_url TEXT,
      preview_url TEXT,
      fix_count INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );`);
  await d.query(`CREATE INDEX IF NOT EXISTS working_branches_lookup ON working_branches (project_key, repo);`);
  // URL patterns per repo, so a deployment can be recognised rather than guessed.
  await d.query(`
    CREATE TABLE IF NOT EXISTS repo_urls (
      id TEXT PRIMARY KEY,
      project_key TEXT NOT NULL,
      repo TEXT NOT NULL,
      environment TEXT NOT NULL,
      pattern TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );`);
  await d.query(`CREATE INDEX IF NOT EXISTS repo_urls_lookup ON repo_urls (project_key, repo);`);
  // Five-stage board: rows written before it kept the old three-value status.
  // Both statements are idempotent — after the first run there is nothing to
  // rewrite (`in_progress` is unchanged, so it needs no statement).
  await d.query(`UPDATE comments SET status = 'queue'    WHERE status = 'open';`);
  await d.query(`UPDATE comments SET status = 'resolved' WHERE status = 'done';`);
}
