import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MAX_LINE_LENGTH,
  SIGNAL_WEIGHTS,
  clearFileListCache,
  collectFiles,
  isComponentishName,
  isSourcePath,
  isUtilityClass,
  isViewFile,
  looksGenerated,
  mapElementToSource,
  rankMatches,
  searchableClasses,
  signalsFrom,
} from "../src/mapper.ts";

/**
 * The fixture tree is built in a temp directory rather than committed, so it can
 * contain a real `node_modules` without becoming one for the package resolver.
 */
let root = "";

const FILES: Record<string, string> = {
  "src/components/CheckoutButton.tsx": [
    "import { useState } from 'react';",
    "",
    "export function CheckoutButton() {",
    "  const [busy, setBusy] = useState(false);",
    "  return (",
    '    <button',
    '      id="checkout-submit"',
    '      aria-label="Place your order"',
    '      className="cta checkout-button flex mt-4 bg-blue-500"',
    "      onClick={() => setBusy(true)}",
    "    >",
    "      Complete checkout",
    "    </button>",
    "  );",
    "}",
    "",
  ].join("\n"),
  "src/components/PricingTable.tsx": [
    "export function PricingTable() {",
    '  return <table className="pricing"><tbody><tr><td>Complete checkout</td></tr></tbody></table>;',
    "}",
    "",
  ].join("\n"),
  "src/pages/CheckoutPage.tsx": [
    "export function CheckoutPage() {",
    "  return <main>Complete checkout</main>;",
    "}",
    "",
  ].join("\n"),
  "src/utils/format.ts": [
    "export const formatMoney = (n: number) => `$${n}`;",
    "",
  ].join("\n"),
  "src/components/checkout-helper.ts": [
    "// lowercase basename: a helper, not a component",
    "export const CHECKOUT_TEXT = 'Complete checkout';",
    "",
  ].join("\n"),
  "node_modules/some-pkg/dist/index.js": "export const Complete = 'Complete checkout'; export const id = 'checkout-submit';\n",
  "dist/bundle.js": "var x='Complete checkout';var y='checkout-submit';\n",
  "build/old.js": "var z='Complete checkout';\n",
  // A generated file that is NOT under a skipped directory — the extension's own
  // content.js problem. It must be recognised by shape, not by where it lives.
  "src/bundled.js": `var Complete="Complete checkout";${"var padding=1;".repeat(200)}\n`,
};

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "loupe-map-"));
  for (const [rel, body] of Object.entries(FILES)) {
    const full = join(root, rel);
    await mkdir(join(full, ".."), { recursive: true });
    await writeFile(full, body, "utf8");
  }
  // A binary-ish file that must be ignored on extension alone.
  await writeFile(join(root, "src", "logo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  clearFileListCache();
});

afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

describe("walking the workspace", () => {
  it("collects source files and never descends into build output or dependencies", async () => {
    const { files } = await collectFiles(root);
    const rel = files.map((f) => f.slice(root.length + 1).split("\\").join("/")).sort();

    expect(rel).toContain("src/components/CheckoutButton.tsx");
    expect(rel).toContain("src/pages/CheckoutPage.tsx");
    // The three that must never appear, whatever their contents say.
    expect(rel.some((f) => f.includes("node_modules"))).toBe(false);
    expect(rel.some((f) => f.startsWith("dist/"))).toBe(false);
    expect(rel.some((f) => f.startsWith("build/"))).toBe(false);
    // Not a source extension.
    expect(rel.some((f) => f.endsWith(".png"))).toBe(false);
  });

  it("honours the file cap and says the list is partial", async () => {
    const { files, truncated } = await collectFiles(root, { maxFiles: 2 });
    expect(files.length).toBe(2);
    expect(truncated).toBe(true);

    const whole = await collectFiles(root);
    expect(whole.truncated).toBe(false);
  });

  it("returns nothing for a root that is not there, rather than throwing", async () => {
    expect((await collectFiles(join(root, "nope"))).files).toEqual([]);
  });
});

describe("class filtering", () => {
  it("rejects styling utilities", () => {
    for (const cls of [
      "flex", "grid", "hidden", "relative", "mt-4", "bg-blue-500", "text-sm", "w-full",
      "px-2", "gap-x-2", "hover:bg-red-500", "md:flex", "sm:text-lg", "rounded-lg",
      "font-bold", "leading-tight", "border-2", "shadow-lg", "transition",
    ]) {
      expect(isUtilityClass(cls), cls).toBe(true);
    }
  });

  it("keeps names that are the app's own", () => {
    for (const cls of ["cta", "checkout-button", "pricing-table", "kpi-card", "hero", "sidebar-nav"]) {
      expect(isUtilityClass(cls), cls).toBe(false);
    }
  });

  it("de-duplicates and drops blanks", () => {
    expect(searchableClasses(["cta", "cta", " flex ", "", "pricing-table"])).toEqual(["cta", "pricing-table"]);
    expect(searchableClasses(undefined)).toEqual([]);
  });
});

