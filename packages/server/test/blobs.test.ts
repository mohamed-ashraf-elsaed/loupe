import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.LOUPE_BLOB_DIR = mkdtempSync(join(tmpdir(), "loupe-blob-"));
process.env.LOUPE_PUBLIC_URL = "http://test.local";

import { describe, expect, it } from "vitest";
import { contentTypeForId, dataUrlToBuffer, extFromDataUrl, getBlob, putBlob } from "../blobs.ts";

describe("blobs", () => {
  it("stores a blob and returns a public URL (id sanitized, .png default)", () => {
    const url = putBlob("abc 123!/../x", Buffer.from("PNGDATA"));
    expect(url).toBe("http://test.local/v1/blobs/abc123x.png");
    expect(getBlob("abc123x.png")!.toString()).toBe("PNGDATA");
    // Legacy ids without an extension still resolve to the .png file.
    expect(getBlob("abc123x")!.toString()).toBe("PNGDATA");
  });

  it("stores a recording with a webm extension and round-trips it", () => {
    const url = putBlob("rec1", Buffer.from("WEBMDATA"), "webm");
    expect(url).toBe("http://test.local/v1/blobs/rec1.webm");
    expect(getBlob("rec1.webm")!.toString()).toBe("WEBMDATA");
  });

  it("returns null for a missing blob", () => {
    expect(getBlob("does-not-exist")).toBeNull();
  });

  it("maps data URL MIME to an extension", () => {
    expect(extFromDataUrl("data:image/png;base64,AAAA")).toBe("png");
    expect(extFromDataUrl("data:video/webm;base64,AAAA")).toBe("webm");
    expect(extFromDataUrl("data:application/x-weird,AAAA")).toBe("png"); // safe default
  });

  it("infers the content type from a stored id's extension", () => {
    expect(contentTypeForId("x.png")).toBe("image/png");
    expect(contentTypeForId("x.webm")).toBe("video/webm");
    expect(contentTypeForId("legacy-no-ext")).toBe("image/png");
  });

  it("decodes a data URL to a buffer", () => {
    const b64 = Buffer.from("hello").toString("base64");
    expect(dataUrlToBuffer(`data:image/png;base64,${b64}`).toString()).toBe("hello");
  });
});
