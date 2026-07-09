import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.LOUPE_BLOB_DIR = mkdtempSync(join(tmpdir(), "loupe-blob-"));
process.env.LOUPE_PUBLIC_URL = "http://test.local";

import { describe, expect, it } from "vitest";
import { dataUrlToBuffer, getBlob, putBlob } from "../blobs.ts";

describe("blobs", () => {
  it("stores a blob and returns a public URL (id sanitized)", () => {
    const url = putBlob("abc 123!/../x", Buffer.from("PNGDATA"));
    expect(url).toBe("http://test.local/v1/blobs/abc123x");
    expect(getBlob("abc123x")!.toString()).toBe("PNGDATA");
  });

  it("returns null for a missing blob", () => {
    expect(getBlob("does-not-exist")).toBeNull();
  });

  it("decodes a data URL to a buffer", () => {
    const b64 = Buffer.from("hello").toString("base64");
    expect(dataUrlToBuffer(`data:image/png;base64,${b64}`).toString()).toBe("hello");
  });
});
