import { db } from "./db.ts";
import { newId, newSecret } from "./crypto.ts";

export type Role = "owner" | "member";

export interface Organization {
  id: string;
  name: string;
  allowed_domain: string | null;
  created_by_email: string;
  created_at: string;
}
export interface OrgWithRole extends Organization {
  role: Role;
}
export interface Member {
  org_id: string;
  email: string;
  role: Role;
}
export interface Project {
  id: string;
  org_id: string;
  name: string;
  secret: string;
  webhook_url: string;
  webhook_secret: string;
  created_at: string;
}
export interface Delivery {
  id: string;
  project_id: string;
  issue_id: string;
  status: "ok" | "failed";
  http_status: number | null;
  attempts: number;
  last_error: string | null;
  created_at: string;
}

/** Emails are compared case-insensitively everywhere; store them lowercased. */
export const normEmail = (email: string) => email.trim().toLowerCase();

/** "@Acme.com" / "acme.com" → "acme.com"; empty → null. */
export function normDomain(domain: string | null | undefined): string | null {
  const d = (domain ?? "").trim().toLowerCase().replace(/^@/, "");
  return d === "" ? null : d;
}

export const isEmail = (s: unknown): s is string =>
  typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim()) && s.length <= 320;

export const isDomain = (s: string) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s);

// ---- organizations & members ----

/** Create an org; its creator becomes the owner. */
export async function createOrg(name: string, creatorEmail: string, allowedDomain?: string | null): Promise<Organization> {
  const d = await db();
  const id = newId("org");
  const email = normEmail(creatorEmail);
  const { rows } = await d.query<Organization>(
    `INSERT INTO organizations (id, name, allowed_domain, created_by_email) VALUES ($1, $2, $3, $4) RETURNING *`,
    [id, name, normDomain(allowedDomain), email],
  );
  await d.query(`INSERT INTO org_members (org_id, email, role) VALUES ($1, $2, 'owner')`, [id, email]);
  return rows[0]!;
}

export async function getOrg(id: string): Promise<Organization | null> {
  const d = await db();
  const { rows } = await d.query<Organization>(`SELECT * FROM organizations WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

/** Orgs the email is an explicit member of, with its role. */
export async function listOrgsFor(email: string): Promise<OrgWithRole[]> {
  const d = await db();
  const { rows } = await d.query<OrgWithRole>(
    `SELECT o.*, m.role FROM organizations o JOIN org_members m ON m.org_id = o.id
     WHERE m.email = $1 ORDER BY o.created_at DESC`,
    [normEmail(email)],
  );
  return rows;
}

export async function roleIn(orgId: string, email: string): Promise<Role | null> {
  const d = await db();
  const { rows } = await d.query<{ role: Role }>(
    `SELECT role FROM org_members WHERE org_id = $1 AND email = $2`,
    [orgId, normEmail(email)],
  );
  return rows[0]?.role ?? null;
}

export async function setAllowedDomain(orgId: string, domain: string | null): Promise<void> {
  const d = await db();
  await d.query(`UPDATE organizations SET allowed_domain = $2 WHERE id = $1`, [orgId, normDomain(domain)]);
}

export async function listMembers(orgId: string): Promise<Member[]> {
  const d = await db();
  const { rows } = await d.query<Member>(
    `SELECT * FROM org_members WHERE org_id = $1 ORDER BY role DESC, email`,
    [orgId],
  );
  return rows;
}

export async function addMember(orgId: string, email: string, role: Role): Promise<void> {
  const d = await db();
  await d.query(
    `INSERT INTO org_members (org_id, email, role) VALUES ($1, $2, $3)
     ON CONFLICT (org_id, email) DO UPDATE SET role = EXCLUDED.role`,
    [orgId, normEmail(email), role],
  );
}

/** Remove a member. Refuses (returns false) to remove the org's last owner. */
export async function removeMember(orgId: string, email: string): Promise<boolean> {
  const d = await db();
  const e = normEmail(email);
  if ((await roleIn(orgId, e)) === "owner") {
    const { rows } = await d.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM org_members WHERE org_id = $1 AND role = 'owner'`,
      [orgId],
    );
    if (rows[0]!.n <= 1) return false;
  }
  await d.query(`DELETE FROM org_members WHERE org_id = $1 AND email = $2`, [orgId, e]);
  return true;
}

/**
 * The ingest membership rule: the email is an explicit member of the org, OR
 * its domain equals the org's allowed_domain.
 */
export async function isAllowedSubmitter(org: Organization, email: string): Promise<boolean> {
  const e = normEmail(email);
  if (org.allowed_domain && e.slice(e.lastIndexOf("@") + 1) === org.allowed_domain) return true;
  return (await roleIn(org.id, e)) !== null;
}

// ---- projects ----

export async function createProject(orgId: string, name: string, webhookUrl: string): Promise<Project> {
  const d = await db();
  const { rows } = await d.query<Project>(
    `INSERT INTO projects (id, org_id, name, secret, webhook_url, webhook_secret)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [newId("prj"), orgId, name, newSecret("psk"), webhookUrl, newSecret("whs")],
  );
  return rows[0]!;
}

export async function getProject(id: string): Promise<Project | null> {
  const d = await db();
  const { rows } = await d.query<Project>(`SELECT * FROM projects WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function listProjects(orgId: string): Promise<Project[]> {
  const d = await db();
  const { rows } = await d.query<Project>(`SELECT * FROM projects WHERE org_id = $1 ORDER BY created_at DESC`, [orgId]);
  return rows;
}

export async function setWebhookUrl(projectId: string, url: string): Promise<void> {
  const d = await db();
  await d.query(`UPDATE projects SET webhook_url = $2 WHERE id = $1`, [projectId, url]);
}

/** Rotate the project secret (psk_) or the webhook signing secret (whs_). Returns the new value. */
export async function rotateSecret(projectId: string, which: "secret" | "webhook_secret"): Promise<string> {
  const d = await db();
  const value = newSecret(which === "secret" ? "psk" : "whs");
  // `which` is a closed union, never user text, so interpolating the column is safe.
  await d.query(`UPDATE projects SET ${which} = $2 WHERE id = $1`, [projectId, value]);
  return value;
}

// ---- deliveries ----

export async function recordDelivery(d0: Omit<Delivery, "created_at">): Promise<void> {
  const d = await db();
  await d.query(
    `INSERT INTO deliveries (id, project_id, issue_id, status, http_status, attempts, last_error)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [d0.id, d0.project_id, d0.issue_id, d0.status, d0.http_status, d0.attempts, d0.last_error],
  );
}

export async function listDeliveries(projectId: string, limit = 20): Promise<Delivery[]> {
  const d = await db();
  const { rows } = await d.query<Delivery>(
    `SELECT * FROM deliveries WHERE project_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
    [projectId, limit],
  );
  return rows;
}
