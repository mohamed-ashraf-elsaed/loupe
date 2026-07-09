import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Object-storage seam for screenshots. Local disk now; swap put()/get() for S3
 * (putObject → return the public/signed URL) in production. Comments store only
 * the URL, never the base64 — so lists and reads stay small.
 */
// Read env lazily so tests (and the server) can set the dir/URL before use.
const dir = () => process.env.LOUPE_BLOB_DIR || fileURLToPath(new URL("./data/blobs", import.meta.url));
const publicBase = () => (process.env.LOUPE_PUBLIC_URL || "http://localhost:8787").replace(/\/$/, "");

const safe = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, "");

export function putBlob(id: string, buf: Buffer): string {
  mkdirSync(dir(), { recursive: true });
  writeFileSync(join(dir(), `${safe(id)}.png`), buf);
  return `${publicBase()}/v1/blobs/${safe(id)}`;
}

export function getBlob(id: string): Buffer | null {
  const p = join(dir(), `${safe(id)}.png`);
  return existsSync(p) ? readFileSync(p) : null;
}

/** Decode a data: URL to a PNG buffer (what the SDK sends on upload). */
export function dataUrlToBuffer(dataUrl: string): Buffer {
  const comma = dataUrl.indexOf(",");
  return Buffer.from(dataUrl.slice(comma + 1), "base64");
}
