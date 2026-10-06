# Troubleshoot Loupe

Use this page when a Loupe 0.14.0 setup does not behave as you expect. Find the part of Loupe that misbehaves, then find the row whose symptom matches what you see. Each row gives the cause, the fix, and the source line that produces the behavior, so you can check it yourself.

Most messages below are quoted exactly as the code writes them. Search this page for the text you see in the browser console, the server log, or an HTTP response body.

## Contents

- [Before you start](#before-you-start)
  - [Prerequisites for the npm commands](#prerequisites-for-the-npm-commands)
  - [After you apply a fix](#after-you-apply-a-fix)
- [Widget and SDK](#widget-and-sdk)
  - [Any embed](#any-embed)
  - [Script tag](#script-tag)
  - [npm](#npm)
  - [Configuration examples](#configuration-examples)
- [Laravel](#laravel)
  - [Install and access](#install-and-access)
  - [Gate example](#gate-example)
  - [Comments, assets and upgrades](#comments-assets-and-upgrades)
  - [Hub from a Laravel app](#hub-from-a-laravel-app)
- [Local server and dashboard](#local-server)
- [MCP](#mcp)
- [Extension](#extension)
- [Hub](#hub)
  - [Sign-in and dashboard](#sign-in-and-dashboard)
  - [Signed API and deliveries](#signed-api-and-deliveries)
  - [Self-hosting](#self-hosting)
- [Known issues in 0.14.0](#known-issues-in-0140)
- [Next steps](#next-steps)

## Before you start

Collect three things before you look for your symptom:

1. Open the browser developer tools and select the **Console** tab.

   You should see the page's console messages. Loupe prefixes its own messages with `[loupe]`.

2. Select the **Network** tab and reload the page.

   You should see one row per request, with its status code in the **Status** column. Note the status code and the response body of any failing request to `/v1/...`.

3. Open the Loupe panel and click the gear button in the panel header. The button's tooltip is **Settings** (`packages/sdk/src/app.ts:621-626`, `:674`).

   You should see a menu with a version line at the bottom. It shows `Loupe v0.14.0`, then `server` when the widget talks to a backend, or `offline` when it stores comments in this browser only (`packages/sdk/src/app.ts:646-647`).

Source paths in the tables are relative to the root of the [Loupe repository](https://github.com/mohamed-ashraf-elsaed/loupe). Line numbers refer to the current source on the main development line, not to the `v0.14.0` tag. Most files match the tag. The Hub files `packages/hub/index.ts` and `packages/hub/webhook.ts` changed after 0.14.0, so their line numbers do not match the tag, and rows marked **after 0.14.0** describe behavior that a 0.14.0 Hub does not have.

### Prerequisites for the npm commands

Rows that tell you to run `npm start`, `npm run seed`, `npm run build` or `npm run build:extension` use scripts from the repository's root `package.json` (`package.json:21-26`). They work only from the root of a clone. You need:

- Git.
- Node.js 24, the version CI uses (`.github/workflows/ci.yml:15`).

Clone the repository and install its dependencies:

```bash
git clone https://github.com/mohamed-ashraf-elsaed/loupe.git
cd loupe
npm install
```

You should see `npm install` finish without errors. Run every `npm` command on this page from this `loupe` directory.

### After you apply a fix

1. Reload the page, or restart the process you changed (the server, Hub or the MCP client).
2. Repeat the three steps in [Before you start](#before-you-start).

   You should see that the message is gone from the console and that the request answers with a `2xx` status. If the symptom stays, read the next row whose symptom matches.

Terms used on this page:

- **Project key**: the public ID of a project, passed to `init` as `projectKey`, for example `pk_demo_acme`.
- **Project secret**: the project's admin secret. Keep it on your server. A backend uses it to check `userHmac`, and the dashboard and the MCP server send it as `X-Loupe-Admin` (`packages/server/auth.ts:24-27`).
- **`apiBase`**: the base URL of the Loupe backend that the widget calls, for example `http://localhost:8787`.
- **`userHmac`**: a hex HMAC-SHA256 of the user's id, keyed with the project secret (`packages/server/auth.ts:6`, `:27`). See [Configuration examples](#configuration-examples).

## Widget and SDK

These rows apply to the widget, however you load it: a script tag, the npm package, the Laravel `@loupeWidget` directive, or the browser extension.

### Any embed

| Symptom | Cause | Fix | Source |
|---|---|---|---|
| The console shows `[loupe] init requires a projectKey` and no launcher appears. | `projectKey` is missing or empty. | Pass your project key to `init`. See [Configuration examples](#configuration-examples). | `packages/sdk/src/index.ts:25` |
| The console shows `[loupe] init requires user.id` and no launcher appears. | `user` or `user.id` is missing or empty. | Call `init` only after you know the user, and pass a non-empty `user.id`. | `packages/sdk/src/index.ts:26` |
| Your teammates cannot see your comments, and **Settings** shows `offline`. | `apiBase` is not set, so the widget stores comments in this browser's `localStorage`. | Set `apiBase` to your backend's base URL. See [Configuration examples](#configuration-examples). | `packages/sdk/src/app.ts:647`, `packages/sdk/src/store.ts:6`, `:17`, `:25` |
| An attachment fails with `attachment too large for offline mode`. | In offline mode, one attachment can be at most 3,000,000 bytes. | Attach a smaller file, or connect the widget to a backend with `apiBase`. | `packages/sdk/src/store.ts:58` |
| The composer shows `Up to 10 files.` | You picked more than 10 attachments. | Remove some files, or attach fewer at a time. | `packages/sdk/src/app.ts:147`, `:2565` |
| The composer shows `<FILE_NAME> is too large.` | A non-video file is over 10 MB, or a video is over 25 MB. `<FILE_NAME>` is the name of the file you picked. | Compress or trim the file, then attach it again. | `packages/sdk/src/app.ts:150-151`, `:2566-2567` |
| Nothing happens after a short drag with **Region**. | Loupe ignores a drag smaller than 8 pixels in either direction. | Drag a larger rectangle. | `packages/sdk/src/app.ts:2267` |
| A comment shows a **moved** badge and its pin is gone. | After a redeploy, no element scored at least 0.5 against the saved anchor. | Add a stable `data-testid` to the element so Loupe can find it again. | `packages/sdk/src/fingerprint.ts:8`, `:84` |
| A reply shows **Retry**. | The reply could not be saved. | Check your connection, then click **Retry**. | `packages/sdk/src/app.ts:4232` |
| The launcher is gone after it worked before. | Someone hid it. The choice is saved in that browser. | Press **Alt+Shift+L**, tap the tab at the right edge of the screen on a touch device, or call `Loupe.showLauncher()`. | `packages/sdk/src/app.ts:76`, `:2110` |
| **Generate** shows **Request access to generate**. | The host page did not pass a `generate` function to `init`. | Pass `generate` in `init`. **Request access to generate** reaches someone only when the host page passes `onRequestAccess` to `init`; without it, the button only records the request in this browser's Activity tab and the gate shows `Pass onRequestAccess to init() to route this somewhere.` | `packages/sdk/src/app.ts:3754-3770` |
| **Test connection** for Local AI says `Timed out. Is the server running, and does it allow this origin (CORS)?` | The local AI server did not answer `GET <URL>/v1/models` within 4 seconds. | Start the server, and allow your page's origin in its CORS settings. | `packages/sdk/src/app.ts:3988-4011` |
| **Test connection** says `Could not reach it. Check the URL, and that the server allows this origin (CORS).` | The request failed, often because of a wrong URL or a CORS refusal. | Check the URL, and allow your page's origin on the server. | `packages/sdk/src/app.ts:4012` |
| Adding an environment shows `Enter a full http:// or https:// URL.` | The value is not an absolute `http://` or `https://` URL. | Enter a full URL, for example `https://staging.shop.example.com`. | `packages/sdk/src/app.ts:1829` |
| Adding an environment shows `That environment is already listed.` | The URL is already in the list. | No fix needed. | `packages/sdk/src/app.ts:1834` |
| The **Activity** tab shows **Monitor unavailable.** | Nothing feeds the tab: the backend has no activity feed, and the page has not called `trackActivity`. | On Laravel, check that `LOUPE_ACTIVITY` is not `false`, run `php artisan vendor:publish --tag=loupe-migrations`, then run `php artisan migrate`. The package publishes its migrations and does not load them itself (`packages/laravel/src/LoupeServiceProvider.php:175-177`). The local server has no `/v1/activity` endpoint. | `packages/sdk/src/app.ts:1448`, `packages/laravel/src/Http/Controllers/ActivityController.php:24-26` |
| The settings version line shows a highlighted `package v<VERSION>`. | The host package (for example `loupekit/laravel`) reports a different version from the widget bundle it serves. | Publish the package's assets again. For Laravel, see [Comments, assets and upgrades](#comments-assets-and-upgrades). | `packages/sdk/src/app.ts:4706-4711` |
| Requests to `/v1/comments` answer `401`. On the local server the body is `{"error":"invalid or missing credentials"}`. | `userHmac` is missing, or it was computed with another secret or another user id. | Compute `userHmac` on your server as HMAC-SHA256 of the exact `user.id` you pass to `init`, keyed with the project secret. See [Configuration examples](#configuration-examples). | `packages/server/auth.ts:42` |
| Requests answer `404` with `{"error":"unknown project"}`. | The backend does not know this project key. | Check `projectKey` for typos, and check that the project exists on that backend. | `packages/server/auth.ts:32` |
| Requests answer `400` with `{"error":"missing projectKey"}`. | The request reached the local server without a project key. | Pass `projectKey` to `init`. | `packages/server/auth.ts:30` |
| You sign in with a cookie on another origin, for example `api.example.com` from `shop.example.com`, and requests are not authenticated. | The browser does not send cookies on cross-origin requests by default. | Pass `credentials: "include"` to `init`. Your server must answer CORS with your page's exact origin and `Access-Control-Allow-Credentials: true`. The local server does not send that second header, so use `userHmac` with it. | `packages/sdk/src/http-adapter.ts:26-28`, `packages/server/index.ts:42-45` |

### Script tag

For the setup, see [Embed Loupe with a script tag](how-to/embed-script-tag.md).

| Symptom | Cause | Fix | Source |
|---|---|---|---|
| The console shows `Loupe is not defined`. | Your `init` call runs before the script loads, or the script URL returns 404. | Put the `Loupe.init` script after the `<script src>` tag, and open the script URL in the browser to check that it loads. | `packages/sdk/tsup.config.ts:9-10` |

### npm

For the setup, see [Install Loupe from npm](how-to/install-npm.md).

| Symptom | Cause | Fix | Source |
|---|---|---|---|
| `ReferenceError: document is not defined` during server-side rendering or a static build. | `init` reads `document.readyState`, so it runs only in a browser. | Call `init` in client-only code, for example inside `useEffect` or `onMounted`. | `packages/sdk/src/index.ts:30` |
| The launcher does not appear, and nothing is logged. | `init` was never called, or a widget was already running. A second `init` call does nothing. | Check that the code path with `init` runs. To start again with a new configuration, call `destroy()` first. | `packages/sdk/src/index.ts:24` |
| TypeScript cannot find a declaration file for `@loupekit/sdk`. | The 0.14.0 package ships JavaScript only. | Add a file such as `src/loupe.d.ts` that contains `declare module "@loupekit/sdk";`. | `packages/sdk/tsup.config.ts:20` |
| `version` logs an older version than you expected. | `npm i @loupekit/sdk` installs whatever the `latest` dist-tag points to. A dist-tag is a name on the npm registry that points at one published version. | Install an exact version, for example `npm i @loupekit/sdk@0.14.0`. | `.github/workflows/release.yml:89`, `:121` |

### Configuration examples

A minimal `init` call that talks to a backend:

```js
Loupe.init({
  projectKey: "<PROJECT_KEY>",
  user: { id: "<USER_ID>" },
  apiBase: "<API_BASE>",
  userHmac: "<USER_HMAC>",
});
```

- `<PROJECT_KEY>`: your project key, for example `pk_demo_acme`.
- `<USER_ID>`: the signed-in user's id, a non-empty string.
- `<API_BASE>`: your backend's base URL, for example `http://localhost:8787`. Leave `apiBase` out to run offline.
- `<USER_HMAC>`: the value your server computes, below.

Compute `userHmac` on your server, never in the browser, because it needs the project secret. In PHP:

```php
$userHmac = hash_hmac('sha256', $userId, $projectSecret);
```

In Node.js:

```js
import { createHmac } from "node:crypto";
const userHmac = createHmac("sha256", projectSecret).update(userId).digest("hex");
```

`$userId` and `userId` must be the exact string you pass as `user.id`. The backend compares the result with the `X-Loupe-Hmac` header (`packages/server/auth.ts:6`, `:38-41`, `packages/sdk/src/http-adapter.ts:21`).

## Laravel

These rows apply to the `loupekit/laravel` package. For the setup steps, see [Install the Laravel package](how-to/laravel-install.md) and [Authorize who can use Loupe in Laravel](how-to/laravel-authorize.md).

### Install and access

| Symptom | Cause | Fix | Source |
|---|---|---|---|
| The dashboard answers 403 with `Unauthenticated. This app has no [login] route to redirect to — sign in your own way, then open the Loupe dashboard.` | Nobody is signed in, and the app has no route named `login`. | Add authentication with a `login` route, for example Laravel Breeze, then sign in. | `packages/laravel/src/Http/Middleware/Authenticate.php:50-52` |
| A Loupe route answers 403 with `You are not authorized to use Loupe.` | The user is signed in but not authorized. Outside `local`, the `loupe:use` and `loupe:admin` gates deny everyone until you change them. A gate is a Laravel authorization rule defined with `Gate::define`. The dashboard needs `loupe:admin`. | Add the user to the gates in `app/Providers/LoupeServiceProvider.php`. See [Gate example](#gate-example). | `packages/laravel/src/Http/Middleware/Authorize.php:29`, `packages/laravel/src/LoupeServiceProvider.php:66-74` |
| Everyone can use Loupe on your machine, but nobody can on staging. | `allow_in_local` allows any signed-in user only when the environment is `local`. | Add users to the gates, or register `Loupe::useWhen()` and `Loupe::adminWhen()`. | `packages/laravel/config/loupe.php:106` |
| Your gates are ignored. | A closure in `loupe.authorize.use` or `loupe.authorize.dashboard` answers first, then a closure from `useWhen()` or `adminWhen()`. Or `APP_ENV` is `local` and `allow_in_local` is `true`, which allows every signed-in user before the gates run. | Remove the closure, or move your rule into it. To test gates on your machine, set `'allow_in_local' => false` in `config/loupe.php`. | `packages/laravel/src/Loupe.php:173-195`, `:190`, `packages/laravel/config/loupe.php:106` |
| A user on your list is still denied. | The stub's `in_array` email match is case-sensitive, or the user signs in through a guard Loupe does not read. A guard is the Laravel authentication driver that signs a user in, such as `web`. | Match the email's case. For several guards, set `LOUPE_GUARDS`, for example `LOUPE_GUARDS=web,admin`. | `packages/laravel/stubs/LoupeServiceProvider.stub:34`, `:40`, `packages/laravel/config/loupe.php:74-77` |
| `@loupeWidget` writes nothing, and the page source has no `loupe.js` tag. | The directive renders nothing when `LOUPE_ENABLED=false`, when nobody is signed in, or when the user is not authorized. | Sign in, check the user's authorization, and check that `LOUPE_ENABLED` is not `false`. | `packages/laravel/src/LoupeServiceProvider.php:137-150` |
| `loupe:install` warns `Could not auto-register the provider.` | The app has no `bootstrap/providers.php`. | Add `App\Providers\LoupeServiceProvider::class` to your providers list by hand. | `packages/laravel/src/Console/InstallCommand.php:85` |
| `loupe:install` warns that the app has no `[login]` route. | The app has no route named `login`, so nobody can sign in. | Add authentication, for example with `composer require laravel/breeze --dev` and `php artisan breeze:install`. | `packages/laravel/src/Console/InstallCommand.php:58-69` |
| `php artisan config:cache` fails with `the value at loupe.user_resolver is non-serializable`. | `user_resolver` (or `authorize.*`, or `people_resolver`) is a closure. Cached config cannot hold closures. | Use an invokable class name, gates, or `Loupe::useWhen()`. | `packages/laravel/config/loupe.php:127-128` |

### Gate example

The stub that `loupe:install` publishes defines both gates with an email list (`packages/laravel/stubs/LoupeServiceProvider.stub:33-43`). Add your users to the arrays in `app/Providers/LoupeServiceProvider.php`:

```php
Gate::define('loupe:use', function ($user) {
    return in_array($user->email, [
        'sara@acme.com',
    ]);
});

Gate::define('loupe:admin', function ($user) {
    return in_array($user->email, [
        'sara@acme.com',
    ]);
});
```

The match is case-sensitive, so write each email exactly as it is stored.

### Comments, assets and upgrades

| Symptom | Cause | Fix | Source |
|---|---|---|---|
| The page has the `loupe.js` tag, but the browser shows a 404 for `vendor/loupe/sdk/loupe.js`. | The assets are not published, or `APP_URL` or `LOUPE_ASSET_URL` names a host that does not serve `public/vendor/loupe/`. | Run `php artisan vendor:publish --tag=loupe-assets --force`, then check `APP_URL` and `LOUPE_ASSET_URL`. To verify, run `curl -I <APP_URL>/vendor/loupe/sdk/loupe.js`; you should see `200`. | `packages/laravel/src/Support/Url.php:28` (`asset()`) |
| The widget's version line shows a highlighted `package v<VERSION>`. | The package was upgraded, but the published bundle in `public/vendor/loupe` is the old one. | Run `php artisan vendor:publish --tag=loupe-assets --force`, then hard-reload the page. | `packages/sdk/src/app.ts:4706-4711`, `packages/laravel/src/Loupe.php:166` |
| The log shows ``[loupe] loupe_comments is missing <COLUMNS> — run `php artisan migrate` to add it.`` (or `them`). | A newer package writes columns your database does not have yet. Loupe saves the comment without them. | Run `php artisan vendor:publish --tag=loupe-migrations`, then `php artisan migrate`. | `packages/laravel/src/Support/Columns.php:36-39` |
| Saving a comment fails with HTTP 419. | Laravel rejected the CSRF token. The widget sends the session cookie only to its own origin (`credentials: 'same-origin'`), and its `apiBase` is `url(<LOUPE_PATH>)` on the page's host. | Render the page inside the `web` middleware group. Serve the page and the Loupe routes on the same origin: leave `LOUPE_DOMAIN` unset. | `packages/laravel/resources/views/widget.blade.php:10-11`, `packages/laravel/src/LoupeServiceProvider.php:158` |
| Saving a comment answers 403 `cannot post as another user`. | The comment's `author.id` differs from the id that `user_resolver` returns for the signed-in user. | Pass the same id to the widget that your `user_resolver` returns. | `packages/laravel/src/Http/Controllers/CommentController.php:96` |
| Moving a comment answers 422 `unknown status; use one of queue, todo, in_progress, in_review, resolved`. | The status is not a board stage (one of the board's columns) or a legacy `open`/`done`. | Send one of the listed stages. | `packages/laravel/src/Http/Controllers/CommentController.php:171` |
| Deleting a comment answers 403 `only the author or an admin can delete this`. | The user did not write the comment and does not pass dashboard authorization. | Delete as the author, or grant the user `loupe:admin`. | `packages/laravel/src/Http/Controllers/CommentController.php:224` |
| A reply answers 422 `body is required`. | The reply body is empty. | Type a reply before you send it. | `packages/laravel/src/Http/Controllers/ThreadController.php:48` |
| `GET /<LOUPE_PATH>/v1/activity` answers 404 `activity is not enabled`. | `LOUPE_ACTIVITY` is `false`, or the `loupe_activity` table does not exist. | Set `LOUPE_ACTIVITY=true`, run `php artisan vendor:publish --tag=loupe-migrations`, then run `php artisan migrate`. | `packages/laravel/src/Http/Controllers/ActivityController.php:26` |
| A user is not offered in @mention autocomplete. | They have not written in this project yet, and their email is not in `LOUPE_ALLOWED_EMAILS`. | Add the email to `LOUPE_ALLOWED_EMAILS`, or set `people_resolver`. | `packages/laravel/config/loupe.php:146-149` |

`<LOUPE_PATH>` is the route prefix from `LOUPE_PATH`. The default is `loupe`.

### Hub from a Laravel app

These rows apply when a Laravel app sends tickets to Loupe Hub or receives them. In the examples, **Shop** sends tickets and **Tracker** receives them. For the setup, see [Connect apps to Hub](how-to/hub-connect-apps.md).

Terms: the **chip** is the forwarding badge on a comment card, such as `→ Tracker` (`packages/sdk/src/app.ts:3405-3425`). A project's **inbound URL** is the address where Hub delivers tickets to it, `<APP_URL>/<LOUPE_PATH>/v1/hub/inbound`. A **route** is the destination project that Hub sends a project's tickets to.

| Symptom | Cause | Fix | Source |
|---|---|---|---|
| Chip `→ Hub failed`; log `[loupe] Hub rejected comment`. | Hub answered with an error, for example `403 user not in organization` or `401 invalid signature`. The chip's tooltip shows the error. | For 403, add the user's email or domain to the organization. For 401 or 404, check Shop's `LOUPE_PROJECT_ID` and `LOUPE_PROJECT_SECRET`, then run `php artisan config:clear`. | `packages/laravel/src/Jobs/SendToHub.php:64` |
| Chip `→ Hub failed`; log `[loupe] could not send comment to Hub`. | Shop could not connect to Hub. | Check `LOUPE_HUB_URL`, and check that Shop's server can reach Hub over HTTPS. | `packages/laravel/src/Jobs/SendToHub.php:93` |
| Chip `→ Tracker failed`; log `[loupe] Hub accepted comment but webhook delivery failed`. | Hub could not deliver to Tracker after three attempts. | Open Shop's project page in Hub and read the **Error** column under **Last 20 deliveries**, then use the rows below. | `packages/laravel/src/Jobs/SendToHub.php:87` |
| No chip; the Activity feed says Hub accepted the ticket and `no destination is set for this project`. | Hub accepted the ticket, but Shop has no route and no webhook. | On Shop's project page in Hub, under **Routing**, choose a project in **Send tickets to** and click **Save route**. Only owners see this form. | `packages/laravel/src/Jobs/SendToHub.php:130-134`, `packages/hub/views.ts:152-159` |
| No chip; log `[loupe] not sending comment to Hub: the user has no email`. | The signed-in user has no email. Hub identifies people by email. | Give the user an email, or return one from `user_resolver`. | `packages/laravel/src/Support/Hub.php:109` |
| No chip after a while, and no log line. | `queue.default` is not `sync` and no queue worker runs. | Run `php artisan queue:work`. | `packages/laravel/src/Support/Hub.php:144-156` |
| Delivery error `HTTP 503`; Tracker answers `Loupe Hub is not configured`. | One of Tracker's `LOUPE_HUB_URL`, `LOUPE_PROJECT_ID` and `LOUPE_PROJECT_SECRET` is empty. | Set all three in Tracker's `.env`, then run `php artisan config:clear`. | `packages/laravel/src/Http/Middleware/VerifyHubSignature.php:34` |
| Delivery error `HTTP 401`; Tracker answers `delivery is for another project`. | Tracker's `LOUPE_PROJECT_ID` is not the Tracker project's ID. | Set Tracker's own project ID and secret, then run `php artisan config:clear`. | `packages/laravel/src/Http/Middleware/VerifyHubSignature.php:50` |
| Delivery error `HTTP 401`; Tracker answers `timestamp out of range`. | Tracker's clock and Hub's clock differ by more than 300 seconds. | Sync both clocks, for example with NTP. | `packages/laravel/src/Http/Middleware/VerifyHubSignature.php:53` |
| Delivery error `HTTP 401`; Tracker answers `invalid signature`. | Tracker's `LOUPE_PROJECT_SECRET` does not match the Tracker project in Hub. | Copy the current secret, or rotate it in Hub and update `.env`. | `packages/laravel/src/Http/Middleware/VerifyHubSignature.php:57` |
| Delivery error `HTTP 413`; Tracker answers `payload too large`. | The delivery body is over 6,000,000 bytes. | Attach fewer or smaller files to the comment. | `packages/laravel/src/Http/Middleware/VerifyHubSignature.php:29`, `:39` |
| Delivery error `HTTP 404`. | The inbound URL path is wrong, or Tracker's `LOUPE_PATH` is not `loupe`. | Set Tracker's inbound URL to `https://tracker.example.com/<LOUPE_PATH>/v1/hub/inbound`. | `packages/laravel/routes/loupe.php:22-24` |
| The ticket reaches Tracker, but status changes and replies never reach Shop. | Hub sends updates to the `reply_url` that Shop sent with the ticket. A 0.14.0 Hub keeps any `http://` or `https://` `reply_url`. **After 0.14.0** (listed as Unreleased in the changelog), Hub keeps it only when its path ends with `/v1/hub/inbound`, it carries no credentials, and it shares the origin of Shop's inbound URL when Shop has one. | Keep Shop's routes enabled (`LOUPE_ENABLED` is not `false`). After 0.14.0, if Shop has an inbound URL in Hub, use the same scheme and host that Shop's users open. | `packages/hub/index.ts:229` in the `v0.14.0` tag; `packages/hub/index.ts:145-150`, `:243` after it; the `[Unreleased]` section of `CHANGELOG.md` |
| The Activity feed shows `Could not reach Loupe Hub` for an update. | The app could not connect to Hub to send a status change or reply. | Check `LOUPE_HUB_URL` and the app's network access to Hub. | `packages/laravel/src/Jobs/SendUpdateToHub.php:54-56` |
| The Activity feed shows `Could not send the <KIND> update to the other project`; log `[loupe] Hub did not deliver the ticket update`. | Hub answered with an error, or could not deliver the update to the other project. `<KIND>` is the kind of update, for example a status change or a reply. The feed entry shows the error. | Read the error. For a delivery failure, open the project page in Hub and use the **Error** column under **Last 20 deliveries**, then the [Signed API and deliveries](#signed-api-and-deliveries) rows. | `packages/laravel/src/Jobs/SendUpdateToHub.php:47-51` |

<a id="local-server"></a>

## Local server and dashboard

These rows apply to `@loupekit/server` and the dashboard at `/dashboard/`. For the setup, see [Run the local server](how-to/run-local-server.md). The `npm` commands need a clone; see [Prerequisites for the npm commands](#prerequisites-for-the-npm-commands). The examples use port `8787`, the default. If you set `PORT`, use that port instead (`packages/server/index.ts:28`).

| Symptom | Cause | Fix | Source |
|---|---|---|---|
| The dashboard shows ``Not authorized. Open this page with ?key=<project secret> (from `npm run seed`).`` | The API answered 401 or 404: the key is missing or wrong, or the project does not exist. | Open `http://localhost:8787/dashboard/?project=<PROJECT_KEY>&key=<PROJECT_SECRET>`. Without `?project=`, the dashboard opens the demo project `pk_demo_acme`. The dashboard saves the last `?key=` in `localStorage` as `loupe_admin`, so pass the new key after you change the secret. If you have not seeded, run `npm run seed`. | `packages/dashboard/app.ts:25`, `:32-33`, `:136` |
| The dashboard shows `You don't have access to this dashboard.` | The dashboard runs inside a host app (for example the Laravel package), and the API answered 401 or 404. | Sign in as a user who passes the host's dashboard authorization. | `packages/dashboard/app.ts:135` |
| The dashboard shows `Can't reach the API at <URL>. Is the backend running? (<ERROR>)`. `<ERROR>` is the underlying error message. | The server is not running, `?api=` points somewhere else, or the API answered with an error status, which shows as `API 500` or similar. | Start the server with `npm start`, run `curl http://localhost:8787/v1/health`, and remove a wrong `?api=` parameter. | `packages/dashboard/app.ts:24`, `:120`, `:137` |
| `/dashboard/` or `/demo/` loads, but the board or widget never appears. | The packages are not built, so `dashboard/dist/app.js` or `sdk/dist/index.global.js` is missing. | Run `npm run build`, then reload. | `package.json:21`, `packages/server/index.ts:32-34` |
| The Integrations page shows `Credentials cannot be stored: LOUPE_CREDENTIAL_KEY is missing or not a 32-byte key on the server.` | The server started without `LOUPE_CREDENTIAL_KEY`, or with a base64 value that is not 32 bytes. | Generate a key with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`, then restart the server with `LOUPE_CREDENTIAL_KEY` set to it. | `packages/dashboard/app.ts:709`, `packages/server/integrations.ts:243` |
| An integration card shows `Stored credentials could not be decrypted — reconnect the integration.` | The server runs with a different `LOUPE_CREDENTIAL_KEY` from the one that stored the token. | Restart with the original key, or paste the token again and click **Reconnect**. | `packages/server/integrations.ts:276` |
| Messages stopped, and a card shows an error such as `token_revoked`, `invalid_auth`, `account_inactive` or `Unauthorized`. | A delivery failed with an authentication error, so the server marked the integration as errored and skips it. | Create a new token, paste it into the card, and click **Reconnect**. **Test connection** alone uses the stored token and fails again. | `packages/server/delivery.ts:135` |
| The Telegram destination list is empty. | Telegram lists only chats that the bot has already seen. | Send the bot a message, or add it to the group, then click **Test connection**. | `packages/server/providers/telegram.ts:88-90` |
| An integration request answers 403 `administrators only`. | The request did not carry the project secret in `X-Loupe-Admin`. | Open the dashboard with `?key=<PROJECT_SECRET>`. | `packages/server/index.ts:276`, `:284` |

`<PROJECT_KEY>` is the project key, and `<PROJECT_SECRET>` is the project's admin secret. After `npm run seed`, the demo project's key is `pk_demo_acme` and its secret is `sk_demo_acme_0f3b9c`, unless you set `LOUPE_DEMO_SECRET` (`packages/server/seed.ts:7-8`).

## MCP

These rows apply to `@loupekit/mcp`. For the setup, see [Connect MCP clients](how-to/connect-mcp-clients.md).

| Symptom | Cause | Fix | Source |
|---|---|---|---|
| The server exits at start with `ERR_MODULE_NOT_FOUND` for `@loupekit/shared`. | A known issue in 0.14.0. See [Known issues in 0.14.0](#known-issues-in-0140). | Run the server from source. | `packages/mcp/package.json:49-51` |
| A tool fails with a message ending in `→ 401`, for example `GET /v1/comments?… → 401` or `GET /v1/comments/<ID> → 401`. | `LOUPE_ADMIN_KEY` is missing or is not the project secret. | Set `LOUPE_ADMIN_KEY` to the project secret, then restart the MCP client. | `packages/mcp/index.ts:100`, `:177`, `:202` |
| A tool fails with a message ending in `→ 404`. | `LOUPE_PROJECT_KEY` names a project the backend does not know. | Use a key that exists, for example `pk_demo_acme` after `npm run seed`. | `packages/mcp/index.ts:100`, `packages/server/auth.ts:32` |
| The log shows `[loupe] bridge port 9800 is busy after 6 attempts — continuing without it`. | The bridge is the MCP server's local HTTP server on `127.0.0.1`, port `9800` by default; it passes selections between the browser and the agent and serves the activity dashboard. Another process, often a second Loupe MCP server, holds port 9800. | Stop the other process, or set `LOUPE_BRIDGE_PORT` to a free port. The comment tools work either way. | `packages/mcp/src/bridge/http-bridge.ts:1-11`, `:65`, `:93`, `packages/mcp/index.ts:74` |
| `get_dashboard_url` replies `The activity dashboard is not running — the bridge did not start.` | The bridge did not start, or `LOUPE_BRIDGE_PORT` is `0`. | Free the port, or remove `LOUPE_BRIDGE_PORT`, then restart the client. | `packages/mcp/index.ts:74`, `:528`, `:672` |
| `get_recent_events` always fails. | A known issue in 0.14.0. See [Known issues in 0.14.0](#known-issues-in-0140). | Use `get_activity_summary` or `get_files_touched`, or open the `/monitor` page. | `packages/mcp/index.ts:485` |
| `create_pr_for_thread` replies `No GitHub token is configured, so I cannot open a pull request.` | No usable token was found. Loupe reads `GITHUB_TOKEN`, and reads `GH_TOKEN` only when `GITHUB_TOKEN` is not set; then it tries `gh auth token`. A value that looks like a placeholder is ignored, so a placeholder `GITHUB_TOKEN` hides a valid `GH_TOKEN`. | Unset a placeholder `GITHUB_TOKEN`. Then set `GITHUB_TOKEN` to a fine-grained token with read and write access to Contents and Pull requests, or run `gh auth login`. | `packages/mcp/src/github/github-client.ts:78`, `:92` |
| `install_agent_hooks` replies `Could not install: settings file is not valid JSON (...); left untouched`. | The settings file has a syntax error, so Loupe refuses to overwrite it. | Fix the JSON in `$HOME/.claude/settings.json` (or the file in `LOUPE_CLAUDE_SETTINGS`), then ask again. | `packages/mcp/src/hooks/hook-installer.ts:166`, `packages/mcp/index.ts:544` |

## Extension

These rows apply to the browser extension. For the setup, see [Use the browser extension](how-to/browser-extension.md). Loupe's release workflows publish no store build of the extension, so these rows assume you loaded it unpacked from a clone (see [Prerequisites for the npm commands](#prerequisites-for-the-npm-commands)).

| Symptom | Cause | Fix | Source |
|---|---|---|---|
| Nothing happens after **Start Loupe on this tab**, and the console shows `[loupe] Set a project key and user in the extension popup first.` | **Project key** or **User id** is empty. Both are required. | Open the popup, fill in both fields, click **Save settings**, then start again. | `packages/extension/content.src.ts:32-36` |
| Nothing happens after **Start Loupe on this tab**, and the console shows no warning. | You hid this site with **Show / hide Loupe on this page**. On a hidden site, Start does nothing. | Right-click the page and choose **Show / hide Loupe on this page**. | `packages/extension/content.src.ts:25-31` |
| Loupe does not start on `chrome://` pages, `about:` pages or the Chrome Web Store, and the show/hide menu does nothing there. | The toggle needs an `http://` or `https://` origin, and Chrome does not let extensions inject into its own pages. | Use Loupe on `http://` or `https://` pages. | `packages/extension/background.js:99-107` |
| A screenshot cuts off part of a large element. | The extension captures the visible viewport only. | Scroll so that the whole element is on screen, or comment on a smaller element. | `packages/extension/background.js:45-47` |
| **Record** opens the browser's screen-sharing prompt. | The extension does not override the recorder, so it uses the SDK's screen-share recorder. | Choose the current tab in the prompt, then drag the region. | `packages/extension/content.src.ts:42-51` |
| Comments you left earlier are missing. | **API base** is blank, so comments are stored in the page's `localStorage` in your browser only. | Set **API base** to a Loupe backend. | `packages/sdk/src/store.ts:6`, `:17`, `:25` |
| The extension still behaves like an older version. | The tab kept the old content script, or `content.js` was not rebuilt. | Run `npm run build:extension`, reload the extension on `chrome://extensions`, then reload the tab. | `package.json:24` |

## Hub

These rows apply to Loupe Hub. For the setup, see [Self-host Loupe Hub](how-to/hub-self-host.md) and [Manage Hub organizations and projects](how-to/hub-manage-projects.md).

### Sign-in and dashboard

| Symptom | Cause | Fix | Source |
|---|---|---|---|
| The sign-in page says `GOOGLE_CLIENT_ID is not configured on this server.`, and sign-in answers 503 `{"error":"GOOGLE_CLIENT_ID not configured"}`. | Hub has no `GOOGLE_CLIENT_ID`. | Create a Google OAuth web client, set `GOOGLE_CLIENT_ID`, then restart Hub. | `packages/hub/views.ts:38`, `packages/hub/index.ts:321` |
| Sign-in fails with `sign-in rejected: email not verified`. | Google has not verified the account's email address. | Sign in with an account whose email Google has verified. | `packages/hub/google.ts:21`, `packages/hub/index.ts:333` |
| Sign-in fails with another `sign-in rejected: …` message. | Hub could not verify the Google ID token, for example because it was issued for another client ID. | Check that the server's `GOOGLE_CLIENT_ID` is the client whose JavaScript origin you configured. | `packages/hub/index.ts:333` |
| A form or sign-in answers 403 `Bad origin` (or `{"error":"bad origin"}`). | The request's `Origin` host does not match the `Host` header Hub receives, for example behind a proxy that rewrites `Host`. | Make the proxy forward the original `Host` header, and open Hub on the host name the proxy serves. | `packages/hub/index.ts:319`, `:378` |
| You sign in, then land back on the sign-in page. | The `hub_session` cookie is `Secure`, so the browser does not send it over plain HTTP. | Open Hub over `https://`. On your own machine, use `http://localhost`, which browsers treat as secure. | `packages/hub/index.ts:94` |
| `Organization not found` or `Project not found`. | You are not a member of that organization. Hub answers the same way for an organization that does not exist. | Ask an owner to add your email under **Allowed members**. A user allowed only by domain can submit tickets but cannot open the dashboard. | `packages/hub/index.ts:345`, `:351-353` |
| `Only an organization owner can do that`. | You are a `member`, and the action is owner-only. | Ask an owner to make the change, or to give you the `owner` role. | `packages/hub/index.ts:359` |
| `Allowed domain is not a valid domain`. | The domain has characters other than letters, digits, hyphens and dots, or no dot. | Enter a bare domain such as `acme.com`, with no `https://` and no path. | `packages/hub/index.ts:395` |
| `Enter a valid email`. | The member email is not a valid address. | Enter a full address, such as `dev@acme.com`. | `packages/hub/index.ts:414` |
| `An organization needs at least one owner`. | You tried to remove the last owner. | Add another owner first, then remove this one. | `packages/hub/index.ts:418` |
| `Webhook URL must be an http(s) URL` or `Inbound URL must be an http(s) URL`. | The URL does not start with `http://` or `https://`, cannot be parsed, or is longer than 2000 characters. | Enter a full URL, for example `https://tracker.example.com/loupe/v1/hub/inbound`. | `packages/hub/index.ts:428`, `:455` |
| `That project has no inbound URL, so it cannot receive tickets`. | The destination project has no inbound URL. | Set the destination's inbound URL first, then set the route. | `packages/hub/index.ts:468` |
| A route disappeared. | Someone cleared the destination project's inbound URL, which clears every route that points at it. | Set the inbound URL again, then set the route again. | `packages/hub/store.ts:186-193` |

### Signed API and deliveries

To check signatures on your receiver, see [Verify Hub webhooks](how-to/verify-hub-webhooks.md).

| Symptom | Cause | Fix | Source |
|---|---|---|---|
| `401 {"error":"missing X-Loupe-Project, X-Loupe-Timestamp or X-Loupe-Signature"}`. | The request to Hub lacks one of the three signing headers. | Send all three headers. | `packages/hub/index.ts:164` |
| `401` with `invalid timestamp`, `timestamp out of range` or `invalid signature`. | The timestamp is not 1-12 digits, is more than 300 seconds from Hub's clock, or the HMAC does not match the project secret. | Sign `<TIMESTAMP>.<RAW_BODY>` with the project secret, using the current Unix time, and sync your clock. | `packages/hub/crypto.ts:31-33` |
| `404 {"error":"unknown project"}`. | `X-Loupe-Project` names a project that Hub does not have. | Copy the project ID from the Hub project page. | `packages/hub/index.ts:167` |
| `403 {"error":"user not in organization"}`. | The reporter's email is not a member, and its domain is not the organization's allowed domain. | Add the email under **Allowed members**, or set the allowed domain. | `packages/hub/index.ts:214` |
| `400 {"error":"user.email required"}` or `{"error":"issue.id required"}`. | The ingest body lacks a valid reporter email or an issue id. | Send `user.email` and a non-empty `issue.id`. | `packages/hub/index.ts:207-210` |
| `413 payload too large`. | The body is over Hub's cap: 5,000,000 bytes for ingest, 1,000,000 for updates. | Attach fewer or smaller files. | `packages/hub/index.ts:15`, `:17`, `:50` |
| Ingest answers `202` with `"delivery":"none"`, and no row appears under **Last 20 deliveries**. | The project has no destination and no webhook, so Hub accepted the ticket without sending it. | On the project page, under **Routing**, choose a project in **Send tickets to** and click **Save route**, or save a webhook URL. Only owners see these forms. | `packages/hub/index.ts:240`, `packages/hub/views.ts:152-163` |
| An update answers `404 {"error":"unknown ticket"}`. | No successful project-to-project delivery has this issue id. Tickets sent to a plain webhook cannot carry updates. | Route the ticket to another project instead of a webhook. | `packages/hub/store.ts:250-265` |
| An update answers `403 {"error":"this project does not hold the ticket"}`. | The calling project is neither the sender nor the receiver of the ticket. | Send the update from one of the two projects. | `packages/hub/index.ts:294` |
| **Error** `timeout after 10000ms`. | The receiver did not answer within 10 seconds, three times. | Make the receiver answer quickly, and do slow work in a queue. | `packages/hub/webhook.ts:205` |
| **Error** `refused: <HOST> resolves to a private address (<IP>)`. | **After 0.14.0 only** (listed as Unreleased in the changelog): Hub refuses loopback, private, link-local and other non-public addresses. A 0.14.0 Hub never shows this error. | Use a public URL. For local development only, start Hub with `HUB_ALLOW_PRIVATE_URLS=1`. Never set it on a public Hub. | `packages/hub/webhook.ts:52`, `:95` |
| **Error** `HTTP 3xx`. | Hub never follows redirects, so a redirect counts as a failure. | Set the URL to the final address, for example with `https://` instead of `http://`. | `packages/hub/webhook.ts:192`, `:201` |

### Self-hosting

| Symptom | Cause | Fix | Source |
|---|---|---|---|
| Hub exits at start with `HUB_SESSION_SECRET is required in production`. | `NODE_ENV` is `production`, and `HUB_SESSION_SECRET` is not set. | Set `HUB_SESSION_SECRET` to the output of `openssl rand -hex 32`. If you set up the VM with `packages/hub/deploy/setup-vm.sh`, check `/etc/loupe-hub.env`, which that script writes. | `packages/hub/index.ts:25`, `packages/hub/deploy/setup-vm.sh:55-63` |
| `deploy.sh` prints service logs and exits with status 1. | Hub did not answer `/v1/health` within 20 seconds after the restart. | Read the printed `journalctl` lines, fix the error, and run `deploy.sh` again. | `packages/hub/deploy/deploy.sh:28-29` |

## Known issues in 0.14.0

These defects exist in the 0.14.0 code. Each entry gives a workaround where one exists.

### `@loupekit/mcp` 0.14.0 fails with `ERR_MODULE_NOT_FOUND`

The published package imports `@loupekit/shared` at run time, but its `package.json` lists `@loupekit/shared` only under `devDependencies`. The build keeps the import external, so `npx -y @loupekit/mcp` fails at start (`packages/mcp/index.ts:43-53`, `packages/mcp/tsup.config.ts:14`, `packages/mcp/package.json:49-51`).

Workaround: run the server from source.

Prerequisites: Git, and Node.js 24, the version CI uses (`.github/workflows/ci.yml:15`).

1. Clone the repository and install its dependencies:

   ```bash
   git clone https://github.com/mohamed-ashraf-elsaed/loupe.git
   cd loupe
   npm install
   ```

   You should see `npm install` finish without errors.

2. Build the shared package:

   ```bash
   npm run build:shared
   ```

   You should see `packages/shared/dist/index.js` appear (`packages/shared/package.json:30`).

3. Point your MCP client at the source entry:

```json
{
  "mcpServers": {
    "loupe": {
      "command": "node",
      "args": ["<CLONE_PATH>/packages/mcp/index.ts"],
      "env": {
        "LOUPE_API": "<API_BASE>",
        "LOUPE_PROJECT_KEY": "<PROJECT_KEY>",
        "LOUPE_ADMIN_KEY": "<PROJECT_SECRET>"
      }
    }
  }
}
```

- `<CLONE_PATH>`: the absolute path of your clone.
- `<API_BASE>`: your backend's base URL, for example `http://localhost:8787`.
- `<PROJECT_KEY>`: your project key, for example `pk_demo_acme`.
- `<PROJECT_SECRET>`: the project's admin secret.

4. Restart your MCP client so it starts the server again.

Verify: in your MCP client, list the MCP servers, for example with `/mcp` in Claude Code. You should see `loupe` listed as connected, with tools such as `list_comments`. See [Connect MCP clients](how-to/connect-mcp-clients.md).

### `get_recent_events` throws

The handler declares `const events = events.latest(...)`, which reads the new variable before it exists, so the tool always fails (`packages/mcp/index.ts:485`).

Workaround: use `get_activity_summary` or `get_files_touched`, or open the `/monitor` page that `get_dashboard_url` returns.

### The integration delivery log is not scoped to a project

`GET /v1/integrations/deliveries` checks that the caller is an admin of the project in `projectKey`, then lists deliveries for every project on the server, because `listDeliveries` has no project filter (`packages/server/index.ts:281-287`, `packages/server/integrations.ts:403-410`).

Workaround: run one local server per team that may see each other's delivery log.

### Notification deep links do not focus the comment

Integration messages link to `<BASE>/dashboard/?comment=<ID>` (`packages/server/delivery.ts:185`). The dashboard reads only `api`, `project` and `key` from the query string (`packages/dashboard/app.ts:24-33`), so the link opens the board without selecting the comment.

Workaround: search the board for the comment title.

### Laravel migrations 000007 and 000008 ignore a custom `loupe.table`

The migrations that add `pr` (`2024_01_01_000007`) and `source`/`forwarded` (`2024_01_01_000008`) name the table `loupe_comments` directly instead of reading `config('loupe.table')` (`packages/laravel/database/migrations/2024_01_01_000007_add_pr_to_loupe_comments.php:16`, `:23`; `packages/laravel/database/migrations/2024_01_01_000008_add_source_and_forwarded_to_loupe_comments.php:19`, `:27`).

Workaround: if you set `loupe.table`, edit your published copies of both files to use your table name, then run `php artisan migrate`.

## Next steps

- If your symptom is not here, search the [issue tracker](https://github.com/mohamed-ashraf-elsaed/loupe/issues), or open an issue with the exact message, the request's status code and body, and the version line from **Settings**.
- To check settings and defaults, see the reference pages: [SDK](reference/sdk.md), [Laravel package](LARAVEL.md), [Local server](reference/server.md), [MCP server](reference/mcp.md), [Browser extension](reference/extension.md), [Hub](reference/hub.md).
- To understand identity checks and signatures, see [Authentication and privacy](explanation/auth-and-privacy.md).
- To move to a new version, see [Upgrade Loupe](how-to/upgrade.md).
