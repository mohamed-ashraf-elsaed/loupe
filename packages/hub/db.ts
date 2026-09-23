import { fileURLToPath } from "node:url";

/**
 * Same query() seam as packages/server/db.ts: node-postgres (`pg`) when
 * DATABASE_URL is set (production), otherwise an embedded PGlite database on
 * disk, or in memory for tests (HUB_PG_DIR=memory://).
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
    const { default: pg } = await import("pg");
    const pool = new pg.Pool({ connectionString: url });
    console.log("[hub] Postgres via DATABASE_URL");
    return { query: (text, params) => pool.query(text, params as any[]) as any };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.HUB_PG_DIR || fileURLToPath(new URL("./data/pg", import.meta.url));
  const inMemory = dir.startsWith("memory");
  if (!inMemory) {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(dir, { recursive: true });
  }
  const pg = new PGlite(inMemory ? "memory://" : dir);
  await pg.waitReady;
  console.log(`[hub] embedded Postgres (PGlite) at ${dir}`);
  return { query: (text, params) => pg.query(text, params as any[]) as any };
}

export function db(): Promise<Db> {
  if (!dbPromise) dbPromise = create();
  return dbPromise;
}

/** Idempotent schema, run on startup. */
export async function migrate(): Promise<void> {
  const d = await db();
  await d.query(`
    CREATE TABLE IF NOT EXISTS organizations (
      id               TEXT PRIMARY KEY,
      name             TEXT NOT NULL,
      allowed_domain   TEXT,
      created_by_email TEXT NOT NULL,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await d.query(`
    CREATE TABLE IF NOT EXISTS org_members (
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      email  TEXT NOT NULL,
      role   TEXT NOT NULL CHECK (role IN ('owner', 'member')),
      PRIMARY KEY (org_id, email)
    );
  `);
  await d.query(`CREATE INDEX IF NOT EXISTS org_members_email ON org_members (email);`);
  await d.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id             TEXT PRIMARY KEY,
      org_id         TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name           TEXT NOT NULL,
      secret         TEXT NOT NULL,
      webhook_url    TEXT NOT NULL,
      webhook_secret TEXT NOT NULL,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await d.query(`
    CREATE TABLE IF NOT EXISTS deliveries (
      id          TEXT PRIMARY KEY,
      project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      issue_id    TEXT NOT NULL,
      status      TEXT NOT NULL CHECK (status IN ('ok', 'failed')),
      http_status INT,
      attempts    INT NOT NULL,
      last_error  TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await d.query(`CREATE INDEX IF NOT EXISTS deliveries_project_created ON deliveries (project_id, created_at DESC);`);
}
