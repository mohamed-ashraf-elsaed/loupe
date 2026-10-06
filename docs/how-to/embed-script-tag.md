# Add Loupe to a page with a script tag

This guide shows you how to add the Loupe widget to any HTML page with a plain `<script>` tag, without a bundler or build step.

**Contents**

- [Before you begin](#before-you-begin)
- [Step 1: Get the browser build](#step-1-get-the-browser-build)
- [Step 2: Add the script tag](#step-2-add-the-script-tag)
- [Step 3: Start Loupe](#step-3-start-loupe)
- [Step 4: Compute `userHmac` on your server](#step-4-compute-userhmac-on-your-server)
- [Step 5 (optional): Mark sensitive and stable elements](#step-5-optional-mark-sensitive-and-stable-elements)
- [Verify](#verify)
- [Troubleshooting](#troubleshooting)
- [Next steps](#next-steps)

## Before you begin

You need:

- **A page you control.** You must be able to edit its HTML and serve a static file next to it.
- **Node.js and npm, only if you copy the file into your site.** Step 1 installs the package with npm. If you load the file from the jsDelivr CDN instead (Step 1, option B), you need no tooling at all.
- **A backend that implements the Loupe HTTP API**, or none:
  - the local server from [Run the local server](run-local-server.md),
  - the Laravel package `loupekit/laravel` (its `@loupeWidget` Blade directive writes the script tag for you, so you can skip this guide), or
  - your own server.
  
  Without a backend, Loupe runs in *offline mode*: comments are stored in the browser's `localStorage` only.
- **Your project key**, the public identifier your backend issued for the project (for example `pk_demo_acme` on the local server).
- **For production, your project secret and a way to compute `userHmac` on your server.** The *project secret* is the private value your backend stores next to the project key; the backend checks every signature against it. `userHmac` is an HMAC-SHA256 signature of the user's id, made with the project secret. It proves to the backend that the page did not invent the user. Where the secret comes from depends on the backend:
  - **Local server:** `npm run seed` creates it and prints it with the label `admin key`. See [Run the local server](run-local-server.md), Step 2.
  - **Laravel package:** you do not need a project secret or `userHmac`. The `@loupeWidget` directive authenticates the widget with the Laravel session and its CSRF token. The package's `LOUPE_PROJECT_SECRET` setting is a different value: the Loupe Hub secret (`psk_…`), used only to forward comments to the Hub.
  - **Your own server:** you generate the secret when you create the project, store it with the project, and verify `X-Loupe-Hmac` against it. See [Authentication](../reference/server.md#authentication) in the local server reference for the exact check.

  Step 4 shows how to compute `userHmac`.

## Step 1: Get the browser build

The `@loupekit/sdk` package ships an IIFE build, `dist/index.global.js`. An *IIFE build* is a single self-contained file that defines one global variable when loaded; for Loupe that global is `Loupe`. It bundles all of its dependencies, so you need no other files.

Choose one option.

**Option A: copy the file into your site (needs Node.js and npm).**

1. Open a terminal in your project folder, the one that holds your `package.json`. If your site has no `package.json`, npm creates one in the current folder, so run the command where you want it.

2. Install the package:

   ```bash
   npm i @loupekit/sdk
   ```

   You should see `node_modules/@loupekit/sdk/dist/index.global.js` in that folder.

3. Copy the build into your static assets folder:

   ```bash
   cp node_modules/@loupekit/sdk/dist/index.global.js <STATIC_DIR>/loupe.js
   ```

   Replace `<STATIC_DIR>` with the folder your web server serves as static files, for example `public/js`.

   You should see `loupe.js` in that folder.

**Option B: load it from a public npm CDN (no tooling).** The same file is served by jsDelivr. Use this URL as the script source in Step 2, and pin the exact version so the file never changes under you:

```text
https://cdn.jsdelivr.net/npm/@loupekit/sdk@0.14.0/dist/index.global.js
```

## Step 2: Add the script tag

1. Add the script tag just before the closing `</body>` tag:

   ```html
       <script src="/js/loupe.js"></script>
     </body>
   </html>
   ```

   Change `/js/loupe.js` to the URL where you placed the file in Step 1, or to the jsDelivr URL if you chose option B.

2. Reload the page, open the browser developer tools console, and run:

   ```js
   typeof Loupe.init
   ```

   You should see `"function"`. Nothing is shown on the page yet; the widget appears only after you call `init`.

## Step 3: Start Loupe

1. Directly after the script tag, call `Loupe.init` with the signed-in user:

   ```html
   <script src="/js/loupe.js"></script>
   <script>
     Loupe.init({
       projectKey: "<PROJECT_KEY>",
       user: { id: "<USER_ID>", name: "<USER_NAME>", email: "<USER_EMAIL>" },
       // Computed by your server, never in the browser. See Step 4.
       userHmac: "<USER_HMAC>",
       apiBase: "<API_BASE>",
     });
   </script>
   ```

   Replace the placeholders:

   | Placeholder | What to put there | Example |
   |---|---|---|
   | `<PROJECT_KEY>` | Your project key. Required. | `pk_demo_acme` |
   | `<USER_ID>` | The stable id of the signed-in user. Required. | `u_92` |
   | `<USER_NAME>` | The name shown on the user's comments. Required. | `Sara` |
   | `<USER_EMAIL>` | The user's email. Optional; remove the field if you do not have one. | `sara@acme.com` |
   | `<USER_HMAC>` | The signature from Step 4. Leave the field out in offline mode. | 64 hex characters |
   | `<API_BASE>` | The base URL of your backend, with no trailing path such as `/v1`. Leave the field out for offline mode. | `https://tracker.example.com` |

2. Reload the page.

   You should see the Loupe launcher button near the edge of the page.

Notes:

- Call `init` once, after your page knows who the user is. A second call does nothing.
- If the page is still loading, Loupe waits for `DOMContentLoaded` before it draws anything, so you can also call `init` from the `<head>`.
- If your backend authenticates with a session cookie instead of `userHmac`, pass the cookie's CSRF token with `headers: { "X-CSRF-TOKEN": "<TOKEN>" }`. Every option is listed in the [SDK reference](../reference/sdk.md).

## Step 4: Compute `userHmac` on your server

`userHmac` is the lowercase hex HMAC-SHA256 of `user.id`, keyed with your project secret. Compute it on the server that renders the page and print it into the HTML. Never put the project secret in browser code: anyone who has it can sign as any user.

1. In the server code that renders the page, compute the signature.

   Node.js:

   ```js
   import { createHmac } from "node:crypto";

   const userHmac = createHmac("sha256", process.env.LOUPE_PROJECT_SECRET)
     .update(String(user.id))
     .digest("hex");
   ```

   PHP:

   ```php
   $userHmac = hash_hmac('sha256', (string) $user->id, getenv('LOUPE_PROJECT_SECRET'));
   ```

   In both snippets, `LOUPE_PROJECT_SECRET` is an environment variable you set to your project secret, and `user.id` / `$user->id` must be exactly the string you pass as `user.id` to `Loupe.init`.

2. Print the value into the `init` call from Step 3. For example, in a PHP template:

   ```php
   userHmac: "<?= $userHmac ?>",
   ```

3. Reload the page and view its source.

   You should see `userHmac` set to a string of exactly 64 lowercase hex characters (`0-9`, `a-f`).

### Test with the local server

On the local server, the project secret for the demo project is `sk_demo_acme_0f3b9c` unless you set `LOUPE_DEMO_SECRET`.

1. From the root of the Loupe repository, after Step 2 of [Run the local server](run-local-server.md), run:

   ```bash
   npm run seed
   ```

   The `seed` script exists only in the Loupe repository. In your own project, npm reports `Missing script: "seed"`.

   You should see:

   ```text
   Seeded project: pk_demo_acme
     admin key   (dashboard ?key= / X-Loupe-Admin): sk_demo_acme_0f3b9c
     demo HMAC    (host-app-injected for u_92): <HMAC>
   ```

   The `admin key` line is the project secret. `<HMAC>` is the `userHmac` for the demo user `u_92`.

## Step 5 (optional): Mark sensitive and stable elements

1. Hide sensitive content from screenshots. Add `data-loupe-redact` to any element that shows private data:

   ```html
   <input type="email" name="email" data-loupe-redact>
   ```

   Loupe leaves the element out of element screenshots and paints over it in region screenshots. To check, capture a region that covers the element (see [Use the widget](use-the-widget.md)). You should see a filled box where the element was.

2. Give elements a stable anchor. Add a `data-testid` (or `data-test`) attribute to elements people are likely to comment on:

   ```html
   <button data-testid="checkout-pay">Pay now</button>
   ```

   Loupe re-finds the element a comment is pinned to after your markup changes, and it looks for `data-testid` first. You should see a comment pinned to that element stay attached to it after you redeploy.

## Verify

1. Reload the page.

   You should see the Loupe launcher button near the edge of the page.

   ![The demo page with the round Loupe launcher button in the corner and the panel closed](../images/sdk-launcher.png)

2. Open the browser developer tools console and run:

   ```js
   Loupe.version
   ```

   You should see `"0.14.0"` (or the version you installed).

3. Open the Loupe panel and click **Settings** (the gear in the panel header).

   You should see the version line end in `server` if you set `apiBase`, or `offline` if you did not.

4. If you set `apiBase`, open the **Network** tab and reload.

   You should see a request to `<API_BASE>/v1/comments?projectKey=<PROJECT_KEY>&…` that returns `200`.

5. If you run in offline mode, save a comment, then open the **Application** tab (Chrome) or **Storage** tab (Firefox) and look at **Local Storage** for your page's origin.

   You should see a key that starts with `loupe:<PROJECT_KEY>:`, followed by the page it belongs to.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| The console shows `[loupe] init requires a projectKey` and no launcher appears. | `projectKey` is missing or empty. | Pass your project key in `Loupe.init`. |
| The console shows `[loupe] init requires user.id` and no launcher appears. | `user` or `user.id` is missing or empty. | Call `init` only after the user is known, and pass a non-empty `user.id`. |
| `Loupe is not defined` in the console. | `init` runs before the script tag, or the script URL returns 404. | Put the `init` script after the `<script src>` tag, and check that the file URL loads in the browser. |
| Comments appear in one browser but not on another device or for teammates. | `apiBase` is not set, so Loupe is in offline mode and stores comments in this browser's `localStorage`. | Set `apiBase` to your backend's base URL. |
| Requests to `/v1/comments` return `401`. On the local server the body is `{"error":"invalid or missing credentials"}`. | `userHmac` is missing, or it was signed with a different secret or a different user id. | Recompute `userHmac` on the server from the exact `user.id` you pass to `init` and the secret of this project. |
| Requests return `404` with `{"error":"unknown project"}`. | The backend does not know this project key. | Check `projectKey` for typos, and check that the project exists on that backend. |
| You authenticate with a cookie on another origin (for example `api.example.com` from `shop.example.com`) and requests are not authenticated. | By default the browser does not send cookies on cross-origin requests. | Pass `credentials: "include"` to `Loupe.init`. Your server must also answer CORS with your page's exact origin in `Access-Control-Allow-Origin` and `Access-Control-Allow-Credentials: true`. The local server does not send the second header, so use `userHmac` with it. |
| The launcher is gone after it worked before. | A user hid it; the choice is saved in that browser. | Press **Alt+Shift+L**. On a touch device, tap the tab at the right edge of the screen. You can also turn on the **Launcher** switch in **Settings**, or call `Loupe.showLauncher()` from the console or your own menu. |

## Next steps

- [Use the widget](use-the-widget.md): pin comments, capture regions, and reply in threads.
- [SDK reference](../reference/sdk.md): every `init` option and every method on `window.Loupe`.
- [Authentication and privacy](../explanation/auth-and-privacy.md): why `userHmac` exists and what leaves the page.
