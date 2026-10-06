# Contributing to Loupe

This guide shows you how to set up the Loupe repository, build and test every package, and open a pull request that is ready for review.

Loupe is a *monorepo*: one Git repository that holds several packages. The JavaScript packages are npm *workspaces* under `packages/`. A workspace is a package that npm manages from the repository root: one `npm install` at the root installs the dependencies of every workspace and links the workspaces to each other, so `@loupekit/sdk` can import `@loupekit/shared` without a published copy. The Laravel package lives in `packages/laravel` and uses Composer.

Loupe is released under the [MIT License](LICENSE). Under GitHub's [Terms of Service](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service#6-contributions-under-repository-license), a contribution you make to a repository with a license is made under that license.

**Contents**

- [Before you begin](#before-you-begin)
- [Step 1: Install dependencies](#step-1-install-dependencies)
- [Step 2: Build the packages](#step-2-build-the-packages)
- [Step 3: Run the JavaScript tests](#step-3-run-the-javascript-tests)
- [Step 4: Run the Laravel tests](#step-4-run-the-laravel-tests)
- [Step 5: Make your change](#step-5-make-your-change)
- [Step 6: Sync the Laravel assets](#step-6-sync-the-laravel-assets)
- [Step 7: Add a changelog entry](#step-7-add-a-changelog-entry)
- [Step 8: Open a pull request](#step-8-open-a-pull-request)
- [Verify](#verify)
- [Troubleshooting](#troubleshooting)
- [Next steps](#next-steps)
- [Reference: package layout](#reference-package-layout)
- [Reference: code conventions](#reference-code-conventions)

## Before you begin

You need:

- **Git and a GitHub account.** You need both to fork the repository, push a branch and open a pull request. Check Git:

  ```bash
  git --version
  ```

  You should see `git version` followed by a version number.

- **Node.js 24 or later.** The root `package.json` does not declare a Node version; CI runs on Node 24 (`.github/workflows/ci.yml`), so use the same. The server, Hub and MCP packages run TypeScript files directly with `node index.ts`, which needs Node's built-in type stripping. On a Node version without it, `npm start` fails. Check your version:

  ```bash
  node --version
  ```

  You should see `v24` or a later major version.

- **npm**, which ships with Node.js. Check it with `npm --version`.
- **PHP and Composer**, only if you change or test `packages/laravel`. The package requires `php ^8.2`, and Laravel 13 needs PHP 8.3 or later. Install PHP 8.3 or 8.4, the versions CI tests with every supported Laravel release. You also need:
  - the `pdo_sqlite` extension, because the tests use an in-memory SQLite database;
  - a coverage driver, pcov or Xdebug, for the coverage gate in [Step 4](#step-4-run-the-laravel-tests). CI uses pcov.

  Check PHP and its extensions:

  ```bash
  php --version
  php -m | grep -i -E 'pdo_sqlite|pcov|xdebug'
  ```

  You should see `PHP 8.3` or `PHP 8.4`, then `pdo_sqlite` and at least one of `pcov` or `Xdebug`.

To get the code:

1. On GitHub, open [mohamed-ashraf-elsaed/loupe](https://github.com/mohamed-ashraf-elsaed/loupe) and click **Fork** to create a copy under your account.
2. Clone your fork. Replace `<GITHUB_USER>` with your GitHub username:

   ```bash
   git clone https://github.com/<GITHUB_USER>/loupe.git
   cd loupe
   ```

3. Add the original repository as a remote named `upstream`, so you can branch from its latest `main`:

   ```bash
   git remote add upstream https://github.com/mohamed-ashraf-elsaed/loupe.git
   ```

4. Check that you are on `main`:

   ```bash
   git status
   ```

   You should see `On branch main`.

If you have push access to `mohamed-ashraf-elsaed/loupe`, you can clone it directly and skip the fork. In that case, read `origin` wherever this guide says `upstream`.

Run every command in this guide from the repository root unless a step says otherwise.

## Step 1: Install dependencies

1. Install the workspace dependencies:

   ```bash
   npm install
   ```

   You should see npm finish with an `added N packages` line and no errors. One install covers every workspace: `shared`, `sdk`, `dashboard`, `server`, `mcp`, `extension` and `hub`.

## Step 2: Build the packages

1. Build the browser and published packages:

   ```bash
   npm run build
   ```

   The build runs in this order: `shared` → `sdk` → `mcp` → `dashboard` → `extension`. `shared` builds first because the other packages resolve its `dist/`. The extension builds after the SDK because it bundles `@loupekit/sdk`. You should see each workspace build without errors.

   For what each package outputs, and which packages run without a build, see [Reference: package layout](#reference-package-layout).

2. Optional: create the demo project for the local server:

   ```bash
   npm run seed
   ```

   You should see `Seeded project: pk_demo_acme`, followed by the admin key and a demo HMAC.

3. Optional: start the local server to try your change in a browser:

   ```bash
   npm start
   ```

   You should see `[loupe] API + static on http://localhost:8787  (dashboard: /dashboard/ · demo: /demo/)`. Press `Ctrl+C` to stop it. For details, see [Run the local server](docs/how-to/run-local-server.md).

## Step 3: Run the JavaScript tests

1. Run every Vitest suite:

   ```bash
   npm test
   ```

   You should see Vitest report every test file as passed. Vitest picks up `packages/**/test/**/*.test.ts`. DOM tests opt in to happy-dom with a `// @vitest-environment happy-dom` comment; everything else runs in Node.

2. Optional: run the tests in watch mode while you work:

   ```bash
   npm run test:watch
   ```

   You should see Vitest run the suites, then wait for file changes and rerun the affected tests when you save. Press `q` or `Ctrl+C` to quit.

3. Optional: check coverage for new code:

   ```bash
   npm run test:coverage
   ```

   You should see a text summary in the terminal. The HTML report is written to `coverage/`.

4. Optional: type-check the SDK:

   ```bash
   npm run typecheck
   ```

   You should see npm's `> ... typecheck` header lines and no errors after them.

To run a single package's tests, pass its path to Vitest. For example, `npx vitest run packages/sdk`.

## Step 4: Run the Laravel tests

Skip this step if you did not change `packages/laravel`. The commands use `composer --working-dir`, so you stay in the repository root.

1. Install the package's Composer dependencies:

   ```bash
   composer --working-dir=packages/laravel install
   ```

   You should see Composer finish with `Generating autoload files` and no errors.

2. Run the test suite:

   ```bash
   composer --working-dir=packages/laravel test
   ```

   You should see PHPUnit report `OK`. The tests use Orchestra Testbench with an in-memory SQLite database, so they never touch a real database.

3. Run the coverage gate that CI runs:

   ```bash
   composer --working-dir=packages/laravel test:coverage-100
   ```

   You should see `Line coverage: 100.00% (...)` followed by `Coverage threshold met.` This gate requires 100% line coverage and needs a coverage driver. If you use Xdebug, prefix the command with `XDEBUG_MODE=coverage`.

For what each suite covers, see [Testing](docs/TESTING.md).

## Step 5: Make your change

Before you start, read [Reference: code conventions](#reference-code-conventions).

1. Edit the source files under `packages/<PKG>/`, where `<PKG>` is the package you are changing, for example `sdk` or `server`.
2. Add or update a test in `packages/<PKG>/test/<NAME>.test.ts`, where `<NAME>` describes the behavior under test.
3. Run that package's tests:

   ```bash
   npx vitest run packages/<PKG>
   ```

   You should see every test file in that package reported as passed.

If you change `packages/laravel`, add a PHPUnit test under `packages/laravel/tests/` instead, and run [Step 4](#step-4-run-the-laravel-tests).

## Step 6: Sync the Laravel assets

The Laravel package ships prebuilt copies of the SDK and dashboard bundles in `packages/laravel/resources/dist/`. Laravel users never run the JavaScript build, so these committed files are what they get.

Run this step whenever you change `packages/sdk`, `packages/dashboard` or `packages/shared`.

1. Rebuild and copy the bundles:

   ```bash
   bash packages/laravel/bin/sync-assets.sh
   ```

   The script builds `shared`, `sdk` and `dashboard`, then copies two files:

   | From | To |
   |---|---|
   | `packages/sdk/dist/index.global.js` | `packages/laravel/resources/dist/sdk/loupe.js` |
   | `packages/dashboard/dist/app.js` | `packages/laravel/resources/dist/dashboard/app.js` |

   You should see `→ Building shared → sdk → dashboard…`, the build output, `→ Vendoring bundles into <DEST>…`, and, as the last line, `✓ Loupe Laravel assets synced.`

2. Check which bundles changed:

   ```bash
   git status --short packages/laravel/resources/dist
   ```

   You should see one or both of these lines, depending on which package you changed:

   ```text
    M packages/laravel/resources/dist/dashboard/app.js
    M packages/laravel/resources/dist/sdk/loupe.js
   ```

   The script copies both files every time, but Git lists only a file whose content changed. You commit whichever changed in [Step 8](#step-8-open-a-pull-request).

## Step 7: Add a changelog entry

`CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Every user-visible change needs an entry.

1. Open `CHANGELOG.md` and find the `## [Unreleased]` heading at the top.
2. Add your entry under the matching subheading. Keep a Changelog defines six, in this order: `### Added`, `### Changed`, `### Deprecated`, `### Removed`, `### Fixed` and `### Security`. If the subheading does not exist yet, create it in that order relative to the subheadings already under `## [Unreleased]`. For example, a new `### Fixed` goes above an existing `### Security`.

   ```markdown
   ## [Unreleased]

   ### Fixed

   - **<SHORT_SUMMARY>.** <DETAILS>.
   ```

   Replace the placeholders:

   - `<SHORT_SUMMARY>`: a one-line summary, shown in bold.
   - `<DETAILS>`: one or two sentences on what a user notices and why it changed.

3. Check your edit:

   ```bash
   git diff CHANGELOG.md
   ```

   You should see your new line under `## [Unreleased]`.

Do not add a version number or date. A maintainer moves `Unreleased` entries under the new version when they cut a release. The release workflow fails if the tagged version has no `CHANGELOG.md` entry. For the release process, see [Releasing](RELEASING.md).

## Step 8: Open a pull request

1. Fetch the latest upstream `main`:

   ```bash
   git fetch upstream
   ```

2. Create a branch from it:

   ```bash
   git switch -c <BRANCH_NAME> upstream/main
   ```

   You should see `Switched to a new branch '<BRANCH_NAME>'`.

3. Stage the files you changed:

   ```bash
   git add <PATHS>
   ```

   Name the files rather than adding everything. If you ran Step 6, include the bundles that changed, for example `packages/laravel/resources/dist/sdk/loupe.js` and `packages/laravel/resources/dist/dashboard/app.js`.

4. Commit:

   ```bash
   git commit -m "<TYPE>(<SCOPE>): <SUMMARY>"
   ```

   You should see a line that starts with `[<BRANCH_NAME>` and ends with your commit subject.

5. Push the branch to your fork:

   ```bash
   git push -u origin <BRANCH_NAME>
   ```

   You should see `* [new branch]      <BRANCH_NAME> -> <BRANCH_NAME>`.

6. On GitHub, open a pull request from `<BRANCH_NAME>` on your fork into `main` on `mohamed-ashraf-elsaed/loupe`.

   You should see the `CI` check start on the pull request. If you changed `packages/laravel`, you should also see the `laravel-package` checks start.

7. In the description, state:
   - what changed and why;
   - how you tested it, with the commands you ran;
   - any part you could not test.

Replace the placeholders:

- `<BRANCH_NAME>`: a short description, for example `fix/region-anchor-offset`.
- `<PATHS>`: the files you changed.
- `<TYPE>(<SCOPE>): <SUMMARY>`: a [Conventional Commits](https://www.conventionalcommits.org/) subject. `<TYPE>` names the kind of change; this repository's history uses `feat`, `fix`, `docs`, `chore`, `ci` and `test`. `<SCOPE>` names the package, for example `sdk` or `laravel`. `<SUMMARY>` is a short imperative description. For example: `fix(sdk): keep region pins on resize`.

A pull request is ready for review when:

- `npm test` passes. CI (the `CI` workflow) runs `npm ci`, `npm run build:shared` and `npm test` on every pull request.
- `composer test:coverage-100` passes, if you changed `packages/laravel`. The `laravel-package` workflow runs only when a pull request changes `packages/laravel/**` or `.github/workflows/laravel.yml`. It runs the gate on PHP 8.2, 8.3 and 8.4 against Laravel 11, 12 and 13, except PHP 8.2 with Laravel 13. It also runs the end-to-end install test, `packages/laravel/bin/stranger-test.sh`, on PHP 8.2 with Laravel 12 and on PHP 8.4 with Laravel 13.
- The Laravel assets are synced, if you changed the SDK, dashboard or shared package.
- `CHANGELOG.md` has an entry under `## [Unreleased]`.
- Docs that describe the changed behavior are updated in the same pull request.

## Verify

Run the same checks CI runs, from the repository root:

```bash
npm ci
npm run build:shared
npm test
```

`npm ci` deletes `node_modules` and reinstalls exactly what `package-lock.json` lists. You should see an `added N packages` line, then every Vitest file pass.

If you changed the Laravel package, also run:

```bash
composer --working-dir=packages/laravel test:coverage-100
```

You should see `Coverage threshold met.` as the last line.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| A test fails with a missing module from `@loupekit/shared`. | `shared` has not been built, so `packages/shared/dist/` is missing. | Run `npm run build:shared`, or `npm run build`. |
| `npm start` fails with `ERR_UNKNOWN_FILE_EXTENSION` for a `.ts` file. | Your Node version cannot run TypeScript files directly. | Install Node 24 and check with `node --version`. |
| `npm start` fails with `EADDRINUSE` on port 8787. | Another process uses port 8787, the server's default. | Stop that process, or start on another port: `PORT=<PORT> npm start`, where `<PORT>` is a free port such as `8788`. |
| `node index.ts` fails with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. | The file uses TypeScript that Node cannot strip, such as an enum or a constructor parameter property. | Rewrite it as plain fields and union types. `npx vitest run packages/mcp` checks the MCP sources only; for `server` and `hub`, run `npm start` or `npm run start:hub` and confirm the process starts. |
| `git push` fails with `403` or `Permission denied`. | `origin` points at `mohamed-ashraf-elsaed/loupe`, where you have no push access. | Fork the repository, then point `origin` at your fork: `git remote set-url origin https://github.com/<GITHUB_USER>/loupe.git`, and push again. |
| The `laravel-package` checks never start on your pull request. | The workflow runs only when the pull request changes `packages/laravel/**` or `.github/workflows/laravel.yml`. | Nothing to fix if you did not change the Laravel package. Only the `CI` check applies. |
| `composer test:coverage-100` stops with the warning `No code coverage driver available`, then `returned with error code 1`. | PHP has no coverage driver loaded. | Install and enable pcov or Xdebug, then run the command again. |
| `composer test:coverage-100` stops with `XDEBUG_MODE=coverage (environment variable) or xdebug.mode=coverage (PHP configuration setting) has to be set`. | Xdebug is loaded but not in coverage mode. | Run `XDEBUG_MODE=coverage composer --working-dir=packages/laravel test:coverage-100`. |
| `composer test:coverage-100` fails with `Coverage X% is below the required 100%`. | New PHP code has lines no test runs. | Generate an HTML report with `(cd packages/laravel && vendor/bin/phpunit --coverage-html build/coverage)`, open `packages/laravel/build/coverage/index.html`, and add tests for the lines it marks as not covered. |
| Laravel tests fail with a database driver error. | The `pdo_sqlite` extension is not enabled. | Enable `pdo_sqlite` in your PHP install. Check with `php -m \| grep pdo_sqlite`. |
| A Laravel app still shows the old widget after your SDK change. | The bundles in `packages/laravel/resources/dist/` were not refreshed. | Run `bash packages/laravel/bin/sync-assets.sh` and commit the result. |
| DOM tests fail on Node 25 or later with `localStorage` errors. | Node's built-in `localStorage` shadows happy-dom's. | Run tests through `npm test`. `vitest.config.ts` starts workers with `--no-experimental-webstorage`. |

## Next steps

- [Testing](docs/TESTING.md): what each test suite covers.
- [Architecture](docs/ARCHITECTURE.md): how the packages fit together.
- [Releasing](RELEASING.md): how maintainers version, tag and publish.
- [Run the local server](docs/how-to/run-local-server.md): try your change in the demo and dashboard.
- [Documentation index](docs/README.md): every guide and reference page.

## Reference: package layout

`npm run build` writes these outputs:

| Package | Build tool | Output |
|---|---|---|
| `shared` | `tsc` | `packages/shared/dist/` |
| `sdk` | tsup | `packages/sdk/dist/index.js` (ESM) and `packages/sdk/dist/index.global.js` (script tag) |
| `mcp` | tsup | `packages/mcp/dist/index.js`, the published `loupe-mcp` entry |
| `dashboard` | tsup | `packages/dashboard/dist/app.js` |
| `extension` | tsup | `packages/extension/content.js` |

`server` and `hub` have no build step. Node runs their TypeScript directly:

| Package | Start command | What runs |
|---|---|---|
| `server` | `npm start` | `node index.ts` in `packages/server` |
| `hub` | `npm run start:hub` | `node index.ts` in `packages/hub` |
| `mcp` | `npm run start -w @loupekit/mcp` | `node index.ts`, for local development only |

The MCP package runs `index.ts` from source with its `start` script, but the published package runs the compiled `dist/index.js`. Node does not strip types from files under `node_modules`, so a published package must ship JavaScript.

Because Node only strips types, code in `server`, `hub` and `mcp` cannot use TypeScript syntax that needs compiling, such as enums, namespaces or constructor parameter properties. The test `packages/mcp/test/typescript-runtime.test.ts` scans the `packages/mcp` sources for them. It does not scan `server` or `hub`.

For how the packages depend on each other, see [Architecture: Components](docs/ARCHITECTURE.md#components).

## Reference: code conventions

- **Put shared data types in `@loupekit/shared`.** The SDK, server, dashboard, MCP and Hub packages import their types from there.
- **Keep the strict packages strict.** The `shared`, `sdk` and `hub` tsconfigs set `"strict": true`. Do not turn it off.
- **Use the right import extension.** Node packages (`server`, `mcp`, `hub`) import local files with `.ts` extensions. Bundled browser packages (`sdk`, `dashboard`, `extension`) follow the existing files in that package.
- **Change behavior behind the existing extension points**, not their contracts. An extension point (the architecture page calls it a *seam*) is a place where you can swap an implementation without changing the code that calls it. Examples are the SDK `StorageAdapter` interface, `packages/server/db.ts`, `packages/server/blobs.ts` and the SDK capture overrides (`captureScreenshot`, `captureRegion`, `captureRecording`). For the full list, see [Architecture: Seams](docs/ARCHITECTURE.md#seams).
- **Add tests.** New logic needs a test in that package's `test/` folder. Laravel changes must keep 100% line coverage.
- **Match the surrounding style.** Do not add a dependency without a reason you can state in the pull request.
