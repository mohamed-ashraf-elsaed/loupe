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
const safeExt = (ext: string) => (ext || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";

/** Content types we serve blobs as, keyed by extension. Defaults to PNG. */
const MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  gif: "image/gif", webm: "video/webm", mp4: "video/mp4",
};

/** Map a data: URL's declared MIME to a file extension (screenshot → png, recording → webm). */
export function extFromDataUrl(dataUrl: string): string {
  const m = /^data:([^;,]+)/.exec(dataUrl);
  const mime = (m?.[1] || "image/png").toLowerCase();
  for (const [ext, type] of Object.entries(MIME)) if (type === mime) return ext;
  return "png";
}

/** The content type to serve a stored blob as, from its (possibly extensionless) id. */
export function contentTypeForId(id: string): string {
  const dot = id.lastIndexOf(".");
  const ext = dot >= 0 ? safeExt(id.slice(dot + 1)) : "png";
  return MIME[ext] || "image/png";
}

/**
 * Store a blob and return its public URL. The extension is carried in the URL/id so
 * screenshots (png) and recordings (webm) round-trip with the right content type.
 */
export function putBlob(id: string, buf: Buffer, ext = "png"): string {
  mkdirSync(dir(), { recursive: true });
  const name = `${safe(id)}.${safeExt(ext)}`;
  writeFileSync(join(dir(), name), buf);
  return `${publicBase()}/v1/blobs/${name}`;
}

export function getBlob(id: string): Buffer | null {
  // The id may already carry an extension (new blobs) or not (legacy png).
  const raw = id.includes(".") ? id : `${id}.png`;
  const dot = raw.lastIndexOf(".");
  const p = join(dir(), `${safe(raw.slice(0, dot))}.${safeExt(raw.slice(dot + 1))}`);
  return existsSync(p) ? readFileSync(p) : null;
}

/** Decode a data: URL to a buffer (what the SDK sends on upload). */
export function dataUrlToBuffer(dataUrl: string): Buffer {
  const comma = dataUrl.indexOf(",");
  return Buffer.from(dataUrl.slice(comma + 1), "base64");
}