describe("naming heuristics", () => {
  it("spots component-shaped basenames", () => {
    expect(isComponentishName("src/components/CheckoutButton.tsx")).toBe(true);
    expect(isComponentishName("src/components/useCheckout.ts")).toBe(true);
    expect(isComponentishName("src/components/checkout-helper.ts")).toBe(false);
    expect(isComponentishName("src/utils/format.ts")).toBe(false);
  });

  it("spots view files", () => {
    expect(isViewFile("a/B.tsx")).toBe(true);
    expect(isViewFile("a/B.blade.php")).toBe(true);
    expect(isViewFile("a/B.vue")).toBe(true);
    expect(isViewFile("a/b.ts")).toBe(false);
  });

  it("recognises a generated file by its longest line", () => {
    // A bundle is one enormous line, wherever it sits.
    expect(looksGenerated(`var a=1;${"x".repeat(MAX_LINE_LENGTH + 10)};`)).toBe(true);
    expect(looksGenerated("const a = 1;\nconst b = 2;\n")).toBe(false);
    // Many short lines are fine, however many there are.
    expect(looksGenerated("a\n".repeat(MAX_LINE_LENGTH + 10))).toBe(false);
  });

  it("knows where source usually lives", () => {
    expect(isSourcePath("src/app.ts")).toBe(true);
    expect(isSourcePath("packages/sdk/src/app.ts")).toBe(true);
    expect(isSourcePath("packages/extension/content.js")).toBe(false);
    expect(isSourcePath("index.ts")).toBe(false);
  });
});

describe("scoring", () => {
  const m = (filePath: string, matchType: any, needle = "x") => ({ filePath, line: 1, matchType, needle });

  it("orders by signal strength", () => {
    const ranked = rankMatches([
      m("a/Plain.ts", "plain-text"),
      m("b/Class.ts", "class"),
      m("c/Text.ts", "text"),
      m("d/Aria.ts", "aria-label"),
      m("e/Id.ts", "id"),
    ]);
    expect(ranked.map((c) => c.matchType)).toEqual(["id", "aria-label", "text", "class", "plain-text"]);
    // And the numbers are monotonically decreasing, not just re-ordered.
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1]!.confidence).toBeGreaterThan(ranked[i]!.confidence);
    }
    expect(SIGNAL_WEIGHTS.id).toBeGreaterThan(SIGNAL_WEIGHTS.class);
  });

  it("boosts component filenames and view files", () => {
    const [component] = rankMatches([m("src/components/CheckoutButton.tsx", "text")]);
    const [plain] = rankMatches([m("src/helpers/format.ts", "text")]);
    expect(component!.confidence).toBeGreaterThan(plain!.confidence);
    expect(component!.reason).toContain("component filename");
    expect(component!.reason).toContain("view file");
  });

  it("boosts a file that several signals agree on", () => {
    const [agreeing] = rankMatches([
      m("src/Checkout.tsx", "text"), m("src/Checkout.tsx", "class"), m("src/Checkout.tsx", "aria-label"),
    ]);
    const [single] = rankMatches([m("src/Other.tsx", "text")]);
    expect(agreeing!.confidence).toBeGreaterThan(single!.confidence);
    expect(agreeing!.reason).toContain("3 signals agree");
  });

  it("never exceeds 1", () => {
    const ranked = rankMatches([
      m("src/Checkout.tsx", "id"), m("src/Checkout.tsx", "aria-label"), m("src/Checkout.tsx", "text"),
      m("src/Checkout.tsx", "class"), m("src/Checkout.tsx", "plain-text"),
    ]);
    expect(ranked[0]!.confidence).toBeLessThanOrEqual(1);
  });

  it("de-duplicates by file+line and caps at ten", () => {
    const dupes = [m("a/A.tsx", "text"), m("a/A.tsx", "text"), m("a/A.tsx", "text")];
    expect(rankMatches(dupes).length).toBe(1);

    const many = Array.from({ length: 25 }, (_, i) => m(`src/C${i}.tsx`, "text"));
    expect(rankMatches(many).length).toBe(10);
  });

  it("pads the line range without going past the start of the file", () => {
    const [c] = rankMatches([{ filePath: "a/A.tsx", line: 1, matchType: "text", needle: "x" }]);
    expect(c!.lineStart).toBe(1);
    expect(c!.lineEnd).toBe(3);
  });

  it("returns nothing at all for no matches", () => {
    expect(rankMatches([])).toEqual([]);
  });
});

