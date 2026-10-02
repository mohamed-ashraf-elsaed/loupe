# AGENTS.md — Loupe project memory

> This file is auto-loaded at the start of every Claude Code session. Read it first.
> It is the map of the whole project: what exists, why, where it lives, and how the
> non-obvious logic works. With it, you never start from zero. Keep it up to date when
> you change architecture, contracts, or conventions.

## What Loupe is

An embeddable visual-feedback platform. A product manager inspects any element on a
running product, pins a comment to it, and captures a screenshot. Comments persist and
**re-anchor across redeploys**, and are handed to **Claude Code via MCP** as an
actionable, fully-contextualized backlog. There is also a browser extension that does
the same on any site without an SDK install.

**The loop:** SDK (in the product) → backend API → Postgres + object storage →
dashboard (human triage) **and** MCP server (Claude reads it) → status flows back.

## How to work in this repo (read this)

- It's an **npm workspaces monorepo**. Root scripts orchestrate the packages.
- **Node runs TypeScript natively** (Node 24, type-stripping) for `server/` and `mcp/` in
  dev — run `node index.ts` directly; imports use `.ts` extensions. Caveat: `mcp` is the one
  Node package that is ALSO bundled (tsup → `dist/index.js`) for **publishing**, because Node
  refuses to strip types for files under `node_modules` — the npm tarball must ship compiled JS.
- **Browser code is bundled by tsup** (`sdk/`, `dashboard/`, `extension/`) — those
  import with `.js` extensions (ESM convention) and are bundled to `dist/`.
- **`@loupekit/shared` is a built package** (tsc → `dist`). Build it before others.
- The **`StorageAdapter` seam** (SDK) and the **`db.ts` / `blobs.ts` seams** (server) are
  the extension points. Change implementations behind them, not their contracts.
- Before claiming something works, **run it** — tests (`npm test`) and, for runtime
  behavior, drive the real flow (the server + a browser).

## Layout

```
packages/
  shared/       @loupekit/shared — canonical types + normalizeUrl(); built to dist
  sdk/          @loupekit/sdk — embeddable browser widget (the thing a dev installs)
    src/            index, app, fingerprint, capture, store, http-adapter, styles, types
    demo/           "Acme Analytics" fake product to try it on
  server/       @loupekit/server — API + Postgres + object storage + auth + static hosting
                    index, db, store, auth, blobs, seed  (run with `node <file>.ts`)
  dashboard/    @loupekit/dashboard — Kanban triage board (app.ts bundled by tsup)
  mcp/          @loupekit/mcp — MCP server exposing comments to Claude Code
  extension/    @loupekit/extension — MV3 browser extension (reuses the SDK core)
  hub/          @loupekit/hub (private) — Loupe Hub: orgs/members/projects dashboard (Google
                    sign-in) + POST /v1/issues (project HMAC, org membership) → signed webhook.
                    index, db, store, crypto, webhook, google, views, seed; deploy/ = GCP VM scripts
  laravel/      loupekit/laravel (Composer, PHP 8.4+/Laravel 11–13) — Laravel wrapper.
                    VENDORS the built SDK + dashboard bundles into resources/dist via
                    bin/sync-assets.sh; own API + gating + dashboard + MCP. 100% coverage.
docs/           architecture wiki (Mermaid), landing page, and the guide site (docs/guide)
```

## Run it

```bash
npm install
npm run build            # shared → sdk → dashboard → extension
npm run seed             # creates demo project; prints admin key + demo HMAC
npm start                # http://localhost:8787 serves API + /dashboard + /demo + /sdk
npm test                 # vitest
npm run test:coverage    # vitest + v8 coverage report
```

- Demo product: `http://localhost:8787/demo/`
- Triage board: `http://localhost:8787/dashboard/?key=<admin key>`
- Demo project key `pk_demo_acme`, seeded secret `sk_demo_acme_0f3b9c`,
  precomputed demo HMAC for user `u_92`: `decb2c23961bbcea494b1034aad995b8f30c9a2e517598667b791b73e8752846`.

