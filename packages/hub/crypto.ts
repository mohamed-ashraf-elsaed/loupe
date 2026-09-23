import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Opaque, unguessable identifiers and secrets with a readable type prefix. */
export const newId = (prefix: string) => `${prefix}_${randomBytes(12).toString("hex")}`;
export const newSecret = (prefix: string) => `${prefix}_${randomBytes(24).toString("base64url")}`;

/** hex(HMAC-SHA256(timestamp + "." + body, secret)): the ingest and webhook signature scheme. */
export function sign(timestamp: string | number, body: string, secret: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Max clock skew accepted on a signed request. */
export const MAX_SKEW_SECONDS = 300;

export type SignatureCheck = { ok: true } | { ok: false; reason: string };

/** Verify a signed request: fresh timestamp + constant-time signature compare. */
export function verifySignature(
  timestamp: string,
  body: string,
  signature: string,
  secret: string,
  now: number = Math.floor(Date.now() / 1000),
): SignatureCheck {
  if (!/^\d{1,12}$/.test(timestamp)) return { ok: false, reason: "invalid timestamp" };
  if (Math.abs(now - Number(timestamp)) > MAX_SKEW_SECONDS) return { ok: false, reason: "timestamp out of range" };
  if (!safeEqual(sign(timestamp, body, secret), signature.toLowerCase())) return { ok: false, reason: "invalid signature" };
  return { ok: true };
}

// ---- session cookie: base64url(json) + "." + hmac ----

export interface Session {
  email: string;
  name?: string;
  /** Expiry, unix seconds. */
  exp: number;
}

export const SESSION_TTL_SECONDS = 7 * 24 * 3600;

export function encodeSession(s: Session, secret: string): string {
  const payload = Buffer.from(JSON.stringify(s)).toString("base64url");
  const mac = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

export function decodeSession(token: string, secret: string, now: number = Math.floor(Date.now() / 1000)): Session | null {
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  if (!safeEqual(expected, mac)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString()) as Session;
    if (typeof s.email !== "string" || typeof s.exp !== "number" || s.exp < now) return null;
    return s;
  } catch {
    return null;
  }
}
