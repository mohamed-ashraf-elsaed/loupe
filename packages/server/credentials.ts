/**
 * Credential encryption at rest.
 *
 * Integration tokens are the most dangerous thing this product stores: a Slack bot token
 * can post as the company, a Jira token can read every issue. Two rules follow from that
 * and they are the whole design:
 *
 *  1. **The plaintext is never returned by the API.** Not masked, not on a GET, not in an
 *     error. There is no "reveal" endpoint, because a reveal endpoint is a plaintext
 *     endpoint with extra steps. `redact()` is what responses carry.
 *  2. **Encryption is authenticated.** AES-256-GCM, so a tampered ciphertext fails to
 *     decrypt rather than yielding attacker-chosen garbage that then gets sent somewhere
 *     as a credential.
 *
 * The key comes from config (`LOUPE_CREDENTIAL_KEY`). Without one, credentials cannot be
 * stored at all — the module refuses rather than falling back to a plaintext column, since
 * a silent downgrade is how a "we encrypt tokens" claim stops being true.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 32 bytes for AES-256. */
const KEY_BYTES = 32;
const IV_BYTES = 12; // GCM's recommended nonce length
const TAG_BYTES = 16;

export class CredentialKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialKeyError";
  }
}

/**
 * Parse a key from config.
 *
 * Accepts base64 (the natural way to write 32 random bytes in an env var) or a
 * passphrase, which is hashed to length. A passphrase is weaker, so it is accepted rather
 * than rejected — a wrong-length base64 string is the mistake worth catching, and
 * silently padding one would hide it.
 */
export function parseKey(raw: string | undefined): Buffer {
  if (!raw || !raw.trim()) {
    throw new CredentialKeyError(
      "LOUPE_CREDENTIAL_KEY is not set. Integrations cannot store credentials without it — refusing rather than storing them in plaintext.",
    );
  }
  const trimmed = raw.trim();
  // A base64 string of exactly 32 bytes is the intended form.
  if (/^[A-Za-z0-9+/=]+$/.test(trimmed)) {
    const buf = Buffer.from(trimmed, "base64");
    if (buf.length === KEY_BYTES) return buf;
    // Looks like base64 but is the wrong size: that is a misconfiguration, not a
    // passphrase, and padding it would produce a key nobody can explain.
    if (buf.length > 0 && trimmed.length % 4 === 0) {
      throw new CredentialKeyError(
        `LOUPE_CREDENTIAL_KEY decodes to ${buf.length} bytes; AES-256 needs ${KEY_BYTES}. Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
      );
    }
  }
  // Anything else is a passphrase; a fixed-size digest of it is a usable key.
  return createHashKey(trimmed);
}

function createHashKey(passphrase: string): Buffer {
  // sha256 over the passphrase, so any length works and the same phrase always yields
  // the same key.
  return createHash("sha256").update(passphrase).digest();
}

export interface Encrypted {
  /** base64 iv.tag.ciphertext */
  sealed: string;
  /** Marks the scheme, so a future change can be told apart from this one. */
  v: 1;
}

/** Encrypt a credential bag. */
export function encrypt(plaintext: string, key: Buffer): Encrypted {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { sealed: `${iv.toString("base64")}.${tag.toString("base64")}.${ciphertext.toString("base64")}`, v: 1 };
}

/**
 * Decrypt, or throw.
 *
 * A wrong key and a tampered ciphertext both fail here — which is the point of GCM. The
 * error deliberately says nothing about *why*, so it cannot be used as an oracle.
 */
export function decrypt(sealed: string, key: Buffer): string {
  const parts = String(sealed).split(".");
  if (parts.length !== 3) throw new Error("credential is not in the expected format");
  const [ivB64, tagB64, dataB64] = parts as [string, string, string];
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new Error("credential is not in the expected format");

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  // Throws on a bad tag, before any plaintext is produced.
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

export function encryptBag(bag: Record<string, string>, key: Buffer): Encrypted {
  return encrypt(JSON.stringify(bag), key);
}

export function decryptBag(sealed: string, key: Buffer): Record<string, string> {
  const parsed = JSON.parse(decrypt(sealed, key));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("credential bag is not an object");
  return parsed as Record<string, string>;
}

/**
 * What a credential looks like on the wire.
 *
 * A fixed placeholder rather than a masked prefix of the real value: showing the first
 * four characters of a token is a small leak that adds nothing, and it invites people to
 * think the API returned the credential. `set: false` is the useful signal — "you have
 * not configured this yet" — which is what the UI actually needs.
 */
export interface RedactedCredential {
  set: true;
  /** The names configured, never the values. */
  fields: string[];
  updatedAt?: string;
}

export function redact(fields: string[], updatedAt?: string): RedactedCredential {
  return { set: true, fields: [...fields].sort(), updatedAt };
}

/**
 * Strip anything secret-looking out of text before it is logged.
 *
 * Applied to provider error bodies, which are the most likely place for a token to
 * reappear: an API that echoes back the request it rejected. Cheap, and the alternative
 * is a token in a log file forever.
 */
export function scrubSecrets(text: string, secrets: string[] = []): string {
  let out = String(text ?? "");
  for (const secret of secrets) {
    if (secret && secret.length >= 6 && out.includes(secret)) {
      out = out.split(secret).join("[redacted]");
    }
  }
  // Common shapes, for the case where the token is not one we were handed: Slack bot
  // tokens, Telegram bot ids, generic bearer headers.
  return out
    .replace(/xox[baprs]-[A-Za-z0-9-]{10,}/g, "[redacted]")
    .replace(/\b\d{6,12}:[A-Za-z0-9_-]{30,}\b/g, "[redacted]")
    .replace(/\b(Bearer|token|api[_-]?key)\s+[A-Za-z0-9._-]{12,}/gi, "$1 [redacted]");
}

/** Constant-time compare, for anything credential-shaped being checked by value. */
export function sameSecret(a: string, b: string): boolean {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
