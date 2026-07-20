# Changelog

All notable changes to Loupe are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Releases are
published via [GitHub Releases](https://github.com/mohamed-ashraf-elsaed/loupe/releases);
see [RELEASING.md](RELEASING.md) for the process.

## [Unreleased]

_Nothing yet._

## [0.7.0] — 2026-07-20

### Added

- **Claude modification loop (round-trip).** The MCP `get_comment` tool now returns the
  **actual screenshot as an image** (not just a URL) alongside the element HTML and computed
  styles, and a new **`propose_change(id, html, css?, notes?)`** tool lets Claude write its
  **modified HTML/CSS back onto the comment**. The dashboard renders that proposal for the dev
  team as copyable code plus a **live before/after preview** (the "after" rendered in a
  sandboxed iframe). Mirrored in the Laravel MCP server (`propose_change` tool + image block).
- **Screen recording.** A new **Record** tool captures a screen video of a drag-selected
  region (same selection UX as Region) via `getDisplayMedia` + per-frame canvas crop, saved as
  `.webm` (duration-capped, with a Stop button). Recordings play back inline in the widget and
  the dashboard. Overridable via the new `captureRecording` config seam.
- **Two-page sidebar on both surfaces.** The SDK widget dock and the dashboard now each have a
  **Comments** page and a **Connect Claude** page (numbered steps + copyable MCP config), plus
  an **"Integrates with"** row (GitHub / Slack / Telegram / Linear — visual for now). The
  widget's comment list no longer shows the author's name/email.

### Changed

- **Data model (additive).** `Comment` gains optional `recording` (webm URL) and `proposal`
  (`{ html, css?, notes?, author?, createdAt }`) fields; new nullable DB columns
  (`recording_url`, `proposal`) on both the Node and Laravel schemas. Blob storage now carries
  a file extension / content type so it serves `video/webm` as well as `image/png` (legacy
  extensionless ids still resolve to PNG). The comment `PATCH` accepts `proposal`. All changes
  are back-compat — upgrading is drop-in.

## [0.6.0] — 2026-07-17

### Added

- **Dockable, DevTools-style control.** The widget is now a single dockable panel —
  header (`◎ Loupe` + dock controls) → tools (Inspect / Note / Region) → comment list —
  that you dock to the **left**, **right**, or **bottom** edge, or **float** as a movable,
  resizable window. Docked edges **push the host page over** (reflow the `<html>` margin) so
  the panel never hides content; float overlays. The chosen position, open/closed state, and
  float geometry all persist in `localStorage`.
- **Light / dark theme toggle** in the panel header (dark by default); persists.
- **Mobile bottom sheet.** On viewports ≤ 640px the panel becomes a full-width bottom sheet
  (docking is a desktop affordance), and shrinks to a compact header-plus-tools bar while a
  tool is active so most of the page stays visible and tappable.
- **`label` config** — sets the brand name shown in the control header (defaults to `"Loupe"`).

### Changed

- The floating pill toolbar and the separate comment panel are unified into the single
  dockable panel; when closed it collapses to a small `◎` launcher button. Comments render
  inline in the panel. **UI-only** — no DB migration and no change to the SDK `init` config
  (additive `label` only), HTTP API, or MCP tools, so upgrading is drop-in.

## [0.5.2] — 2026-07-15

### Fixed

- **`loupe-mcp` binary now actually starts.** After 0.5.1 shipped compiled JS, launching the
  installed `loupe-mcp` binary still did nothing — it started and exited without serving.
  The entrypoint guard compared `import.meta.url` to `argv[1]`, but the npm `bin` is a
  **symlink** into `node_modules/.bin`: Node resolves the symlink for `import.meta.url` while
  `argv[1]` stays the symlink path, so the two never matched and the stdio transport never
  connected. The check now resolves symlinks (`realpathSync`) before comparing, so
  `loupe-mcp` (and MCP-directory introspection like Glama) works. Verified by running the
  published binary through its `node_modules/.bin` symlink.

## [0.5.1] — 2026-07-15

### Fixed

- **`@loupekit/mcp` now installs and runs from npm.** The package shipped its raw
  TypeScript entry (`index.ts`) and relied on Node stripping types at runtime — but
  Node refuses to strip types for files under `node_modules`
  (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`), so `npm i -g @loupekit/mcp` followed
  by `loupe-mcp` failed for every consumer (and blocked containerized introspection on
  MCP directories like Glama). The package now compiles to `dist/index.js` (tsup, bundled
  in the root build with a `prepublishOnly` safety net) and points `bin`/`main` there.
  Running the server from a source checkout (`node packages/mcp/index.ts`) is unchanged.
  Its type-only dependency on `@loupekit/shared` moved to `devDependencies`, so a fresh
  install no longer pulls an unrelated `shared` version.

## [0.5.0] — 2026-07-14

### Added

- **Free comments — drop a note anywhere, no element or screenshot.** A new **"Note"**
  toolbar mode lets you click any spot on the page and leave a page-level comment that
  isn't tied to a DOM element and carries no screenshot — the lightest way to say "this
  whole area feels off." New `kind: "free"` in `@loupekit/shared`; the drop point is
  stored in the existing `offset` field as a fraction of the document, so **no database
  migration is needed** on the Node server or in `loupekit/laravel`. Free notes render as
  page-level items in the SDK panel, the dashboard, and both MCP servers (Node + Laravel),
  which omit the element-HTML/styles sections for them. _Ships to the SDK, the browser
  extension, and the Laravel widget together (shared `@loupekit/sdk` core)._
- **Draggable, edge-aware toolbar.** Grab the `◎ Loupe` logo and drop the bar anywhere on
  screen; its position persists across reloads (`localStorage`). When expanded it grows
  **inward** so it's always fully visible — docked to a left/right edge it opens as a
  vertical column, along the top/bottom or in a corner it opens as a horizontal row.
  Clicking the logo still collapses/expands; a drag no longer triggers a toggle.

### Changed

- **Version alignment.** All publishable packages move to `0.5.0`. The previously stale
  `@loupekit/server` (`0.2.0`), the extension `manifest.json` (`0.2.0`), and the Node MCP
  server (`McpServer` `0.2.0`) are now `0.5.0` in lockstep with the rest.

## [0.4.3] — 2026-07-13

### Fixed
- **`loupekit/laravel`: multi-guard apps no longer 403 with "cannot post as another
  user".** Apps that use separate auth guards (e.g. `web` for users, `admin` for admins)
  could render the widget under one guard and authenticate the API under another, so the
  ids mismatched. Loupe now resolves identity through a configurable, ordered guard list
  (`LOUPE_GUARDS`, e.g. `web,admin`) and uses the **same** resolution everywhere — the
  widget author, the `loupe:use`/`loupe:admin` gates, the API middleware (new `loupe.auth`,
  which accepts a session on any configured guard), and the anti-spoof check. Fully
  backward compatible: unset = the app's default guard, identical to before.

## [0.4.2] — 2026-07-12

### Fixed
- **`loupekit/laravel`: widget/dashboard assets now load behind a CDN.** The package
  loaded its own JS via `asset('vendor/loupe/...')`, which respects the host's
  `ASSET_URL` — so apps that point `ASSET_URL` at a CDN (with only their Vite build
  uploaded there) got 404s and a silently missing widget. Loupe now resolves its own
  published assets from the **app URL** via `Url::asset()`, bypassing `ASSET_URL`. New
  `LOUPE_ASSET_URL` env / `config('loupe.asset_url')` to override the origin if you serve
  `public/vendor/loupe` elsewhere. Backward-compatible (same result on non-CDN hosts).

## [0.4.1] — 2026-07-12

### Fixed
- **Captures no longer hang the widget.** `await document.fonts.ready` (added in 0.3.4)
  could stall indefinitely on SPAs that keep loading fonts, making **Inspect** feel
  stuck ("loads too hard") and **Region shot** never open its composer. The font wait
  is now capped (~0.8s), the capture timeout lowered to 6s, and every capture is
  wrapped in a hard outer timeout so it can never block the UI.
- **Region shot opens instantly.** The composer now appears immediately and the
  screenshot is captured in the background (attached on submit), instead of blocking on
  the capture first. Fixes the region "Attach screenshot" checkbox being disabled
  because the shot hadn't been captured yet.

_SDK fix — applies to the SDK, the browser extension, and the `loupekit/laravel` widget._

## [0.4.0] — 2026-07-12

### Added
- **Device / viewport tracking (end to end).** Each comment now records the viewport
  it was captured on; the SDK panel, the dashboard, and the MCP payload show a
  **desktop / tablet / mobile** badge, and it's persisted in the database
  (`comments.viewport` on the server; a new `viewport` column via
  `add_viewport_to_loupe_comments_table` on Laravel). New `deviceType(width)` helper
  in `@loupekit/shared`.
- **Per-page comments on SPA navigation.** The widget reloads comments when the URL
  changes without a full page load (patched `history.pushState`/`replaceState` +
  `popstate`), so each page shows only its own comments.

### Changed
- **Mobile toolbar.** On small screens the bar is compact, **icon-only, and pinned to
  the left**; every item now uses one consistent icon+label layout (fixes the
  misaligned icons/text). Collapsing the bar (click the ◎ logo) now also hides the pins.
- **Region-shot capture** renders the smallest element that covers the selection
  instead of the whole page — faster, and it embeds web fonts reliably (the full-page
  render was timing out and falling back to system fonts, distorting the shot).

_All changes above are in `@loupekit/sdk`/`@loupekit/shared`, so they apply to the SDK,
the browser extension, and the `loupekit/laravel` widget; released together at 0.4.0._

## [0.3.4] — 2026-07-12

### Fixed
- **Screenshots fell back to system fonts (wrong layout).** The DOM-based capture
  rasterized before the page's web fonts were embedded, so headings/buttons rendered
  in a fallback font and reflowed (e.g. button text wrapping). Capture now awaits
  `document.fonts.ready` and allows a generous 30s timeout for cross-origin font/asset
  embedding, so the screenshot matches the page. Applies to `@loupekit/sdk` (and thus
  the browser extension and the `loupekit/laravel` widget).
  _Note: fonts served without CORS headers still can't be embedded by any DOM-based
  capture — the pixel-perfect browser extension is the fallback for those._

## [0.3.3] — 2026-07-12

### Added
- **Collapsible toolbar (all SDK surfaces).** Clicking the "◎ Loupe" logo now
  collapses the toolbar to just the logo and expands it again — so the bar can be
  tucked away while browsing. This lives in `@loupekit/sdk`, so it applies
  everywhere the SDK renders: the standalone SDK, the browser extension, and the
  `loupekit/laravel` widget.

### Fixed
- **`loupekit/laravel` — "You are not authorized to use Loupe" on a fresh install.**
  Loupe is now frictionless for any authenticated user in the `local` environment
  (governed by the new `config('loupe.allow_in_local')`, default `true`); the
  `loupe:use` / `loupe:admin` gates and `authorize` closures govern other
  environments. Baseline gates now deny by default (secure in production). An
  explicit `authorize` closure still wins in every environment.

### Changed
- All publishable packages released together at 0.3.3 (`@loupekit/shared`,
  `@loupekit/sdk`, `@loupekit/mcp`, and `loupekit/laravel`).

## [0.3.2] — 2026-07-12

### Fixed
- **`loupekit/laravel` migration failed on MySQL** — the `loupe_comments.url` column
  was a `TEXT`, which MySQL cannot include in the `(project_key, url)` index without a
  key length (`SQLSTATE[42000] 1170: BLOB/TEXT column 'url' used in key specification
  without a key length`). `url` is now `VARCHAR(500)` and `project_key` `VARCHAR(191)`
  so the composite index fits MySQL's key-length limit. Works on MySQL, PostgreSQL and
  SQLite. (Normalized URLs are short, so 500 chars is ample.)

## [0.3.1] — 2026-07-12

### Changed
- **SEO / GEO — author & entity metadata.** Made the project and its author,
  **Mohamed Ashraf Elsaed**, discoverable by search engines and AI answer engines
  (ChatGPT, Claude, Perplexity, Gemini, Copilot): a schema.org `@graph`
  (`Person` + `Organization` + `WebSite` + `SoftwareApplication`) with `sameAs`
  links to LinkedIn/GitHub and `mailto:`, `rel="me"`/`rel="author"` links, a visible
  author byline, an explicit AI-crawler allow-list in `robots.txt`, an **Author**
  section in `llms.txt`, `author` fields across the npm packages, and updated
  `composer.json` author (email `m.ashraf.saed@gmail.com`, LinkedIn homepage).

### Fixed
- **Release/CI:** synced `package-lock.json` with the bumped versions so `npm ci`
  (and therefore the npm publish + CI) no longer fails on release tags.

## [0.3.0] — 2026-07-12

### Added
- **Loupe for Laravel (`loupekit/laravel`).** A Composer package that installs the whole
  Loupe loop into any Laravel app: the `@loupeWidget` Blade directive embeds the SDK,
  comments persist to the host's own database (`loupe_comments` Eloquent model), access is
  gated per-user via `loupe:use` / `loupe:admin` Gate abilities **and** config closures,
  the Kanban dashboard is served on a host route (`/loupe/dashboard`) behind the host's
  auth, and a first-party **MCP server** (`php artisan mcp:start loupe`, on
  `laravel/mcp`) hands the backlog to Claude Code. Screenshots use the Laravel filesystem.
  Supports **PHP 8.4+** and **Laravel 11/12/13**, with a CI matrix and a **100%
  line-coverage** gate. See [docs/LARAVEL.md](docs/LARAVEL.md).

### Changed
- **SDK:** `LoupeConfig` gained two generic options — `headers` (extra request headers,
  e.g. a CSRF token) and `credentials` (fetch credentials mode) — so the widget can
  authenticate via a session cookie instead of the HMAC identity header. Fully
  back-compatible with the standalone server.
- **Dashboard:** now reads an injected `window.__LOUPE__` (api/project/csrf) when present
  and sends `X-CSRF-TOKEN`, so it can run behind a host's authenticated session (used by
  the Laravel package). Falls back to the existing `?api/?project/?key` query params.

## [0.2.1] — 2026-07-12

### Changed
- **Docs:** professional npm READMEs for `@loupekit/sdk`, `@loupekit/mcp`, and
  `@loupekit/shared` — hero banner, shields.io badges, product screenshots, feature tables,
  and the re-anchor before/after visuals. No code changes.

## [0.2.0] — 2026-07-12

### Added
- **Free-region screenshots ("Region shot")** — a new toolbar mode lets you drag a
  free-size box anywhere on the page, screenshot exactly that area, and pin a comment to
  it — no element required. The region is anchored to the element under its center and
  stored as fractions of that element's box, so the pin **tracks responsive reflow and a
  different viewport** (a region drawn on mobile lands correctly on desktop) as well as
  scrolling; it re-shows the outline when highlighted and detaches gracefully if the
  anchor is gone. Persists through the whole loop (SDK/extension → API → dashboard →
  MCP); the extension captures real pixels via `captureVisibleTab`, the SDK default via
  `modern-screenshot`. New optional `captureRegion` config hook mirrors `captureScreenshot`.

### Changed
- **Automated dual-registry publishing.** Every push to `main` now publishes a
  `X.Y.Z-next.<n>` prerelease to the `next` dist-tag, and tagging `vX.Y.Z` publishes a
  stable `latest` — both to **public npm** (`@loupekit/*`) and **GitHub Packages**
  (`@mohamed-ashraf-elsaed/*`). See `RELEASING.md`.
- **npm package pages.** Added full, professional READMEs and keywords to
  `@loupekit/shared`, `@loupekit/sdk`, and `@loupekit/mcp` (previously blank on npm).

### Fixed
- **SDK widget styling** — the theme custom properties (`--accent`, `--panel`, `--line`, …)
  were declared on `:root, .loupe`, neither of which resolves inside the Shadow DOM, so every
  `var(…)` fell back to nothing: composer/panel backgrounds went transparent and buttons lost
  their fills and borders (the "Comment" button was white-on-transparent → invisible; panel
  actions rendered as bare text). Declared them on `:host` so they inherit through the shadow
  tree. Affects the SDK widget and the browser extension (which reuses the SDK core).

## [0.1.0] — 2026-07-09

The first release — the full loop, end to end.

### Added
- **`@loupekit/sdk`** — embeddable Shadow-DOM widget: element inspector, comment composer,
  screenshot capture, and redeploy-surviving re-anchoring (multi-signal fingerprint).
- **`@loupekit/server`** — `node:http` API with Postgres (PGlite locally, `pg` in prod),
  object storage for screenshots, per-project HMAC authentication, and static hosting.
- **`@loupekit/dashboard`** — Kanban triage board (status columns, page filter, live refresh).
- **`@loupekit/mcp`** — MCP server exposing comments to Claude Code (`list_comments`,
  `get_comment`, `update_status`).
- **`@loupekit/extension`** — MV3 browser extension reusing the SDK core with pixel-perfect
  `captureVisibleTab` screenshots.
- **`@loupekit/shared`** — canonical types + `normalizeUrl`.
- Vitest test suite (~91% line coverage), Mermaid architecture docs, a GitHub Wiki, and an
  SEO/GEO-optimized landing page.

[Unreleased]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.5.2...HEAD
[0.5.2]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.4.3...v0.5.0
[0.4.3]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.4.2...v0.4.3
[0.4.2]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.3.4...v0.4.0
[0.3.4]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.3.3...v0.3.4
[0.3.3]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.2.1...v0.3.0
[0.1.0]: https://github.com/mohamed-ashraf-elsaed/loupe/releases/tag/v0.1.0
