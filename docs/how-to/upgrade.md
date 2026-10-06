# Upgrade Loupe

This guide shows you how to move each Loupe package to a newer version: the npm packages, the Laravel package, the browser extension, Loupe Hub, and the local server. Loupe Hub (Hub) is the service that holds organizations and projects and routes tickets between Loupe installs. See [How Loupe Hub works](../explanation/hub.md).

Upgrade one package at a time. Before you start, read the [Version notes](#version-notes) for every version between the one you run and the one you move to.

## Contents

- [Prerequisites](#prerequisites)
- [Version notes](#version-notes)
- [npm packages](#npm-packages)
- [Laravel package](#laravel-package)
- [Browser extension](#browser-extension)
- [Loupe Hub](#loupe-hub)
- [Local server](#local-server)
- [Verify](#verify)
- [Troubleshooting](#troubleshooting)
- [Next steps](#next-steps)

## Prerequisites

- **The version you run now.** Read it in one of these places:
  - In the widget: click the launcher (the round button in a corner of the page) to open the panel, then click the gear (**Settings**) in the panel header. The bottom line reads `Loupe v<VERSION>`. This is the version of the widget bundle the page serves. See [Use the Loupe widget](use-the-widget.md) for the launcher and the panel.
  - For an npm install, run `npm ls @loupekit/sdk`.
  - For a Laravel install, run `composer show loupekit/laravel`. On Laravel, the widget can lag behind the package until you republish the assets.
- **The version you want.** Take it from `npm view @loupekit/sdk dist-tags`, from Packagist, or from the [changelog](https://github.com/mohamed-ashraf-elsaed/loupe/blob/main/CHANGELOG.md).
- **A backup of your database** before any Laravel upgrade that adds a migration. One migration, in 0.10.8, cannot be rolled back.
- **For the extension, Hub, and the local server:** a checkout of the [Loupe repository](https://github.com/mohamed-ashraf-elsaed/loupe) with Node.js 24. Run every repository command from the repository root.

The steps use these placeholders:

| Placeholder | Meaning | Example |
|---|---|---|
| `<VERSION>` | The version you upgrade to | `0.14.1` |
| `<OLD>` | The version you run now | `0.14.0` |
| `<NEW>` | The version you upgrade to, as Composer and the widget print it | `0.14.1` |

## Version notes

This table lists every version that needs an action. A version that is not listed needs no action beyond the normal upgrade steps. For every change in a version, see the [changelog](https://github.com/mohamed-ashraf-elsaed/loupe/blob/main/CHANGELOG.md).

| Version | What changed | Action |
|---|---|---|
| 0.3.0 | First release of `loupekit/laravel`. | Install with [Install the Laravel package](laravel-install.md). |
| 0.3.2 | `url` became `VARCHAR(500)` and `project_key` `VARCHAR(191)`, so the composite index works on MySQL. | Fresh installs only. The change is in the create-table migration. |
| 0.3.3 | New `allow_in_local` config key, default `true`. The baseline `loupe:use` and `loupe:admin` gates now deny by default. A gate is a Laravel authorization check that answers whether a user may do something. | Outside `local`, define both gates in `app/Providers/LoupeServiceProvider.php`. If you do not have that file, publish it with `php artisan vendor:publish --tag=loupe-provider`, then register it as [Authorize who can use Loupe](laravel-authorize.md) describes. |
| 0.4.0 | New `viewport` column. | Publish migrations and run `php artisan migrate`. |
| 0.4.2 | Assets load from the app URL, not `ASSET_URL`. New `LOUPE_ASSET_URL`. | Set `LOUPE_ASSET_URL` only if you serve `public/vendor/loupe` from another origin. |
| 0.4.3 | New `LOUPE_GUARDS` and the `loupe.auth` middleware for apps with several auth guards. | Multi-guard apps: set `LOUPE_GUARDS`, for example `web,admin`. If you published the config earlier, replace `auth` with `loupe.auth` in `middleware.api` and `middleware.dashboard`. |
| 0.5.0 | Free notes (`kind` `free`). No migration. | None. |
| 0.7.0 | New `recording_url` and `proposal` columns. New MCP tool `propose_change`. `get_comment` returns the screenshot as an image. | Publish migrations and run `php artisan migrate`. |
| 0.8.0 | Hub forwarding: `hub.*` config and the `SendToHub` job. | Optional. Set `LOUPE_HUB_URL`, `LOUPE_PROJECT_ID` and `LOUPE_PROJECT_SECRET` to forward new comments to Hub. |
| 0.8.1 | Asset URLs carry `?v=`. | Republish assets with `--force`. |
| 0.9.0 | New `title` and `attachments` columns. | Publish migrations and run `php artisan migrate`. |
| 0.9.1 | The identity check uses `describeUser()`, so a custom `user_resolver` is honored. | None. |
| 0.9.3 | `user_resolver` may be a class-string or `[class, method]`, which survives `config:cache`. | If `user_resolver` is a Closure, replace it with a class-string. |
| 0.10.5 | A guest gets a 403 instead of a 500 when the app has no `login` route. | None. |
| 0.10.7 | The PHP floor dropped to `^8.2`. `loupe:install` warns when there is no `login` route. | None. |
| 0.10.8 | The dashboard board now has five stages (columns): `queue`, `todo`, `in_progress`, `in_review` and `resolved`. A data migration rewrites the status `open` to `queue` and `done` to `resolved`. | **Back up first.** Publish migrations and run `php artisan migrate`. This migration is irreversible: its `down()` does nothing, so `migrate:rollback` leaves the new values in place. |
| 0.10.9 | Priority and change type on every comment. | Publish migrations and run `php artisan migrate`. |
| 0.10.10 | New `repo` and `branch` columns. The comments list filters in SQL by `repo`, `branch`, `status`, `priority`, `changeType`, `kind` and `q`. | Publish migrations and run `php artisan migrate`. |
| 0.10.15 | New `pr` column. | Publish migrations and run `php artisan migrate`. |
| 0.10.18 | A missing column no longer causes a 500. The write keeps only existing columns and logs a warning. | Run `php artisan migrate` if you skipped it after 0.10.15. |
| 0.11.0 | New `timezone` and `locale` config keys (`LOUPE_TIMEZONE`, `LOUPE_LOCALE`). The widget receives `packageVersion`. | Optional: set the two keys. Republish assets so the version check passes. |
| 0.12.0 | Hub inbound receiver, the `TicketReceived` event, `GET v1/org`, `GET v1/activity`, and the `loupe_activity` table. The widget options `repo`, `branch` and `repos` were removed; stored values stay. | Publish migrations and run `php artisan migrate` (adds `source`, `forwarded` and `loupe_activity`). Remove `repo`, `branch` and `repos` from your `init()` call. If you forward to a self-hosted Hub, redeploy it. |
| 0.13.0 | Routes for replies, reactions, people and notifications. Events `CommentCreated`, `CommentStatusChanged`, `CommentDeleted`, `MessageAdded` and `HubUpdateReceived`. `Loupe::reply()` and `Loupe::describeTicket()`. `PATCH v1/comments/{id}` answers 422 for an unknown status. Only the author or an admin can delete a comment. | Publish migrations and run `php artisan migrate` (adds `loupe_messages`, `loupe_reactions`, `loupe_notifications`). Update any client that sent other status values, or that deleted other users' comments. If you forward to a self-hosted Hub, redeploy it. |
| 0.13.1 | The widget re-reads comments, threads and the inbox every 10 seconds. | Widget only. Update the SDK, or republish Laravel assets. |
| 0.14.0 | Resolve, Open and Delete on Home rows. Status filter, sort order and collapsible day groups on Comments. | Widget only. Update the SDK, or republish Laravel assets. **`@loupekit/mcp` 0.14.0 does not start through `npx`.** Upgrade it to 0.14.1. |
| 0.14.1 | Hub refuses to deliver to loopback, private, link-local, carrier-grade NAT, multicast and reserved addresses (`packages/hub/webhook.ts:52`, `:95`). Hub keeps a ticket's `reply_url` only when its path ends with `/v1/hub/inbound`, it carries no credentials, and it shares the origin of the source project's inbound URL when one is registered (`packages/hub/index.ts:145-150`). `@loupekit/mcp` lists `@loupekit/shared` as a runtime dependency, so `npx -y @loupekit/mcp` starts again. The MCP tool `get_recent_events` works, and `update_status` refuses `resolved`. | Redeploy Hub ([Loupe Hub](#loupe-hub)). Make every webhook URL, inbound URL and app URL public. If Hub and your apps run on one machine for local development, start Hub with `HUB_ALLOW_PRIVATE_URLS=1`; never set it on a public Hub. If status changes and replies stop reaching a source app, see [Troubleshooting](../troubleshooting.md#hub). Update `@loupekit/mcp` to 0.14.1 ([npm packages, step 5](#npm-packages)). An agent that set `resolved` through `update_status` now gets a refusal; have it set `in_review` or call `mark_thread_addressed`. |

## npm packages

The npm packages are `@loupekit/sdk` (the widget), `@loupekit/shared` (types and helpers), and `@loupekit/mcp` (the Model Context Protocol server, which lets an AI agent read and update Loupe comments; see [Connect Claude Code and other MCP clients](connect-mcp-clients.md)).

### Understand the two release channels

Each package has two *dist-tags*. A dist-tag is a name that npm maps to one version.

| Dist-tag | Published when | Use it for |
|---|---|---|
| `latest` | A maintainer pushes a `vX.Y.Z` tag. | Production. |
| `next` | Every push to the `main` branch. | Trying a fix before it is released. |

A `next` build is a *canary*: a prerelease version in the form `<BASE>-next.<N>`. `<BASE>` is the version in `packages/shared/package.json` at the time of the push, which is the current release, and `<N>` is the CI run number. SemVer sorts a prerelease below its base, so `0.14.0-next.81` is older than `0.14.0` as far as npm ranges are concerned. A canary is ahead of the release only in code, not in version order. Never rely on a range such as `^0.14.0` to pick up a canary.

### Steps

1. List the versions each tag points to:

   ```bash
   npm view @loupekit/sdk dist-tags
   ```

   You should see an object with a `latest` key and a `next` key, each followed by a version.

2. Install one exact version of the SDK. Replace `<VERSION>` with the version you chose in step 1, for example `0.14.1`:

   ```bash
   npm i @loupekit/sdk@<VERSION> --save-exact
   ```

   You should see npm report that it changed (or added) packages. `package.json` now lists `"@loupekit/sdk": "<VERSION>"` with no `^`, so a later `npm install` cannot move you to another version.

3. If you also install `@loupekit/shared` or `@loupekit/mcp`, move them to the same version in the same command:

   ```bash
   npm i --save-exact @loupekit/sdk@<VERSION> @loupekit/shared@<VERSION> @loupekit/mcp@<VERSION>
   ```

   You should see npm report that it changed (or added) packages. The three packages are released together at the same version number. Install them at matching versions, so the types match the running code.

4. Rebuild and redeploy your app, so the new bundle reaches your users.

   You should see your build finish without errors. After the deploy, the widget shows `Loupe v<NEW>` (see [Verify](#verify)).

5. If an MCP client starts the server with `npx`, pin the version in the client config. A restart alone is not enough: `npx` can reuse a copy it cached earlier. Change the argument to `@loupekit/mcp@<VERSION>`:

   ```json
   "args": ["-y", "@loupekit/mcp@<VERSION>"]
   ```

   Then restart the client. You should see the `loupe` server listed as connected (in Claude Code, run `/mcp`).

   > **Note:** `@loupekit/mcp` 0.14.0 exits with `ERR_MODULE_NOT_FOUND` for `@loupekit/shared` when you start it with `npx`. Fixed in 0.14.1: pin `@loupekit/mcp@0.14.1` or later.

## Laravel package

The Laravel package `loupekit/laravel` defines five publish tags: `loupe-config`, `loupe-migrations`, `loupe-provider`, `loupe-assets` and `loupe-views`. Composer updates the PHP code in `vendor/`, but it does not copy anything into your app. On upgrade, two tags matter every time: `loupe-assets` (the widget and dashboard JavaScript) and `loupe-migrations`. You publish them with `vendor:publish`.

### Steps

1. Check the version constraint in your app's `composer.json`:

   ```bash
   composer show loupekit/laravel
   grep loupekit/laravel composer.json
   ```

   You should see the installed version and a line such as `"loupekit/laravel": "^0.13.1"`. Loupe is in 0.x, and on 0.x a caret constraint allows only patch updates: `^0.13.1` means `>=0.13.1 <0.14.0`.

2. Require the new version. Replace `<VERSION>` with the version you want:

   ```bash
   composer require loupekit/laravel:^<VERSION>
   ```

   You should see `  - Upgrading loupekit/laravel (v<OLD> => v<NEW>)`. For a patch release within your current minor version, `composer update loupekit/laravel` also works.

3. Copy the new widget and dashboard bundles over the old ones:

   ```bash
   php artisan vendor:publish --tag=loupe-assets --force
   ```

   You should see a `Copying directory` line that ends in `DONE`. It writes `public/vendor/loupe/sdk/loupe.js` and `public/vendor/loupe/dashboard/app.js`. `--force` is required, because the files already exist. The page serves the widget from `public/vendor/loupe`, not from `vendor/`, so if you skip this step users keep the old widget.

4. Copy any new migrations into your app:

   ```bash
   php artisan vendor:publish --tag=loupe-migrations
   ```

   You should see a `Copying directory` line that ends in `DONE`. Do not pass `--force` here. Without it, Laravel skips the migration files you already have and copies only the new ones. The package does not load migrations from `vendor/`, so a migration that is not published never runs.

5. Run the migrations:

   ```bash
   php artisan migrate
   ```

   You should see one line per new migration, or `Nothing to migrate.` when the release added none. If you skip this step, comment writes still succeed, but the package drops every attribute whose column does not exist and logs a warning. The newest fields stay empty until you migrate.

6. If you cache config, routes, or views, rebuild the caches. New releases add routes (0.12.0 and 0.13.0 did):

   ```bash
   php artisan optimize:clear
   php artisan optimize
   ```

   You should see each command print an `INFO` line, then one line per cache that ends in `DONE`.

7. If you published the views (`--tag=loupe-views`), your app has its own copies of the package's Blade templates in `resources/views/vendor/loupe/`. Steps 1-6 do not update them. Compare them with the package's views:

   ```bash
   diff -r vendor/loupekit/laravel/resources/views resources/views/vendor/loupe
   ```

   You should see no output when they match. Carry any difference you did not make yourself into your copies.

The script URL carries `?v=<stamp>`, built from the published file's modification time and size, so a new bundle gets a new URL and browsers and CDNs fetch it right away.

## Browser extension

These steps assume you loaded the extension unpacked from `packages/extension` in Chrome, as in [Use the Loupe browser extension](browser-extension.md). An unpacked extension updates only when you rebuild it and reload it.

### Steps

1. From the repository root, pull the new code, then install dependencies:

   ```bash
   git pull
   npm install
   ```

   You should see `git pull` list the changed files, and npm report that it added or changed packages.

2. From the repository root, build every package:

   ```bash
   npm run build
   ```

   This builds `@loupekit/shared`, `@loupekit/sdk`, `@loupekit/mcp`, `@loupekit/dashboard` and `@loupekit/extension`, in that order. The extension bundles the SDK from `packages/sdk/dist/`, which is not in git, so `npm run build:extension` alone would bundle a stale SDK, or fail on a clean checkout.

   You should see the command finish without errors, and `packages/extension/content.js` has a new modification time.

3. Open `chrome://extensions`.
4. Find **Loupe — visual feedback** and click its reload icon.

   You should see the version under the extension name change to the new version.

5. Reload every tab where Loupe was running. A tab keeps the old content script until it reloads.

   You should see the widget's Settings menu show `Loupe v<NEW>` in that tab.

Your popup settings live in `chrome.storage.local` and survive the reload.

## Loupe Hub

Hub runs from a repository checkout. Pick the procedure that matches how you installed it in [Self-host Loupe Hub](hub-self-host.md).

### Upgrade a Hub deployed with deploy.sh

#### Prerequisites

- The Google Cloud CLI (`gcloud`), signed in on the gcloud configuration named `loupe-hub`. The script uses that configuration unless you set `CLOUDSDK_ACTIVE_CONFIG_NAME`.
- SSH access to the Hub VM through IAP. The script copies and runs files with `gcloud compute scp` and `gcloud compute ssh --tunnel-through-iap`.
- If you changed them at install time, the zone and the VM name. The script reads `ZONE` (default `us-central1-a`) and `VM` (default `loupe-hub`).

#### Steps

1. From the repository root, pull the new code:

   ```bash
   git pull
   ```

   You should see `git pull` list the changed files, or `Already up to date.`

2. From the repository root, deploy it. Replace `<GCP_PROJECT_ID>` with the Google Cloud project that holds the Hub VM:

   ```bash
   GCP_PROJECT=<GCP_PROJECT_ID> bash packages/hub/deploy/deploy.sh
   ```

   If you use another zone or VM name, add them in front, for example `ZONE=<ZONE> VM=<VM_NAME> GCP_PROJECT=<GCP_PROJECT_ID> bash packages/hub/deploy/deploy.sh`.

   The script uploads `package.json`, the `.ts` files and `tools/`, installs production dependencies on the VM, moves the running release to `/opt/loupe-hub.old`, puts the new one in `/opt/loupe-hub`, and restarts the `loupe-hub` service. It then polls `/v1/health` for up to 20 seconds.

   You should see `deploy: ok` on the last line.

Hub migrates its schema on every start, so the restart applies any new columns. You do not run a separate migration command.

#### Roll back

There is no rollback command. The previous release stays in `/opt/loupe-hub.old` until the next deploy deletes it. To go back, deploy the previous tag. Replace `<PREVIOUS_VERSION>` with the version you ran before, for example `0.13.1`:

```bash
git fetch --tags
git checkout v<PREVIOUS_VERSION>
GCP_PROJECT=<GCP_PROJECT_ID> bash packages/hub/deploy/deploy.sh
```

A schema change made by the newer release stays in place after a rollback. Back up the Hub database before you upgrade, so you can restore it if the older release cannot use the new schema.

### Upgrade a Hub that runs on any other host

1. From the repository root, pull the new code and install dependencies:

   ```bash
   git pull
   npm install
   ```

   You should see `git pull` list the changed files, and npm report that it added or changed packages.

2. Stop the running Hub process, then start it again with the same settings you used at install, for example:

   ```bash
   NODE_ENV=production \
   HUB_SESSION_SECRET=<SESSION_SECRET> \
   GOOGLE_CLIENT_ID=<GOOGLE_CLIENT_ID> \
   DATABASE_URL=<DATABASE_URL> \
   node packages/hub/index.ts
   ```

   If a process manager runs Hub, restart it there instead. You should see `[hub] Loupe Hub on http://127.0.0.1:8790`, or the host and port you set with `HOST` and `PORT`.

Hub migrates its schema on start, so you do not run a separate migration command.

## Local server

The local server (`@loupekit/server`) runs from a repository checkout.

### Steps

1. Stop the running server with `Ctrl+C`.

   You should see your shell prompt return.

2. From the repository root, pull the new code, install dependencies, and build:

   ```bash
   git pull
   npm install
   npm run build
   ```

   You should see each command finish without errors.

3. Start the server:

   ```bash
   npm start
   ```

   You should see this line, with your `PORT` value in place of `8787` if you set one:

   ```text
   [loupe] API + static on http://localhost:8787  (dashboard: /dashboard/ · demo: /demo/)
   ```

The server migrates its database at start. The migration also rewrites legacy statuses: `open` becomes `queue` and `done` becomes `resolved`.

## Verify

1. Open a page where the widget runs, and hard-reload it (`Ctrl+Shift+R`, or `Cmd+Shift+R` on macOS).
2. Click the launcher to open the panel, then click the gear (**Settings**) in the panel header.

   You should see `Loupe v<NEW>` at the bottom, followed by `server` when the widget talks to a backend, or `offline` when it stores comments in the browser.

   ![The widget's Settings menu, with the version line Loupe v0.14.0 and the word server at the bottom](../images/sdk-settings.png)

3. On a Laravel app, look at the version line again.

   You should see no `package v…` note after the version. A note there means the served bundle and the installed package differ: the widget compares its own version with the `packageVersion` the package passes to it. The same note appears in the footer of the panel's Home tab.

4. On a Laravel app, confirm no migration is pending:

   ```bash
   php artisan migrate:status
   ```

   Every Loupe migration should read `Ran`.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `composer update loupekit/laravel` prints `Nothing to modify in lock file` and the version stays the same. | Your constraint is a 0.x caret such as `^0.13.1`, which allows only patch updates. | Run `composer require loupekit/laravel:^<VERSION>`. |
| The Settings menu shows `package v<NEW>` after the version, in a warning style. Its tooltip reads "This widget bundle is v<OLD> but the installed package is v<NEW>. Re-publish the package assets so the served bundle matches." | The package was updated but the published bundle in `public/vendor/loupe` is the old one. | Run `php artisan vendor:publish --tag=loupe-assets --force`. |
| The version line still shows the old version after you republished. | Your browser or a CDN holds a cached copy of the page, which references the old `?v=` URL. | Hard-reload the page. If a CDN caches your HTML, purge it. |
| The log shows ``[loupe] <TABLE> is missing <COLUMNS> — run `php artisan migrate` to add it.`` (or `them`). `<TABLE>` is `loupe_comments`, or your custom `loupe.table`. | A migration from the new release has not run. | Run `php artisan vendor:publish --tag=loupe-migrations`, then `php artisan migrate`. |
| `php artisan migrate` says `Nothing to migrate.`, but the warning above stays. | The new migration files were never copied into `database/migrations`. | Run `php artisan vendor:publish --tag=loupe-migrations` without `--force`, then migrate again. |
| The `pr` or `source`/`forwarded` migration fails with a missing-table error while you use a custom `loupe.table`. | The migrations that add `pr` (`2024_01_01_000007`) and `source`/`forwarded` (`2024_01_01_000008`) name the table `loupe_comments` directly. | Edit your published copies of those two files to use your table name, then migrate. |
| Moving a comment fails with 422 `unknown status; use one of queue, todo, in_progress, in_review, resolved`. | Since 0.13.0, `PATCH` refuses statuses that are not board stages or the legacy `open`/`done`. | Send one of the listed stages. |
| Deleting a comment fails with 403 `only the author or an admin can delete this`. | Since 0.13.0, only the author or a user who passes dashboard authorization can delete. | Delete as the author, or grant the user the `loupe:admin` gate. |
| `migrate:rollback` did not restore `open` and `done` statuses. | The 0.10.8 board migration's `down()` is empty on purpose. | Restore from the backup you took before the upgrade. |
| The extension still behaves like the old version. | The tab kept the old content script, or the extension was built against a stale SDK build. | From the repository root, run `npm run build`, reload the extension on `chrome://extensions`, then reload the tab. |
| `deploy.sh` ends with service logs and exits 1. | The new Hub did not answer `/v1/health` within 20 seconds. | Read the printed `journalctl` lines. To go back, follow [Roll back](#roll-back). |

## Next steps

- Read the full [changelog](https://github.com/mohamed-ashraf-elsaed/loupe/blob/main/CHANGELOG.md) for every change in the versions you skipped.
- [Install the Laravel package](laravel-install.md) explains each publish tag.
- [Install Loupe with npm in a bundled app](install-npm.md) covers installing a pinned version and `init()` options.
- [Use the Loupe widget](use-the-widget.md) shows the new widget features.
- [Troubleshoot Loupe](../troubleshooting.md) covers problems that are not specific to an upgrade.
