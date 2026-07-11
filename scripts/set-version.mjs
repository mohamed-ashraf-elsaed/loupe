#!/usr/bin/env node
// Prepare the published Loupe packages for a `npm publish` run (CI use).
//
// Edits package.json in place — WITHOUT committing. Two independent operations:
//
//   --version <v>        Set the version on every published package, and pin internal
//                        @loupekit/* dependency RANGES to that exact version (so each
//                        release's packages depend on their own same-version siblings).
//
//   --name-scope <scope> Rename the package NAME's scope (e.g. @loupekit → @owner).
//                        GitHub Packages requires the scope to match the repo owner.
//                        Dependency names are left untouched — internal deps keep pointing
//                        at @loupekit/* on the public npm registry, which resolves fine.
//
// Examples:
//   node scripts/set-version.mjs --version 0.1.0-next.42
//   node scripts/set-version.mjs --name-scope @mohamed-ashraf-elsaed
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const version = flag("--version");
const nameScope = flag("--name-scope");
const CANON_SCOPE = "@loupekit";
const PKGS = ["shared", "sdk", "mcp"];
const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];

if (!version && !nameScope) {
  console.error("Nothing to do: pass --version and/or --name-scope.");
  process.exit(1);
}

for (const p of PKGS) {
  const path = `packages/${p}/package.json`;
  const json = JSON.parse(readFileSync(path, "utf8"));

  if (version) {
    json.version = version;
    // Pin internal sibling dependency ranges to the exact release version.
    for (const field of DEP_FIELDS) {
      const deps = json[field];
      if (!deps) continue;
      for (const key of Object.keys(deps)) {
        if (key.startsWith(`${CANON_SCOPE}/`)) deps[key] = version;
      }
    }
  }

  if (nameScope) json.name = json.name.replace(/^@[^/]+\//, `${nameScope}/`);

  writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
  console.log(`  ${p} → name=${json.name} version=${json.version}`);
}
