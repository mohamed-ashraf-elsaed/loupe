# Install Loupe with npm in a bundled app

This guide shows you how to add the Loupe feedback widget to a front-end app that uses a bundler such as Vite or webpack, with any UI library (React, Vue, Svelte) or none. You install the `@loupekit/sdk` package, start the widget once when your app loads, and pass it the signed-in user.

The *widget* is the launcher button and side panel that Loupe draws on top of your page. It draws into a separate DOM tree attached to the page (a shadow root), so your app's CSS does not affect it.

If you do not use a bundler, see [Add Loupe to a page with a script tag](embed-script-tag.md) instead.

## Contents

- [Prerequisites](#prerequisites)
- [Steps](#steps)
  - [1. Install the package](#1-install-the-package)
  - [2. Add a type declaration if you use TypeScript](#2-add-a-type-declaration-if-you-use-typescript)
  - [3. Start the widget once](#3-start-the-widget-once)
  - [4. Place the call in your framework](#4-place-the-call-in-your-framework)
  - [5. Connect a backend and pass the signed-in user](#5-connect-a-backend-and-pass-the-signed-in-user)
  - [6. Add optional settings](#6-add-optional-settings)
- [Verify](#verify)
- [Troubleshooting](#troubleshooting)
- [Next steps](#next-steps)

## Prerequisites

- Node.js and npm. To check that both are installed, run:

  ```bash
  node --version && npm --version
  ```

  You should see two version numbers, one per line. The SDK does not declare a minimum Node.js version; use one that your bundler supports. The SDK's browser code targets ES2020.

- A front-end project that uses a bundler which understands ES modules. The package is ESM only (`"type": "module"`).
- A Loupe backend, if you want comments to be shared with your team. Set one up with either guide:
  - [Run the local server and dashboard](run-local-server.md). Its seed script gives you a project key, `pk_demo_acme`, and a project secret, `sk_demo_acme_0f3b9c` (or the value of `LOUPE_DEMO_SECRET` if you set it).
  - [Install Loupe in a Laravel app](laravel-install.md).

  Without a backend, the widget still works in *offline mode*: it keeps comments in the browser's `localStorage` only.
- The project's *secret*, if you use a backend. The secret is the private key of a Loupe project (the local server also calls it the project's admin key). Keep it on your server. You use it in step 5 to sign the user id.

## Steps

### 1. Install the package

Run this command in your project's root folder:

```bash
npm i @loupekit/sdk@0.14.1
```

You should see npm report `added 1 package`. The SDK bundles its own dependencies, so it adds nothing else to `node_modules`.

This command pins the version. A plain `npm i @loupekit/sdk` installs whatever the npm `latest` tag points to, and that tag can lag behind the newest release. To see where each tag points, run `npm view @loupekit/sdk dist-tags`.

### 2. Add a type declaration if you use TypeScript

Skip this step if your project is plain JavaScript.

The 0.14.1 package ships JavaScript only. Its `package.json` names a `types` file that the build does not produce. With `strict` or `noImplicitAny` on, TypeScript stops at the first import with error TS7016, `Could not find a declaration file for module '@loupekit/sdk'`.

1. Create the file `src/loupe.d.ts` with this content:

   ```ts
   declare module "@loupekit/sdk";
   ```

2. Run the type checker:

   ```bash
   npx tsc --noEmit
   ```

   You should see no TS7016 error for `@loupekit/sdk`. Imports from the package are typed `any`.

### 3. Start the widget once

Import `init` and call it with the smallest working configuration. This configuration has no `apiBase`, so the widget runs in offline mode. You add the backend in step 5.

```ts
import { init } from "@loupekit/sdk";

init({
  projectKey: "<PROJECT_KEY>",
  user: { id: "<USER_ID>", name: "<USER_NAME>" },
});
```

Replace the placeholders:

| Placeholder | What to put there | Required | Example |
|---|---|---|---|
| `<PROJECT_KEY>` | The public project key from your Loupe backend. In offline mode, any non-empty string works. | Yes | `pk_demo_acme` |
| `<USER_ID>` | A stable id for the signed-in user. | Yes | `u_92` |
| `<USER_NAME>` | The name shown on the user's comments. | Yes | `Sara` |

The `user` object also takes an optional `email` field, for example `{ id: "u_92", name: "Sara", email: "sara@acme.com" }`.

`init` checks two things before it starts. Without `projectKey`, it logs `[loupe] init requires a projectKey` and returns. Without `user.id`, it logs `[loupe] init requires user.id` and returns.

### 4. Place the call in your framework

The SDK has no React, Vue, or Svelte adapter. It is one global widget for the whole page, controlled by two functions:

- `init()` is idempotent. A second call while the widget is running does nothing.
- `destroy()` removes the widget, clears its polling timers, disconnects its DOM observer, removes its resize, pointer, and keyboard listeners, and resets the page margins the docked panel set.

`destroy()` does not remove the SDK's navigation listeners or restore `history.pushState` and `history.replaceState`. These stay in place until the page reloads.

So call `init()` once where your app starts, and call `destroy()` only when you want the widget gone.

You do not need a router hook. The SDK listens for `popstate` and wraps `history.pushState` and `history.replaceState`, so it reloads the comments for each page when your router changes the URL.

Pick the block that matches your app.

**React.** Call `init` in an effect in your root component, and return `destroy` as the cleanup:

```tsx
import { useEffect } from "react";
import { init, destroy } from "@loupekit/sdk";

export function App() {
  useEffect(() => {
    init({
      projectKey: "<PROJECT_KEY>",
      user: { id: "<USER_ID>", name: "<USER_NAME>" },
    });
    return () => destroy();
  }, []);

  return <main>{/* your app */}</main>;
}
```

In React's development Strict Mode the effect runs, cleans up, and runs again. The second `init()` starts a new widget, so you see one launcher. Because `destroy()` leaves the navigation listeners in place, the first widget also keeps reloading its comment list on each route change in development. Production builds run the effect once.

**Vue 3.** Call `init` in `onMounted` and `destroy` in `onBeforeUnmount` in your root component:

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount } from "vue";
import { init, destroy } from "@loupekit/sdk";

onMounted(() => {
  init({
    projectKey: "<PROJECT_KEY>",
    user: { id: "<USER_ID>", name: "<USER_NAME>" },
  });
});

onBeforeUnmount(() => destroy());
</script>

<template>
  <RouterView />
</template>
```

**Any other single-page app** (Svelte, Solid, plain TypeScript). Call `init` in your entry file, after you mount the app:

```ts
// src/main.ts
import { init } from "@loupekit/sdk";

// ...mount your app here...

init({
  projectKey: "<PROJECT_KEY>",
  user: { id: "<USER_ID>", name: "<USER_NAME>" },
});
```

If `init` runs while the document is still loading, the SDK waits for `DOMContentLoaded` before it draws anything.

Start your dev server and open the app. You should see the round Loupe launcher button on the page.

### 5. Connect a backend and pass the signed-in user

Skip this step if you only want offline mode.

When you set `apiBase`, the backend accepts a request only if the user id comes with a matching HMAC. Without `userHmac`, every request returns `401`. The *HMAC* is `HMAC-SHA256(user.id, PROJECT_SECRET)` as a lowercase hex string. Compute it on your server, because the project secret must never reach the browser.

1. On your server, add a route that returns the signed-in user and their HMAC. This example uses Express and `node:crypto`:

   ```ts
   import express from "express";
   import { createHmac } from "node:crypto";

   const app = express();

   app.get("/api/feedback-identity", (req, res) => {
     const user = getSignedInUser(req); // <GET_SIGNED_IN_USER>: your session lookup
     if (!user) return res.sendStatus(401);

     const userHmac = createHmac("sha256", process.env.LOUPE_PROJECT_SECRET!)
       .update(user.id)
       .digest("hex");

     res.json({ user: { id: user.id, name: user.name, email: user.email }, userHmac });
   });
   ```

   Replace the parts that belong to your app:

   | Part | What to put there |
   |---|---|
   | `getSignedInUser(req)` | The code your app already uses to read the signed-in user from the request, for example `req.user` set by your auth middleware. It must return `null` or `undefined` when nobody is signed in. |
   | `LOUPE_PROJECT_SECRET` | Only an example name. Use whatever your server already uses to hold the project secret. |

   If your server does not use Express, add the same logic to your own router: read the signed-in user, compute the HMAC over `user.id`, and return `{ user, userHmac }` as JSON.

2. In the browser, add a function that fetches that route and then calls `init` with the result and your backend URL:

   ```ts
   // src/feedback.ts
   import { init } from "@loupekit/sdk";

   export async function startFeedback(isCancelled: () => boolean = () => false) {
     const res = await fetch("/api/feedback-identity", { credentials: "same-origin" });
     if (!res.ok) return; // not signed in: no widget
     const { user, userHmac } = await res.json();
     if (isCancelled()) return; // the component unmounted while the request ran

     init({
       projectKey: "<PROJECT_KEY>",
       apiBase: "<API_BASE>",
       user,
       userHmac,
     });
   }
   ```

   Replace `<API_BASE>` with the base URL of your Loupe backend, for example `https://tracker.example.com`.

3. Call `startFeedback` in place of the `init` call from step 4.

   `init` checks only whether a widget is already running. If a component unmounts before the request finishes, `init` would otherwise run after `destroy()` and leave a widget behind. The `isCancelled` check prevents that.

   **React:**

   ```tsx
   useEffect(() => {
     let cancelled = false;
     void startFeedback(() => cancelled);
     return () => {
       cancelled = true;
       destroy();
     };
   }, []);
   ```

   **Vue 3:**

   ```ts
   let cancelled = false;
   onMounted(() => {
     void startFeedback(() => cancelled);
   });
   onBeforeUnmount(() => {
     cancelled = true;
     destroy();
   });
   ```

   **Any other single-page app:**

   ```ts
   void startFeedback();
   ```

When `userHmac` is set, the SDK sends it on every request as the `X-Loupe-Hmac` header, next to `X-Loupe-User`.

### 6. Add optional settings

These options are often useful in a bundled app. Add them to the object you pass to `init`.

| Option | Type | Default | Use it to |
|---|---|---|---|
| `timeZone` | `string` (IANA zone) | the browser's zone | Show every timestamp in one zone, for example `"Europe/London"`. An unknown zone falls back to the browser's and logs one console warning. |
| `locale` | `string` (BCP 47) | the browser's locale | Format dates, for example `"en-GB"` for day-first dates. |
| `credentials` | `RequestCredentials` | the browser default, `same-origin` | Send cookies to a backend on another origin. Set `"include"`. |
| `headers` | `Record<string, string>` | none | Add headers to every backend request, for example a CSRF token when your backend uses session cookies. If the backend is on another origin, it must list each header in `Access-Control-Allow-Headers`. The local server allows only its own headers. |
| `bridge` | `string` (URL) | none | Connect to a local agent bridge to show who else is on the page (presence). |

For example:

```ts
init({
  projectKey: "<PROJECT_KEY>",
  apiBase: "<API_BASE>",
  user,
  userHmac,
  timeZone: "Europe/London",
  locale: "en-GB",
});
```

For every option, see the [SDK reference](../reference/sdk.md).

## Verify

1. Start your dev server and open your app in a browser.

   You should see the round Loupe launcher button on the page.

   ![The round Loupe launcher button in the corner of the page, with the panel closed](../images/sdk-launcher.png)

2. Click the launcher.

   You should see the Loupe panel open on the **Home** tab.

   ![The Loupe panel open on the Home tab, with the Open, Needs you, Resolved and Stale tiles and the recent feed](../images/sdk-home-tab.png)

3. In the panel header, open **Settings** (the gear).

   You should see the version line `Loupe v0.14.1` at the bottom of the menu, followed by `server` if you set `apiBase`, or `offline` if you did not. A build from the Loupe source without a version shows `Loupe vdev`.

   ![The Settings menu with accent dots, the Hover hints, Markers, Page paths and Launcher switches, Restart tour, and the version line](../images/sdk-settings.png)

   You can also read the version in code: `import { version } from "@loupekit/sdk";`.

4. If you set `apiBase`, open your browser's developer tools, select the **Network** tab, and reload the page.

   You should see a request to `<API_BASE>/v1/comments?projectKey=<PROJECT_KEY>&…` with status `200`.

5. Leave a comment on the page, as described in [Comment on an element](use-the-widget.md#comment-on-an-element). Then reload the page.

   You should see your comment again after the reload.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ReferenceError: document is not defined` during server-side rendering or a static build. | `init` reads `document.readyState` and draws into the page, so it can only run in a browser. | Call `init` only in the browser: inside `useEffect`, `onMounted`, or your client entry file. In a framework that renders on the server, put the call in a client-only component. Do not call it at the top level of a module the server imports. |
| The launcher does not appear, and the console shows `[loupe] init requires a projectKey` or `[loupe] init requires user.id`. | A required field is empty, often because the identity request had not finished. | Call `init` after you have the user, as in step 5. |
| The launcher is gone after it worked before, and nothing is logged. | A user hid the launcher. The choice is saved in that browser. | Press **Alt+Shift+L**, or call `showLauncher()` from `@loupekit/sdk`. |
| The launcher does not appear, and nothing is logged. | The code path that calls `init` never runs. | Check that the effect, hook, or entry file with `init` runs, for example with a breakpoint. |
| The widget keeps its old configuration after you call `init` again. | `init` ignores a call while a widget is running. | Call `destroy()` first, then `init` with the new configuration. |
| TypeScript reports error TS7016, `Could not find a declaration file for module '@loupekit/sdk'`. | The package's `types` field points at a file the build does not emit (`dts: false`). TypeScript reports this only under `strict` or `noImplicitAny`; otherwise the import is typed `any`. | Add `src/loupe.d.ts` as in [step 2](#2-add-a-type-declaration-if-you-use-typescript). |
| The Settings version line shows an older version than you expected. | `npm i @loupekit/sdk` installs whatever the `latest` tag points to, and that tag can lag behind the newest release. | Install the exact version, for example `npm i @loupekit/sdk@0.14.1`. |
| Requests to `/v1/comments` return `401`. | `userHmac` is missing, or it was signed with a different secret or a different user id. | Pass `userHmac` as in step 5. See also the troubleshooting section of [Add Loupe to a page with a script tag](embed-script-tag.md#troubleshooting). |
| The console shows a CORS error such as `Request header field <HEADER> is not allowed by Access-Control-Allow-Headers in preflight response.` | You added a custom header with `headers`, and the backend on another origin does not allow it. | Add the header to the backend's `Access-Control-Allow-Headers` response, or remove it from `headers`. The local server allows only `Content-Type`, `X-Loupe-User`, `X-Loupe-Hmac`, `X-Loupe-Admin`, and `X-Loupe-Project`. |

## Next steps

- [SDK reference](../reference/sdk.md): every `init` option and exported function.
- [Use the widget](use-the-widget.md): pin comments, capture regions, and reply to threads.
- [Upgrade Loupe](upgrade.md): move to a new release, or try a canary build from the npm `next` tag.
