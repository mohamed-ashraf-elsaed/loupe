import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(readFileSync(dir + "manifest.json", "utf8"));

describe("extension manifest", () => {
  it("is a valid MV3 manifest with the needed permissions", () => {
    expect(manifest.manifest_version).toBe(3);
    for (const p of ["activeTab", "scripting", "storage", "tabs"]) expect(manifest.permissions).toContain(p);
    expect(manifest.host_permissions).toContain("<all_urls>");
  });

  it("references files that exist", () => {
    expect(existsSync(dir + manifest.background.service_worker)).toBe(true);
    expect(existsSync(dir + manifest.action.default_popup)).toBe(true);
    expect(existsSync(dir + "popup.js")).toBe(true);
    expect(existsSync(dir + "content.src.ts")).toBe(true);
  });
});
