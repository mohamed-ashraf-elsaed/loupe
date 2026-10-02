import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { globSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Node runs this package with **type-stripping only** — it does not compile. Some
 * TypeScript is therefore not available, and the failure mode is brutal: the server
 * dies at import time with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`, so `npm test` looks
 * like a connection error rather than a type error.
 *
 * Constructor parameter properties are the one that has bitten twice. Rather than
 * rely on remembering, scan for it.
 */
const dir = fileURLToPath(new URL("../", import.meta.url));

/** Every shipped .ts file, tests and the bundle output excluded. */
function sourceFiles(): string[] {
  return globSync("**/*.ts", { cwd: dir })
    .filter((f) => !f.startsWith("test/") && !f.startsWith("dist/") && !f.startsWith("node_modules/"))
    .map((f) => f);
}

/** `constructor(private x)`, `constructor(readonly x)`, `constructor(public x)`. */
const PARAMETER_PROPERTY = /constructor\s*\([^)]*\b(private|public|protected|readonly)\s+\w+/;

/** `enum X {}` and `namespace X {}` are also unsupported in strip-only mode. */
const ENUM_OR_NAMESPACE = /^\s*(?:export\s+)?(?:const\s+)?(enum|namespace)\s+\w+/m;

/**
 * Drop comment lines before scanning.
 *
 * Line-based and conservative on purpose: stripping `//` with a regex would eat the
 * rest of any line containing a URL, which could hide a real offender. Skipping lines
 * that *begin* as comments cannot hide code.
 */
function codeLines(source: string): string[] {
  return source
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
    });
}

describe("the MCP sources stay runnable by Node's type stripper", () => {
  it("finds the sources to check", () => {
    const files = sourceFiles();
    expect(files.length).toBeGreaterThan(5);
    expect(files).toContain("index.ts");
  });

  it("uses no constructor parameter properties", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      codeLines(readFileSync(dir + file, "utf8")).forEach((line) => {
        if (PARAMETER_PROPERTY.test(line)) offenders.push(`${file} — ${line.trim()}`);
      });
    }
    expect(
      offenders,
      "These would crash the server at import time. Declare the fields and assign them " +
      "in the constructor body instead:\n" + offenders.join("\n"),
    ).toEqual([]);
  });

  it("declares no enums or namespaces", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const source = codeLines(readFileSync(dir + file, "utf8")).join("\n");
      if (ENUM_OR_NAMESPACE.test(source)) offenders.push(file);
    }
    expect(offenders, "Use a const object and a union type instead:\n" + offenders.join("\n")).toEqual([]);
  });

  it("the check itself catches the pattern it is guarding against", () => {
    // A guard that cannot fail is not a guard.
    expect(PARAMETER_PROPERTY.test("constructor(private readonly capacity = 50) {")).toBe(true);
    expect(PARAMETER_PROPERTY.test("constructor(capacity: number) {")).toBe(false);
    expect(ENUM_OR_NAMESPACE.test("export enum Colour {}")).toBe(true);
    expect(ENUM_OR_NAMESPACE.test("export type Colour = 'red' | 'blue';")).toBe(false);
    // …and comment lines are ignored, or the guard would fail on its own explanation.
    expect(codeLines("  // constructor(private x) is not supported")).toEqual([]);
    expect(codeLines("    constructor(private x: number) {}")).toHaveLength(1);
  });
});
