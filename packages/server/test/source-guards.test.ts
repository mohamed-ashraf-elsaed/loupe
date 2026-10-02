import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * A source scan for a mistake the type checker would have caught.
 *
 * The server runs as native TypeScript with no `tsconfig`, so nothing typechecks it —
 * and `Auth` carries the project *row*, not a `projectKey`. Writing `auth.projectKey`
 * therefore compiled fine and was `undefined` at runtime: a 500 on write (the not-null
 * constraint) and a silent empty list on read. It shipped in v0.10.20 and broke every
 * route that took its project key from the authenticated request.
 *
 * The same technique as the parameter-properties scan: cheaper than wiring a build step
 * into a package that deliberately has none, and it fails loudly at the exact line.
 */

const here = fileURLToPath(new URL(".", import.meta.url));
const serverRoot = join(here, "..");

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "data" || entry === "test") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sources(full, out);
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("the server's source", () => {
  it("never reads a project key off the auth result", () => {
    const offenders: string[] = [];
    for (const file of sources(serverRoot)) {
      readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        // `auth.project.project_key` is the real field; a bare `auth.projectKey` is not.
        if (/\bauth\.projectKey\b/.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders, `use auth.project.project_key instead:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("uses the authenticated project on every route that needs one", () => {
    // At least the routes fixed above must be reading it, so the scan above cannot
    // pass by the field simply having been deleted everywhere.
    const index = readFileSync(join(serverRoot, "index.ts"), "utf8");
    const uses = index.match(/auth\.project\.project_key/g) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(8);
  });
});
