# Loupe

> Pin feedback to the live UI. Hand it to Claude.

Loupe lets product managers inspect any element on a running product, pin a comment to
it, and capture a screenshot — then hand that feedback straight to Claude Code as an
actionable, fully-contextualized backlog. Comments persist and re-anchor across
redeploys.

This is a monorepo (npm workspaces). Every piece runs locally with **no external
services** — the database is embedded Postgres (PGlite), so `npm install && npm run
build && npm run seed && npm start` is the whole setup.

## Packages

```
packages/
  shared/      canonical types + normalizeUrl() (built to dist, consumed by all)
  sdk/         embeddable browser SDK — inspect, comment, capture, re-anchor
    demo/      a fake product ("Acme Analytics") to try it on
  server/      comment API — node:http, Postgres, object storage, HMAC auth, static hosting
  dashboard/   Kanban triage board (reads the API)
  mcp/         MCP server — exposes comments to Claude Code
  extension/   MV3 browser extension — inspect/comment on ANY site, pixel-perfect capture
```

## Run it

```bash
npm install
npm run build          # shared → sdk → dashboard → extension
npm run seed           # creates the demo project; prints its admin key + demo HMAC
npm start              # one process on http://localhost:8787 serves API + dashboard + demo + SDK
```

Then open:

- **Demo product** — http://localhost:8787/demo/ (leave feedback; persists to the API)
- **Triage board** — http://localhost:8787/dashboard/?key=<admin key from `npm run seed`>

Point **Claude Code** at the comments:

```json
{
  "mcpServers": {
    "loupe": {
      "command": "node",
      "args": ["/absolute/path/to/loupe/packages/mcp/index.ts"],
      "env": {
        "LOUPE_API": "http://localhost:8787",
        "LOUPE_PROJECT_KEY": "pk_demo_acme",
        "LOUPE_ADMIN_KEY": "<admin key from npm run seed>"
      }
    }
  }
}
```

Then: *"list the open Loupe comments and work through them."* Claude calls
`list_comments` → `get_comment` (request + element HTML + computed styles + screenshot
URL) → makes the change → `update_status`.

## Architecture notes

**Database** — `server/db.ts` is a one-function `query()` seam. With `DATABASE_URL` set
it uses node-postgres against real/hosted Postgres; otherwise embedded PGlite on disk.
Same SQL, same `$1` params.

**Auth** — every project has a `secret`. Writes require `X-Loupe-User` +
`X-Loupe-Hmac` = HMAC-SHA256(userId, secret) (the host app's server computes this and
injects it — the demo's value is precomputed by `npm run seed`). The dashboard and MCP
server authenticate as admin with `X-Loupe-Admin` = secret. Screenshot blobs are served
by unguessable id (prod: signed URLs).

**Object storage** — `server/blobs.ts` is the seam (local disk now, S3 later). The SDK
uploads a screenshot to `POST /v1/blobs` and stores only the returned **URL** on the
comment, so lists/reads stay small.

**URL normalization** — `normalizeUrl()` in `@loupekit/shared` strips `utm_*`, click ids,
and Loupe's dev params, so a comment on `/checkout?utm_source=x` and one on `/checkout`
don't fragment. Applied server-side on write and query.

## Browser extension

The extension reuses the exact SDK core; its only difference is the screenshot source —
`chrome.tabs.captureVisibleTab` (real pixels), cropped to the element with redaction,
wired via the SDK's `captureScreenshot` override. Load it manually:

```bash
npm run build:extension      # builds packages/extension/content.js
```

1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select
   `packages/extension`.
2. Click the Loupe icon → set project key (`pk_demo_acme`), user, API base
   (`http://localhost:8787`), and (optionally) the demo HMAC → **Start Loupe on this tab**.

> Note: the extension is validated by build + manifest/bundle checks; full in-browser E2E
> wasn't automated in this repo's headless setup.

## Roadmap

1. **Client SDK** ✓ — inspect, comment, capture, re-anchor across redeploys.
2. **Backend API** ✓ — Postgres, HMAC auth + per-project secrets, object storage, static hosting.
3. **MCP server** ✓ — comments as a Claude Code backlog.
4. **Dashboard** ✓ — Kanban triage.
5. **Hardening** ✓ — monorepo, Postgres, enforced auth, blob storage, URL normalization.
6. **Browser extension** ✓ — pixel-perfect capture on any site.

**Next:** real cloud object storage (S3/R2) + signed URLs, project/team management UI,
Postgres migrations tooling, and packaging the SDK/MCP to npm + the extension to the
Chrome Web Store.

## License

MIT
