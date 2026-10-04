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
| 💬 **Free comments** | Drop a page-level note anywhere with the **Note** mode — no element, no screenshot. |
| ▭ **Free-region screenshots** | Drag a free-size box, screenshot exactly that area, comment on it. The region anchors to the element under its center, so it tracks responsive reflow and scrolling. |
| ⏺ **Screen recording** | The **Record** tool drags the same box, then captures a screen video of it (via `getDisplayMedia` + canvas crop) as `.webm` — duration-capped with a Stop button. Recordings play back inline in the widget and the dashboard. |
| 🧲 **Dockable control** | A DevTools-style panel: dock it to the left / right / bottom edge (which pushes your page over so it's never covered) or float it as a movable, resizable window. Light/dark theme, collapses to a draggable `◎` launcher (one tap reopens the panel; a chevron expands the quick actions to pin a comment, drop a note, hide the markers or hide the launcher itself), and becomes a bottom sheet on mobile. Position, launcher position, theme and marker visibility persist. |
| 🕒 **Who and when** | Every thread shows its author and an absolute timestamp rendered in `init({ timeZone, locale })`, so one team reads one clock. The Home footer shows the bundle version and flags it when the host's `packageVersion` differs. |
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

A dockable control panel appears with a three-page sidebar — **Home** (stat tiles, scope chips with
counts, the project manager, and the most recent feedback), **Comments** (with the
**Inspect**, **Note**, **Region**, and **Record** tools + the comment list) and
**Activity** (a live monitor fed by `trackActivity()`). The header carries a position menu
(left / bottom / right / float), a theme toggle, a settings dropdown — five accent colours, switches
for hover hints, markers and page paths, plus the running package version — and a minimize button
that collapses the panel to a one-line context bar. A five-step guided tour runs once on first open
(skippable, replayable from Settings), and each view shows a one-time hint card with a **Turn off
hints** link.
Pass `repo` and `branch` to `init()` to make
threads branch-aware — the board can then be filtered by repository and branch.
Use the header's dock controls to dock it left / right /
bottom (which pushes your page over) or float it, toggle light/dark, or close it to the `◎`
launcher. The launcher carries the comment count; one tap reopens the panel, and the chevron
beside it expands the quick actions (pin a comment, drop a note, hide the markers, hide the
launcher). Drag the launcher to move it anywhere — the spot is remembered, and **Reset launcher
position** in the Settings menu puts it back. Hide it from a quick action, the Settings menu,
`Alt+Shift+L`, or `hideLauncher()` / `showLauncher()` when it covers something on your page. On a
touch screen a slim tab at the right edge of the screen brings a hidden launcher back.
Call `destroy()` to tear it down. `init()` is idempotent — safe to call more
than once. Pass `label` to change the brand name shown in the header.

### Adding your own tab

The panel is extensible without forking it. Register as many sidebar pages as you like:

```ts
import { init, connectTab } from "@loupekit/sdk";

init({
  projectKey: "pk_live_…",
  user: { id: "u_1", name: "Ada" },
  repo: "acme/web",
  repos: ["acme/web", "acme/api"],          // powers the panel's repo picker
  environments: ["https://staging.acme.test"],
  tabs: [
    connectTab(),                            // the Claude/MCP page, now opt-in
    {
      id: "build",
      label: "Build",
      hint: { title: "Build health", body: "Straight from our CI." },
      render: (ctx) => `<p>Project <b>${ctx.projectKey}</b> — SDK v${ctx.version}</p>`,
    },
  ],
});
```

`render` runs once, when the panel is built, and may return markup or an element. It receives a
context with `projectKey`, `apiBase`, `user`, `comments`, `url`, `version` and the helpers
`track` (push an event into the Activity feed), `open` (switch tab) and `close`. A tab that throws
is caught and rendered as an error card rather than taking the panel down.

### Reporting agent activity

Anything an agent bridge or your app does can show up in the panel's Activity view:

```ts
import { trackActivity, setActivityStatus } from "@loupekit/sdk";

setActivityStatus("working");
trackActivity({ kind: "Read", label: "Read src/app.ts", files: ["src/app.ts"] });
trackActivity({ kind: "Bash", label: "pnpm test", detail: "exit 1", level: "error" });
```

Loupe's own operations feed the same stream, so the view is never empty. With nothing connected it
says *Monitor unavailable* and explains how to wire it up.

### Reviewing a change

A thread can carry the pull request its fix is riding on, which the panel turns into a lifecycle chip,
a PR link and a checks meter:

```ts
// Via the API (or your own tooling) — the panel picks it up on the next load.
await fetch(`${apiBase}/v1/comments/${id}`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json", "X-Loupe-Admin": secret },
  body: JSON.stringify({
    pr: { number: 412, url: "https://github.com/acme/web/pull/412", checksPassed: 3, checksTotal: 4 },
  }),
});
```

Threads in **In Review** lead their detail with a review banner — **Approve** and **Add comment** —
and, when a change has been proposed, a *Show original* toggle that puts your original request beside
the proposal. Approving resolves the thread and is logged in the Activity feed.

The rule that shape enforces: **only a human resolves a thread.** An agent moves work to In Review;
a person closes it from there.

### Generating and iterating on a change

Pass a `generate` function and a thread's detail gains a Generate pane — preview,
opacity comparison, undo, iteration history and a refine input. The panel owns all of
that; producing the markup is yours, so any model works:

```ts
init({
  projectKey: "pk_live_…",
  user: { id: "u_1", name: "Ada" },
  generate: async ({ comment, prompt, kind, previous, localAi }) => {
    // previous carries the iteration being refined; localAi is whatever the user
    // configured in the panel (see below).
    const { html, css, notes } = await myModel({ comment, prompt, kind, previous, localAi });
    return { html, css, notes };
  },
});
```

The preview renders in a **sandboxed** iframe, so generated markup can never reach your
page. A local-AI endpoint and model (any OpenAI-compatible server — Ollama, llama.cpp…)
are configurable in the project manager, with a real connection check. Without a
`generate` function the pane offers *Request access to generate* and hands it to
`init({ onRequestAccess })`.

### Agent navigation needs consent

An agent that can move the browser is useful and dangerous in equal measure, so
navigation is a request a human answers:

```ts
import { requestNavigation } from "@loupekit/sdk";

requestNavigation("https://preview.acme.test/pr/412", {
  reason: "The fix is live on the preview URL.",
  requester: "Claude Code",
});
```

The panel shows who wants to go where and why. **Nothing navigates without an explicit
grant** — only `http(s)` is even offerable, and every decision is kept as an audit trail.

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
| `captureRecording` | `(rect, opts?) => Promise<string \| undefined>` | Override screen-recording capture (returns a webm data URL). Defaults to `getDisplayMedia` + canvas crop; `opts` carries a duration cap and a `register(stop)` hook. |
| `headers` | `Record<string, string>` | Extra headers merged into every backend request (e.g. a CSRF token). |
| `credentials` | `RequestCredentials` | `credentials` mode for backend requests — set `"include"` for cross-origin cookie auth. |
| `timeZone` | `string` | IANA time zone every timestamp is rendered in (e.g. `"Africa/Cairo"`). Defaults to the browser's. |
| `locale` | `string` | BCP 47 locale for dates (e.g. `"en-GB"` for day-first). Defaults to the browser's. |
| `packageVersion` | `string` | Version of the host package that served this bundle (`Loupe.version` is the bundle's own). Flagged in the widget when the two differ. |

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
