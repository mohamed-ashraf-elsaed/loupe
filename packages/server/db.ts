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
  // Revisions: a reviewer reopens a resolved thread rather than filing a new one.
  await d.query(`ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_thread_id TEXT;`);
  await d.query(`ALTER TABLE comments ADD COLUMN IF NOT EXISTS iteration_type TEXT;`);
  await d.query(`ALTER TABLE comments ADD COLUMN IF NOT EXISTS iteration_number INTEGER;`);
  // Thread messages. The comment's own `body` is presented as message #1 rather than
  // copied here: no backfill to run, and no window where a thread has no messages.
  await d.query(`
    CREATE TABLE IF NOT EXISTS thread_messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      project_key TEXT NOT NULL,
      author JSONB NOT NULL,
      body TEXT NOT NULL,
      attachments JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );`);
  await d.query(`CREATE INDEX IF NOT EXISTS thread_messages_lookup ON thread_messages (thread_id, created_at);`);
  // Soft delete. Added after the table existed, so it is an ALTER rather than a column
  // in the CREATE — an app that upgrades the package must not need a rebuild.
  await d.query(`ALTER TABLE thread_messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;`);
  // Who took part. Maintained on write so a notification can target them without
  // walking the conversation; the comment's own author is folded in on read.
  await d.query(`
    CREATE TABLE IF NOT EXISTS thread_participants (
      thread_id TEXT NOT NULL,
      project_key TEXT NOT NULL,
      author_id TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      type TEXT NOT NULL,
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (thread_id, author_id)
    );`);
  // In-app notifications. Created when someone is mentioned; read state is per person.
  await d.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      project_key TEXT NOT NULL,
      recipient_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      body TEXT NOT NULL,
      actor_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      read_at TIMESTAMPTZ
    );`);
  // One row per (message, emoji, person). The primary key IS the toggle invariant:
  // reacting twice cannot create two rows, so a count can never drift.
  await d.query(`
    CREATE TABLE IF NOT EXISTS reactions (
      thread_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      emoji TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (thread_id, message_id, emoji, user_id)
    );`);
  await d.query(`CREATE INDEX IF NOT EXISTS notifications_inbox ON notifications (project_key, recipient_id, created_at);`);
  // Five-stage board: rows written before it kept the old three-value status.
  // Both statements are idempotent — after the first run there is nothing to
  // rewrite (`in_progress` is unchanged, so it needs no statement).
  await d.query(`UPDATE comments SET status = 'queue'    WHERE status = 'open';`);
  await d.query(`UPDATE comments SET status = 'resolved' WHERE status = 'done';`);
}
