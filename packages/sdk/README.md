# @loupekit/sdk

**Embeddable visual-feedback widget for the web.** Drop it into any running product and
your team can inspect an element, pin a comment to it, and capture a screenshot. Comments
**persist and re-anchor across redeploys**, and are handed to **Claude Code via MCP** as a
fully-contextualized, actionable backlog.

Part of [**Loupe**](https://github.com/mohamed-ashraf-elsaed/loupe) — the loop is:
SDK (in your product) → backend API → Postgres + object storage → dashboard (human triage)
**and** MCP server (Claude reads it) → status flows back.

---

## Why

Traditional feedback ("the header looks off on the pricing page") loses the one thing an
engineer needs: **which element, in what state, on which page.** Loupe captures all of it at
the moment of the comment — a multi-signal element fingerprint, the target's HTML + computed
styles, a screenshot, and the normalized URL — so the feedback stays actionable even after
the UI changes underneath it.

## Features

- 🎯 **Click-to-comment inspector** — hover-highlight any element, click to pin a comment.
- ▭ **Free-region screenshots** — drag a free-size box, screenshot exactly that area, and
  comment on it. The region anchors to the element under its center, so it tracks responsive
  reflow and scrolling.
- 🔁 **Redeploy-surviving re-anchoring** — a multi-signal fingerprint (stable id/testid, CSS
  path, XPath, text, attributes, position) re-locates the element on the current page; if it
  can't, the pin **detaches** rather than pointing at the wrong thing.
- 📸 **Screenshot capture** with `[data-loupe-redact]` regions blurred out before anything
  leaves the browser.
- 🧩 **Shadow-DOM isolation** — the widget's CSS never leaks into your page and vice-versa.
- 🔌 **Pluggable storage** — talks to the Loupe backend, or persists to `localStorage` for
  offline/demo use.
- 🤖 **Claude-ready** — every comment carries the context Claude Code needs to make the fix.

## Install

```bash
npm i @loupekit/sdk
```

> Also mirrored to **GitHub Packages** as `@mohamed-ashraf-elsaed/sdk`. To install from there,
> add `@mohamed-ashraf-elsaed:registry=https://npm.pkg.github.com` to your `.npmrc`.

## Quick start

```ts
import { init } from "@loupekit/sdk";

init({
  projectKey: "pk_live_yourkey",
  user: { id: "u_92", name: "Sara (PM)", email: "sara@acme.com" },
  apiBase: "https://loupe.yourbackend.com",
  // HMAC-SHA256(user.id, PROJECT_SECRET), computed on your server (see Auth below).
  userHmac: "decb2c…",
});
```

That's it — a floating toolbar appears with **Inspect & comment**, **Region shot**, and
**Comments**. Call `destroy()` to tear it down.

### Offline mode (no backend)

Omit `apiBase` and comments persist to `localStorage`. Great for demos and local dev.

```ts
init({ projectKey: "pk_demo", user: { id: "u_1", name: "You" } });
```

## Configuration

`init(config: LoupeConfig)`:

| Option             | Type                                             | Description                                                                                   |
| ------------------ | ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `projectKey`       | `string` **(required)**                          | Public project key issued by the backend.                                                     |
| `user`             | `{ id, name, email? }` **(required)**            | The already-authenticated host-app user.                                                      |
| `apiBase`          | `string`                                         | Backend base URL. Omit → `localStorage` (offline mode).                                        |
| `userHmac`         | `string`                                         | `HMAC-SHA256(user.id, PROJECT_SECRET)` computed server-side. Required in production for writes. |
| `autoOpen`         | `boolean`                                        | Start with the inspector already active.                                                      |
| `captureScreenshot`| `(el: Element) => Promise<string \| undefined>`  | Override element screenshot capture (the extension backs this with `captureVisibleTab`).      |
| `captureRegion`    | `(rect: RegionRect) => Promise<string \| undefined>` | Override free-region capture. `rect` is in viewport coordinates.                          |
| `headers`          | `Record<string, string>`                         | Extra headers merged into every backend request (e.g. a CSRF token).                          |
| `credentials`      | `RequestCredentials`                             | `credentials` mode for backend requests — set `"include"` for cross-origin cookie auth.       |

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
the raw secret. See the [Auth docs](https://github.com/mohamed-ashraf-elsaed/loupe#auth-model).

## Extending the storage seam

Anything implementing `StorageAdapter` can back the widget — swap in your own transport:

```ts
interface StorageAdapter {
  list(projectKey: string, url: string): Promise<Comment[]>;
  save(comment: Comment): Promise<Comment>;
  update(id: string, patch: Partial<Comment>): Promise<void>;
  remove(id: string): Promise<void>;
}
```

## Browser support

Modern evergreen browsers (Chromium, Firefox, Safari). Uses Shadow DOM, `MutationObserver`,
and the `crypto`/`clipboard` APIs.

## Related packages

- [`@loupekit/mcp`](https://www.npmjs.com/package/@loupekit/mcp) — MCP server that hands the
  comments to Claude Code.
- [`@loupekit/shared`](https://www.npmjs.com/package/@loupekit/shared) — the canonical types.

## License

MIT © [Mohamed Ashraf Elsaed](https://github.com/mohamed-ashraf-elsaed)
