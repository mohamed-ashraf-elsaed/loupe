# Testing

This page tells contributors how to run every Loupe test suite on their own machine, and lists
what each suite and each test file checks. The how-to sections come first. The reference
tables (configuration, CI jobs, test files) follow, and a short explanation of the stranger test
and the coverage gate comes last.

Loupe has three kinds of tests:

- **JavaScript tests.** One [Vitest](https://vitest.dev/) run covers the TypeScript packages:
  `shared`, `sdk`, `server`, `mcp`, `dashboard`, `extension` and `hub`. `hub` is
  [Loupe Hub](reference/hub.md), the optional service that holds organizations and projects
  and routes tickets between apps.
- **Laravel tests.** [PHPUnit](https://phpunit.de/) with
  [Orchestra Testbench](https://packages.tools/testbench) covers the `loupekit/laravel` package.
  It has a 100% line-coverage gate.
- **The stranger test.** An end-to-end script installs the Laravel package into a brand-new
  Laravel app, the way a first-time user would, and checks that the first run works.

## Contents

- [Before you start](#before-you-start)
- [Run the JavaScript tests](#run-the-javascript-tests)
- [Run the Laravel tests](#run-the-laravel-tests)
- [Run the stranger test](#run-the-stranger-test)
- [What CI runs](#what-ci-runs)
- [Vitest configuration reference](#vitest-configuration-reference)
- [PHPUnit configuration reference](#phpunit-configuration-reference)
- [Test suites](#test-suites)
- [Coverage](#coverage)
- [Troubleshooting](#troubleshooting)
- [About the stranger test and the coverage gate](#about-the-stranger-test-and-the-coverage-gate)
- [Next steps](#next-steps)

## Before you start

You need:

| Tool | Version | Needed for |
|---|---|---|
| Node.js and npm | 24 or later. CI uses 24. | the JavaScript tests |
| PHP | 8.2, 8.3 or 8.4, with the `mbstring`, `pdo_sqlite` and `sqlite3` extensions | the Laravel tests and the stranger test |
| Composer | 2.x | the Laravel tests and the stranger test |
| A PHP coverage driver: [PCOV](https://github.com/krakjoe/pcov) or [Xdebug](https://xdebug.org/) | any | `composer test:coverage-100` only |
| `curl` and `python3` | any | the stranger test only |

Then get the code and prepare your shell:

1. Clone the repository:

   ```bash
   git clone https://github.com/mohamed-ashraf-elsaed/loupe.git
   ```

   You should see `Cloning into 'loupe'...`.

2. Go to the repository root:

   ```bash
   cd loupe
   ```

   Run every command below from this folder, unless a step says otherwise. `ls` should list
   `package.json`, `vitest.config.ts` and `packages`.

3. Make sure `DATABASE_URL` is not set in your shell:

   ```bash
   unset DATABASE_URL
   ```

   The server and Hub pick their database in `packages/server/db.ts` and `packages/hub/db.ts`.
   They check `DATABASE_URL` first and connect to that Postgres database when it is set. The
   tests only set `LOUPE_PG_DIR` or `HUB_PG_DIR` to `memory://`, and nothing in the test setup
   clears `DATABASE_URL`.

With `DATABASE_URL` unset, no test touches a real database. The JavaScript server and Hub tests
use in-memory [PGlite](https://pglite.dev/) (Postgres compiled to WebAssembly, running inside the
Node process), and the Laravel tests use SQLite `:memory:`. To keep the variable for other work
and still run the tests safely, run `env -u DATABASE_URL npm test` instead of `npm test`.

## Run the JavaScript tests

1. Install the dependencies exactly as the lockfile pins them:

   ```bash
   npm ci
   ```

   You should see npm finish with an `added <N> packages` line and no `ERR!` lines.

2. Build the shared package. The other packages import `@loupekit/shared` from its `dist`
   folder, so the tests cannot load without it:

   ```bash
   npm run build:shared
   ```

   You should see `tsc -p tsconfig.json` run with no errors. `packages/shared/dist/index.js`
   now exists.

3. Run the whole suite once:

   ```bash
   npm test
   ```

   You should see a summary like this, with no failed files:

   ```text
    Test Files  46 passed (46)
         Tests  836 passed (836)
   ```

   The counts were measured on 2026-10-05 and grow as tests are added.

### Verify the JavaScript run

- The summary line reads `Test Files  <N> passed (<N>)`, with the same number twice and no
  `failed` count.
- No line in the output reads `[loupe] Postgres via DATABASE_URL` or
  `[hub] Postgres via DATABASE_URL`. Either line means the tests used a real database. See
  [Troubleshooting](#troubleshooting).

To work on the tests, use one of these instead of step 3:

| Command | What it does |
|---|---|
| `npm run test:watch` | Runs `vitest` in watch mode and re-runs affected tests when you save a file. |
| `npm run test:coverage` | Runs `vitest run --coverage` and writes the reports to `coverage/`. See [Coverage](#coverage). |
| `npx vitest run packages/<PACKAGE>` | Runs one package's tests. Replace `<PACKAGE>` with a folder name under `packages/`, for example `sdk` or `hub`. |
| `npm run typecheck` | Type-checks the SDK only (`tsc --noEmit` in `packages/sdk`). It is not part of `npm test`. |

## Run the Laravel tests

1. Go to the package folder:

   ```bash
   cd packages/laravel
   ```

2. Install the package's own dependencies:

   ```bash
   composer install
   ```

   You should see Composer finish with `Generating autoload files`. `vendor/autoload.php` now
   exists.

3. Run the test suite:

   ```bash
   composer test
   ```

   You should see PHPUnit finish with `OK`, for example:

   ```text
   OK (234 tests, 747 assertions)
   ```

   The counts were measured on 2026-10-05 with PHP 8.4.

4. Optional: run the coverage gate that CI runs. It needs PCOV or Xdebug:

   ```bash
   composer test:coverage-100
   ```

   You should see these last two lines:

   ```text
   Line coverage: 100.00% (1332/1332)
   Coverage threshold met.
   ```

   The script runs `phpunit --coverage-clover=build/clover.xml`, then
   `php bin/check-coverage.php build/clover.xml 100`. The first command writes a Clover file
   (an XML coverage report format) to `build/clover.xml`. The checker reads the statement
   metrics from that file and exits with status 1 when coverage is below the threshold.

5. Go back to the repository root:

   ```bash
   cd ../..
   ```

   `ls` should list `package.json` and `packages` again.

### Verify the Laravel run

- `composer test` ends with an `OK (<N> tests, <M> assertions)` line.
- If you ran the gate, the last line is `Coverage threshold met.`

To run one test class, call PHPUnit directly with `--filter`. Run it from `packages/laravel`:

```bash
cd packages/laravel
vendor/bin/phpunit --filter <TEST_CLASS>
cd ../..
```

Replace `<TEST_CLASS>` with a class name from [Laravel test files](#laravel-test-files), for
example `HubTest`.

Other Composer scripts in `packages/laravel/composer.json`:

| Script | Command |
|---|---|
| `composer test` | `phpunit` |
| `composer test:coverage` | `phpunit --coverage-text` |
| `composer test:coverage-100` | `phpunit --coverage-clover=build/clover.xml && php bin/check-coverage.php build/clover.xml 100` |
| `composer stranger-test` | `bin/stranger-test.sh` |

## Run the stranger test

The stranger test installs **your working tree** of `packages/laravel` into a new Laravel app
through a Composer [path repository](https://getcomposer.org/doc/05-repositories.md#path) (a
repository entry that points Composer at a local folder), not the version on Packagist. CI runs
it on every pull request that changes `packages/laravel`, so a change that breaks a first install
shows up as a failed check. It writes only to a temporary directory and deletes that directory
when it exits.

It needs network access (it runs `composer create-project`), plus PHP with `pdo_sqlite`,
Composer, `curl` and `python3`.

1. Make sure you are in the repository root, not in `packages/laravel`. Then run the script:

   ```bash
   bash packages/laravel/bin/stranger-test.sh
   ```

   Or, from `packages/laravel`, run `composer stranger-test`.

   You should see the first heading,
   `1/7  A brand-new Laravel app — the stranger's starting point`. Creating the app takes a
   minute or more.

2. Watch the seven numbered steps. The script prints `✓` for each passing check and `✗` for
   each failing one.

3. Check the last line. On success you should see:

   ```text
   ✅ stranger test passed — a brand-new install works end to end
   ```

   The script exits with a non-zero status on any failure, but the last line depends on where
   it failed:

   - A check in step 3, 5 or 7 fails: the script keeps going, and the last line is
     `❌ stranger test failed — see the ✗ lines above`. The exit status is 1.
   - Step 1 (`composer create-project` or `composer install`) or step 6 (the app never came
     up) fails: the script prints a `✗` line with the reason and the end of the log, then exits
     with status 1 straight away.
   - Any other command fails, such as `composer require` in step 2 or `php artisan migrate` in
     step 3: the script stops at once with that command's exit status, and prints no `✗` line.

### Verify the stranger run

- Every check line starts with `✓`, and no line starts with `✗`.
- The last line is `✅ stranger test passed — a brand-new install works end to end`.

### Environment variables

| Variable | Type | Default | Effect |
|---|---|---|---|
| `STRANGER_LARAVEL` | major version number, for example `12` | unset: whatever `composer create-project laravel/laravel` installs today | Creates the app from `laravel/laravel:^<N>.0`. |
| `STRANGER_PORT` | port number | `8791` | Port for `php artisan serve`. |

Example, pinned to Laravel 12 on port 8899:

```bash
STRANGER_LARAVEL=12 STRANGER_PORT=8899 bash packages/laravel/bin/stranger-test.sh
```

### What it does and what it asserts

| Step | Action |
|---|---|
| 1/7 | Creates a Laravel app with `--no-scripts --no-install`. Turns off Composer's advisory block, removes the skeleton's `require-dev` and its `allow-plugins` list, runs `composer install --no-dev`, copies `.env`, generates the app key and creates `database/database.sqlite`. |
| 2/7 | Adds the path repository and runs `composer require loupekit/laravel:@dev`. |
| 3/7 | Runs `php artisan loupe:install` and checks that its output warns about the missing `[login]` route. Then runs `php artisan migrate --force`. |
| 4/7 | Adds `@loupeWidget` before `</body>` in `welcome.blade.php`, a test-only sign-in route `/__stranger_login`, and a named `login` route. |
| 5/7 | Runs `php artisan loupe:install --force` again and checks that the `[login]` warning is gone. |
| 6/7 | Starts `php artisan serve` and waits up to 30 seconds for it to answer. |
| 7/7 | Runs the assertions below. |

The assertions in step 7/7:

- A guest gets the home page with status 200, and the page does not contain the widget script.
- A guest's request to `/loupe/dashboard` does not return a 5xx status.
- A signed-in user's page contains `vendor/loupe/sdk/loupe.js?v=` and `Loupe.init`.
- The SDK bundle downloads with status 200, is larger than 100,000 bytes, and its first 400 bytes contain `Loupe`.
- `POST /loupe/v1/comments` with the session's CSRF token returns 200 or 201.
- `GET /loupe/v1/comments` returns 200 and contains the comment that was just posted.

## What CI runs

Two GitHub Actions workflows run tests.

| Workflow | File | Runs on | Steps |
|---|---|---|---|
| `CI` | `.github/workflows/ci.yml` | every push to `main` and every pull request | Node 24, then `npm ci`, `npm run build:shared`, `npm test`. No coverage gate, no type check, no PHP. |
| `laravel-package` | `.github/workflows/laravel.yml` | pushes to `main` and pull requests that change `packages/laravel/**` or the workflow file | the `test` and `stranger` jobs below |

### The `test` job (laravel-package)

It runs a matrix of PHP `8.2`, `8.3` and `8.4` against Laravel 11, 12 and 13 with
`fail-fast: false`. It excludes PHP 8.2 with Laravel 13, because Laravel 13 needs PHP 8.3. That
leaves 8 jobs.

| Laravel | Testbench constraint |
|---|---|
| 11 | `^9.0` |
| 12 | `^10.0` |
| 13 | `^11.0` |

Each job:

1. Sets up PHP with the `mbstring`, `pdo_sqlite` and `sqlite3` extensions and PCOV for coverage.
2. Pins Laravel with `composer require "orchestra/testbench:<VERSION>" --dev --no-update`.
3. Runs `composer update --prefer-dist --with-all-dependencies`.
4. Runs `composer run test:coverage-100`, so every combination must reach 100% line coverage.

`laravel/mcp ^0.8` supports Laravel 11, 12 and 13, so the MCP tools are tested on every
combination.

### The `stranger` job (laravel-package)

It runs at both ends of the supported range, with coverage off:

| PHP | `STRANGER_LARAVEL` |
|---|---|
| 8.2 | 12 |
| 8.4 | 13 |

Each job:

1. Sets up PHP with the `mbstring`, `pdo_sqlite` and `sqlite3` extensions and no coverage
   driver.
2. Runs `composer install --prefer-dist --no-interaction --no-progress` in `packages/laravel`.
3. Runs `bin/stranger-test.sh` from `packages/laravel`, with `STRANGER_LARAVEL` set to the
   matrix value.

There is no Laravel 11 stranger job. See
[About the stranger test and the coverage gate](#about-the-stranger-test-and-the-coverage-gate).

## Vitest configuration reference

`vitest.config.ts` at the repository root:

| Setting | Value | Why |
|---|---|---|
| `include` | `packages/**/test/**/*.test.ts` | Every package keeps its tests in `test/`. |
| `environment` | `node` | The default. A test file that needs a DOM opts in with the comment `// @vitest-environment happy-dom` on its first line. [happy-dom](https://github.com/capricorn86/happy-dom) is a browser DOM implemented in JavaScript for Node. |
| `testTimeout` | `20000` (20 s) | Some suites start real HTTP servers and subprocesses. |
| `execArgv` | `["--no-experimental-webstorage"]` | Node 25 and later ship a global `localStorage` that hides happy-dom's in the DOM suites. The flag turns it off in the test workers. It does nothing on Node 24. |
| `coverage.provider` | `v8` | |
| `coverage.reporter` | `text`, `text-summary`, `html`, `json-summary` | |
| `coverage.reportsDirectory` | `coverage` | `coverage/` is in `.gitignore`. |
| `coverage.all` | `true` | Has no effect. The installed Vitest is 4.1.10, and Vitest 4 has no `all` coverage option, so it ignores the key. |
| `coverage.include` | `packages/shared/src/**/*.ts`, `packages/sdk/src/**/*.ts`, `packages/server/*.ts`, `packages/dashboard/*.ts`, `packages/mcp/index.ts`, `packages/hub/*.ts` | Every matching file counts, including files that no test imports. Without `include`, Vitest 4 counts only the files the tests load. |
| `coverage.exclude` | `**/*.config.ts`, `**/dist/**`, `**/node_modules/**`, `**/test/**`, `packages/server/seed.ts`, `packages/hub/seed.ts`, `**/*.d.ts`, `packages/sdk/demo/**` | |

## PHPUnit configuration reference

`packages/laravel/phpunit.xml.dist` and `packages/laravel/tests/TestCase.php`:

| Setting | Value | Effect |
|---|---|---|
| `bootstrap` | `vendor/autoload.php` | Run `composer install` first. |
| `failOnWarning` | `true` | A PHPUnit warning fails the run. |
| `failOnRisky` | `true` | A risky test, such as one with no assertions, fails the run. |
| Test suite | `Loupe Test Suite`, directory `tests` | Runs `tests/Feature` and `tests/Unit`. |
| Coverage source | `src` | Only package code counts towards the 100% gate. |
| Coverage report | text summary to stdout | |
| `APP_ENV` | `testing` | |
| `APP_KEY` | a fixed test key | |
| `DB_CONNECTION` | `testing` | |
| `testing` connection | `driver: sqlite`, `database: :memory:` (set in `TestCase::defineEnvironment()`) | Every test runs against a fresh in-memory SQLite database. |

`TestCase` also creates a `users` table, loads the package migrations from
`database/migrations`, registers a named `login` route and sets up a local `public` disk. Its
helper `actingAsAllowed()` grants both Loupe abilities and signs in a new user.

## Test suites

The list below comes from:

```bash
git ls-files 'packages/*/test/*' 'packages/laravel/tests/*'
```

Each purpose is taken from the file's header comment and its `describe` blocks or test names.

### shared (`packages/shared/test/`)

| File | What it checks |
|---|---|
| `companion-tray.test.ts` | The gather tray (add, replace, include, reorder, payload), dictation availability and the recording clock label. |
| `consent.test.ts` | Navigation consent: only http(s) URLs, a new request replaces the pending one, and only an explicit grant navigates. |
| `iteration.test.ts` | The history of generated changes: add, undo, move and the 20-item cap. |
| `lifecycle.test.ts` | The lifecycle chip (Sent to agent, In PR, Review preview, Reviewed) and `awaitingReview`. |
| `mentions.test.ts` | Parsing, resolving, rendering and autocompleting `@` mentions. |
| `needs-you.test.ts` | Question detection, the needs-you predicate, board filtering and the full truth table. |
| `normalizeUrl.test.ts` | URL normalization: tracking parameters dropped, parameters sorted, trailing slash, absolute URLs. |
| `preview.test.ts` | URL pattern matching, template expansion, the GitHub Pages preview convention and repo URL environments. |
| `reactions-presence.test.ts` | Reaction toggling and summaries, presence join, heartbeat and sweep, cursor throttling and avatar initials. |
| `status.test.ts` | The five comment stages and legacy status mapping. |
| `thread-delete.test.ts` | Retracted messages, message attachments and the thread event names. |
| `thread.test.ts` | The comment body as the first message, conversations, participants and revision labels. |
| `timeline.test.ts` | Target descriptions, the thread timeline and the Markdown thread export. |
| `triage.test.ts` | Priorities, change types, their labels and their defaults. |

### sdk (`packages/sdk/test/`)

| File | What it checks |
|---|---|
| `app.test.ts` | The widget end to end under happy-dom: mounting, inspect, comment, pins, persistence, re-anchoring, the panel, dock modes, the launcher, region anchoring, organization chips, the Activity feed and the forwarding chips. |
| `capture.test.ts` | Element context capture and truncation, and screenshot success and failure. |
| `fingerprint.test.ts` | `captureAnchor` and every `resolveAnchor` tier. |
| `http-adapter.test.ts` | Identity headers, blob upload before save, inline fallback, PATCH and DELETE, errors, and the organization and activity reads. |
| `store.test.ts` | The offline `LocalStorageAdapter`. |

### server (`packages/server/test/`)

| File | What it checks |
|---|---|
| `api.test.ts` | The HTTP API on a real `node:http` server: working branches, repo URLs, preview, people, mentions, notifications, reactions, message retraction, attachments and comment routes. |
| `auth.test.ts` | Admin and user authentication, and the 400, 401 and 404 answers. |
| `blobs.test.ts` | Blob storage: round-trips, id sanitizing and MIME types. |
| `branches.test.ts` | Working branches, repo URL patterns and preview lookup. |
| `integrations.test.ts` | Credential encryption, the provider registry, credential storage, repo mappings and the Slack and Telegram adapters. |
| `notifications.test.ts` | Who can be mentioned, and notifications. |
| `source-guards.test.ts` | A source scan for a mistake the type checker would catch, because the server runs as native TypeScript with nothing type-checking it. |
| `store.test.ts` | The comment store: upsert, URL normalization, SQL filters, legacy statuses, triage fields, recordings, proposals, pull requests and deletion. |

### mcp (`packages/mcp/test/`)

| File | What it checks |
|---|---|
| `bridge.test.ts` | The selection store and its validation, the agent registry, the event bus, CORS and the local HTTP bridge. |
| `companion-bridge.test.ts` | Mapping Claude Code hook events to bridge events, ingesting events, the companion over the bridge, the delivery guarantee, the activity summary and desktop notifications. |
| `companion-hooks.test.ts` | The companion queue, delivering messages with a tool result, and merging and writing the hooks settings file. |
| `create-pr.test.ts` | The fixes table, which branch a fix belongs on, and `create_pr_for_thread`. |
| `element-context.test.ts` | Thread hydration, the edit prompt, formatting context for an agent, and the element-context tools. |
| `events-sessions.test.ts` | Payload truncation, the event store, extracting file paths from tool payloads and folding sessions. |
| `github-client.test.ts` | Placeholder tokens, token resolution, commits, pull requests and keeping the token out of output. |
| `handlers.test.ts` | The tool handlers in-process against a canned Loupe API: `list_comments` filters, `get_comment` branches, `update_status` and API errors. |
| `handoff.test.ts` | `mark_thread_addressed`, `add_thread_message`, `get_thread_conversation` and the refusal message. |
| `mapper.test.ts` | The source mapper: walking the workspace, class filtering, naming heuristics, scoring and mapping an element. |
| `mcp.test.ts` | The real MCP server over stdio, driven by an MCP client against a canned API, plus the companion hand-off. |
| `presence.test.ts` | The presence registry, presence over the bridge and relaying thread updates from the API. |
| `typescript-runtime.test.ts` | That the MCP sources use no TypeScript syntax Node's type stripper cannot run, such as constructor parameter properties. |

### dashboard, extension and hub

| File | What it checks |
|---|---|
| `packages/dashboard/test/app.test.ts` | The Kanban board (one column per stage) under happy-dom: the five stages, moving cards, search, triage chips and filters, sorting, saved views, density, the agent brief, keyboard expansion, the loading state and the 401 error. |
| `packages/extension/test/manifest.test.ts` | The Manifest V3 (MV3, the current Chrome extension format) manifest: least-privilege permissions, files that exist, a tool for every context menu except the toggle, and no host permissions or web-accessible resources. |
| `packages/hub/test/api.test.ts` | The Hub HTTP API on a real server: `POST /v1/issues`, sign-in, routing between projects, `POST /v1/issues/{id}/updates`, `GET /v1/projects`, and organization and project pages. |
| `packages/hub/test/crypto.test.ts` | Ids and secrets, request signing and verification, and the session cookie. |
| `packages/hub/test/google.test.ts` | Google ID token checks: audience, verified email and refused tokens. |
| `packages/hub/test/webhook.test.ts` | Signed delivery with retries against a local receiver, and the private-address guard. |

### Laravel test files

`packages/laravel/tests/Feature/`:

| File | What it checks |
|---|---|
| `ActivityTest.php` | Activity rows for comment writes, the `v1/activity` feed (order, project scope, `since`, cap), the off switch, the `use` ability and pruning. |
| `AssetUrlTest.php` | Asset URLs come from the app origin or `LOUPE_ASSET_URL`, never an asset CDN, and carry a version stamp. |
| `BlobTest.php` | Storing and serving screenshots and recordings (`webm`, `mov`), invalid input, 404s and legacy ids without an extension. |
| `CommentApiTest.php` | The comment API: authentication, authorization, listing, URL filters, create, upsert, patch, statuses, triage fields, deletion rules and identity spoofing. |
| `DashboardTest.php` | The dashboard renders for an admin, is forbidden to others and needs a signed-in user. |
| `FacadeTest.php` | The `Loupe` facade resolves the manager and proxies authorization. |
| `HubTest.php` | Forwarding new comments to Loupe Hub: the three config keys, signing, queue and after-response dispatch, users without email and logged failures. |
| `InboundTicketTest.php` | The Hub receiver: signed deliveries, duplicates, listener rollback, defaults, validation, every bad signature shape, size limit and no session or CSRF. |
| `InstallCommandTest.php` | `loupe:install`: provider registration and the missing `[login]` route warning. |
| `McpToolsTest.php` | The four MCP tools: input schemas, `list_comments` filters and targets, `get_comment` packages and images, `propose_change` and `update_status`. |
| `MissingColumnTest.php` | Creates and patches still succeed when a migration has not run yet. |
| `MultiGuardTest.php` | Users on a non-default guard, spoofing across guards, unknown guard names and guests. |
| `NotificationApiTest.php` | The inbox belongs to the signed-in user, marking read, and no inbox for Hub reporters or a missing table. |
| `OrganizationTest.php` | `v1/org` from Hub (signed, cached), without Hub, on Hub errors and the `use` ability. |
| `PeopleTest.php` | The mention list: allowed users and participants, an empty allow list, a custom resolver and guards without an Eloquent provider. |
| `RelayTest.php` | Two-way sync after a Hub delivery: model events, status and replies relayed back, quiet changes and failure handling. |
| `RoutesDisabledTest.php` | No routes are registered when `loupe.enabled` is false. |
| `ServiceProviderTest.php` | Middleware aliases, the manager singleton, the baseline gates that deny by default, and route registration. |
| `ThreadTest.php` | Replies, deleted replies, mention and reporter notifications, validation and reactions. |
| `WidgetTest.php` | `@loupeWidget`: nothing for disabled, guest or unauthorized users, the SDK bootstrap, the time zone and the package version. |

`packages/laravel/tests/Unit/`:

| File | What it checks |
|---|---|
| `AuthenticateMiddlewareTest.php` | `loupe.auth`: signed-in users pass, browser guests are redirected, 403 when the app has no `login` route, 401 for JSON. |
| `AuthorizeMiddlewareTest.php` | `loupe.authorize`: allows an authorized user (default ability `use`) and returns 403 otherwise. |
| `CommentModelTest.php` | The configured table and every field of `toLoupeArray()`. |
| `LoupeManagerTest.php` | The authorization order, `allow_in_local`, and `describeUser()` with each resolver form. |
| `MentionsTest.php` | Mention parsing matches the shared package, and resolution by name, first name, email and id. |
| `StagesTest.php` | Stage order, labels, legacy mapping and normalization. |
| `TriageTest.php` | Priority and change type order, labels and defaults. |
| `UrlTest.php` | URL normalization, matching the shared `normalizeUrl`. |

Support files, not tests: `tests/TestCase.php` (the base class described in
[PHPUnit configuration reference](#phpunit-configuration-reference)) and
`tests/Fixtures/User.php` (an `Authenticatable` user model).

## Coverage

**JavaScript.** There is no coverage threshold. CI runs `npm test`, not
`npm run test:coverage`. To see the current figures, run:

```bash
npm run test:coverage
```

Open `coverage/index.html` for the per-file report. Measured on 2026-10-05 with Node 26.7.0.
CI uses Node 24, where the figures can differ slightly:

```text
Statements   : 79.33% ( 5152/6494 )
Branches     : 71.57% ( 2994/4183 )
Functions    : 75.27% ( 822/1092 )
Lines        : 83.26% ( 4452/5347 )
```

**Laravel.** Line coverage must be 100%, and CI enforces it on every PHP and Laravel
combination. Measured on 2026-10-05 with PHP 8.4.26 and PCOV:
`Line coverage: 100.00% (1332/1332)`.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| The test output shows `[loupe] Postgres via DATABASE_URL` or `[hub] Postgres via DATABASE_URL`. | `DATABASE_URL` is set in your shell. The server and Hub check it before `LOUPE_PG_DIR` and `HUB_PG_DIR`, so the tests ran against that database. | Stop the run. Run `unset DATABASE_URL` and then `npm test`, or run `env -u DATABASE_URL npm test`. |
| Vitest fails to import `@loupekit/shared`. | The shared package has no `dist` folder yet. | Run `npm run build:shared`, then run the tests again. |
| DOM tests fail with `localStorage` errors on Node 25 or later. | Vitest was started without the root `vitest.config.ts`, so `--no-experimental-webstorage` was not applied. | Run the tests from the repository root with `npm test` or `npx vitest run`. |
| A test times out after 20 seconds. | A suite that starts a server or subprocess is waiting on something. | Re-run that one package with `npx vitest run packages/<PACKAGE>` and read its output. |
| `composer test:coverage-100` prints `No code coverage driver available`. | No coverage driver is loaded, so PHPUnit cannot write the Clover file. `failOnWarning` turns the warning into a failure, and the checker never runs. | Install PCOV or Xdebug and check that `php -m` lists it. Use `composer test` if you do not need the gate. |
| `composer test:coverage-100` prints `XDEBUG_MODE=coverage (environment variable) or xdebug.mode=coverage (PHP configuration setting) has to be set`, then `No tests executed!`. | Xdebug is loaded, but its mode does not include coverage. `php -m` already lists Xdebug, so installing a driver does not help. | Run `XDEBUG_MODE=coverage composer test:coverage-100`, or add `coverage` to `xdebug.mode` in your `php.ini`. |
| `Coverage file not found: build/clover.xml` | You ran `php bin/check-coverage.php` on its own, before a coverage run wrote `build/clover.xml`. Through `composer test:coverage-100` the checker runs only after PHPUnit succeeds. | Run `composer test:coverage-100`, which writes the file first. |
| `Coverage <X>% is below the required 100.00%` | New code in `src/` has no test. | Add tests for the uncovered lines. `composer test:coverage` prints the per-file report. |
| A PHPUnit warning or risky test fails the run. | `failOnWarning` and `failOnRisky` are on. | Fix the warning, or add an assertion to the risky test. |
| The stranger test prints `composer create-project … failed`. | No network access, or the requested Laravel line cannot be installed (Laravel 11, see [What CI runs](#what-ci-runs)). | Check your connection. Set `STRANGER_LARAVEL` to `12` or `13`. |
| The stranger test prints `the app never came up`. | Something else is using port 8791. | Set `STRANGER_PORT` to a free port. |

## About the stranger test and the coverage gate

The unit suite runs inside Orchestra Testbench, whose test app always registers a `login`
route. A brand-new Laravel app has none. The stranger test exists for the gap between the two:
it installs the package into a fresh app and checks the first-run path, including that
`/loupe/dashboard` never returns a 5xx when the app has no `login` route.

**Why there is no Laravel 11 stranger job.** Composer 2.9 and later refuses packages with known
security advisories, and every Laravel 11 release from v11.31 to v11.57 is flagged. A brand-new
Laravel 11 app cannot be installed on any PHP version. The unit matrix in the `test` job still
covers the package on Laravel 11.

**Why the Laravel gate is 100% and the JavaScript side has none.** CI runs
`composer run test:coverage-100` in every cell of the Laravel matrix, so new code in `src/`
must arrive with tests. The JavaScript `CI` workflow runs `npm test` only, so the Vitest
coverage report is for reading, not a gate.

## Next steps

- [Contributing](../CONTRIBUTING.md): set up the repository and open a pull request.
- [Releasing](../RELEASING.md): the release checklist and the publish workflows.
- [Laravel package](LARAVEL.md): install and configure `loupekit/laravel`.
- [Architecture](ARCHITECTURE.md): how the packages fit together.
