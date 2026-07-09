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
      status         TEXT NOT NULL DEFAULT 'open',
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
}
