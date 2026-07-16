# Testing

```bash
npm test              # run everything (Vitest)
npm run test:watch    # watch mode
npm run test:coverage # coverage report (text + HTML in coverage/)
```

Runner: **Vitest** + **v8 coverage**. DOM code runs under **happy-dom** (files opt in with
`// @vitest-environment happy-dom`); everything else runs in Node.

## What each suite covers

| Suite | Type | What it proves |
|---|---|---|
| `shared/normalizeUrl` | unit | Strips `utm_*`/click ids/dev params, sorts, trailing slash, absolute URLs |
| `server/auth` | unit (PGlite) | HMAC sign/verify; admin vs user vs 401/404/400 |
| `server/blobs` | unit | put/get round-trip, id sanitization, data-URL decode |
| `server/store` | unit (PGlite) | CRUD, URL normalization on write/query, upsert-replace |
| `server/api` | integration | Real `node:http` on port 0 — full auth matrix, comments CRUD, blob upload+serve, static, routing edges, malformed body |
| `sdk/fingerprint` | unit (happy-dom) | Capture + all re-anchor tiers, dedup, detach, UI exclusion |
| `sdk/store` | unit (happy-dom) | LocalStorage adapter CRUD + bad-JSON handling |
| `sdk/http-adapter` | unit (mocked fetch) | Identity headers, blob-upload-then-save, fallback, PATCH/DELETE, errors |
| `sdk/capture` | unit (happy-dom) | Element context, truncation, screenshot success + error swallow |
| `sdk/app` | integration (happy-dom) | Mount, inspect→comment→pin→persist, free note, reload+re-anchor, comment list, done, delete, dock position + theme + push/reflow + mobile-inspect, launcher, Escape |
| `mcp/handlers` | unit (canned API) | All three tools in-process, both anchor branches, filters, error path |
| `mcp/mcp` | integration (stdio) | Real MCP server spawned + driven by an MCP client end-to-end |
| `extension/manifest` | unit | Valid MV3 manifest; referenced files exist |

## Coverage — the honest picture

Current: **~91% lines, ~85% statements** (`npm run test:coverage`). Pure-logic modules
are at or near 100% (`server/store` 100%, `server/blobs` 100%, `sdk/http-adapter` 96%,
`sdk/store` 94%, `mcp` 92%).

We deliberately do **not** chase a literal 100% by excluding real code, because a handful
of paths can't be meaningfully exercised in this harness — reaching them would mean faking
the environment rather than testing behavior:

- **`server/db.ts` (~73%)** — the `pg` (hosted Postgres) branch needs a live Postgres
  server; locally we run and test the PGlite branch. The SQL is identical.
- **`sdk/capture.ts` filter (~65%)** — the redaction `filter` callback only executes
  inside `modern-screenshot`'s real render pipeline, which is mocked in Node.
- **`sdk/app.ts` & `dashboard/app.ts` (~84%)** — scroll/resize `requestAnimationFrame`,
  the `MutationObserver` debounce, and the safety `setInterval` depend on a real layout
  engine; happy-dom has none.
- **`shared` catch (~89%)** — a defensive fallback for an input `URL()` won't reject on.
- **`extension/content.src.ts`** — excluded from coverage: it needs Chrome APIs +
  `<canvas>`; validated instead by the manifest test and the build.
- **`mcp` stdio connect line** — runs only as the spawned entrypoint (covered by the
  integration test, which runs in a subprocess v8 can't instrument).

Everything a bug could realistically hide in — auth, storage, normalization, the
re-anchor algorithm, the API surface, the MCP tools — is covered.
