# Changelog

All notable changes to Loupe are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Releases are
published via [GitHub Releases](https://github.com/mohamed-ashraf-elsaed/loupe/releases);
see [RELEASING.md](RELEASING.md) for the process.

## [Unreleased]

_Nothing yet._

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

[Unreleased]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/mohamed-ashraf-elsaed/loupe/releases/tag/v0.1.0
