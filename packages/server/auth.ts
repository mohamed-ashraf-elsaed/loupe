import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { getProject, type Project } from "./store.ts";

export function signUser(userId: string, secret: string): string {
  return createHmac("sha256", secret).update(userId).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function verifyUser(userId: string, providedHmac: string, secret: string): boolean {
  return safeEqual(signUser(userId, secret), providedHmac);
}

export type Auth =
  | { ok: true; project: Project; mode: "user"; userId: string }
  | { ok: true; project: Project; mode: "admin" }
  | { ok: false; status: number; reason: string };

/**
 * Authenticate a request against a project.
 * - Admin (dashboard / back-office): X-Loupe-Admin == project secret.
 * - User (SDK): X-Loupe-User + X-Loupe-Hmac = HMAC-SHA256(userId, secret).
 */
export async function authenticate(projectKey: string | null, req: IncomingMessage): Promise<Auth> {
  if (!projectKey) return { ok: false, status: 400, reason: "missing projectKey" };
  const project = await getProject(projectKey);
  if (!project) return { ok: false, status: 404, reason: "unknown project" };

  const admin = String(req.headers["x-loupe-admin"] || "");
  if (admin && safeEqual(admin, project.secret)) return { ok: true, project, mode: "admin" };

  const userId = String(req.headers["x-loupe-user"] || "");
  const hmac = String(req.headers["x-loupe-hmac"] || "");
  if (userId && hmac && verifyUser(userId, hmac, project.secret)) {
    return { ok: true, project, mode: "user", userId };
  }
  return { ok: false, status: 401, reason: "invalid or missing credentials" };
}
