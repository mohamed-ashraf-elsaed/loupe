<div align="center">

<a href="https://mohamed-ashraf-elsaed.github.io/loupe/">
  <img src="https://raw.githubusercontent.com/mohamed-ashraf-elsaed/loupe/main/docs/store/promo-marquee-1400x560.jpg" alt="Loupe — Pin feedback to the live UI. Hand it to Claude." width="100%" />
</a>

<h1>@loupekit/sdk</h1>

<p><strong>The embeddable visual-feedback widget for the web.</strong><br />
Inspect any element on your live product, pin a comment to it, capture a screenshot —<br />
comments re-anchor across redeploys and flow to Claude Code as an actionable backlog.</p>

<p>
  <a href="https://www.npmjs.com/package/@loupekit/sdk"><img src="https://img.shields.io/npm/v/@loupekit/sdk?color=4a55d6&label=npm" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@loupekit/sdk"><img src="https://img.shields.io/npm/dm/@loupekit/sdk?color=4a55d6" alt="npm downloads" /></a>
  <img src="https://img.shields.io/npm/types/@loupekit/sdk?color=4a55d6" alt="TypeScript types" />
  <img src="https://img.shields.io/npm/l/@loupekit/sdk?color=4a55d6" alt="MIT license" />
</p>

<p>
  <a href="https://mohamed-ashraf-elsaed.github.io/loupe/"><b>Website</b></a> ·
  <a href="https://mohamed-ashraf-elsaed.github.io/loupe/guide/"><b>Docs</b></a> ·
  <a href="https://github.com/mohamed-ashraf-elsaed/loupe"><b>GitHub</b></a> ·
  <a href="https://github.com/mohamed-ashraf-elsaed/loupe/blob/main/CHANGELOG.md"><b>Changelog</b></a> ·
  <a href="https://www.npmjs.com/package/@loupekit/mcp"><b>MCP server</b></a>
</p>

</div>

---

## Overview

Traditional feedback — _"the revenue card looks off on the dashboard"_ — loses the one thing
an engineer needs: **which element, in what state, on which page.** Loupe captures all of it at
the moment of the comment, so the feedback stays actionable even after the UI changes underneath it.

<div align="center">
  <img src="https://raw.githubusercontent.com/mohamed-ashraf-elsaed/loupe/main/docs/store/screenshot-1-inspect.jpg" alt="Pin a comment to any element" width="90%" />
</div>

## Table of contents

