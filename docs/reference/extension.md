# Browser extension reference

This page lists every manifest field, permission, context menu, popup field, storage key,
runtime message and build setting of the Loupe browser extension, version 0.14.1. It describes
exact behavior for developers and store reviewers. To install and use the extension, see
[Use the browser extension](../how-to/browser-extension.md).

The extension is a Manifest V3 (MV3) package. It injects the same widget core as
[`@loupekit/sdk`](sdk.md) into a tab you choose, and replaces only the screenshot source.

Each table has a **Source** column. It gives the file and line in the
[Loupe repository](https://github.com/mohamed-ashraf-elsaed/loupe) that defines the fact. All
paths are relative to `packages/extension/` unless they start with `packages/` or a root file name.

## Contents

1. [Files](#files)
2. [Manifest](#manifest)
3. [Not requested](#not-requested)
4. [Context menus](#context-menus)
5. [Popup fields](#popup-fields)
6. [Popup buttons](#popup-buttons)
7. [Storage keys](#storage-keys)
8. [Runtime messages](#runtime-messages)
9. [Content script start-up](#content-script-start-up)
10. [Options passed to `init`](#options-passed-to-init)
11. [Capture overrides and redaction](#capture-overrides-and-redaction)
12. [Network](#network)
13. [Build](#build)
14. [Packaging and versioning](#packaging-and-versioning)
15. [Tests](#tests)

## Files

| Name | Type | Default | Description | Source |
|---|---|---|---|---|
| `manifest.json` | MV3 manifest | — | Declares permissions, the service worker, the popup and the icons. | `manifest.json:1-29` |
| `background.js` | service worker | — | Creates the context menus, answers runtime messages, injects the content script. | `background.js:1-107` |
| `content.src.ts` | TypeScript source | — | Starts the SDK in the page with the extension's capture overrides. | `content.src.ts:1-102` |
| `content.js` | build output | absent until built | The bundled content script. It is gitignored, so you must build it before you load the extension unpacked. | `tsup.config.ts:6-11`, root `.gitignore:5` |
| `popup.html`, `popup.js` | popup page | — | The settings form opened from the toolbar icon. | `popup.html:1-41`, `popup.js:1-36` |
| `icons/16.png`, `icons/48.png`, `icons/128.png` | PNG | — | Toolbar and store icons. | `manifest.json:15-19` |
| `package.json` | npm manifest | — | `@loupekit/extension`, version `0.14.1`, `"private": true`. It is never published to npm. | `package.json:2`, `package.json:8`, `package.json:11` |
| `test/manifest.test.ts` | Vitest suite | — | Asserts the manifest's permissions and the menu-to-tool map. See [Tests](#tests). | `test/manifest.test.ts:1-44` |

## Manifest

| Field | Type | Value | Description | Source |
|---|---|---|---|---|
| `manifest_version` | number | `3` | Manifest V3. | `manifest.json:2` |
| `name` | string | `Loupe — visual feedback` | Name in the browser and the store. | `manifest.json:3` |
| `version` | string | `0.14.1` | Edited by hand. See [Packaging and versioning](#packaging-and-versioning). | `manifest.json:4` |
| `description` | string | `Inspect any page, pin comments to elements, and hand them to Claude — no SDK install required.` | Store summary. | `manifest.json:5` |
| `permissions` | string[] | `activeTab`, `scripting`, `storage`, `contextMenus` | The complete list. Nothing else is requested. | `manifest.json:6-11` |
| `background.service_worker` | string | `background.js` | The MV3 service worker. | `manifest.json:12-14` |
| `icons` | object | `16`, `48`, `128` → `icons/<size>.png` | Extension icons. | `manifest.json:15-19` |
| `action.default_popup` | string | `popup.html` | Opens when you click the toolbar icon. | `manifest.json:21` |
| `action.default_title` | string | `Loupe` | Toolbar tooltip. | `manifest.json:22` |
| `action.default_icon` | object | `16`, `48`, `128` → `icons/<size>.png` | Toolbar icon. | `manifest.json:23-27` |

What each permission is used for:

| Permission | Used for | Source |
|---|---|---|
| `activeTab` | Temporary access to the tab you act on, from the popup or a context menu. It covers the screenshot and the injection. | `test/manifest.test.ts:14` |
| `scripting` | `chrome.scripting.executeScript` injects `content.js`. | `popup.js:34`, `background.js:92-97` |
| `storage` | `chrome.storage.local` and `chrome.storage.session`. See [Storage keys](#storage-keys). | `popup.js:5`, `popup.js:23`, `background.js:69-71`, `background.js:87` |
| `contextMenus` | The eight right-click entries. See [Context menus](#context-menus). | `background.js:36-42` |

## Not requested

The manifest declares none of the following. `test/manifest.test.ts` fails if any of them is
added.

| Item | Asserted by | Source |
|---|---|---|
| `host_permissions` | `expect(manifest.host_permissions).toBeUndefined()` | `test/manifest.test.ts:17` |
| `tabs` permission | `expect(manifest.permissions).not.toContain("tabs")` | `test/manifest.test.ts:15` |
| `<all_urls>` | `expect(manifest.permissions).not.toContain("<all_urls>")` | `test/manifest.test.ts:16` |
| `content_scripts` | `expect(manifest.content_scripts).toBeUndefined()` | `test/manifest.test.ts:42` |
| `web_accessible_resources` | `expect(manifest.web_accessible_resources).toBeUndefined()` | `test/manifest.test.ts:41` |

Because there are no `content_scripts`, nothing runs on a page by itself. The content script is
injected only when you click **Start Loupe on this tab** in the popup or choose a Loupe
context-menu entry.

## Context menus

The service worker creates these entries in `chrome.runtime.onInstalled`. It calls
`chrome.contextMenus.removeAll` first, because that listener also runs on update and creating an
existing id throws (`background.js:36-42`).

| id | Title | Contexts | Tool | Source |
|---|---|---|---|---|
| `loupe-comment` | Comment on this page | `page`, `frame` | `inspect` | `background.js:11`, `background.js:27` |
| `loupe-selection` | Comment on “%s” (`%s` is the selected text) | `selection` | `note` | `background.js:12`, `background.js:28` |
| `loupe-image` | Comment on this image | `image` | `inspect` | `background.js:13`, `background.js:29` |
| `loupe-video` | Comment on this video | `video` | `inspect` | `background.js:14`, `background.js:30` |
| `loupe-audio` | Comment on this audio | `audio` | `inspect` | `background.js:15`, `background.js:31` |
| `loupe-link` | Comment on this link | `link` | `inspect` | `background.js:16`, `background.js:32` |
| `loupe-editable` | Comment on this field | `editable` | `inspect` | `background.js:17`, `background.js:33` |
| `loupe-toggle` | Show / hide Loupe on this page | `page`, `frame` | none; it toggles the site | `background.js:18`, `background.js:66-79` |

- **Tool.** `inspect` arms the element picker. `note` opens a free page note, which needs no
  element. An id missing from the tool map falls back to `inspect` (`background.js:81`).
- **Frame.** When the click carries `info.frameId`, the message and the injection target that
  frame. Otherwise they target the tab (`background.js:64`, `background.js:92-97`).
- **Comment entries.** The worker first sends `LOUPE_TOOL` to the tab. If no content script
  answers, it stores `loupeIntent` in `chrome.storage.session` and injects `content.js`
  (`background.js:81-89`).
- **Toggle.** The worker reads the page origin. Only `http:` and `https:` pages have one, so the
  toggle does nothing on `about:`, `chrome://` and similar pages (`background.js:99-107`). It flips
  `hiddenSites[origin]`. When the site becomes hidden, it sends `LOUPE_TEARDOWN`. When the site
  becomes visible, it injects `content.js` (`background.js:66-79`).

## Popup fields

The popup is a 280 px wide form with the header "Loupe" (`popup.html:6`, `popup.html:20`).
When it opens, it fills every field from `chrome.storage.local` (`popup.js:5-11`).

| id | Label | Type | Default | Placeholder | Needed to start | Stored as | Source |
|---|---|---|---|---|---|---|---|
| `projectKey` | Project key | string | `""` | `pk_demo_acme` | yes; checked by the content script, not the form | `projectKey` | `popup.html:22-24`, `popup.js:6`, `popup.js:15`, `content.src.ts:32-36` |
| `userId` | User id | string | `""` | `u_92` | yes; checked by the content script, not the form | `user.id` | `popup.html:26`, `popup.js:7`, `popup.js:16`, `content.src.ts:32-36` |
| `userName` | Name | string | `""`; an empty value is saved as `Reviewer` | `Sara` | no | `user.name` | `popup.html:27`, `popup.js:8`, `popup.js:16` |
| `apiBase` | API base (optional) | string | `""` (offline mode) | `http://localhost:8787` | no | `apiBase` | `popup.html:29-31`, `popup.js:9`, `popup.js:17` |
| `userHmac` | User HMAC (optional, from your server) | string | `""` | `hex…` | no | `userHmac` | `popup.html:32-34`, `popup.js:10`, `popup.js:18` |

- The form does not block an empty project key or user id. The content script checks them and
  stops with a console warning when either is missing (`content.src.ts:32-36`).
- Every value is trimmed before it is saved (`popup.js:13-20`).
- The popup has no email field, so the user passed to `init` is `{ id, name }` only
  (`popup.js:16`).
- **User HMAC.** An HMAC (hash-based message authentication code) is a signature that your
  server computes over the user id: hex HMAC-SHA256 of `user.id`, keyed with the project secret
  (`packages/sdk/src/types.ts:97-101`). Compute it on your server and paste it here. For the
  option, see [`userHmac` in init options](sdk.md#init-options). For why it must come from your
  server, see
  [Why userHmac is computed on the server](../explanation/auth-and-privacy.md#why-userhmac-is-computed-on-the-server).
- The extension reads no environment variables. All settings come from the popup and live in
  `chrome.storage.local` (`content.src.ts:24`).

![Extension popup with Project key pk_demo_acme, User id u_92, Name Sara, API base http://localhost:8787, and the Save settings and Start Loupe on this tab buttons](../images/extension-popup.png)

## Popup buttons

| id | Label | Action | Source |
|---|---|---|---|
| `save` | Save settings | Writes `{ projectKey, user: { id, name }, apiBase, userHmac }` to `chrome.storage.local`, then shows `Saved ✓` in `#msg` for 1.5 s. | `popup.html:35`, `popup.js:22-28` |
| `start` | Start Loupe on this tab | Saves first. Then queries the active tab in the current window, injects `content.js` into its top frame and closes the popup. If the tab has no id, or Chrome refuses the injection (for example on `chrome://` pages or the Chrome Web Store), the popup stays open after `Saved ✓` and shows no error. See [Troubleshooting: extension](../troubleshooting.md#extension). | `popup.html:36`, `popup.js:30-36` |
| `msg` | (status line) | Shows `Saved ✓`. | `popup.html:37`, `popup.js:24-25` |

## Storage keys

| Key | Area | Type | Written by | Read by | Source |
|---|---|---|---|---|---|
| `projectKey` | `chrome.storage.local` | string | popup | popup, content script | `popup.js:15`, `content.src.ts:24` |
| `user` | `chrome.storage.local` | `{ id: string, name: string }` | popup | popup, content script | `popup.js:16`, `content.src.ts:24` |
| `apiBase` | `chrome.storage.local` | string; empty means offline mode | popup | popup, content script | `popup.js:17`, `content.src.ts:24` |
| `userHmac` | `chrome.storage.local` | string | popup | popup, content script | `popup.js:18`, `content.src.ts:24` |
| `hiddenSites` | `chrome.storage.local` | `Record<origin, boolean>` | service worker (`loupe-toggle`) | service worker (`LOUPE_SITE_STATE`) | `background.js:69-71`, `background.js:52-59` |
| `loupeIntent` | `chrome.storage.session` | `{ tool: "inspect" \| "note", at: number }` | service worker, when it must inject | content script, once; it removes the key after reading it | `background.js:87`, `content.src.ts:39-40` |
| `__loupeInjected` | `window` global in the page | boolean | content script | content script | `content.src.ts:16`, `content.src.ts:21-22` |

`chrome.storage.session` is cleared when the browser session ends. `chrome.storage.local`
persists until the extension is removed.

The widget itself also writes to the page origin's `localStorage`, for example its dock state and,
in offline mode, the comments. Those keys belong to the SDK. See
[Browser storage keys](sdk.md#browser-storage-keys) and
[LocalStorageAdapter keys](sdk.md#localstorageadapter-keys).

## Runtime messages

| `type` | Direction | Payload | Reply | Source |
|---|---|---|---|---|
| `LOUPE_CAPTURE` | content script → service worker | none | PNG data URL of the visible viewport from `chrome.tabs.captureVisibleTab(windowId, { format: "png" })`, or `null` when `chrome.runtime.lastError` is set. The worker returns `true` to keep the channel open. | `background.js:45-50`, `content.src.ts:56`, `content.src.ts:68` |
| `LOUPE_SITE_STATE` | content script → service worker | none | `{ hidden: boolean }` for the sender tab's origin. If the request fails, the content script assumes `{ hidden: false }`. | `background.js:52-59`, `content.src.ts:27` |
| `LOUPE_TOOL` | service worker → content script | `{ tool: "inspect" \| "note" }` | none. The content script calls `openTool(tool)`; any value other than `note` opens `inspect`. | `background.js:85`, `content.src.ts:12` |
| `LOUPE_TEARDOWN` | service worker → content script | none | none. The content script calls `destroy()` and sets `window.__loupeInjected = false`, so a later injection can start Loupe again. | `background.js:74`, `content.src.ts:13-17` |

The capture covers the visible viewport only, not the full scrolled page (`background.js:46`).

## Content script start-up

`main()` runs once per injection, in this order (`content.src.ts:20-52`):

1. If `window.__loupeInjected` is `true`, it returns. Otherwise it sets the flag.
2. It reads `projectKey`, `user`, `apiBase` and `userHmac` from `chrome.storage.local`.
3. It sends `LOUPE_SITE_STATE`. If the site is hidden, it clears the flag and returns without a
   message. **Start Loupe on this tab** therefore does nothing on a hidden site. Use the
   `loupe-toggle` context menu to show the site again.
4. If `projectKey` or `user.id` is missing, it clears the flag, logs
   `[loupe] Set a project key and user in the extension popup first.` with `console.warn`, and
   returns.
5. It reads `loupeIntent` from `chrome.storage.session` and removes it.
6. It calls `init()` with the options below.

The SDK's own `init()` is also idempotent and logs `[loupe] init requires a projectKey` or
`[loupe] init requires user.id` when those are missing (`packages/sdk/src/index.ts:24-26`).

## Options passed to `init`

| Option | Type | Value | Effect | Source |
|---|---|---|---|---|
| `projectKey` | `string` | stored `projectKey` | Scopes comments to the project. | `content.src.ts:43`, `packages/sdk/src/types.ts:94` |
| `user` | `LoupeUser` | stored `user` (`{ id, name }`) | `user.id` is sent as the `X-Loupe-User` header. The name is not sent in a header. | `content.src.ts:44`, `packages/sdk/src/types.ts:96`, `packages/sdk/src/http-adapter.ts:20` |
| `apiBase` | `string` | stored `apiBase`, or `undefined` when empty | Set: server mode through `HttpAdapter`. Empty: offline mode through `LocalStorageAdapter`. | `content.src.ts:45`, `packages/sdk/src/app.ts:376-378` |
| `userHmac` | `string` | stored `userHmac`, or `undefined` when empty | Sent as `X-Loupe-Hmac` when set. | `content.src.ts:46`, `packages/sdk/src/http-adapter.ts:21` |
| `autoOpen` | `boolean` | `true` | The panel opens with a tool armed. | `content.src.ts:47` |
| `tool` | `"inspect" \| "note"` | `"note"` when `loupeIntent.tool` is `"note"`, else `"inspect"` | Chooses the tool that `autoOpen` arms. | `content.src.ts:48`, `packages/sdk/src/types.ts:113-118` |
| `captureScreenshot` | `(el: Element) => Promise<string \| undefined>` | `captureViaExtension` | Element screenshots come from real pixels. | `content.src.ts:49` |
| `captureRegion` | `(rect: RegionRect) => Promise<string \| undefined>` | `captureRegionViaExtension` | Region screenshots come from real pixels. | `content.src.ts:50` |

The content script sets no other option. These keep their SDK defaults: `bridge`, `label`,
`chat`, `environments`, `tabs`, `generate`, `onRequestAccess`, `captureRecording`, `headers`,
`timeZone`, `locale`, `packageVersion` and `credentials` (`packages/sdk/src/types.ts:108-199`). See
[init options](sdk.md#init-options) for those defaults.

## Capture overrides and redaction

| Function | Input | Output | Behavior | Source |
|---|---|---|---|---|
| `captureViaExtension` | `el: Element` | PNG data URL, or `undefined` | Sends `LOUPE_CAPTURE`. Returns `undefined` when the reply is `null`. Otherwise crops to `el.getBoundingClientRect()` scaled by `devicePixelRatio`. | `content.src.ts:55-64` |
| `captureRegionViaExtension` | `rect: { x, y, w, h }` in viewport coordinates | PNG data URL, or `undefined` | Same capture, cropped to the rectangle. | `content.src.ts:67-77` |
| `crop` | data URL, rect, device pixel ratio, redact rects | `image/png` data URL | Draws the crop onto a canvas of at least 1 × 1 device pixels, paints redacted rectangles, then encodes PNG. | `content.src.ts:79-100` |

**Redaction.** Before encoding, every element with the `data-loupe-redact` attribute has its
client rectangle painted over in solid `#0f0f14`. The original pixels of those areas are never
encoded, so they never upload (`content.src.ts:60-62`, `content.src.ts:90-94`).

```html
<div data-loupe-redact>Card ending 4242</div>
```

**Recording.** The extension does not override `captureRecording`. The Record tool uses the SDK's
default recorder, which is `getDisplayMedia` plus a canvas crop (`packages/sdk/src/app.ts:2404`,
`packages/sdk/src/types.ts:162-171`).

## Network

The extension makes no network requests of its own. `background.js`, `popup.js` and
`content.src.ts` contain no `fetch` call.

All requests come from the bundled SDK, inside the page:

| Mode | When | Requests | Source |
|---|---|---|---|
| Server | `apiBase` is set | `HttpAdapter` calls `<API_BASE>/v1/*`, for example `GET /v1/comments` and `POST /v1/blobs`, with headers `Content-Type`, `X-Loupe-User` and, when set, `X-Loupe-Hmac`. A trailing `/` on the base is removed. | `packages/sdk/src/app.ts:377`, `packages/sdk/src/http-adapter.ts:16-21` |
| Offline | `apiBase` is empty | None. Comments live in the page origin's `localStorage` under `loupe:<projectKey>:<url>`. Offline attachments are limited to 3,000,000 bytes. | `packages/sdk/src/app.ts:378`, `packages/sdk/src/store.ts:11-12`, `packages/sdk/src/store.ts:58` |

`<API_BASE>` is the value of the popup's **API base** field. For the full endpoint list, see
[HttpAdapter endpoints](sdk.md#httpadapter-endpoints).

## Build

| Setting | Value | Description | Source |
|---|---|---|---|
| Tool | `tsup` | `npm run build` in the package. | `package.json:13` |
| Root script | `npm run build:extension` | Builds the extension workspace from the repository root. | root `package.json:24` |
| `entry` | `{ content: "content.src.ts" }` | One entry. | `tsup.config.ts:6` |
| `format` | `["iife"]` | A classic script, so it runs as an injected content script. | `tsup.config.ts:7` |
| `platform` | `browser` | Bundles for the browser, not Node. | `tsup.config.ts:8` |
| `target` | `es2020` | Output syntax level is ES2020. | `tsup.config.ts:9` |
| `outDir` | `.` | Writes `content.js` into the package root. | `tsup.config.ts:10-11` |
| `sourcemap` | `false` | No source map is shipped. | `tsup.config.ts:12` |
| `clean` | `false` | The build never deletes `manifest.json`, `background.js` or `popup.*`. | `tsup.config.ts:13` |
| `dts` | `false` | No type declarations. | `tsup.config.ts:14` |
| Dependency | `@loupekit/sdk` `0.14.1` | Bundled into `content.js`. | `package.json:16` |

Build it from the repository root:

```bash
npm install
npm run build:extension
```

To check that the file exists, run:

```bash
ls -l packages/extension/content.js
```

You should see one line that lists `packages/extension/content.js` with today's date.

## Packaging and versioning

| Item | Value | Description | Source |
|---|---|---|---|
| Store package | `loupe-extension.zip` at the repository root | Made by hand. No script creates it, and it is gitignored. | `RELEASING.md:425-432`, root `.gitignore:19` |
| Upload | Chrome Web Store Developer Dashboard | Upload the zip there. | `RELEASING.md:434` |
| `manifest.json` `version` | edited by hand | Bump it in step with each release. | `RELEASING.md:113`, `RELEASING.md:416`, `manifest.json:4` |
| `package.json` `version` | edited by hand | `scripts/set-version.mjs` updates only `shared`, `sdk` and `mcp`, so it never touches the extension. | `RELEASING.md:111`, `scripts/set-version.mjs:29` |

Package the extension from the repository root, as `RELEASING.md` gives it:

```bash
npm run build:extension
(cd packages/extension && zip -r ../../loupe-extension.zip . -x "*.ts" "node_modules/*" "test/*")
```

You should see `loupe-extension.zip` in the repository root.

## Tests

`test/manifest.test.ts` is the only test for the extension. It runs with the root `npm test`.
There is no in-browser end-to-end test.

To run only the extension test, run this from the repository root:

```bash
npx vitest run packages/extension
```

You should see `Tests  4 passed (4)`. The root `vitest.config.ts` includes
`packages/**/test/**/*.test.ts` (`vitest.config.ts:5`).

| Test | Asserts | Source |
|---|---|---|
| is a valid MV3 manifest with least-privilege permissions | `manifest_version` is 3; all four permissions present; no `tabs`, no `<all_urls>`, no `host_permissions`. | `test/manifest.test.ts:9-18` |
| declares icons and references files that exist | The service worker, popup, `popup.js`, `content.src.ts` and the three icons exist. | `test/manifest.test.ts:20-26` |
| every context menu has a tool mapped for it (except the toggle) | Each `loupe-*` id in `background.js` other than `loupe-toggle` has an entry in the tool map. | `test/manifest.test.ts:28-38` |
| asks for no host permissions and no web-accessible resources | No `web_accessible_resources`, no `content_scripts`. | `test/manifest.test.ts:40-43` |

## Related

- [Use the browser extension](../how-to/browser-extension.md)
- [SDK reference](sdk.md)
- [Authentication and privacy](../explanation/auth-and-privacy.md)
- [Troubleshooting: extension](../troubleshooting.md#extension)
