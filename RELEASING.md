# Releasing

Loupe uses [Semantic Versioning](https://semver.org) (`MAJOR.MINOR.PATCH`) and ships through
**GitHub Releases** backed by annotated git tags (`vX.Y.Z`).

- **MAJOR** — a breaking change to a public contract: SDK `init` config, HTTP API routes,
  MCP tool names/shapes, or the DB schema.
- **MINOR** — backward-compatible features.
- **PATCH** — backward-compatible fixes.

## 🔒 The rule: a release must update the docs

**A version is not released until the documentation reflects it.** Every release updates,
at minimum:

1. **`CHANGELOG.md`** — move `Unreleased` items under the new `vX.Y.Z` + date.
2. The **landing page** version (`docs/index.html` footer) and any changed copy.
3. The **Wiki** — the [Changelog](https://github.com/mohamed-ashraf-elsaed/loupe/wiki/Changelog)
   page and any feature/usage pages affected by the change.
4. Package `version` fields for any package being published.

This rule is also encoded in `CLAUDE.md`, so AI coding agents follow it automatically, and
is enforced in CI by the release workflow (it fails if `CHANGELOG.md` has no entry for the tag).

## Steps

```bash
# 1. Update CHANGELOG.md + docs (see the rule above), commit.
git commit -am "docs: prepare vX.Y.Z"

# 2. Tag and push.
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin main --tags
```

Pushing the tag triggers `.github/workflows/release.yml`, which verifies the changelog and
creates the GitHub Release with notes from `CHANGELOG.md`.

## Publishing packages

Publishable: **`@loupekit/shared`**, **`@loupekit/sdk`**, **`@loupekit/mcp`**.
Not published (apps): `@loupekit/server`, `@loupekit/dashboard`. The **extension** ships to the
Chrome Web Store.

### Two channels, two registries

Publishing is fully automated by CI to **both** registries:

| Channel  | Trigger                | dist-tag | public npm scope | GitHub Packages scope     |
| -------- | ---------------------- | -------- | ---------------- | ------------------------- |
| Canary   | **every push to main** | `next`   | `@loupekit/*`    | `@mohamed-ashraf-elsaed/*`|
| Stable   | **tag `vX.Y.Z`**       | `latest` | `@loupekit/*`    | `@mohamed-ashraf-elsaed/*`|

- **Canary** (`.github/workflows/publish-next.yml`): each push to `main` publishes a
  prerelease `X.Y.Z-next.<run_number>` under the `next` dist-tag. Install with
  `npm i @loupekit/sdk@next`. `latest` is never touched by canaries.
- **Stable** (`.github/workflows/release.yml`): tagging `vX.Y.Z` verifies the changelog,
  cuts the GitHub Release, and publishes that exact version as `latest`.

GitHub Packages requires the package scope to equal the repo owner, so before its publish
step CI renames `@loupekit/*` → `@mohamed-ashraf-elsaed/*` in place (via
`scripts/set-version.mjs --name-scope`); internal deps keep pointing at `@loupekit/*` on
public npm, which resolves fine. Nothing is committed back.

### Installing from GitHub Packages

```
# .npmrc
@mohamed-ashraf-elsaed:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

```bash
npm i @mohamed-ashraf-elsaed/sdk
```

### Prerequisites (one-time)

- Add **`NPM_TOKEN`** (an npm automation token for the `@loupekit` scope) as a repository
  secret. Both workflows need it. GitHub Packages uses the built-in `GITHUB_TOKEN`
  (`packages: write`) — no extra secret.

### Manual publish (fallback)

In dependency order — `shared` first, since `mcp` imports it at runtime:

```bash
npm run build
npm publish ./packages/shared --access public
npm publish ./packages/mcp    --access public
npm publish ./packages/sdk    --access public   # bundles shared + modern-screenshot
```

Notes:
- `@loupekit/sdk` bundles its dependencies (tsup), so the published tarball has no runtime
  deps; `@loupekit/shared` and `modern-screenshot` are dev-only for it.
- `@loupekit/mcp` imports `@loupekit/shared` at runtime, so publish `shared` first.

### Chrome Web Store (extension)

```bash
npm run build:extension
cd packages/extension && zip -r ../../loupe-extension.zip . -x "*.ts" "node_modules/*"
```

Upload `loupe-extension.zip` in the Chrome Web Store Developer Dashboard (one-time $5
developer registration). Bump `manifest.json` `version` in lockstep with the release.