- [Features](#features)
- [Install](#install)
- [Quick start](#quick-start)
- [Re-anchoring across redeploys](#re-anchoring-across-redeploys)
- [Configuration](#configuration)
- [Redaction](#redaction)
- [Auth model](#auth-model)
- [Storage seam](#storage-seam)
- [The loop](#the-loop)
- [Related packages](#related-packages)

## Features

| | |
| --- | --- |
| 🎯 **Click-to-comment inspector** | Hover-highlight any element, click to pin a comment. |
| ▭ **Free-region screenshots** | Drag a free-size box, screenshot exactly that area, comment on it. The region anchors to the element under its center, so it tracks responsive reflow and scrolling. |
| 🔁 **Redeploy-surviving re-anchoring** | A multi-signal fingerprint (stable id/testid, CSS path, XPath, text, attributes, position) re-locates the element on the current page; if it can't, the pin **detaches** instead of pointing at the wrong thing. |
| 📸 **Screenshot capture** | `[data-loupe-redact]` regions are painted over **before any pixels leave the browser**. |
| 🧩 **Shadow-DOM isolation** | The widget's CSS never leaks into your page and vice-versa. |
| 🔌 **Pluggable storage** | Talks to the Loupe backend, or persists to `localStorage` for offline/demo use. |
| 🤖 **Claude-ready** | Every comment carries the element HTML + computed styles + screenshot Claude Code needs to make the fix. |

## Install

```bash
npm i @loupekit/sdk
```

> Also mirrored to **GitHub Packages** as `@mohamed-ashraf-elsaed/sdk` — add
> `@mohamed-ashraf-elsaed:registry=https://npm.pkg.github.com` to your `.npmrc` to install from there.

## Quick start

```ts
import { init } from "@loupekit/sdk";

init({
  projectKey: "pk_live_yourkey",
  user: { id: "u_92", name: "Sara (PM)", email: "sara@acme.com" },
  apiBase: "https://loupe.yourbackend.com",
  // HMAC-SHA256(user.id, PROJECT_SECRET), computed on your server (see Auth model).
  userHmac: "decb2c…",
});
```

A floating toolbar appears with **Inspect & comment**, **Region shot**, and **Comments**.
Call `destroy()` to tear it down. `init()` is idempotent — safe to call more than once.

### Offline mode (no backend)

Omit `apiBase` and comments persist to `localStorage` — great for demos and local dev:

```ts
init({ projectKey: "pk_demo", user: { id: "u_1", name: "You" } });
```

## Re-anchoring across redeploys

The crown jewel. A comment records a multi-signal fingerprint of its target. On the next
page load — even after the UI is rebuilt, relabeled, or reordered — Loupe re-locates the
element and moves the pin to it. Below, the "Revenue" card was relabeled to "Total Revenue"
and reordered, yet the pin follows it:

<table>
<tr>
<td width="50%" align="center"><b>Before redeploy</b><br /><img src="https://raw.githubusercontent.com/mohamed-ashraf-elsaed/loupe/main/docs/before-redeploy.png" alt="Comment pinned to the revenue card" /></td>
<td width="50%" align="center"><b>After redeploy</b><br /><img src="https://raw.githubusercontent.com/mohamed-ashraf-elsaed/loupe/main/docs/after-redeploy.png" alt="Pin re-anchored after the layout changed" /></td>
</tr>
</table>

## Configuration

`init(config: LoupeConfig)`:

| Option | Type | Description |
| --- | --- | --- |
| `projectKey` | `string` **(required)** | Public project key issued by the backend. |
| `user` | `{ id, name, email? }` **(required)** | The already-authenticated host-app user. |
| `apiBase` | `string` | Backend base URL. Omit → `localStorage` (offline mode). |
| `userHmac` | `string` | `HMAC-SHA256(user.id, PROJECT_SECRET)` computed server-side. Required in production for writes. |
| `autoOpen` | `boolean` | Start with the inspector already active. |
| `captureScreenshot` | `(el: Element) => Promise<string \| undefined>` | Override element screenshot capture (the extension backs this with `captureVisibleTab`). |
| `captureRegion` | `(rect: RegionRect) => Promise<string \| undefined>` | Override free-region capture. `rect` is in viewport coordinates. |
| `headers` | `Record<string, string>` | Extra headers merged into every backend request (e.g. a CSRF token). |
| `credentials` | `RequestCredentials` | `credentials` mode for backend requests — set `"include"` for cross-origin cookie auth. |

## Redaction

Any element marked `data-loupe-redact` is painted over in screenshots **before the pixels
ever leave the browser** — use it on PII, secrets, or anything sensitive:

```html
<input data-loupe-redact value="secret.person@acme.com" />
```

## Auth model

Each project has a secret. **Writes** require `X-Loupe-User` + `X-Loupe-Hmac`
(`= HMAC-SHA256(userId, PROJECT_SECRET)`), which your server computes and injects into the
page — users can't spoof identity. The dashboard and MCP server authenticate as admin with
the raw secret.

## Storage seam

Anything implementing `StorageAdapter` can back the widget — swap in your own transport:

```ts
interface StorageAdapter {
  list(projectKey: string, url: string): Promise<Comment[]>;
  save(comment: Comment): Promise<Comment>;
  update(id: string, patch: Partial<Comment>): Promise<void>;
  remove(id: string): Promise<void>;
}
```

## The loop

SDK (in your product) → backend API → Postgres + object storage → **dashboard** (human triage)
**and** **MCP server** (Claude reads it) → status flows back.

<table>
<tr>
<td width="50%" align="center"><b>Triage board (dashboard)</b><br /><img src="https://raw.githubusercontent.com/mohamed-ashraf-elsaed/loupe/main/docs/store/screenshot-2-board.jpg" alt="Kanban triage board" /></td>
<td width="50%" align="center"><b>Claude Code reads it via MCP</b><br /><img src="https://raw.githubusercontent.com/mohamed-ashraf-elsaed/loupe/main/docs/store/screenshot-3-claude.jpg" alt="Claude Code reading comments through MCP" /></td>
</tr>
</table>

## Related packages

| Package | Description |
| --- | --- |
| [`@loupekit/mcp`](https://www.npmjs.com/package/@loupekit/mcp) | MCP server that hands the comments to Claude Code. |
| [`@loupekit/shared`](https://www.npmjs.com/package/@loupekit/shared) | The canonical TypeScript types shared across the platform. |

## Browser support

Modern evergreen browsers (Chromium, Firefox, Safari). Uses Shadow DOM, `MutationObserver`,
and the `crypto` / `clipboard` APIs.

## License

MIT © [Mohamed Ashraf Elsaed](https://github.com/mohamed-ashraf-elsaed)
