# Releasing Loupe

Use this guide to cut a Loupe release. It lists the files that carry the version, the exact
steps to ship and verify a release, and how to repair one that went wrong. The last section is a
reference for the workflows that a release starts.

A *release* is one annotated git tag `vX.Y.Z` that you push to GitHub. An *annotated tag* is a
tag object with its own message, author and date, which `git tag -a` creates. That tag publishes
the npm packages, the GitHub Release, the GitHub Packages mirror, and the Laravel package on
Packagist, the default Composer package registry.

## Contents

- [Versioning rules](#versioning-rules)
- [Prerequisites](#prerequisites)
- [Version strings to bump together](#version-strings-to-bump-together)
- [Release steps](#release-steps)
- [Verify the release](#verify-the-release)
- [Troubleshooting](#troubleshooting)
- [Manual fallback](#manual-fallback)
- [Laravel package split: one-time setup](#laravel-package-split-one-time-setup)
- [Chrome Web Store extension](#chrome-web-store-extension)
- [Release pipeline reference](#release-pipeline-reference)
- [Next steps](#next-steps)

## Versioning rules

Loupe follows [Semantic Versioning](https://semver.org) (`MAJOR.MINOR.PATCH`). Every package
in the monorepo carries the same version.

| Part | Bump it when | Examples |
|---|---|---|
| `MAJOR` | You break a public contract. | A removed or renamed SDK `init` option, HTTP API route, MCP tool name or tool shape, or a database schema change that existing installs cannot migrate through. |
| `MINOR` | You add a backward-compatible feature. | A new config option, a new route, a new MCP tool, an additive migration. |
| `PATCH` | You fix a bug without changing a contract. | A widget fix, a corrected error message. |

Record every change under `## [Unreleased]` in `CHANGELOG.md` as you merge it. The changelog
follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), with release headings
in the form `## [X.Y.Z] — YYYY-MM-DD`.

## Prerequisites

Set these once in the repository's **Settings → Secrets and variables → Actions**.

| Name | Kind | Used by | Value |
|---|---|---|---|
| `NPM_TOKEN` | Secret | `release.yml`, `publish-next.yml` | An npm automation token with publish rights on the `@loupekit` scope. |
| `ACCESS_TOKEN` | Secret | `laravel-split.yml` | A personal access token with `repo` scope that can push to the split repository. |
| `LARAVEL_SPLIT_ORG` | Variable | `laravel-split.yml` | Owner of the split repository. Default `loupekit`. |
| `LARAVEL_SPLIT_REPO` | Variable | `laravel-split.yml` | Name of the split repository. Default `laravel`. |
| `GITHUB_TOKEN` | Built in | `release.yml`, `publish-next.yml` | No setup. The jobs request `contents: write` or `packages: write`. |

The *split repository* is a separate repository that holds only `packages/laravel`. See
[Laravel package split: one-time setup](#laravel-package-split-one-time-setup).

On your machine you need:

- Write access to `main` and permission to push tags.
- Node 24 and npm.
- PHP 8.2 or later with the `mbstring`, `pdo_sqlite` and `sqlite3` extensions, and Composer,
  to run the Laravel tests.
- The [GitHub CLI](https://cli.github.com/) (`gh`), signed in with `gh auth login`, to watch
  workflow runs. To check the GitHub Packages mirror, the token also needs the `read:packages`
  scope: run `gh auth refresh -s read:packages`.
- An npm account with publish rights on the `@loupekit` scope. You need it only to repair
  dist-tags (named pointers such as `latest` that npm installs by default) or to use the
  [Manual fallback](#manual-fallback).
- `zip`, to package the browser extension for the
  [Chrome Web Store](#chrome-web-store-extension).

## Version strings to bump together

`scripts/set-version.mjs` only edits `packages/shared`, `packages/sdk` and `packages/mcp`, and
CI uses it only for canaries (prereleases published from every push to `main`, see
[Canary channel](#canary-channel)) and for the GitHub Packages rename. For a release you edit every
location below by hand.

| File | What to change |
|---|---|
| `package.json` (root) | `"version"` |
| `packages/shared/package.json` | `"version"` |
| `packages/sdk/package.json` | `"version"` and the `@loupekit/shared` pin in `devDependencies` |
| `packages/mcp/package.json` | `"version"` and the `@loupekit/shared` pin, which must be in `dependencies` (see the warning below) |
| `packages/dashboard/package.json` | `"version"` and the `@loupekit/shared` pin |
| `packages/server/package.json` | `"version"` and the `@loupekit/shared` pin |
| `packages/extension/package.json` | `"version"` and the `@loupekit/sdk` pin |
| `packages/hub/package.json` | `"version"` and the `@loupekit/shared` pin |
| `packages/extension/manifest.json` | `"version"` |
| `packages/mcp/index.ts` | `new McpServer({ name: "loupe", version: "X.Y.Z" })` |
| `docs/index.html` | The footer line ending in `· vX.Y.Z` |
| `docs/guide/index.html` | The `<meta name="description">` text, the header `.ver` badge, the header changelog link, the hero eyebrow ("Documentation · vX.Y.Z"), the "Version" tile, the jsDelivr CDN URL in the script-tag snippet, the extension version in the "Load unpacked" step, and the footer. Also add a `cl-entry` card for the new version at the top of the Changelog section and remove the oldest card, because the section shows the last three versions. |
| `docs/privacy.html` | The "Applies to the Loupe browser extension, version X.Y.Z" line, and its "Last updated" date |
| `docs/how-to/embed-script-tag.md` | The pinned jsDelivr URL `@loupekit/sdk@X.Y.Z/dist/index.global.js` |
| `CHANGELOG.md` | A new `## [X.Y.Z] — YYYY-MM-DD` heading and the compare links at the end of the file |

Other pages in `docs/` and the package READMEs also mention versions. Most of those mentions are
history, such as "Fixed in 0.14.1" notes and version-notes tables, and stay as they are.
[Step 8](#release-steps) finds the rest.

You do not edit these:

- `packages/laravel/composer.json` has no `version` field. Packagist takes the version from the
  tag on the split repository.
- The SDK bakes its version in at build time from `packages/sdk/package.json`
  (`__LOUPE_VERSION__` in `packages/sdk/tsup.config.ts`).

> [!WARNING]
> `@loupekit/mcp` imports **values** from `@loupekit/shared` at runtime, such as
> `normalizeStatus` and `STAGE_LABELS` in `packages/mcp/index.ts` and `joinPresence` in
> `packages/mcp/src/bridge/presence-registry.ts`. `packages/mcp/tsup.config.ts` keeps
> `@loupekit/shared` external, so the published `dist/index.js` needs it installed. It must be
> listed under `dependencies` in `packages/mcp/package.json`. If it is only under
> `devDependencies`, `npx -y @loupekit/mcp` fails with `ERR_MODULE_NOT_FOUND`. That is what
> happened to `@loupekit/mcp@0.14.0`; 0.14.1 fixed it. [Step 7](#release-steps) checks this on
> every release.

## Release steps

Run every command from the repository root. In the commands, replace these placeholders:

- `<X.Y.Z>`: the version you are releasing, for example `0.15.0`.
- `<OLD_VERSION>`: the version you are replacing, for example `0.14.0`.
- `<YYYY-MM-DD>`: today's date.
- `<RUN_ID>`: the numeric ID of a workflow run, printed by the command before it.

1. Switch to `main` and pull the latest commits.

   ```bash
   git switch main && git pull --ff-only
   ```

   You should see `Already up to date.` or a fast-forward summary.

2. Check that the working tree is clean.

   ```bash
   git status --short
   ```

   You should see no output. If you see files, commit or stash them first, so they do not end
   up in the release commit.

3. In `CHANGELOG.md`, add the release heading directly below `## [Unreleased]`, so the items
   that were under `Unreleased` now sit under the new version:

   ```markdown
   ## [Unreleased]

   ## [<X.Y.Z>] — <YYYY-MM-DD>
   ```

   You should see an empty `## [Unreleased]` heading followed by the new version heading.

4. At the end of `CHANGELOG.md`, update the compare links. Change the `[Unreleased]` link to
   start from the new tag, and add a link for the new version below it:

   ```markdown
   [Unreleased]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v<X.Y.Z>...HEAD
   [<X.Y.Z>]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v<OLD_VERSION>...v<X.Y.Z>
   ```

   You should see the `[Unreleased]` link start at `v<X.Y.Z>`, and the new `[<X.Y.Z>]` link
   directly below it.

5. Edit every file in [Version strings to bump together](#version-strings-to-bump-together)
   and replace the old version with the new one.

   You should see `<X.Y.Z>` at each location in the table. Step 6 checks the package files.

6. Check that no package file still carries the old version.

   ```bash
   grep -rnF "<OLD_VERSION>" \
     package.json packages/*/package.json packages/extension/manifest.json \
     packages/mcp/index.ts docs/index.html
   ```

   You should see no output. `-F` matches the dots in the version literally.

7. Check that `@loupekit/mcp` declares `@loupekit/shared` as a runtime dependency.

   ```bash
   node -p "require('./packages/mcp/package.json').dependencies['@loupekit/shared']"
   ```

   You should see `<X.Y.Z>`. If you see `undefined`, move the `@loupekit/shared` pin from
   `devDependencies` to `dependencies` in `packages/mcp/package.json` and run the command
   again. See the warning in [Version strings to bump together](#version-strings-to-bump-together).

8. List the remaining mentions of the old version in the docs and READMEs.

   ```bash
   grep -rnF "<OLD_VERSION>" docs README.md packages/*/README.md | grep -v 'class="cl-ver"'
   ```

   You should see only history: known-issue notes, version-notes tables and the dated
   `Last updated` lines. The `grep -v` hides the changelog cards in `docs/guide/index.html`.
   Bump any match that describes the current release, and update any page whose described
   behaviour changed in this release.

9. Add the release to the [wiki](https://github.com/mohamed-ashraf-elsaed/loupe/wiki)
   **Changelog** page, and update any wiki page whose described behaviour changed. The wiki is a
   separate git repository, `https://github.com/mohamed-ashraf-elsaed/loupe.wiki.git`.

   You should see the new version at the top of the wiki Changelog page.

10. Refresh `package-lock.json` so it records the new workspace versions.

    ```bash
    npm install
    ```

    Then check the lock file changed:

    ```bash
    git diff --stat package-lock.json
    ```

    You should see `package-lock.json` with changed lines.

11. Rebuild the browser bundles that ship inside the Laravel package.

    ```bash
    bash packages/laravel/bin/sync-assets.sh
    ```

    You should see `✓ Loupe Laravel assets synced.` The script copies the SDK and dashboard
    builds into `packages/laravel/resources/dist/`. Those files are committed, because Laravel
    users never run the JavaScript build.

12. Run the JavaScript tests.

    ```bash
    npm test
    ```

    You should see every test file pass and no failures.

13. Install the Laravel package's dependencies.

    ```bash
    composer --working-dir=packages/laravel install
    ```

    You should see Composer finish without errors.

14. Run the Laravel tests.

    ```bash
    composer --working-dir=packages/laravel test
    ```

    You should see PHPUnit finish with `OK`. The tests use an in-memory SQLite database. To run
    the same 100% coverage gate as CI, run
    `composer --working-dir=packages/laravel test:coverage-100`. That needs a *coverage driver*,
    a PHP extension that records which lines run, such as [PCOV](https://github.com/krakjoe/pcov)
    or Xdebug.

15. Review the changed files.

    ```bash
    git status --short
    ```

    You should see only modified (` M`) files: the files in
    [Version strings to bump together](#version-strings-to-bump-together), any docs you edited
    in step 8, `package-lock.json`, and `packages/laravel/resources/dist/sdk/loupe.js` and
    `packages/laravel/resources/dist/dashboard/app.js` if the bundles changed. If you see a
    file you did not mean to change, restore it with `git restore <FILE>`.

16. Stage the tracked changes.

    ```bash
    git add -u
    git diff --cached --name-only
    ```

    You should see the same file list as in step 15. `git add -u` stages only files git already
    tracks, so stray untracked files stay out of the commit.

17. Commit the release.

    ```bash
    git commit -m "chore(release): v<X.Y.Z>"
    ```

    You should see `[main <SHA>] chore(release): v<X.Y.Z>`.

18. Create the annotated tag.

    ```bash
    git tag -a v<X.Y.Z> -m "v<X.Y.Z>"
    ```

    Then check it:

    ```bash
    git tag -n1 v<X.Y.Z>
    ```

    You should see `v<X.Y.Z>` followed by the message `v<X.Y.Z>`.

19. Push `main`.

    ```bash
    git push origin main
    ```

    You should see a line ending in `main -> main`. The push starts CI, the canary publish, the
    split of `main` and, because `packages/laravel/**` changed, the `laravel-package` tests.

20. Wait for CI on `main` to pass. `release.yml` does not wait for CI, so a tag pushed on a red
    `main` still publishes.

    ```bash
    gh run watch "$(gh run list --workflow ci.yml --branch main --limit 1 --json databaseId -q '.[0].databaseId')" --exit-status
    ```

    You should see every step of the `test` job with a green check, and the command exits with
    status 0. Repeat the command with `--workflow laravel.yml` for the Laravel tests. If either
    run fails, fix `main` before you push the tag.

21. Push the one tag you created.

    ```bash
    git push origin v<X.Y.Z>
    ```

    You should see `* [new tag]  v<X.Y.Z> -> v<X.Y.Z>`. The push starts `release.yml` and
    `laravel-split.yml`. You can watch both on the repository's **Actions** tab.

> [!WARNING]
> Never push several version tags at once, so never use `git push --tags` or
> `git push origin main --tags`. Each tag starts its own `release.yml` run, and those runs
> publish in parallel without `--tag`, so whichever version npm receives **last** becomes
> `latest`. This happened with 0.13.1 and 0.14.0: both runs started together, 0.13.1 finished
> publishing after 0.14.0, and `latest` pointed at the older 0.13.1. Push one tag, wait for its
> run to finish, then push the next.

## Verify the release

1. Watch the release run until it finishes.

   ```bash
   gh run watch "$(gh run list --workflow release.yml --limit 1 --json databaseId -q '.[0].databaseId')"
   ```

   You should see both jobs, `release` and `publish-npm`, end with a green check. A green run
   alone does not prove the right version is `latest`, and a red run may still have published:
   the v0.13.1 run failed in its GitHub Packages mirror step after the npm publish step had
   already succeeded. Step 2 is the check that matters.

2. Check the npm dist-tags of each package. A *dist-tag* is a named pointer, such as `latest`
   or `next`, that npm resolves when someone installs a package without a version.

   ```bash
   npm view @loupekit/sdk dist-tags
   npm view @loupekit/mcp dist-tags
   npm view @loupekit/shared dist-tags
   ```

   You should see `latest: '<X.Y.Z>'` for each one.

3. Check the GitHub Packages mirror.

   ```bash
   npm view @mohamed-ashraf-elsaed/sdk dist-tags \
     --registry https://npm.pkg.github.com \
     --//npm.pkg.github.com/:_authToken="$(gh auth token)"
   ```

   You should see `latest: '<X.Y.Z>'`. A `403` error that mentions scopes means your `gh`
   token lacks `read:packages`; run `gh auth refresh -s read:packages`.

4. Check the Laravel split run for the tag.

   ```bash
   gh run list --workflow laravel-split.yml --branch v<X.Y.Z> --limit 1 --json status,conclusion
   ```

   You should see `"status":"completed"` and `"conclusion":"success"`.

5. Open the GitHub Release at
   `https://github.com/mohamed-ashraf-elsaed/loupe/releases/tag/v<X.Y.Z>`. You should see the
   notes from the matching `CHANGELOG.md` section.

6. Open [packagist.org/packages/loupekit/laravel](https://packagist.org/packages/loupekit/laravel).
   You should see `v<X.Y.Z>` in the version list within a few minutes.

7. Smoke-test the published MCP server.

   ```bash
   npx -y @loupekit/mcp@<X.Y.Z> < /dev/null
   ```

   You should see a line on stderr starting with `[loupe-mcp] connected · project=`. The
   server exits when stdin closes. An `ERR_MODULE_NOT_FOUND` error means a runtime dependency
   is missing from `packages/mcp/package.json`; see the warning in
   [Version strings to bump together](#version-strings-to-bump-together).

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| The `release` job fails with `CHANGELOG.md has no entry for X.Y.Z`. | `CHANGELOG.md` has no `## [X.Y.Z]` heading on the tagged commit. | npm and GitHub Packages got nothing, because `publish-npm` needs `release`. **Packagist did publish**: `laravel-split.yml` runs on the same tag and does not depend on `release.yml`. Follow [Re-tag a release](#re-tag-a-release). |
| `npm view … dist-tags` shows an older version as `latest`. | Two release runs published in parallel and the older one finished last. | Follow [Point `latest` back at the release](#point-latest-back-at-the-release). |
| The run succeeds but npm still shows the previous version. | The `package.json` versions were not bumped, so `publish-npm` skipped every package as already published. | Bump the versions and release the next patch version. Do not reuse `X.Y.Z`: the run already created the GitHub Release `vX.Y.Z`, and the split forwarded tag `vX.Y.Z`, which Packagist published from the unbumped commit. |
| `npx -y @loupekit/mcp` fails with `ERR_MODULE_NOT_FOUND` for `@loupekit/shared`. | `@loupekit/shared` is only a dev dependency of `@loupekit/mcp`. This was the state of 0.14.0. | Move it to `dependencies` in `packages/mcp/package.json` and release a patch version. |
| Packagist does not list the new version. | The `Split (tag)` step failed, or Packagist auto-update is off. | Run `gh run list --workflow laravel-split.yml --branch v<X.Y.Z> --limit 1 --json status,conclusion`. If it shows `success`, check that the tag exists on the split repository and that **Auto-update** is on for the Packagist package. |
| A Laravel user reports a `package v…` flag after the version in the widget. | The user upgraded the package but did not republish its assets, so the served widget bundle is older than the installed package. This is the usual cause. | Point them to [Upgrade Loupe](docs/how-to/upgrade.md). They run `php artisan vendor:publish --tag=loupe-assets --force`. |
| The flag appears on a fresh install of the new version. | The committed `packages/laravel/resources/dist` bundle was not rebuilt for this release. | Run `bash packages/laravel/bin/sync-assets.sh`, commit, and release a patch version. |

### Re-tag a release

Use this when the tag points at a commit you must replace, for example one without its
changelog section.

1. Delete the local tag.

   ```bash
   git tag -d v<X.Y.Z>
   ```

   You should see `Deleted tag 'v<X.Y.Z>'`.

2. Delete the tag on GitHub.

   ```bash
   git push origin --delete v<X.Y.Z>
   ```

   You should see `- [deleted]         v<X.Y.Z>`.

3. Delete the tag that `laravel-split.yml` forwarded to the split repository.

   ```bash
   git push https://github.com/mohamed-ashraf-elsaed/loupe-laravel.git --delete v<X.Y.Z>
   ```

   You should see `- [deleted]         v<X.Y.Z>`.

4. Fix the commit, for example add the changelog section, and commit it.
5. Repeat [Release steps](#release-steps) 18 to 21 to create and push the tag again.
6. Run [Verify the release](#verify-the-release). On Packagist, check that `v<X.Y.Z>` is listed
   once the new split run finishes.

### Point `latest` back at the release

Run each command with an npm account that has publish rights on `@loupekit`.

```bash
npm dist-tag add @loupekit/shared@<X.Y.Z> latest
npm dist-tag add @loupekit/mcp@<X.Y.Z> latest
npm dist-tag add @loupekit/sdk@<X.Y.Z> latest
```

You should see `+latest: @loupekit/<PACKAGE>@<X.Y.Z>` for each one. Then run step 2 of
[Verify the release](#verify-the-release).

## Manual fallback

Use this only when the release workflow cannot run. It publishes to npm only, not to GitHub
Packages or Packagist.

1. Check out the release tag.

   ```bash
   git switch --detach v<X.Y.Z>
   ```

   You should see `HEAD is now at <SHA> chore(release): v<X.Y.Z>`.

2. Install and build every package.

   ```bash
   npm ci
   npm run build
   ```

   You should see each workspace build finish without errors.

3. Sign in to npm as an account with publish rights on `@loupekit`.

   ```bash
   npm login
   ```

   You should see `Logged in on https://registry.npmjs.org/.` Check the account with
   `npm whoami`.

4. Publish in dependency order: shared first, then mcp, then sdk.

   ```bash
   npm publish ./packages/shared --access public
   npm publish ./packages/mcp --access public
   npm publish ./packages/sdk --access public
   ```

   Each command should end with `+ @loupekit/<PACKAGE>@<X.Y.Z>`. The mcp package also rebuilds
   itself through its `prepublishOnly` script.

5. Run the checks in [Verify the release](#verify-the-release).

## Laravel package split: one-time setup

Packagist reads a repository's root `composer.json`, so it cannot publish
`packages/laravel` from the monorepo directly. `laravel-split.yml` mirrors that directory to a
separate repository, the split repository, with `danharrin/monorepo-split-github-action`. The
workflow has no `paths` filter on purpose: a `paths` filter would also skip tag pushes whose
commit does not touch `packages/laravel`.

To set it up on a new fork:

1. Create an empty repository to receive the split, for example `<OWNER>/loupe-laravel`.
   `<OWNER>` is the GitHub user or organization that owns it.
2. In the monorepo, set the repository variables `LARAVEL_SPLIT_ORG` to `<OWNER>` and
   `LARAVEL_SPLIT_REPO` to `loupe-laravel`.
3. Create a personal access token with `repo` scope that can push to the split repository, and
   save it as the `ACCESS_TOKEN` secret.
4. Push to `main`. The `laravel-split` run should succeed, and the split repository's `main`
   should now contain `composer.json` at its root.
5. Submit the split repository once at
   [packagist.org/packages/submit](https://packagist.org/packages/submit).
6. On the Packagist package page, turn on **Auto-update** so the GitHub webhook publishes each
   forwarded tag.

## Chrome Web Store extension

The extension is uploaded by hand. No workflow builds or uploads it.

1. Confirm `packages/extension/manifest.json` has the release version.

   ```bash
   node -p "require('./packages/extension/manifest.json').version"
   ```

   You should see `<X.Y.Z>`.

2. Build the content script.

   ```bash
   npm run build:extension
   ```

   You should see a line ending in `Build success`. The build writes
   `packages/extension/content.js`, which is ignored by git.

3. Delete any old package. `zip -r` adds to an existing archive instead of replacing it.

   ```bash
   rm -f loupe-extension.zip
   ```

   You should see no output.

4. Create the zip from the extension directory, leaving out sources and tests.

   ```bash
   (cd packages/extension && zip -r ../../loupe-extension.zip . -x "*.ts" "node_modules/*" "test/*")
   ```

   You should see `loupe-extension.zip` in the repository root. It is in `.gitignore`, so it
   is never committed. This is the same command as in
   [`docs/store/LISTING.md`](docs/store/LISTING.md), which also shows how to check the zip
   contents before you upload.

5. Upload `loupe-extension.zip` in the Chrome Web Store Developer Dashboard. The listing copy
   is in [`docs/store/LISTING.md`](docs/store/LISTING.md).

## Release pipeline reference

This section describes what the workflows do. You do not run anything here.

### What one tag ships

Pushing a tag that matches `v*` starts two workflows.

| Workflow | What it does | Destination |
|---|---|---|
| `.github/workflows/release.yml`, job `release` | Fails unless `CHANGELOG.md` contains `## [X.Y.Z]`. Extracts that section into the release notes. Creates the GitHub Release, or edits it if it already exists. | [GitHub Releases](https://github.com/mohamed-ashraf-elsaed/loupe/releases) |
| `.github/workflows/release.yml`, job `publish-npm` | Needs `release`. Runs `npm ci` and `npm run build`, then publishes `packages/shared`, `packages/mcp` and `packages/sdk`, in that order, with no `--tag` option, so npm applies the `latest` dist-tag. Skips any version that is already published. | npm: `@loupekit/shared`, `@loupekit/mcp`, `@loupekit/sdk` |
| `.github/workflows/release.yml`, job `publish-npm`, mirror step | Renames the three packages to the `@mohamed-ashraf-elsaed` scope and publishes them again. | GitHub Packages: `@mohamed-ashraf-elsaed/shared`, `/mcp`, `/sdk` |
| `.github/workflows/laravel-split.yml`, step `Split (tag)` | Forwards the tag to the split repository. Packagist's GitHub webhook then publishes the stable version. Does not depend on `release.yml`. | [github.com/mohamed-ashraf-elsaed/loupe-laravel](https://github.com/mohamed-ashraf-elsaed/loupe-laravel), then [Packagist `loupekit/laravel`](https://packagist.org/packages/loupekit/laravel) |

The split target is set by the repository variables `LARAVEL_SPLIT_ORG` and
`LARAVEL_SPLIT_REPO`. Without them the workflow falls back to `loupekit/laravel`. This
repository sets them to `mohamed-ashraf-elsaed` and `loupe-laravel`.

These packages are **not** published by any workflow:

| Package | Why |
|---|---|
| `@loupekit/dashboard`, `@loupekit/extension`, `@loupekit/hub` | Marked `"private": true`. |
| `@loupekit/server` | No workflow publishes it. Its `package.json` has no `private` flag, so do not run `npm publish -ws`. |
| The browser extension | Uploaded by hand. See [Chrome Web Store extension](#chrome-web-store-extension). |

> [!IMPORTANT]
> `release.yml` publishes the version written in each committed `package.json`. It never
> compares that version with the tag. If you tag `v0.15.0` but leave `packages/sdk/package.json`
> at `0.14.0`, the workflow skips the SDK as "already published" and still succeeds.

### What a push to main ships

| Workflow | What it does |
|---|---|
| `ci.yml` (CI) | `npm ci`, `npm run build:shared`, `npm test`. Also runs on every pull request. |
| `laravel.yml` (laravel-package) | PHPUnit with a 100% line-coverage gate on PHP 8.2–8.4 × Laravel 11–13, except PHP 8.2 on Laravel 13, because Laravel 13 needs PHP 8.3 or later. Also runs the [stranger test](docs/TESTING.md#run-the-stranger-test), which installs the package into a brand-new Laravel app. Runs only when `packages/laravel/**` or the workflow file changed. |
| `publish-next.yml` (Publish, canary) | Publishes a canary of shared, mcp and sdk under the `next` dist-tag, on npm and GitHub Packages. See [Canary channel](#canary-channel). |
| `laravel-split.yml`, step `Split (branch)` | Syncs `packages/laravel` to the split repository's `main` branch. Packagist serves it as `dev-main`. |

### Canary channel

A *canary* is a prerelease built from every push to `main`. `publish-next.yml` computes its
version as `<BASE>-next.<RUN_NUMBER>`, where `<BASE>` is the version in
`packages/shared/package.json` and `<RUN_NUMBER>` is the workflow's run number. It then runs
`scripts/set-version.mjs --version`, which sets that version on shared, sdk and mcp and pins
their internal `@loupekit/*` dependencies to it. Finally it publishes all three with
`--tag next`. Canary publishes never touch `latest`.

Two things to know:

- **Ordering.** SemVer sorts a prerelease below its release, so `0.14.0-next.81` is older than
  `0.14.0`. After a release, canaries stay behind `latest` until you bump the version on `main`
  to the next planned version.
- **No idempotency.** Unlike `release.yml`, the canary job does not skip versions that already
  exist. Re-running a finished canary run fails with npm's
  `cannot publish over the previously published versions` error. Push a new commit instead.
  The workflow's concurrency group `publish-next` runs canaries one at a time and never cancels
  one mid-publish.

To install a canary as a user, see
[Upgrade Loupe → Understand the two release channels](docs/how-to/upgrade.md#understand-the-two-release-channels).

### GitHub Packages mirror

GitHub Packages requires a package's scope to match the repository owner. After the npm
publish, both workflows run `node scripts/set-version.mjs --name-scope @mohamed-ashraf-elsaed`,
which renames the three packages in the CI checkout only. Dependencies keep their
`@loupekit/*` names and resolve from npm. Nothing is committed back.

To install from the mirror, add this `.npmrc` to your project:

```ini
@mohamed-ashraf-elsaed:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Then set `GITHUB_TOKEN` to a token with `read:packages` and install:

```bash
npm i @mohamed-ashraf-elsaed/sdk
```

The `.npmrc` file is in this repository's `.gitignore`. Never commit a token.

## Next steps

- [Upgrade Loupe](docs/how-to/upgrade.md): what users run after a release.
- [Contributing](CONTRIBUTING.md): set up the repository and open a pull request.
- [Testing](docs/TESTING.md): every test suite and how to run it.
- [Changelog](CHANGELOG.md): the release history.