## Architecture, module by module

### `@loupekit/shared` (`packages/shared/src/index.ts`)
Canonical data types (`Comment`, `Anchor`, `ElementContext`, `Proposal`, `LoupeUser`,
`CommentStatus`) and `normalizeUrl()`. `Comment` carries optional `recording` (webm URL) and
`proposal` (Claude's modified `{ html, css?, notes?, author?, createdAt }`). Everyone imports
types from here; Node packages import compiled JS.
`normalizeUrl` strips `utm_*`, click ids (`gclid`/`fbclid`/…), and Loupe dev params
(`api`/`key`), sorts the rest, and drops trailing slashes — so a comment on
`/checkout?utm_source=x` and one on `/checkout` don't fragment.

### `@loupekit/sdk` — the embeddable widget
- `index.ts` — public API `init(config)` / `destroy()`. Idempotent. Chooses the storage
  adapter: `apiBase` set → `HttpAdapter`, else `LocalStorageAdapter` (offline).
- `app.ts` — `LoupeApp`: builds a **Shadow DOM** host (`#loupe-root`). The dock has a
  **sidebar** of built-in pages (`Home`/`Comments`/`Activity`) plus any the host registers via
  `init({ tabs })` — `tabList` is built in `buildDock`, each tab gets a `LoupeTabContext`, and
  `viewEls` maps id → container with display driven by an `.on` class (so host ids need no CSS).
  The **Comments** page (tools + comment list + an "Integrates with" icon row; the list shows **no
  author name**) and the **Activity** page (`buildActivityPanel` — status dot, collapsible summary,
  micro-stats, tool chips, live feed; fed by `addActivity` / the exported `trackActivity`).
  `connectTab()` in `connect.ts` is the Connect Claude page as an opt-in reusable tab, and the worked
  example of the API. Tools: **Inspect** (hover + click-select), **Note** (`kind:"free"`),
  **Region** (drag box → screenshot), and **Record** (`mode:"record"` — same drag box →
  `finishRecording()` → screen video). The active tab persists in `localStorage:loupe:dock`.
  The header carries a **position menu** (`.pos-grid`, four layouts), a theme toggle, a **settings
  dropdown** (`.acc-dot` accents + `[data-set]` switches for hover hints / markers / page paths +
  *Restart tour*), and a **minimize** button (`.minbar` — a one-line context strip). Accents are
  written as inline `--accent`/`--accent-soft` on the host so they beat both token blocks.
  A **guided tour** (`TOUR`, `.tour-spot` cut-out via `box-shadow`, click-through overlay) runs once
  on first open and is replayable; `HINTS` renders one card per view into a `.hint-slot`.
  A `.recbar` pill (Stop button) shows while recording. Repositions pins on scroll/resize (rAF)
  and DOM mutations (MutationObserver, debounced) + an 800ms safety interval.
  A card's header row carries a **lifecycle chip** (`lifecycle()` from shared: Sent → In PR →
  Review preview → Reviewed) plus a monospace PR chip and a checks meter; a thread in `in_review`
  leads its detail with a **review banner** (Approve / Add comment, and an "origin" compare of the
  request against `proposal`), and `.reviewbar` above the list counts what is waiting on a human.
- `fingerprint.ts` — **the crown jewel.** `captureAnchor(el)` records a multi-signal
  fingerprint (stable id/testid, CSS path rooted at a stable ancestor, XPath, text,
  attrs, nth-of-type, bounding rect + viewport). `resolveAnchor(anchor)` re-locates it on
  the current page in tiers: (1) unique testid/id → 0.98; (1.5) a cssPath rooted at a
  stable id whose single match has the right tag → 0.9 (handles content that changed on
  redeploy); (2) weighted similarity scan (text .34, attrs .22, testid .22, cssPath .2,
  tag .12, position .1) accepted at ≥ 0.5. Below threshold → the pin is "detached" rather
  than pinned to the wrong element.
