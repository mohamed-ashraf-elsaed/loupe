import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(readFileSync(dir + "manifest.json", "utf8"));

describe("extension manifest", () => {
  it("is a valid MV3 manifest with least-privilege permissions", () => {
    expect(manifest.manifest_version).toBe(3);
    for (const p of ["activeTab", "scripting", "storage"]) expect(manifest.permissions).toContain(p);
    // least privilege: no broad host permissions, no "tabs" (activeTab covers capture + inject)
    expect(manifest.permissions).not.toContain("tabs");
    expect(manifest.host_permissions).toBeUndefined();
  });

  it("declares icons and references files that exist", () => {
    expect(existsSync(dir + manifest.background.service_worker)).toBe(true);
    expect(existsSync(dir + manifest.action.default_popup)).toBe(true);
    expect(existsSync(dir + "popup.js")).toBe(true);
    expect(existsSync(dir + "content.src.ts")).toBe(true);
    for (const size of ["16", "48", "128"]) expect(existsSync(dir + manifest.icons[size])).toBe(true);
  });
});