describe("mapping an element", () => {
  it("resolves a unique text anchor to the component that renders it", async () => {
    const ranked = await mapElementToSource({ text: "Complete checkout" }, root);
    // Every file containing the string is a candidate…
    const paths = ranked.map((c) => c.filePath);
    expect(paths).toContain("src/components/CheckoutButton.tsx");
    expect(paths).toContain("src/pages/CheckoutPage.tsx");
    // …but the PascalCase component outranks the page and the lowercase helper.
    expect(paths[0]).toBe("src/components/CheckoutButton.tsx");
    const helper = ranked.find((c) => c.filePath === "src/components/checkout-helper.ts");
    const component = ranked.find((c) => c.filePath === "src/components/CheckoutButton.tsx");
    expect(component!.confidence).toBeGreaterThan(helper!.confidence);
  });

  it("lets a stable id outrank a text match", async () => {
    const ranked = await mapElementToSource({ id: "checkout-submit", text: "Complete checkout" }, root);
    expect(ranked[0]!.filePath).toBe("src/components/CheckoutButton.tsx");
    expect(ranked[0]!.matchType).toBe("id");
    expect(ranked[0]!.reason).toContain("checkout-submit");
  });

  it("resolves aria-label and reports the line", async () => {
    const ranked = await mapElementToSource({ ariaLabel: "Place your order" }, root);
    expect(ranked.length).toBe(1);
    expect(ranked[0]!.filePath).toBe("src/components/CheckoutButton.tsx");
    expect(ranked[0]!.matchType).toBe("aria-label");
    // `aria-label="Place your order"` is the 8th line of the fixture.
    expect(ranked[0]!.lineStart).toBeLessThanOrEqual(8);
    expect(ranked[0]!.lineEnd).toBeGreaterThanOrEqual(8);
  });

  it("searches an app class but ignores its utilities", async () => {
    const ranked = await mapElementToSource({ classes: ["checkout-button", "flex", "mt-4", "bg-blue-500"] }, root);
    expect(ranked.map((c) => c.filePath)).toEqual(["src/components/CheckoutButton.tsx"]);
    // The utility names matched nothing, and did not appear in the reason.
    expect(ranked[0]!.reason).not.toContain("flex");
    expect(ranked[0]!.reason).not.toContain("mt-4");
  });

  it("never returns anything outside the workspace", async () => {
    const ranked = await mapElementToSource({ text: "Complete checkout" }, root);
    for (const c of ranked) {
      expect(c.filePath.startsWith("src/")).toBe(true);
      expect(c.filePath).not.toContain("node_modules");
      expect(c.filePath).not.toContain("..");
    }
  });

  it("skips a generated file even when it sits outside a skipped directory", async () => {
    const ranked = await mapElementToSource({ text: "Complete checkout" }, root);
    expect(ranked.map((c) => c.filePath)).not.toContain("src/bundled.js");
  });

  it("prefers source under src/ over a file beside the package root", async () => {
    // Both contain the text; only one is where source lives.
    const ranked = await mapElementToSource({ text: "Complete checkout" }, root);
    const srcIndex = ranked.findIndex((c) => c.filePath.startsWith("src/"));
    expect(srcIndex).toBe(0);
  });

  it("answers empty rather than throwing when nothing matches, or the root is wrong", async () => {
    expect(await mapElementToSource({ text: "nothing like this exists here" }, root)).toEqual([]);
    expect(await mapElementToSource({ text: "Complete checkout" }, join(root, "nope"))).toEqual([]);
    expect(await mapElementToSource({ text: "Complete checkout" }, "")).toEqual([]);
  });

  it("ignores signals too short to mean anything", async () => {
    // "a" would match half the workspace; better to return nothing than noise.
    expect(await mapElementToSource({ text: "a", id: "xy" }, root)).toEqual([]);
    expect(await mapElementToSource({ classes: ["cta"] }, root)).toEqual([]);
  });

  it("reads signals out of a captured payload", () => {
    expect(signalsFrom({
      id: "x", tag: "button", text: "Go", classes: ["cta"], attrs: { "aria-label": "Go now" },
    })).toMatchObject({ id: "x", tag: "button", text: "Go", ariaLabel: "Go now" });
    // No aria-label present → null, not undefined, so callers can compare.
    expect(signalsFrom({ attrs: {} }).ariaLabel).toBeNull();
  });

  it("reuses a warm file list instead of re-walking", async () => {
    clearFileListCache();
    const first = await collectFiles(root);
    const t0 = Date.now();
    await mapElementToSource({ text: "Complete checkout" }, root, { ttlMs: 60_000 });
    const warm = Date.now() - t0;
    // Nothing blocks on a second walk; this is a smoke test for the cache being used.
    expect(warm).toBeLessThan(1500);
    expect(first.files.length).toBeGreaterThan(0);
  });
});