- `capture.ts` — `captureElementContext` (outerHTML + a curated slice of computed styles),
  `captureScreenshot`/`captureRegionScreenshot` (modern-screenshot), and
  `captureRegionRecording` (getDisplayMedia + per-frame canvas crop → webm data URL,
  duration-capped, with a `register(stop)` hook). `[data-loupe-redact]` and our own UI are
  excluded via the filter. The extension overrides screenshot capture (see below); the
  `captureRecording` config seam is the override point for recordings.
- `store.ts` — `LocalStorageAdapter` (offline mode).
- `http-adapter.ts` — `HttpAdapter`: talks to the backend with identity headers; on save
  it **uploads the screenshot to `/v1/blobs` first** and stores only the returned URL.
- `styles.ts` — the Shadow-DOM stylesheet. `types.ts` — re-exports shared + SDK-only
  `LoupeConfig` (incl. the `captureScreenshot` override hook), `StorageAdapter`, `ResolveResult`.

### `@loupekit/server` — API (Node native TS, `node:http`)
- `db.ts` — one `query()` seam. `DATABASE_URL` set → node-`pg`; else embedded **PGlite**
  on disk (`LOUPE_PG_DIR`, or `memory://` for tests). `migrate()` creates the schema.
- `store.ts` — SQL over projects + comments. Normalizes the URL on write and on the list
  filter. `rowToComment` maps DB rows to the shared `Comment` shape.
- `auth.ts` — `signUser(userId, secret)` = HMAC-SHA256. `authenticate(projectKey, req)`
  resolves to admin (`X-Loupe-Admin` == secret) or user (`X-Loupe-User` + `X-Loupe-Hmac`).
- `blobs.ts` — object-storage seam (local disk now; swap for S3). `putBlob(id, buf, ext)`
  returns a URL carrying the extension; serves `image/png` and `video/webm` by extension
  (legacy ext-less ids resolve to `.png`). `extFromDataUrl`/`contentTypeForId` map MIME↔ext.
