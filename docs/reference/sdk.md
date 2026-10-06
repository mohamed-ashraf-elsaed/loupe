# @loupekit/sdk reference

This page lists every option, function, attribute, limit, storage key and network call of the
`@loupekit/sdk` browser widget, version 0.14.1. It is the canonical home of these facts; other
pages link here.

Each table has a **Source** column. It gives the file and line in the
[Loupe repository](https://github.com/mohamed-ashraf-elsaed/loupe) that defines the fact. All
paths are relative to `packages/sdk/src/` unless they start with `packages/`.

**Related pages:** to install the package with `npm install @loupekit/sdk`, see
[Install Loupe with npm](../how-to/install-npm.md). To load it from a `<script>` tag or the CDN
(`https://cdn.jsdelivr.net/npm/@loupekit/sdk@0.14.1/dist/index.global.js`), see
[Embed Loupe with a script tag](../how-to/embed-script-tag.md). To run a backend on your machine,
see [Run the local server](../how-to/run-local-server.md). For why `userHmac` is computed on your
server, see [Identity, access and privacy](../explanation/auth-and-privacy.md#why-userhmac-is-computed-on-the-server).

Terms used on this page:

- **Agent bridge**: a small HTTP server that `@loupekit/mcp` runs on `127.0.0.1`, port `9800` by
  default, so the widget and an AI agent can exchange presence, selections and chat. See
  [Local bridge](mcp.md#local-bridge).
- **Offline mode**: the widget runs with no `apiBase` and keeps comments in the browser's
  `localStorage`.
- **Project secret**: the server-side secret of a project. It signs `userHmac` and never reaches
  the browser. See [Authentication](server.md#authentication).
- **IIFE** (immediately invoked function expression): a script build that runs as soon as it
  loads and defines one global, here `Loupe`.
- **SSE** (server-sent events): a one-way stream from server to browser, opened with the
  browser's `EventSource`.

## Contents

1. [Builds](#builds)
2. [init options](#init-options)
3. [Functions](#functions) and [Constants](#constants)
4. [HTML attributes](#html-attributes)
5. [Keyboard](#keyboard)
6. [Limits](#limits)
7. [Storage adapters](#storage-adapters)
8. [Agent bridge calls](#agent-bridge-calls)
9. [Browser storage keys](#browser-storage-keys)
10. [Statuses and filters](#statuses-and-filters)
11. [Activity kinds emitted](#activity-kinds-emitted)
12. [Re-anchoring summary](#re-anchoring-summary)

## Builds

The package is built with tsup from one entry, `src/index.ts`. It has no runtime dependencies:
`@loupekit/shared` and `modern-screenshot` are bundled in.

### Artifacts

| File | Format | Description | Source |
|---|---|---|---|
| `dist/index.js` | ESM module | Import it with `import { init } from "@loupekit/sdk"`. The package `exports` points here. | `packages/sdk/tsup.config.ts:9`, `packages/sdk/package.json:11-18` |
| `dist/index.global.js` | IIFE script | Load it with a `<script>` tag. It defines the global `Loupe`. | `packages/sdk/tsup.config.ts:9-10` |
| `dist/*.map` | source map | One beside each build. | `packages/sdk/tsup.config.ts:18` |

### Build settings

| Setting | Type | Value | Description | Source |
|---|---|---|---|---|
| Target | string | `es2020` | JavaScript level of both builds. Platform is `browser`. | `packages/sdk/tsup.config.ts:11-12` |
| `noExternal` | regex | `/.*/` | Bundles every import. | `packages/sdk/tsup.config.ts:17` |
| `sourcemap` | boolean | `true` | Writes the `.map` files. | `packages/sdk/tsup.config.ts:18` |
| `minify` | boolean | `false` | The builds are not minified. | `packages/sdk/tsup.config.ts:21` |
| `dts` | boolean | `false` | No `.d.ts` type declarations are built. | `packages/sdk/tsup.config.ts:20` |
| `__LOUPE_VERSION__` | string | the `package.json` version | Baked into the bundle. Read it as `version` (see [Constants](#constants)). | `packages/sdk/tsup.config.ts:15`, `app.ts:70` |

### TypeScript

The package ships no type declarations. `packages/sdk/package.json:13` and `:16` still declare
`"types": "./dist/index.d.ts"`, but that file is not built (`dts: false`), so it does not exist in
the published `dist/`. In a TypeScript project, an import of `@loupekit/sdk` makes the compiler
report that it cannot find a declaration file for the module (TS7016 when `noImplicitAny` is on).
To use the package anyway, add a declaration file to your project, for example
`src/loupe.d.ts`:

```ts
declare module "@loupekit/sdk";
```

The imports are then typed as `any`.

## init options

`init(config: LoupeConfig)` takes these fields. Only `projectKey` and `user` are required.

| Name | Type | Default | Description | Source |
|---|---|---|---|---|
| `projectKey` | `string` | required | Public project key issued by the backend. `init` logs `[loupe] init requires a projectKey` and returns when it is missing. | `types.ts:94`, `index.ts:25` |
| `user` | `{ id: string; name: string; email?: string }` | required | The user your app has already signed in. `init` logs `[loupe] init requires user.id` and returns when `user.id` is missing. | `types.ts:96`, `index.ts:26` |
| `userHmac` | `string` | unset | HMAC-SHA256 of `user.id` keyed with the project secret, computed on your server. When set, the SDK sends it as the `X-Loupe-Hmac` header. Whether writes require it depends on the backend: the local `@loupekit/server` rejects a user request without a valid HMAC (`packages/server/auth.ts:37-42`). | `types.ts:101`, `http-adapter.ts:21` |
| `bridge` | `string` | unset | Base URL of the agent bridge run by `@loupekit/mcp`, for example `http://127.0.0.1:9800` with the default `LOUPE_BRIDGE_PORT`. Without it the peer list is hidden, and presence, live thread updates and chat are off. | `types.ts:108`, `packages/mcp/index.ts:74`, `packages/mcp/src/bridge/http-bridge.ts:110` |
| `apiBase` | `string` | unset | Backend base URL. When set, the SDK uses `HttpAdapter`. When unset, the widget runs in offline mode and comments stay in `localStorage`. | `types.ts:110`, `app.ts:376-378` |
| `autoOpen` | `boolean` | `false` | Opens the panel and arms the tool named by `tool` on start. | `types.ts:112`, `app.ts:393`, `app.ts:417` |
| `tool` | `"inspect" \| "note"` | `"inspect"` | Which tool `autoOpen` arms. `"note"` arms the free page-note tool. | `types.ts:118`, `app.ts:417` |
| `label` | `string` | `"Loupe"` | Brand label in the panel header. | `types.ts:120` |
| `chat` | `boolean` | `false` | Experimental Chat tab. When off, the tab is dimmed with the title "Chat — coming soon" and cannot be opened. | `types.ts:126`, `app.ts:384`, `app.ts:698` |
| `environments` | `string[]` | unset | Starting list of environment URLs for the project popover. Once the user edits the list, the browser copy is used. | `types.ts:132` |
| `tabs` | `LoupeTab[]` | unset | Extra sidebar tabs, shown after the built-in tabs. See [LoupeTab](#loupetab). | `types.ts:138`, `types.ts:81-90` |
| `generate` | `(req: GenerateRequest) => Promise<{ html: string; css?: string; notes?: string }>` | unset | Produces a change for a comment. When set, the comment detail shows a preview pane. When unset, the pane offers "Request access to generate". See [GenerateRequest](#generaterequest). | `types.ts:144`, `types.ts:38-42` |
| `onRequestAccess` | `(req: { capability: "generate"; user; projectKey }) => void \| Promise<void>` | unset | Called when a user asks for access to `generate`. | `types.ts:149`, `types.ts:45-49` |
| `captureScreenshot` | `(el: Element) => Promise<string \| undefined>` | built-in DOM capture | Replaces element screenshots. Return a data URL. | `types.ts:155` |
| `captureRegion` | `(rect: RegionRect) => Promise<string \| undefined>` | built-in DOM capture | Replaces region screenshots. `rect` is in viewport coordinates. | `types.ts:161` |
| `captureRecording` | `(rect: RegionRect, opts?: { maxMs?: number; register?: (stop: () => void) => void }) => Promise<string \| undefined>` | built-in `getDisplayMedia` recorder | Replaces region recording. `maxMs` is the duration cap. Call `register(stop)` to wire the Stop button. Return a webm data URL. | `types.ts:168-171`, `app.ts:2410` |
| `headers` | `Record<string, string>` | unset | Merged into every backend request, for example `{ "X-CSRF-TOKEN": "<TOKEN>" }`. | `types.ts:177`, `http-adapter.ts:22` |
| `timeZone` | `string` (IANA zone) | the browser's zone | Zone for every absolute timestamp in the panel. If `timeZone` or `locale` is invalid, the panel uses the browser's zone and locale together and logs one warning that starts `[loupe] unusable timeZone/locale`. | `types.ts:184`, `app.ts:4786-4793` |
| `locale` | `string` (BCP 47) | the browser's locale | Locale for dates, for example `"en-GB"`. An invalid value triggers the same fallback as `timeZone`. | `types.ts:186`, `app.ts:4786-4793` |
| `packageVersion` | `string` | unset | Version of the host package that serves the bundle. Shown next to the SDK version in the Settings menu only when it differs from the SDK build, flagged with a tooltip telling you to re-publish the assets. | `types.ts:193`, `app.ts:4706-4712` |
| `credentials` | `RequestCredentials` | browser default | `credentials` mode for every backend request. Use `"include"` for cross-origin cookie auth. | `types.ts:199`, `http-adapter.ts:28` |

### LoupeTab

| Name | Type | Default | Description | Source |
|---|---|---|---|---|
| `id` | `string` | required | Stable id. It is persisted as the open tab. | `types.ts:83` |
| `label` | `string` | required | Tab strip label. | `types.ts:85` |
| `render` | `(ctx: LoupeTabContext) => HTMLElement \| string` | required | Builds the tab body once, when the panel is built. | `types.ts:87` |
| `hint` | `{ title: string; body: string }` | unset | One-time hint card. | `types.ts:89` |

`LoupeTabContext` fields:

| Name | Type | Default | Description | Source |
|---|---|---|---|---|
| `projectKey` | `string` | — | The project the panel is bound to. | `types.ts:57` |
| `apiBase` | `string \| undefined` | — | Backend URL, when online. | `types.ts:59` |
| `user` | `LoupeUser` | — | The current user. | `types.ts:61` |
| `comments` | `Comment[]` | — | Comments for the current page. | `types.ts:63` |
| `url` | `string` | — | Current page, path and query. | `types.ts:65` |
| `version` | `string` | — | The running SDK build. | `types.ts:67` |
| `track` | `(event: ActivityEventInput) => void` | — | Pushes an event into the Activity feed. | `types.ts:69` |
| `open` | `(tabId: string) => void` | — | Switches to another tab. | `types.ts:71` |
| `close` | `() => void` | — | Closes the panel. | `types.ts:73` |

### GenerateRequest

| Name | Type | Default | Description | Source |
|---|---|---|---|---|
| `comment` | `Comment` | — | The thread being worked on. | `types.ts:28` |
| `prompt` | `string` | — | The original request on the first pass, the follow-up after that. | `types.ts:30` |
| `kind` | `"generate" \| "refine" \| "revise"` | — | The iteration kind. | `types.ts:31`, `packages/shared/src/iteration.ts` |
| `previous` | `Iteration` | unset | The iteration being refined. | `types.ts:33` |
| `localAi` | `{ url: string; model: string }` | unset | Local AI settings, when the user saved them. | `types.ts:35`, `types.ts:15-20` |

### Example

```html
<script src="https://<YOUR_HOST>/sdk/index.global.js"></script>
<script>
  Loupe.init({
    projectKey: "<PROJECT_KEY>",
    user: { id: "<USER_ID>", name: "Sara", email: "sara@acme.com" },
    userHmac: "<USER_HMAC>",
    apiBase: "https://<YOUR_HOST>",
    timeZone: "Europe/London",
  });
</script>
```

- `<YOUR_HOST>`: the origin of the local `@loupekit/server`, which serves the IIFE build at
  `/sdk/index.global.js` and the Loupe API on the same origin (`packages/server/index.ts:34`).
  Other hosts use other script paths: the Laravel package serves `vendor/loupe/sdk/loupe.js`
  (`packages/laravel/src/LoupeServiceProvider.php:165`), and the CDN build is at
  `https://cdn.jsdelivr.net/npm/@loupekit/sdk@0.14.1/dist/index.global.js`. The script and
  `apiBase` can be on different origins.
- `<PROJECT_KEY>`: the public project key, for example `pk_demo_acme` on the local demo server.
- `<USER_ID>`: the signed-in user's id in your app.
- `<USER_HMAC>`: HMAC-SHA256 of `<USER_ID>` keyed with the project secret, computed on your server.

## Functions

All functions are named exports of `@loupekit/sdk` and properties of the global `Loupe` in the
IIFE build. Every function except `init` and `connectTab` does nothing before `init` has run.

| Name | Type | Default | Description | Source |
|---|---|---|---|---|
| `init` | `(config: LoupeConfig) => void` | — | Starts the widget. A second call does nothing. If the document is still loading, it starts on `DOMContentLoaded`. | `index.ts:23-32` |
| `destroy` | `() => void` | — | Removes the widget and all listeners. `init` can run again afterwards. | `index.ts:35-38` |
| `trackActivity` | `(event: ActivityEventInput) => void` | — | Adds one event to the Activity tab. | `index.ts:47-49` |
| `setActivityStatus` | `(status: "idle" \| "working" \| "error") => void` | — | Sets the Activity status dot. | `index.ts:52-54` |
| `clearActivity` | `() => void` | — | Empties the Activity tab. | `index.ts:57-59` |
| `requestNavigation` | `(url: string, opts?: { reason?: string; requester?: string }) => void` | — | Shows a consent card with "Stay here" and "Go there". The page navigates only when the user grants it. Only absolute `http`/`https` URLs are accepted, and a new request replaces a pending one. | `index.ts:66-68`, `packages/shared/src/consent.ts:45-75` |
| `setLocalAi` | `(config: { url: string; model: string } \| null) => void` | — | Stores the local AI endpoint passed to `generate`. | `index.ts:71-73` |
| `openTool` | `(tool: "inspect" \| "note") => void` | — | Arms a tool from outside the panel. | `index.ts:76-78` |
| `showLauncher` | `() => void` | — | Shows a hidden launcher. | `index.ts:84-86` |
| `hideLauncher` | `() => void` | — | Hides the launcher. The choice persists per browser. | `index.ts:89-91` |
| `connectTab` | `() => LoupeTab` | — | Returns a tab with id `connect`, label "Connect" and hint "Hand it to Claude". It renders an `mcpServers` JSON block for `npx -y @loupekit/mcp`, using `apiBase`, or `http://localhost:8787` when `apiBase` is unset. | `index.ts:4`, `connect.ts:17-39`, `connect.ts:26` |

## Constants

| Name | Type | Default | Description | Source |
|---|---|---|---|---|
| `version` | `string` | `"dev"` from source | The bundle's baked-in version. A named export, and `Loupe.version` in the IIFE build. Available before `init`. | `index.ts:5-6`, `app.ts:70` |

Example: add the Connect tab. In a TypeScript project, add the declaration from
[TypeScript](#typescript) first.

```ts
import { init, connectTab } from "@loupekit/sdk";

init({
  projectKey: "<PROJECT_KEY>",
  user: { id: "<USER_ID>", name: "Sara" },
  tabs: [connectTab()],
});
```

## HTML attributes

| Name | Type | Default | Description | Source |
|---|---|---|---|---|
| `data-loupe-redact` | boolean attribute | absent | Element screenshots leave the element out. Region screenshots paint its rectangle solid `#0f0f14`. | `capture.ts:54`, `capture.ts:106`, `capture.ts:269` |
| `data-testid` | string | absent | Preferred stable anchor for re-anchoring and for the target selector shown in the list. | `fingerprint.ts:44`, `fingerprint.ts:136`, `fingerprint.ts:169`, `app.ts:4974` |
| `data-test` | string | absent | Read when `data-testid` is absent. | `fingerprint.ts:44`, `fingerprint.ts:169` |

## Keyboard

| Name | Type | Default | Description | Source |
|---|---|---|---|---|
| Alt+Shift+L | global shortcut | on | Shows or hides the launcher. Matched on `e.code === "KeyL"` or the key `l`, so it works on non-US layouts. Ctrl and Meta must not be held. | `app.ts:76`, `app.ts:2209-2215` |
| Escape | key | on | With a tool armed: cancels the drag, disarms the tool and closes the composer. With a menu open: closes it. | `app.ts:2199-2201`, `app.ts:2228-2229` |
| Enter | key in the reply box | on | Sends the reply. | `app.ts:4252` |
| Shift+Enter | key in the reply box | on | Inserts a newline. | `app.ts:4252` |

## Limits

| Name | Type | Default | Description | Source |
|---|---|---|---|---|
| Files per comment | count | 10 | Error text: "Up to 10 files." | `app.ts:147`, `app.ts:2565` |
| Non-video attachment size | bytes | 10 MB (10 × 1024 × 1024) | Applies to every file whose MIME type does not start with `video/`. Larger files are refused with "`<FILE_NAME>` is too large." | `app.ts:150`, `app.ts:2566-2567`, `capture.ts:164-166` |
| Video attachment size | bytes | 25 MB (25 × 1024 × 1024) | Larger files are refused with the same text. | `app.ts:151`, `app.ts:2566-2567` |
| Recording length | ms | 20000 | A recording stops at this cap. | `app.ts:145`, `capture.ts:200` |
| Sync poll | ms | 10000 | Re-reads comments, open threads and mentions. | `app.ts:149`, `app.ts:468` |
| Offline attachment size | bytes | 3,000,000 | Error text: "attachment too large for offline mode". | `store.ts:58` |
| Capture timeout | ms | 6000 | Screenshot capture gives up after this. Fonts get up to 800 ms. | `capture.ts:24`, `capture.ts:43` |
| Element context HTML | characters | 6000 | `outerHTML` is cut at this length. | `capture.ts:13` |
| Activity buffer | events | 500 | Older events are dropped. | `app.ts:1285` |
| Mobile breakpoint | px | 640 | At or below this width the panel is a bottom sheet and does not push the page. | `app.ts:3145`, `styles.ts:1105` |
| Local AI test timeout | ms | 4000 | "Test connection" calls `GET {url}/v1/models`. | `app.ts:3988-3990` |

## Storage adapters

The SDK picks `HttpAdapter` when `apiBase` is set and `LocalStorageAdapter` otherwise
(`app.ts:376-378`).

### HttpAdapter headers

| Name | Type | Default | Description | Source |
|---|---|---|---|---|
| `Content-Type` | header | `application/json` | Sent on every request. | `http-adapter.ts:20` |
| `X-Loupe-User` | header | `user.id` | Sent on every request. | `http-adapter.ts:20` |
| `X-Loupe-Hmac` | header | unset | Sent only when `userHmac` is set. | `http-adapter.ts:21` |
| `headers` option | headers | unset | Merged last, so it can override the headers above. | `http-adapter.ts:22` |
| `credentials` option | fetch option | unset | Applied to every request when set. | `http-adapter.ts:28` |

A trailing `/` on `apiBase` is removed (`http-adapter.ts:16`).

### HttpAdapter endpoints

| Name | Type | Default | Description | Source |
|---|---|---|---|---|
| `list` | `GET /v1/comments?projectKey&url` | — | Returns `Comment[]` for one page. | `http-adapter.ts:31-36` |
| `listAll` | `GET /v1/comments?projectKey` | — | Returns `Comment[]` for every page. | `http-adapter.ts:39-44` |
| upload of capture media | `POST /v1/blobs` `{ projectKey, data }` | — | Returns `{ url }`. `save` uploads `screenshot` and `recording` data URLs first. On failure the data URL is kept inline. | `http-adapter.ts:47-69` |
| `save` | `POST /v1/comments` | — | Body is the `Comment`. | `http-adapter.ts:70-76` |
| `upload` | `POST /v1/blobs` | — | Returns an `Attachment` `{ url, name, mime, kind, size }`. | `http-adapter.ts:80-89` |
| `listMessages` | `GET /v1/comments/:id/messages` | — | Replies, oldest first. | `http-adapter.ts:92-96` |
| `addMessage` | `POST /v1/comments/:id/messages` `{ author, body, attachments }` | — | Returns the message plus `mentions` and `unknownMentions`. | `http-adapter.ts:98-109` |
| `listReactions` | `GET /v1/comments/:id/reactions` | — | Returns `{ reactions }`. A 404 gives `[]`. | `http-adapter.ts:111-119` |
| `toggleReaction` | `POST /v1/comments/:id/messages/:mid/reactions` `{ emoji, userId, userName }` | — | Returns `{ reactions }`, the full new set. | `http-adapter.ts:121-132` |
| `listPeople` | `GET /v1/people?projectKey` | — | People you can mention. | `http-adapter.ts:135-140` |
| `listNotifications` | `GET /v1/notifications?projectKey&recipient` | — | Returns `{ notifications }`. | `http-adapter.ts:142-147` |
| `markNotificationsRead` | `POST /v1/notifications/read` `{ projectKey, recipient, id }` | — | Omit `id` to mark all. | `http-adapter.ts:149-155` |
| `update` | `PATCH /v1/comments/:id` | — | Body is a partial `Comment`. | `http-adapter.ts:157-164` |
| `getOrg` | `GET /v1/org` | — | A 404 gives `null`. The answer must have `project` and a `projects` array. | `http-adapter.ts:167-177` |
| `listActivity` | `GET /v1/activity?projectKey&since` | — | A 404 gives `null`. The answer must be an array. | `http-adapter.ts:180-189` |
| `remove` | `DELETE /v1/comments/:id` | — | A 404 is ignored. | `http-adapter.ts:191-197` |

### LocalStorageAdapter keys

| Name | Type | Default | Description | Source |
|---|---|---|---|---|
| `loupe:{projectKey}:{url}` | JSON `Comment[]` | — | Comments for one page. | `store.ts:11-13` |
| `loupe:msgs:{threadId}` | JSON `ThreadMessage[]` | — | Replies on one thread. | `store.ts:92-94` |
| `loupe:rxn:{threadId}` | JSON `Reaction[]` | — | Reactions on one thread. | `store.ts:127`, `store.ts:141` |

Offline mode derives people from comment authors, has no notifications, and returns `null` from
`getOrg` and `listActivity` (`store.ts:146-199`).

### StorageAdapter interface

This is the internal contract that `HttpAdapter` and `LocalStorageAdapter` both implement. You
cannot pass your own adapter: `LoupeConfig` has no adapter field, `init` always picks one of the
two built-in adapters (`app.ts:376-378`), and the package does not export the `StorageAdapter`
type (`index.ts:7-13`). The table tells you what any backend behind `HttpAdapter` must answer.

| Name | Type | Default | Description | Source |
|---|---|---|---|---|
| `list` | `(projectKey, url) => Promise<Comment[]>` | required | One page's comments. | `types.ts:203` |
| `listAll` | `(projectKey) => Promise<Comment[]>` | required | Every page's comments, newest first. | `types.ts:208` |
| `save` | `(comment) => Promise<Comment>` | required | Stores a new comment. | `types.ts:209` |
| `update` | `(id, patch) => Promise<void>` | required | Applies a partial update. | `types.ts:210` |
| `remove` | `(id) => Promise<void>` | required | Deletes a comment. | `types.ts:211` |
| `upload` | `(projectKey, file) => Promise<Attachment>` | required | Stores one attached file. | `types.ts:216` |
| `listMessages` | `(threadId) => Promise<ThreadMessage[]>` | required | Replies, oldest first. | `types.ts:218` |
| `addMessage` | `(threadId, { author, body, attachments? }) => Promise<ThreadMessage & { mentions?; unknownMentions? }>` | required | Posts a reply. | `types.ts:224-227` |
| `listPeople` | `(projectKey) => Promise<{ id; name; email? }[]>` | required | Mention candidates. | `types.ts:229` |
| `listNotifications` | `(projectKey, recipient) => Promise<{ id; threadId; kind; body; actorName?; createdAt; readAt? }[]>` | required | In-app notifications. | `types.ts:231` |
| `markNotificationsRead` | `(projectKey, recipient, id?) => Promise<void>` | required | Marks one or all as read. | `types.ts:232` |
| `listReactions` | `(threadId) => Promise<Reaction[]>` | required | Every reaction on a thread. | `types.ts:234` |
| `toggleReaction` | `({ threadId, messageId, emoji, userId, userName? }) => Promise<Reaction[]>` | required | Toggles one reaction and returns the new set. | `types.ts:236` |
| `getOrg` | `() => Promise<OrgInfo \| null>` | optional | Organization and sibling projects. | `types.ts:241` |
| `listActivity` | `(projectKey, since?) => Promise<ActivityEvent[] \| null>` | optional | Server activity feed. `null` shows "Monitor unavailable". | `types.ts:246` |

## Agent bridge calls

The SDK makes these calls only when `bridge` is set. They go to the bridge run by
`@loupekit/mcp`, not to `apiBase`.

| Name | Type | Default | Description | Source |
|---|---|---|---|---|
| Join presence | `POST {bridge}/presence` `{ url, userId, name }` | — | Returns the peer id. | `app.ts:4384-4390` |
| Heartbeat | `POST {bridge}/presence/:id/heartbeat` | every 6000 ms | A 404 makes the SDK join again. Peers expire after 20000 ms. | `app.ts:4393-4396`, `packages/shared/src/presence.ts:26-28` |
| List peers | `GET {bridge}/presence?url&viewer` | — | Peers on the current page. | `app.ts:4398-4400` |
| Leave | `DELETE {bridge}/presence/:id` | — | Sent with `keepalive`. | `app.ts:4436` |
| Thread updates | SSE `{bridge}/thread-updates`, event `thread` `{ threadId }` | — | Refreshes an open thread. | `app.ts:4458-4465` |
| Chat reply stream | SSE `{bridge}/events`, event `companion` (`eventType: "reply"`) | — | Chat only. Not opened when the browser has no `EventSource`. | `app.ts:1176-1184` |
| Latest selection | `GET {bridge}/selection/latest` | — | Chat only. | `app.ts:1015` |
| Send chat message | `POST {bridge}/companion` `{ body, author, contexts, attachments, ... }` | — | Chat only. | `app.ts:1061-1070` |
| Poll chat replies | `GET {bridge}/companion?since=` | 5000 ms beside the SSE stream; 4000 ms if opening the stream throws | Chat only. | `app.ts:1189-1192`, `app.ts:1203` |

## Browser storage keys

| Name | Type | Default | Description | Source |
|---|---|---|---|---|
| `loupe:dock` | JSON object | absent | Panel state. Fields: `mode`, `open`, `theme`, `tab`, `float`, `markersHidden`, `launcherHidden`, `fab`, `scope`, `statFilter`, `statusFilter`, `sortOrder`, `accent`, `minimized`, `hoverHints`, `showPaths`, `tourDone`, `hintsSeen`. | `app.ts:3149-3170`, `app.ts:3176-3181` |
| `loupe:project:{projectKey}` | JSON object | absent | Project popover settings for this browser: environments and local AI. | `app.ts:1874`, `app.ts:1891` |
| `loupe:{projectKey}:{url}`, `loupe:msgs:{threadId}`, `loupe:rxn:{threadId}` | JSON arrays | absent | Offline data. See [LocalStorageAdapter keys](#localstorageadapter-keys). | `store.ts:12`, `store.ts:93`, `store.ts:127` |

The Settings menu (the gear in the panel header) writes the `accent`, `hoverHints`,
`markersHidden`, `showPaths` and `launcherHidden` fields of `loupe:dock`.

![Settings menu with accent dots, the Hover hints, Markers, Page paths and Launcher switches, and the version line](../images/sdk-settings.png)

Day-group collapse is not stored; it lasts for the session only (`app.ts:294-295`).

## Statuses and filters

| Name | Type | Default | Description | Source |
|---|---|---|---|---|
| Tool modes | `"off" \| "inspect" \| "region" \| "free" \| "record"` | `"off"` | `free` is the Note tool. | `app.ts:78` |
| Dock modes | `"left" \| "right" \| "bottom" \| "float"` | — | Position menu choices. | `app.ts:120`, `app.ts:143` |
| Built-in tabs | `home`, `comments`, `activity`, `chat` | `home` | Four tabs. `chat` is dimmed unless `chat: true`. Host `tabs` follow them. | `app.ts:122-128`, `app.ts:282` |
| Scope | `"page" \| "all"` | `"page"` | This page, or every page of the project. | `app.ts:132`, `app.ts:284` |
| Stat filter | `"" \| "open" \| "needs_you" \| "resolved" \| "stale"` | `""` | Set by clicking a Home tile. **Stale** means not resolved and created more than 7 days ago. | `app.ts:134`, `app.ts:1544-1559` |
| Sort | `"" \| "newest" \| "oldest" \| "page"` | `""` | `""` means page order on This page and newest first on All. | `app.ts:136` |
| Status filter | stage or `""` | `""` | One of `queue`, `todo`, `in_progress`, `in_review`, `resolved`. | `app.ts:292`, `packages/shared/src/index.ts:27` |
| Device | `"mobile" \| "tablet" \| "desktop"` | — | Under 768 px is mobile, under 1024 px is tablet, otherwise desktop. | `packages/shared/src/index.ts:234-239` |
| Day groups | label | — | "Today", "Yesterday", "N days ago" (under 7), then a date. "Earlier" when the date cannot be parsed. | `app.ts:4819-4829` |

## Activity kinds emitted

The widget adds these `kind` values to the Activity tab. `trackActivity` can add any other kind.

| Name | Type | Default | Description | Source |
|---|---|---|---|---|
| `comment.create` | info | — | A comment was saved. | `app.ts:2733` |
| `comment.resolve`, `comment.reopen` | info | — | A comment was resolved or reopened. | `app.ts:3599` |
| `comment.delete` | warn | — | A comment was deleted. | `app.ts:3612-3615` |
| `review.approve` | info | — | A change was approved. | `app.ts:3640` |
| `generate.generate`, `generate.refine`, `generate.revise` | info | — | A `generate` call returned. | `app.ts:3922` |
| `generate.error` | error | — | A `generate` call failed. | `app.ts:3929` |
| `generate.undo` | info | — | A generated change was undone. | `app.ts:3796` |
| `access.request` | warn | — | The user asked for access to generate. | `app.ts:3763-3764` |
| `nav.request` | warn | — | Navigation consent was asked. | `app.ts:3953-3957` |
| `nav.deny`, `nav.grant` | info | — | Navigation consent was declined or granted. | `app.ts:4038`, `app.ts:4044` |
| `message.create` | info | — | A reply or chat message was sent. | `app.ts:1080`, `app.ts:4584` |
| `voice.error` | error | — | Dictation failed. | `app.ts:4099` |
| `error` | error | — | A chat message or attachment failed. | `app.ts:1084`, `app.ts:4285` |
| `agent.reply` | info | — | The agent replied in chat. | `app.ts:1225` |

## Re-anchoring summary

Each comment stores an anchor: tag, CSS path, XPath, a stable id (`data-testid`, `data-test` or
a stable `id`), text up to 120 characters, selected attributes up to 200 characters each,
`nthOfType`, rectangle and viewport (`fingerprint.ts:5-31`). To find the element again:

1. A unique `data-testid`, `data-test` or `id` match scores 0.98 (`fingerprint.ts:43-47`).
2. A CSS path rooted at an id or test id, with the same tag, scores 0.9 (`fingerprint.ts:54-57`).
3. Otherwise candidates are scored with weights tag 0.12, text 0.34, attrs 0.22, testid 0.22,
   cssPath 0.2 and position 0.1 (`fingerprint.ts:10`). The cssPath and XPath hits and every
   element with the same tag are scored (`fingerprint.ts:67-69`). When the anchor has text,
   elements with identical text are added until the candidate set passes 4000
   (`fingerprint.ts:72-76`).

A score below 0.5 detaches the pin and the list shows a "moved" badge (`fingerprint.ts:8`, `app.ts:3434`).
Framework ids are not treated as stable: ids longer than 40 characters, ids starting with
`ember`, `react`, `radix`, `headlessui` or `:r` (case-insensitive), or ids containing `:`
(`fingerprint.ts:176-180`). Hidden elements are skipped in browsers that support
`Element.checkVisibility` (`fingerprint.ts:197-205`).

Since 0.11.1 a region anchors to the smallest ancestor that covers at least 60% of it
(`app.ts:5009-5024`).

For the design behind this, see
[Re-anchoring](../ARCHITECTURE.md#re-anchoring).
