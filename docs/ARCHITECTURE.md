# Loupe — Architecture

Loupe turns a comment a PM leaves on a live product into an actionable, fully-contextual
task for a developer (or for Claude Code). This document explains how every piece fits
together and how the non-obvious logic works.

- [System overview](#system-overview)
- [The feedback loop](#the-feedback-loop-end-to-end)
- [Packages](#packages)
- [Re-anchoring: the crown jewel](#re-anchoring-the-crown-jewel)
- [Authentication](#authentication)
- [Data model](#data-model)
- [Screenshots & object storage](#screenshots--object-storage)
- [URL normalization](#url-normalization)
- [The browser extension](#the-browser-extension)
- [Seams (extension points)](#seams-extension-points)

## System overview

```mermaid
flowchart LR
  subgraph Product["Customer product (any site)"]
    SDK["@loupe/sdk<br/>Shadow-DOM widget"]
  end
  subgraph Ext["Any site (no install)"]
    EXT["@loupe/extension<br/>MV3 + captureVisibleTab"]
  end
  subgraph Backend["@loupe/server (one Node process)"]
    API["HTTP API<br/>node:http"]
    DBSEAM["db.ts seam"]
    BLOB["blobs.ts seam"]
    STATIC["static hosting<br/>/dashboard /demo /sdk"]
  end
  PG[("Postgres<br/>PGlite / hosted")]
  OBJ[["Object storage<br/>disk / S3"]]
  DASH["@loupe/dashboard<br/>Kanban triage"]
  MCP["@loupe/mcp<br/>MCP server"]
  CLAUDE["Claude Code"]

  SDK -->|"identity HMAC"| API
  EXT -->|"identity HMAC"| API
  API --> DBSEAM --> PG
  API --> BLOB --> OBJ
  API --> STATIC
  DASH -->|"admin key"| API
  MCP -->|"admin key"| API
  CLAUDE <-->|"MCP tools"| MCP
  DASH -.serves.- STATIC
```

Everything runs from a single Node process locally — the API, the database (embedded
PGlite), object storage (disk), and static hosting of the dashboard, demo, and SDK bundle.

## The feedback loop (end to end)

```mermaid
sequenceDiagram
  actor PM as PM (in the product)
  participant SDK as @loupe/sdk
  participant API as @loupe/server
  participant PG as Postgres
  participant OBJ as Object storage
  actor Dev as Developer
  participant MCP as @loupe/mcp
  participant Claude as Claude Code

  PM->>SDK: click element, write comment
  SDK->>SDK: captureAnchor() + element context + screenshot
  SDK->>API: POST /v1/blobs (screenshot)  [HMAC]
  API->>OBJ: store PNG
  OBJ-->>API: url
  SDK->>API: POST /v1/comments (with screenshot URL)  [HMAC]
  API->>PG: INSERT (url normalized)
  Note over API,PG: comment now visible to dashboard + MCP
  Dev->>Claude: "work through Loupe comments"
  Claude->>MCP: list_comments / get_comment  [admin]
  MCP->>API: GET /v1/comments
  API->>PG: SELECT
  API-->>Claude: request + element HTML + styles + screenshot URL
  Claude->>MCP: update_status(done)
  MCP->>API: PATCH /v1/comments/:id
```

## Packages

```mermaid
flowchart TD
  SHARED["@loupe/shared<br/>types + normalizeUrl (built)"]
  SDK["@loupe/sdk"]
  DASH["@loupe/dashboard"]
  SRV["@loupe/server"]
  MCP["@loupe/mcp"]
  EXT["@loupe/extension"]
  SHARED --> SDK
  SHARED --> DASH
  SHARED --> SRV
  SHARED --> MCP
  SDK --> EXT
```

| Package | Runtime | Build | Responsibility |
|---|---|---|---|
| `@loupe/shared` | both | `tsc` → dist | Canonical types + `normalizeUrl` |
| `@loupe/sdk` | browser | tsup (ESM + IIFE) | Inspect, comment, capture, re-anchor |
| `@loupe/server` | Node (native TS) | none | API, Postgres, blobs, auth, static |
| `@loupe/dashboard` | browser | tsup (ESM) | Kanban triage board |
| `@loupe/mcp` | Node (native TS) | none | MCP server for Claude Code |
| `@loupe/extension` | browser | tsup (IIFE) | MV3 extension, pixel-perfect capture |

## Re-anchoring: the crown jewel

A pin must survive the developer rewriting the markup. Loupe stores a multi-signal
*fingerprint* and re-resolves it by scoring candidates on every load and DOM change.

```mermaid
flowchart TD
  A["resolveAnchor(anchor)"] --> B{"unique testid / id?"}
  B -- yes --> B1["score 0.98 — return"]
  B -- no --> C{"cssPath rooted at a<br/>stable id, single match,<br/>same tag?"}
  C -- yes --> C1["score 0.90 — return<br/>(survives changed content)"]
  C -- no --> D["weighted similarity scan<br/>text .34 · attrs .22 · testid .22<br/>cssPath .20 · tag .12 · position .10"]
  D --> E{"best score ≥ 0.5?"}
  E -- yes --> E1["pin to best element"]
  E -- no --> E2["mark 'detached'<br/>(never pin to the wrong element)"]
```

`captureAnchor` records: stable id/testid, a CSS path anchored at the nearest stable
ancestor, an XPath, normalized text, identifying attributes, nth-of-type, and the
bounding rect + viewport (for positional scoring and the detached fallback). Live proof
is in `docs/before-redeploy.png` / `docs/after-redeploy.png`.

## Authentication

```mermaid
flowchart TD
  R["request"] --> P{"project found?"}
  P -- no --> E404["404"]
  P -- yes --> ADM{"X-Loupe-Admin == secret?"}
  ADM -- yes --> OKA["authorized (admin) — dashboard / MCP"]
  ADM -- no --> USR{"HMAC-SHA256(user, secret)<br/>== X-Loupe-Hmac?"}
  USR -- yes --> OKU["authorized (user) — SDK"]
  USR -- no --> E401["401"]
```

The host app's **server** computes the user HMAC and injects it into the page — the
browser never sees the secret. The dashboard and MCP server act as admin. Writes are
gated; a user may only post comments as themselves.

## Data model

```mermaid
erDiagram
  PROJECTS ||--o{ COMMENTS : has
  PROJECTS {
    text project_key PK
    text name
    text secret
    text_array allowed_origins
    timestamptz created_at
  }
  COMMENTS {
    text id PK
    text project_key FK
    text url "normalized"
    text status "open|in_progress|done"
    text body
    jsonb author
    jsonb anchor
    jsonb context
    jsonb offset
    text screenshot_url
    timestamptz created_at
  }
```

## Screenshots & object storage

The SDK uploads the PNG to `POST /v1/blobs` and stores only the returned **URL** on the
comment, so lists and reads never carry base64. `blobs.ts` is a seam: local disk today,
S3/R2 with signed URLs in production. `[data-loupe-redact]` regions and Loupe's own UI
are excluded before the image ever leaves the browser.

## URL normalization

`normalizeUrl` (in `@loupe/shared`) strips `utm_*`, click ids (`gclid`, `fbclid`, …), and
Loupe's dev params (`api`, `key`), sorts the remaining query, and drops trailing slashes.
Applied server-side on write and on the list filter, so `/checkout?utm_source=x` and
`/checkout` share one comment thread instead of fragmenting.

## The browser extension

Identical SDK core; the only difference is the screenshot source.

```mermaid
sequenceDiagram
  participant C as content.js (SDK core)
  participant BG as background.js (worker)
  C->>BG: LOUPE_CAPTURE
  BG->>BG: chrome.tabs.captureVisibleTab (real pixels)
  BG-->>C: full-page PNG
  C->>C: crop to element rect (× dpr), paint over redacted regions
  C-->>C: return data URL to the SDK (uploaded as a blob)
```

The SDK exposes a `captureScreenshot` override in its config; the extension passes this
function, so nothing else in the widget changes.

## Seams (extension points)

Change implementations behind these; leave the contracts alone.

| Seam | File | Local | Production |
|---|---|---|---|
| Storage adapter | `sdk/src/store.ts` / `http-adapter.ts` | localStorage / HTTP | HTTP |
| Database | `server/db.ts` | PGlite | hosted Postgres (`DATABASE_URL`) |
| Object storage | `server/blobs.ts` | disk | S3 / R2 signed URLs |
| Screenshot capture | SDK `captureScreenshot` config | modern-screenshot | extension `captureVisibleTab` |
