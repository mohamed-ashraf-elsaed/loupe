# Contributing

Thanks for helping improve Loupe.

## Setup

```bash
npm install
npm run build     # shared → sdk → dashboard → extension
npm test          # Vitest
npm start         # http://localhost:8787 (API + dashboard + demo + SDK)
```

## Ground rules

- **TypeScript, `strict`.** Data types live in `@loupekit/shared`.
- **Node packages** (`server`, `mcp`) run TypeScript natively (`node file.ts`, `.ts`
  import extensions). **Browser packages** (`sdk`, `dashboard`, `extension`) are bundled by
  tsup (`.js` import extensions, output to `dist/`).
- **Change behavior behind the seams** — `StorageAdapter`, `server/db.ts`, `server/blobs.ts`,
  and the SDK `captureScreenshot` override — not their contracts.
- **Add tests.** New logic needs coverage (`npm run test:coverage`). See
  [docs/TESTING.md](docs/TESTING.md).
- **Match the surrounding style.** No new dependencies without a reason.

## Versioning & releases

We use Semantic Versioning and GitHub Releases. **Any change that ships in a release must
update the docs and `CHANGELOG.md`** — see [RELEASING.md](RELEASING.md). Add your entry
under `## [Unreleased]` in `CHANGELOG.md` as part of your PR.

## Architecture

Start with [`CLAUDE.md`](CLAUDE.md) (local) or the
[Wiki](https://github.com/mohamed-ashraf-elsaed/loupe/wiki) for the full map, and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for diagrams.