- `index.ts` — the HTTP handler + static hosting. Exports `handler` and `start(port)` and
  only listens when run as the entry (so tests can mount `handler` on an ephemeral port).
  Routes: `/v1/health`, `/v1/blobs` (GET public by id, POST authed upload),
  `/v1/comments` (GET list authed, POST create authed), `/v1/comments/:id`
  (GET/PATCH/DELETE, auth resolved from the comment's own project). Everything else GET →
  static (`/dashboard`, `/demo`, `/sdk`).
- `seed.ts` — creates the demo project and prints its admin key + demo HMAC.

### `@loupekit/dashboard`
`app.ts` (vanilla TS, tsup-bundled). Reads the API with `X-Loupe-Admin` (from `?key=`,
persisted to localStorage). A **left sidebar** switches two pages: **Comments** (the 5-stage
Kanban — queue / todo / in_progress / in_review / resolved — with page filter, screenshot/`<video>` thumbnails,
move-status PATCH, two-step delete, Copy-for-Claude, live refresh 4s, and **Claude's proposed
fix** rendered as copyable HTML/CSS + a live before/after sandboxed-iframe preview) and
**Connect Claude** (MCP setup steps + config). The Laravel dashboard **inlines this shell**
in `dashboard.blade.php` (mirror shell/CSS changes there too), driven by the vendored `app.js`.

### `@loupekit/mcp`
`index.ts` — MCP stdio server (official SDK). Authenticates to the API as admin
(`LOUPE_ADMIN_KEY`). Tools: `list_comments(status?, url?)`, `get_comment(id)` (returns the
Claude-ready package: request + element HTML + computed styles + the **screenshot as an image
content block** + any recording URL + an existing proposal), `propose_change(id, html, css?,
notes?)` (writes Claude's modified UI back onto the comment via PATCH), `update_status(id,
status)`. The Laravel MCP server (`packages/laravel/src/Mcp`) mirrors these tools.
`test-client.ts` / `verify-loop.ts` are integration drivers.

### `@loupekit/extension` (MV3)
Reuses the exact SDK core. `content.src.ts` (bundled to `content.js`, IIFE) reads config
from `chrome.storage`, calls `init` with a `captureScreenshot` override that asks the
background worker for `chrome.tabs.captureVisibleTab` (real pixels), then crops to the
element and paints over `[data-loupe-redact]` regions. `background.js` = the capture
worker. `popup.html/js` = config + "Start on this tab" (injects `content.js`).

### `@loupekit/hub` (optional hosted service)
Same style as `server/` (native TS, `db.ts` seam, PGlite in tests via `HUB_PG_DIR=memory://`).
`crypto.ts` = `sign(ts, body, secret)` (hex HMAC of `ts.body`), `verifySignature` (±300 s,
constant-time), session cookie encode/decode. `webhook.ts` `deliver()` = 10 s timeout, 3
attempts (1 s, 4 s), `transport` seam for tests. `google.ts` `auth.verify` seam (google-auth-library).
Laravel side: `Support/Hub.php` + `Jobs/SendToHub.php`, config `loupe.hub.*`; only NEW comments
are forwarded. Deployed on GCP project `loupe-hub` (gcloud config `loupe-hub`, account
m.ashraf.saed@gmail.com), VM `loupe-hub` us-central1-a, redeploy with
`GCP_PROJECT=loupe-hub bash packages/hub/deploy/deploy.sh`.

## Data model (Postgres)

```
projects(project_key PK, name, secret, allowed_origins text[], created_at)
comments(id PK, project_key FK→projects, url, status, body,
         kind ('element'|'region'|'free'), author jsonb, anchor jsonb, context jsonb,
         "offset" jsonb, region jsonb, viewport jsonb, screenshot_url,
         recording_url, proposal jsonb, created_at)
```

## Auth model

Each project has a `secret`. **Writes** require `X-Loupe-User` + `X-Loupe-Hmac`
(= HMAC-SHA256(userId, secret), computed by the host app's server and injected into the
page). The **dashboard and MCP** authenticate as admin with `X-Loupe-Admin` = secret.
Screenshot blobs are public by unguessable id (prototype; prod = signed URLs).

## Conventions

- TypeScript everywhere, `strict`. Data types live in `@loupekit/shared`.
- Node packages: native TS, `.ts` import extensions, `node <file>.ts`.
- Browser packages: tsup, `.js` import extensions, output to `dist/`.
- Keep changes behind the seams (`StorageAdapter`, `db.ts`, `blobs.ts`,
  `captureScreenshot`). Match surrounding style; no new deps without reason.
- Errors: API returns `{ error }` with a real status; the SDK degrades gracefully
  (screenshot upload failure falls back to inlining; unresolved anchors detach).
- **The `◎` glyph is the brand logo** (SDK control header + launcher, `app.ts`/`styles.ts`).
  Never restyle or replace it — do not swap it for a gradient dot or any other mark.
- **`.claude/` and every `AGENTS.md` are local-only and MUST never be tracked in git**
  (gitignored). They hold this project's Claude Code setup, not shippable code.

## 🔁 New-feature workflow (automate this every time)

Any change to product behavior runs the **same pipeline**. `/ship-feature` drives it end to
end; `.claude/scripts/ship-checks.sh` is the readiness gate. Don't stop at "tests pass."

1. **Implement** behind the seams; match surrounding style. **Never change the `◎` logo.**
2. **Typecheck** each changed package: `npx tsc -p packages/<pkg>/tsconfig.json --noEmit`.
3. **Test**: `npm test`; add/adjust tests. Laravel stays at **100%** coverage (phpunit).
4. **Verify for real** — drive the flow in a browser (server + `/demo`, or the extension),
   not just tests. Check both themes + mobile when the control UI changed.
5. **Propagate**: `npm run build`, then — if `sdk`/`shared`/`dashboard` changed —
   `bash packages/laravel/bin/sync-assets.sh` to re-vendor the Laravel bundle
   (`packages/laravel/resources/dist/sdk/loupe.js`); the extension `content.js` rebuilds too.
   The SDK is the single source of the widget — one build feeds every consumer.
6. **Docs** — update EVERY affected doc (the release rule below): `CHANGELOG.md`,
   `docs/guide/index.html` (the public guide), `docs/index.html`, `docs/llms.txt`, the
   READMEs, `docs/TESTING.md`, `docs/privacy.html` + `docs/store/*` if UI/permissions changed,
   and the **Wiki** (`git@github.com:mohamed-ashraf-elsaed/loupe.wiki.git`).
7. **Version** (SemVer — feature = MINOR, fix = PATCH, breaking = MAJOR):
   `node scripts/set-version.mjs --version X.Y.Z`, then match the root + private
   `package.json`, `packages/extension/manifest.json`, and the `McpServer({version})` string
   in `packages/mcp/index.ts` — all in lockstep.
8. **Ship**: `bash .claude/scripts/ship-checks.sh` must pass → **confirm with the user
   before publishing** → `git commit` → `git tag -a vX.Y.Z` → `git push origin main --tags`
   (CI publishes npm + cuts the GitHub Release; Packagist syncs `loupekit/laravel` from the
   tag) → push the Wiki.

Hooks enforce the mechanical parts (see `.claude/`): a **PostToolUse** reminder fires when a
bundled source is edited, and a **PreToolUse** gate blocks any release tag/push until
`ship-checks.sh` passes — so a broken or inconsistent release can't be published by accident.

## 🔒 Release rule (must follow)

Loupe uses **Semantic Versioning** and ships via **GitHub Releases** (git tags `vX.Y.Z`).
**Whenever you bump a version or cut a release, you MUST update the documentation in the
same change** — no exceptions:

1. `CHANGELOG.md` — move `Unreleased` items under the new `vX.Y.Z` + date.
2. The landing page version (`docs/index.html` footer) and any changed copy.
3. The Wiki `Changelog` page (and any affected feature/usage pages).
4. `version` in each published `package.json`.

Then tag (`git tag -a vX.Y.Z && git push --tags`). CI (`.github/workflows/release.yml`)
**fails the release if `CHANGELOG.md` has no entry for the tag**. Full process:
`RELEASING.md`. Publishable to npm: `@loupekit/shared`, `@loupekit/sdk`, `@loupekit/mcp`.

## Prototype → production notes

- PGlite → hosted Postgres via `DATABASE_URL` (already wired).
- Enforce per-project secrets from a real projects table (already enforced); add a
  project/team management UI (secrets are seeded by hand today).
- Blobs: local disk → S3/R2 with **signed URLs** (currently public-by-id).
- Add DB migration tooling (schema is `CREATE TABLE IF NOT EXISTS` today).
- Publish: SDK + MCP to npm, extension to the Chrome Web Store.

## Gotchas

- Node 25+ has a global `localStorage` that shadows happy-dom's; `vitest.config.ts` passes
  `--no-experimental-webstorage` to workers — keep it, or the DOM suites break.
- `db()` is a per-process singleton; tests use `memory://` and a fresh module per file.
- Comments are keyed by **normalized** URL — check `normalizeUrl` before debugging
  "missing" comments across query-string variants.
- The extension's `content.js` is a **build artifact** (gitignored); run
  `npm run build:extension` before loading unpacked.
- `.claude/` and this file are gitignored (local-only) by project preference.

## See also

- `docs/ARCHITECTURE.md` — deep dive with Mermaid diagrams.
- `docs/TESTING.md` — test strategy + how coverage is measured.
- `README.md` — user-facing quick start.
