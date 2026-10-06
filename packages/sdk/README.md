# @loupekit/sdk

Add a visual feedback widget to any web page: reviewers pin comments to elements, and each comment carries the screenshot, element HTML and computed styles a developer or coding agent needs to make the fix.

[![npm version](https://img.shields.io/npm/v/@loupekit/sdk?color=4a55d6&label=npm)](https://www.npmjs.com/package/@loupekit/sdk)
![MIT license](https://img.shields.io/npm/l/@loupekit/sdk?color=4a55d6)

![The Loupe panel's Home tab with the Open, Needs you, Resolved and Stale tiles, scope chips, the Pin feedback on this page button, and a feed of recent comments](https://raw.githubusercontent.com/mohamed-ashraf-elsaed/loupe/main/docs/images/sdk-home-tab.png)

**Contents**

- [Terms](#terms)
- [Install](#install)
- [Before you begin](#before-you-begin)
- [Quick start](#quick-start)
- [Verify](#verify)
- [Troubleshooting](#troubleshooting)
- [Common options](#common-options)
- [Offline mode](#offline-mode)
- [Storage](#storage)
- [What reviewers get](#what-reviewers-get)
- [Links](#links)

## Terms

- **Panel:** the sidebar the widget docks to the edge of the page. It holds the Home, Comments, Activity and Chat tabs.
- **Launcher:** the floating button that opens the panel and the comment tools.
- **Pin:** a comment anchored to an element on the page.
- **Thread:** the replies under one comment.
- **Agent bridge:** a local HTTP service that `@loupekit/mcp` runs, by default on port 9800. It carries presence and chat between the panel and a coding agent.

## Install

```bash
npm i @loupekit/sdk
```

The package is also mirrored to GitHub Packages as `@mohamed-ashraf-elsaed/sdk` (registry `https://npm.pkg.github.com`).

The bundle has no runtime dependencies. It ships two builds:

| File | Format | Use it for |
| --- | --- | --- |
| `dist/index.js` | ES module | Bundlers and `import` |
| `dist/index.global.js` | IIFE, global `Loupe` | A plain `<script>` tag |

> **TypeScript:** version 0.14.1 ships no type declarations. `package.json` names `dist/index.d.ts`, but the build does not produce it, so TypeScript reports "Could not find a declaration file for module '@loupekit/sdk'". Until declarations ship, add a file such as `src/loupe.d.ts` that contains `declare module "@loupekit/sdk";`.

## Before you begin

The widget needs a backend to share comments between people. Pick one:

| Backend | What you need | Guide |
| --- | --- | --- |
| None (offline mode) | Nothing. Comments stay in the browser. | [Offline mode](#offline-mode) |
| Local server (`@loupekit/server`) | A clone of the repository and Node.js 24. Gives you `<API_BASE>`, `<PROJECT_KEY>` and `<PROJECT_SECRET>`. | [Run the local server](https://github.com/mohamed-ashraf-elsaed/loupe/blob/main/docs/how-to/run-local-server.md) |
| Laravel package (`loupekit/laravel`) | A Laravel app. Its `@loupeWidget` directive loads this SDK and calls `init()` for you, so you do not call it yourself. | [Install Loupe in a Laravel app](https://github.com/mohamed-ashraf-elsaed/loupe/blob/main/docs/how-to/laravel-install.md) |
| Loupe Hub | Hub routes tickets between Laravel apps. It is not a backend you pass to `init()`. | [Route tickets between apps](https://github.com/mohamed-ashraf-elsaed/loupe/blob/main/docs/how-to/hub-connect-apps.md) |

The **project secret** is the private key the backend issues with each project. The local server uses it to verify user identity and as the dashboard's admin key. Keep it on your server.

To start the local server with its demo project, run these commands from a clone of the repository:

```bash
npm install
npm run build
npm run seed
npm start
```

You should see the seed print the demo project and its secret:

```text
Seeded project: pk_demo_acme
  admin key   (dashboard ?key= / X-Loupe-Admin): sk_demo_acme_0f3b9c
  demo HMAC    (host-app-injected for u_92): <HMAC>
```

and the server report `[loupe] API + static on http://localhost:8787`. The demo values are:

- `<API_BASE>`: `http://localhost:8787`
- `<PROJECT_KEY>`: `pk_demo_acme`
- `<PROJECT_SECRET>`: `sk_demo_acme_0f3b9c`, or the value of `LOUPE_DEMO_SECRET` if you set it before `npm run seed`
- `<USER_HMAC>` for user `u_92`: the `demo HMAC` line

## Quick start

Call `init()` once, after your app knows who the signed-in user is.

### ES module

```ts
import { init } from "@loupekit/sdk";

init({
  projectKey: "<PROJECT_KEY>",
  user: { id: "u_92", name: "Sara", email: "sara@acme.com" },
  apiBase: "<API_BASE>",
  userHmac: "<USER_HMAC>",
});
```

### Script tag

1. Copy the IIFE build into your public assets folder:

   ```bash
   cp node_modules/@loupekit/sdk/dist/index.global.js <PUBLIC_DIR>/loupe.js
   ```

   You should see `loupe.js` in `<PUBLIC_DIR>`. The package `exports` map exposes only the ES module, so copy the file rather than importing it by path.

2. Load it and call `Loupe.init()`:

   ```html
   <script src="/<PATH_TO>/loupe.js"></script>
   <script>
     Loupe.init({
       projectKey: "<PROJECT_KEY>",
       user: { id: "u_92", name: "Sara", email: "sara@acme.com" },
       apiBase: "<API_BASE>",
       userHmac: "<USER_HMAC>",
     });
   </script>
   ```

### Placeholders

- `<PROJECT_KEY>`: the public project key your backend issued, for example `pk_demo_acme` from the local demo server.
- `<API_BASE>`: the base URL of your Loupe backend, for example `https://tracker.example.com`. Omit it to run in [offline mode](#offline-mode).
- `<USER_HMAC>`: `HMAC-SHA256(user.id, <PROJECT_SECRET>)` as hex, computed on your server. Never compute it in the browser, because that exposes the project secret.
- `<PUBLIC_DIR>`: the folder your web server serves static files from.
- `<PATH_TO>`: the URL path where that folder is served.

### Compute the user HMAC on your server

The local server verifies `X-Loupe-Hmac` against `HMAC-SHA256(user.id, project secret)` and rejects a mismatch. In Node.js:

```js
import { createHmac } from "node:crypto";

const userHmac = createHmac("sha256", process.env.LOUPE_PROJECT_SECRET)
  .update(user.id)
  .digest("hex");
```

Pass `userHmac` to the page that calls `init()`.

## Verify

Reload the page. You should see the Loupe panel docked on the right edge of the page, open on the Home tab. On the first open on a desktop browser, a five-step tour runs once.

`init()` does nothing on a second call. Call `destroy()` to remove the widget and stop all its timers.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Console shows `[loupe] init requires a projectKey` | `projectKey` is missing. | Pass `projectKey`. |
| Console shows `[loupe] init requires user.id` | `user.id` is missing. | Pass `user` with an `id`. |
| Requests to `/v1/comments` return `401` with `invalid or missing credentials` | `userHmac` is missing, or was signed with another secret or another user id. | Recompute it on the server from the exact `user.id` you pass to `init()` and the project's secret. |
| Requests return `404` with `unknown project` | No project has that key on the backend. | Check `projectKey`, or run `npm run seed` for the demo project. |
| Comments never leave the browser | `apiBase` is not set, so the widget is in offline mode. | Set `apiBase` to your backend URL. |
| A preflight (`OPTIONS`) request fails with a CORS error against the local server | You added a header with the `headers` option. The local server allows only `Content-Type`, `X-Loupe-User`, `X-Loupe-Hmac`, `X-Loupe-Admin` and `X-Loupe-Project`. | Remove the extra header, or use a backend that allows it. |

## Common options

SDK options are passed to `init()`. None of them is read from an environment variable.

| Option | Type | Default | Env var | Description |
| --- | --- | --- | --- | --- |
| `projectKey` | `string` | required | none | Public project key issued by the backend. |
| `user` | `{ id: string; name: string; email?: string }` | required | none | The signed-in user of the host app. |
| `userHmac` | `string` | unset | none | `HMAC-SHA256(user.id, <PROJECT_SECRET>)`, computed server-side. Sent as the `X-Loupe-Hmac` header when set. |
| `apiBase` | `string` | unset | none | Backend base URL. Without it, comments are stored in `localStorage`. |
| `bridge` | `string` | unset | none | Base URL of the agent bridge, for example `http://127.0.0.1:9800`. Without it, the peer list is hidden and live presence is off. |
| `credentials` | `RequestCredentials` | unset (`fetch` then uses `"same-origin"`) | none | Passed to every `fetch`. Set `"include"` for cross-origin cookie auth. |
| `headers` | `Record<string, string>` | unset | none | Extra headers merged into every backend request, for example `{ "X-CSRF-TOKEN": "…" }`. |
| `timeZone` | `string` | unset (the browser's zone) | none | IANA zone for timestamps, for example `"Europe/London"`. An unknown zone falls back to the browser's, with one console warning. |
| `locale` | `string` | unset (the browser's locale) | none | BCP 47 locale for dates, for example `"en-GB"`. An unknown locale falls back to the browser's, with one console warning. |
| `chat` | `boolean` | `false` | none | Shows the experimental Chat tab. When `false`, the tab is dimmed and cannot be opened. |
| `tabs` | `LoupeTab[]` | unset | none | Extra panel tabs, shown after the built-in ones. `connectTab()` returns one. |

For every option, including `autoOpen`, `tool`, `label` and `environments`, see the [SDK reference](https://github.com/mohamed-ashraf-elsaed/loupe/blob/main/docs/reference/sdk.md).

## Offline mode

When you omit `apiBase`, the widget stores comments, replies and reactions in the browser's `localStorage`, under keys that start with `loupe:`. Nothing leaves the browser, so offline mode suits demos and local development. Comments are visible only in that browser, there are no notifications, and each attachment is limited to 3,000,000 bytes.

```ts
init({ projectKey: "pk_demo", user: { id: "u_1", name: "Sara" } });
```

## Storage

`apiBase` chooses the storage: with it, the widget talks to your backend over HTTP; without it, the widget uses `localStorage`. You cannot pass your own storage adapter to `init()`.

## What reviewers get

- **Four built-in tabs:** Home, Comments, Activity and Chat. Chat is experimental and stays dimmed until you pass `chat: true`. The `tabs` option and `connectTab()` add more.
- **Tools:** Inspect (pin a comment to an element), Note (a page-level note), Region (drag a box) and Record (a short screen recording of a region, capped at 20 seconds). A region anchors to the smallest element that covers at least 60% of it.
- **Threads:** replies with file attachments, `@mentions` with autocomplete, and reactions (👍 🎉 👀 🙏 ❤️ 🚀).
- **Sync:** the panel refreshes comments and open threads every 10 seconds while the tab is visible and nobody is typing in the panel.
- **Home tiles:** Open, Needs you, Resolved and Stale (open for more than 7 days). Click a tile to filter the Comments tab.
- **Launcher:** drag it anywhere. Its chevron opens quick actions: Pin comment, Note, Markers and Hide launcher. Press `Alt+Shift+L` to hide or show it.
- **Re-anchoring:** pins follow their element across redeploys. A pin that cannot be matched detaches and shows a "moved" badge instead of pointing at the wrong element.
- **Redaction:** with the built-in capture, elements marked `data-loupe-redact` are left out of element screenshots and painted over in region screenshots, before upload. A `captureScreenshot` or `captureRegion` override, and screen recordings, are not redacted.

For a walkthrough of each feature, see [Use the widget](https://github.com/mohamed-ashraf-elsaed/loupe/blob/main/docs/how-to/use-the-widget.md).

## Links

- [Documentation](https://github.com/mohamed-ashraf-elsaed/loupe/tree/main/docs)
- [Guide](https://mohamed-ashraf-elsaed.github.io/loupe/guide/)
- [Changelog](https://github.com/mohamed-ashraf-elsaed/loupe/blob/main/CHANGELOG.md)
- [Issues](https://github.com/mohamed-ashraf-elsaed/loupe/issues)
- [`@loupekit/mcp`](https://www.npmjs.com/package/@loupekit/mcp): the MCP server that hands comments to a coding agent

## License

MIT © [Mohamed Ashraf Elsaed](https://github.com/mohamed-ashraf-elsaed)
