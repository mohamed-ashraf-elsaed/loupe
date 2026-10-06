# Laravel package reference

This page is the reference for `loupekit/laravel`, the Laravel adapter for Loupe. It lists the
configuration keys, routes, middleware, facade methods, events, database tables and the
[MCP server](#mcp-server), as the package code defines them.

This page does not walk you through a task. For step-by-step procedures, see:

- [Install Loupe in a Laravel app](how-to/laravel-install.md)
- [Decide who can use Loupe](how-to/laravel-authorize.md)
- [Upgrade Loupe](how-to/upgrade.md)
- [Connect Claude Code and other MCP clients](how-to/connect-mcp-clients.md)
- [Troubleshoot Loupe in a Laravel app](troubleshooting.md#laravel)

For the JSON shape of a comment, see [the `Comment` type](reference/shared.md#index-comment).

Paths in the **Source** columns are relative to `packages/laravel/` in the monorepo unless stated
otherwise. In an app that installed the package with Composer, the same files are under
`vendor/loupekit/laravel/`.

Terms used on this page:

- **MCP** (Model Context Protocol): the protocol an AI coding agent uses to call tools. See
  [MCP server](#mcp-server).
- **Loupe Hub**: an optional service that carries tickets between projects in one organization.
  See [Loupe Hub sender and receiver](#loupe-hub-sender-and-receiver).
- **Stage**: a comment's position on the triage board, such as `queue` or `in_review`. See
  [Stages and triage values](#stages-and-triage-values).
- **Blob**: an uploaded screenshot, recording or attachment file, stored on `loupe.disk` and served
  by the blob route. See [Blobs](#blobs).

## Contents

- [Requirements](#requirements)
- [Configuration](#configuration)
- [Routes](#routes)
- [Middleware](#middleware)
- [Authorization order](#authorization-order)
- [Gates and the published provider](#gates-and-the-published-provider)
- [Facade methods](#facade-methods)
- [Events](#events)
- [The `@loupeWidget` Blade directive](#the-loupewidget-blade-directive)
- [Publish tags](#publish-tags)
- [Artisan command](#artisan-command)
- [HTTP API behavior](#http-api-behavior)
- [Loupe Hub sender and receiver](#loupe-hub-sender-and-receiver)
- [Migrations](#migrations)
- [Missing columns: `Columns::only`](#missing-columns-columnsonly)
- [Data model](#data-model)
- [Stages and triage values](#stages-and-triage-values)
- [MCP server](#mcp-server)
- [Asset URLs](#asset-urls)
- [Testing](#testing)

## Requirements

| Item | Value | Source |
|---|---|---|
| PHP | `^8.2` | `composer.json:28` |
| `illuminate/*` (support, console, database, http, routing, filesystem) | `^11.0\|^12.0\|^13.0` | `composer.json:29-34` |
| PHP on Laravel 13 | 8.3 or later. Laravel 13 does not install on PHP 8.2. | `.github/workflows/laravel.yml:30-32` (repository root) |
| MCP server (optional) | `laravel/mcp` `^0.8`. Not installed with the package: it is only a `suggest` entry, so install it yourself. See [MCP server](#mcp-server). | `composer.json:42-43` |
| Service provider | `Loupekit\Loupe\LoupeServiceProvider`, auto-discovered | `composer.json:55-64` |
| Facade alias | `Loupe` for `Loupekit\Loupe\Facades\Loupe`, auto-discovered | `composer.json:55-64` |

CI tests every combination of PHP 8.2, 8.3 and 8.4 with Laravel 11, 12 and 13, except PHP 8.2 with
Laravel 13. That is eight combinations
(`.github/workflows/laravel.yml:28-32`).

## Configuration

Publish the file with `php artisan vendor:publish --tag=loupe-config`. It lands at
`config/loupe.php`. Every key below is read from `config/loupe.php` in the package.

The **Line** column is a line in `config/loupe.php`. The **Example** column shows one valid value,
written as it would appear in `config/loupe.php` or, for a key with an env var, in `.env`.

| Key | Type | Default | Env var | Description | Example | Line |
|---|---|---|---|---|---|---|
| `enabled` | bool | `true` | `LOUPE_ENABLED` | Master switch. When false, no routes are registered and `@loupeWidget` renders nothing (`src/LoupeServiceProvider.php:78-80`). | `LOUPE_ENABLED=false` | `:14` |
| `path` | string | `'loupe'` | `LOUPE_PATH` | URL prefix of every Loupe route (`src/LoupeServiceProvider.php:83`) and the widget's `apiBase` (`:157`). | `LOUPE_PATH=feedback` | `:24` |
| `domain` | ?string | `null` | `LOUPE_DOMAIN` | Domain the Loupe routes are registered on (`src/LoupeServiceProvider.php:84`). `null` means every domain. | `LOUPE_DOMAIN=admin.example.com` | `:25` |
| `asset_url` | ?string | `null` | `LOUPE_ASSET_URL` | Base URL of Loupe's published assets. `null` means `app.url`. See [Asset URLs](#asset-urls). | `LOUPE_ASSET_URL=https://shop.example.com` | `:38` |
| `project_key` | string | `'app'` | `LOUPE_PROJECT_KEY` | Scopes every comment query (`src/Http/Controllers/CommentController.php:27`) and is sent to the widget (`resources/views/widget.blade.php:7`). | `LOUPE_PROJECT_KEY=shop` | `:47` |
| `middleware.api` | `list<string>` | `['web', 'loupe.auth']` | none | Middleware stack of the JSON API routes. | `['web', 'loupe.auth']` | `:59` |
| `middleware.dashboard` | `list<string>` | `['web', 'loupe.auth']` | none | Middleware stack of the dashboard route. | `['web', 'loupe.auth']` | `:60` |
| `guards` | `list<string>` | empty list | `LOUPE_GUARDS` | Auth guards that identify the user, in order; the first one with a signed-in user wins (`src/Loupe.php:43-48`). An empty list means the app's default guard. The env value is a comma-separated list; entries are trimmed and empty entries are dropped. | `LOUPE_GUARDS=web,admin` | `:74-77` |
| `authorize.use` | ?Closure | `null` | none | Decides who may use the widget and the API. Step 2 of the [authorization order](#authorization-order). | `fn ($user) => str_ends_with($user->email, '@acme.com')` | `:91` |
| `authorize.dashboard` | ?Closure | `null` | none | Decides who may open the dashboard. Step 2 of the authorization order. | `fn ($user) => $user->email === 'sara@acme.com'` | `:92` |
| `allow_in_local` | bool | `true` | none | When true, any signed-in user is allowed in the `local` environment. Step 4 of the authorization order (`src/Loupe.php:190-192`). | `false` | `:106` |
| `comment_model` | class-string | `Loupekit\Loupe\Models\Comment::class` | none | Eloquent model that stores comments. Its model events drive the [Events](#events) (`src/LoupeServiceProvider.php:97`). | `App\Models\FeedbackComment::class` | `:115` |
| `table` | string | `'loupe_comments'` | none | Table the comment model reads and writes (`src/Models/Comment.php:58-61`). See the known limitation under [Migrations](#migrations). | `'feedback_comments'` | `:116` |
| `user_resolver` | ?class-string | `null` | none | Class that describes the signed-in user to the widget. See the note below. | `App\Support\LoupeUserResolver::class` | `:132` |
| `people_resolver` | ?class-string | `null` | none | Class that returns the @mention list. See the note below. | `App\Support\LoupePeople::class` | `:144` |
| `allowed_emails` | `list<string>` | empty list | `LOUPE_ALLOWED_EMAILS` | Emails whose users appear in the @mention list. The env value is a comma-separated list; entries are trimmed and lowercased. | `LOUPE_ALLOWED_EMAILS=sara@acme.com,omar@acme.com` | `:146-149` |
| `timezone` | ?string | `null` (falls back to `app.timezone`) | `LOUPE_TIMEZONE` | IANA time zone the widget shows timestamps in (`src/LoupeServiceProvider.php:160`). | `LOUPE_TIMEZONE=Europe/London` | `:161` |
| `locale` | ?string | `null` (the browser's locale) | `LOUPE_LOCALE` | BCP 47 locale the widget formats dates with (`src/LoupeServiceProvider.php:161`). | `LOUPE_LOCALE=en-GB` | `:162` |
| `disk` | string | `'public'` | `LOUPE_DISK` | Filesystem disk that stores blobs. | `LOUPE_DISK=local` | `:172` |
| `blob_path` | string | `'loupe/screenshots'` | none | Directory on `disk` that holds blobs (`src/Http/Controllers/BlobController.php:87`). | `'loupe/blobs'` | `:173` |
| `hub.url` | ?string | `null` | `LOUPE_HUB_URL` | Base URL of your Loupe Hub. | `LOUPE_HUB_URL=https://hub.example.com` | `:189` |
| `hub.project_id` | ?string | `null` | `LOUPE_PROJECT_ID` | This app's project ID in Loupe Hub (`prj_…`). | `LOUPE_PROJECT_ID=<PROJECT_ID>` | `:190` |
| `hub.project_secret` | ?string | `null` | `LOUPE_PROJECT_SECRET` | This app's project secret in Loupe Hub (`psk_…`). It signs requests in both directions. | `LOUPE_PROJECT_SECRET=<PROJECT_SECRET>` | `:191` |
| `activity.enabled` | bool | `true` | `LOUPE_ACTIVITY` | Turns the activity feed on or off (`src/Http/Controllers/ActivityController.php:25`). | `LOUPE_ACTIVITY=false` | `:204` |
| `activity.retention_days` | int | `30` | none | Days an activity row is kept. | `14` | `:205` |

In the examples, `<PROJECT_ID>` and `<PROJECT_SECRET>` are the values Loupe Hub shows when you
create the project (`config/loupe.php:181-182`).

Notes on specific keys:

| Key | Note | Source |
|---|---|---|
| `user_resolver` | Use a class-string, not a closure. A closure makes `php artisan config:cache` fail with "the value at loupe.user_resolver is non-serializable". The resolver receives the user and returns the `{id, name, email}` array the widget shows. | `config/loupe.php:124-131`, `src/Loupe.php:99-120` |
| `people_resolver` | A class-string is resolved through the container and called with no arguments. It returns a list of `[id, name, email]` people for the @mention list. When set, it replaces the default list. | `config/loupe.php:138-142`, `src/Support/People.php:23-34` |
| `allowed_emails` | Feeds the @mention list only. It does not grant access to Loupe. Without a `people_resolver`, the list is the users of each guard whose email is in `allowed_emails`, plus the authors of recent comments in this project and of recent replies (up to 500 of each), excluding Hub users. The replies are not filtered by project. | `src/Support/People.php:37-69`, `:72-89` |
| `disk` | A private disk works. Files are streamed through the blob route. | `config/loupe.php:168-170` |
| `authorize.*` | A closure here wins over every other check, in every environment. See [Authorization order](#authorization-order). | `src/Loupe.php:179-183` |
| `hub.*` | Loupe Hub forwarding is on only when all three keys are set. | `src/Support/Hub.php:19-24` |
| `activity.retention_days` | Rows older than this are pruned on about one write in 100, so no scheduler entry is needed. Minimum 1. | `src/Support/ActivityLog.php:46`, `:52-57` |

## Routes

Routes are registered only when `loupe.enabled` is true. Every route sits under the `loupe.path`
prefix and, when set, on the `loupe.domain` domain (`src/LoupeServiceProvider.php:78-87`). The table
uses the default prefix `loupe`.

| Method | URI | Name | Middleware | Source |
|---|---|---|---|---|
| GET | `/loupe/v1/blobs/{id}` | `loupe.blobs.show` | none (public) | `routes/loupe.php:18` |
| POST | `/loupe/v1/hub/inbound` | `loupe.hub.inbound` | `VerifyHubSignature` | `routes/loupe.php:22-24` |
| GET | `/loupe/v1/comments` | `loupe.comments.index` | API group | `routes/loupe.php:29` |
| POST | `/loupe/v1/comments` | `loupe.comments.store` | API group | `routes/loupe.php:30` |
| PATCH | `/loupe/v1/comments/{id}` | `loupe.comments.update` | API group | `routes/loupe.php:31` |
| DELETE | `/loupe/v1/comments/{id}` | `loupe.comments.destroy` | API group | `routes/loupe.php:32` |
| POST | `/loupe/v1/blobs` | `loupe.blobs.store` | API group | `routes/loupe.php:33` |
| GET | `/loupe/v1/org` | `loupe.org` | API group | `routes/loupe.php:34` |
| GET | `/loupe/v1/activity` | `loupe.activity.index` | API group | `routes/loupe.php:35` |
| GET | `/loupe/v1/comments/{id}/messages` | `loupe.messages.index` | API group | `routes/loupe.php:36` |
| POST | `/loupe/v1/comments/{id}/messages` | `loupe.messages.store` | API group | `routes/loupe.php:37` |
| GET | `/loupe/v1/comments/{id}/reactions` | `loupe.reactions.index` | API group | `routes/loupe.php:38` |
| POST | `/loupe/v1/comments/{id}/messages/{messageId}/reactions` | `loupe.reactions.toggle` | API group | `routes/loupe.php:39` |
| GET | `/loupe/v1/people` | `loupe.people` | API group | `routes/loupe.php:40` |
| GET | `/loupe/v1/notifications` | `loupe.notifications.index` | API group | `routes/loupe.php:41` |
| POST | `/loupe/v1/notifications/read` | `loupe.notifications.read` | API group | `routes/loupe.php:42` |
| GET | `/loupe/dashboard` | `loupe.dashboard` | dashboard group | `routes/loupe.php:46-48` |
| MCP (local) | server handle `loupe` | n/a | n/a | `routes/ai.php:9` |

- **API group**: `config('loupe.middleware.api')` plus `loupe.authorize:use` (`routes/loupe.php:27`).
- **Dashboard group**: `config('loupe.middleware.dashboard')` plus `loupe.authorize:admin`
  (`routes/loupe.php:46`).
- The MCP route file loads only when `laravel/mcp` is installed
  (`src/LoupeServiceProvider.php:125-127`). See [MCP server](#mcp-server).

## Middleware

| Alias or class | What it does | Source |
|---|---|---|
| `loupe.auth` | Checks each guard in `loupe.guards` (or the default guard when the list is empty) and uses the first one with a signed-in user. A guard that throws is skipped. With no user: a non-JSON request in an app with no `login` route gets a 403 with "Unauthenticated. This app has no [login] route to redirect to — sign in your own way, then open the Loupe dashboard."; any other request gets an `AuthenticationException`. | `src/Http/Middleware/Authenticate.php:28-56`, `src/Loupe.php:43` |
| `loupe.authorize:use` | Allows the request when `authorizedToUse()` returns true. Otherwise 403 "You are not authorized to use Loupe." | `src/Http/Middleware/Authorize.php:21-29` |
| `loupe.authorize:admin` | Same, using `authorizedForDashboard()`. | `src/Http/Middleware/Authorize.php:25-27` |
| `VerifyHubSignature` | Guards `POST v1/hub/inbound`. See the table below. | `src/Http/Middleware/VerifyHubSignature.php` |

Both aliases are registered by the service provider (`src/LoupeServiceProvider.php:56-57`).

The default for both middleware stacks is `['web', 'loupe.auth']` (`config/loupe.php:59-60`). If the
`loupe.middleware.api` key is missing from a published config file, the route file falls back to
`['web', 'auth']` (`routes/loupe.php:27`).

`VerifyHubSignature` responses:

| Condition | Status | Body `error` | Source (`src/Http/Middleware/VerifyHubSignature.php`) |
|---|---|---|---|
| Hub keys not set | 503 | `Loupe Hub is not configured` | `:33-35` |
| Body larger than 6,000,000 bytes | 413 | `payload too large` | `:29`, `:38-40` |
| `X-Loupe-Hub-Project`, `X-Loupe-Hub-Timestamp` or `X-Loupe-Hub-Signature` missing | 401 | `missing X-Loupe-Hub-Project, X-Loupe-Hub-Timestamp or X-Loupe-Hub-Signature` | `:46-48` |
| Project header is not `hub.project_id` | 401 | `delivery is for another project` | `:49-51` |
| Timestamp not 1 to 12 digits, or more than 300 s from now | 401 | `timestamp out of range` | `:26`, `:52-54` |
| Signature does not match (compared with `hash_equals`) | 401 | `invalid signature` | `:55-58` |

## Authorization order

`authorizedToUse()` and `authorizedForDashboard()` both call `decide()`
(`src/Loupe.php:77-82`, `:173-195`). The code checks in this order and stops at the first answer:

| Step | Check | Result | Source |
|---|---|---|---|
| 1 | No user | deny | `src/Loupe.php:175-177` |
| 2 | `config('loupe.authorize.use')` or `config('loupe.authorize.dashboard')` is a closure | the closure's answer | `src/Loupe.php:180-183` |
| 3 | A closure registered with `Loupe::useWhen()` or `Loupe::adminWhen()` | the closure's answer | `src/Loupe.php:185-187` |
| 4 | `allow_in_local` is true and the environment is `local` | allow | `src/Loupe.php:190-192` |
| 5 | Gate `loupe:use` or `loupe:admin` | the Gate's answer | `src/Loupe.php:194` |

## Gates and the published provider

The package defines both abilities to deny everyone (`src/LoupeServiceProvider.php:66-74`). Outside
`local`, nobody can use Loupe until you override them.

`php artisan loupe:install` publishes `stubs/LoupeServiceProvider.stub` to
`app/Providers/LoupeServiceProvider.php`. The stub defines:

| Ability | Grants | Stub default | Source |
|---|---|---|---|
| `loupe:use` | the in-app widget and the API | an empty email list | `stubs/LoupeServiceProvider.stub:33-37` |
| `loupe:admin` | the triage dashboard | an empty email list | `stubs/LoupeServiceProvider.stub:39-43` |

Add your users' emails to each list. For example, to let `sara@acme.com` use the widget, edit the
`loupe:use` definition in `app/Providers/LoupeServiceProvider.php`:

```php
Gate::define('loupe:use', function ($user) {
    return in_array($user->email, [
        'sara@acme.com',
    ]);
});
```

The gates are step 5 of the [authorization order](#authorization-order), so in the `local`
environment `allow_in_local` still allows every signed-in user before they run
(`src/Loupe.php:190-194`). For the full procedure, see
[Decide who can use Loupe](how-to/laravel-authorize.md).

## Facade methods

Call these on `Loupekit\Loupe\Facades\Loupe` (alias `Loupe`). The facade resolves
`Loupekit\Loupe\Loupe`, a singleton (`src/Facades/Loupe.php`, `src/LoupeServiceProvider.php:32`).

| Signature | What it does | Source |
|---|---|---|
| `useWhen(Closure $callback): void` | Registers the step 3 closure for the widget and API. | `src/Loupe.php:26` |
| `adminWhen(Closure $callback): void` | Registers the step 3 closure for the dashboard. | `src/Loupe.php:31` |
| `guards(): array` | The configured guards. An empty list returns `[null]`, the default guard. | `src/Loupe.php:43` |
| `resolveUser(): ?Authenticatable` | The first signed-in user across the guards. | `src/Loupe.php:51` |
| `resolve(): array` | `['user' => …, 'guard' => …]`. Guards that throw are skipped. | `src/Loupe.php:61` |
| `authorizedToUse(?Authenticatable $user): bool` | Runs [the authorization order](#authorization-order) for `use`. | `src/Loupe.php:77` |
| `authorizedForDashboard(?Authenticatable $user): bool` | Runs it for `admin`. | `src/Loupe.php:82` |
| `describeUser(Authenticatable $user): array` | Returns `{id, name, email}`. Uses `user_resolver` when set; otherwise `id` is the auth identifier as a string, `name` is `name`, then `email`, then `'User'`. | `src/Loupe.php:99-120` |
| `describeTicket(string $commentId, ?string $label = null, ?string $reference = null, ?string $url = null): void` | Sets the label, reference and link that the next Hub status update for this comment carries. | `src/Loupe.php:128`, `src/Support/Relay.php:52-58` |
| `reply(string $commentId, array $author, string $body, ?array $attachments = null): Message` | Stores a reply on a thread as `$author`. | `src/Loupe.php:141-157` |
| `packageVersion(string $package = 'loupekit/laravel'): ?string` | The installed version of a Composer package. | `src/Loupe.php:166-171` |

`describeTicket` example. It has an effect only for a ticket this app received through Loupe Hub:
only those status changes are sent back to the sender (`src/Support/Relay.php:61-72`). The
description is held in memory and consumed by the next status change of that comment in the same
PHP process (`src/Support/Relay.php:52-58`, `:63-65`). Call it in the same request or job, right
before you save the new status. A call in one request followed by a status change in another, such
as a queued job, has no effect.

```php
use Loupekit\Loupe\Facades\Loupe;

Loupe::describeTicket($comment->id, 'Ready for testing', 'TCK-42', 'https://tracker.example.com/TCK-42');
$comment->update(['status' => 'in_review']);
```

`$comment` is an instance of `Loupekit\Loupe\Models\Comment`, or of your `comment_model` class.

## Events

The service provider fires `CommentCreated`, `CommentDeleted`, `CommentStatusChanged` and
`MessageAdded` from Eloquent model events, so a model write from any source fires them: the widget,
the dashboard, an MCP tool, a Hub delivery or your own code
(`src/LoupeServiceProvider.php:95-116`). A query-builder mass update or delete, such as
`Comment::query()->where(…)->update([…])`, fires no Eloquent model events, so it fires none of
these four. `TicketReceived` and `HubUpdateReceived` are dispatched directly by the Hub receiver,
as the table shows.

| Event | Properties | When | Source |
|---|---|---|---|
| `CommentCreated` | `Model $comment` | after a comment is stored | `src/Events/CommentCreated.php`, `src/LoupeServiceProvider.php:99` |
| `CommentDeleted` | `Model $comment` | after a comment is deleted | `src/Events/CommentDeleted.php`, `src/LoupeServiceProvider.php:100` |
| `CommentStatusChanged` | `Model $comment`, `string $from`, `string $to` | after the status changes. Both values are normalized stages. Not fired when they are equal. | `src/Events/CommentStatusChanged.php`, `src/LoupeServiceProvider.php:101-110` |
| `MessageAdded` | `Model $comment`, `Message $message` | after a reply is stored. `$message->origin` is set when the reply came through Hub. | `src/Events/MessageAdded.php`, `src/LoupeServiceProvider.php:111-116` |
| `TicketReceived` | `Model $comment`, `array $source`, `array $user` | after a ticket from another project is stored | `src/Events/TicketReceived.php`, `src/Http/Controllers/InboundTicketController.php:105` |
| `HubUpdateReceived` | `Model $comment`, `array $update`, `array $from` | after Hub delivers a status change or reply for a ticket this app holds | `src/Events/HubUpdateReceived.php`, `src/Support/Relay.php:167` |

All six classes are in the `Loupekit\Loupe\Events` namespace. Their properties are public.

Example listener, registered in the `boot()` method of one of your service providers:

```php
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Log;
use Loupekit\Loupe\Events\CommentStatusChanged;

Event::listen(CommentStatusChanged::class, function (CommentStatusChanged $event) {
    Log::info("Comment {$event->comment->getKey()} moved from {$event->from} to {$event->to}");
});
```

The properties come from `src/Events/CommentStatusChanged.php:14-18`.

**`TicketReceived` runs inside the database transaction that stores the comment**
(`src/Http/Controllers/InboundTicketController.php:97-108`). If a synchronous listener throws, the
comment is rolled back and Hub gets a 500, so Hub's retry runs the whole receive again. A queued
listener is retried by your queue instead (`src/Events/TicketReceived.php:12-15`).

## The `@loupeWidget` Blade directive

Put `@loupeWidget` in your layout. It is registered at `src/LoupeServiceProvider.php:133` and
renders `resources/views/widget.blade.php`.

It renders nothing when Loupe is disabled, when no user is signed in, or when the user fails
`authorizedToUse()` (`src/LoupeServiceProvider.php:137-167`). Otherwise it renders a `<script>`
tag for the SDK and a call to `window.Loupe.init()` with:

| Option | Value | Source |
|---|---|---|
| script `src` | `Url::versioned('vendor/loupe/sdk/loupe.js')` | `src/LoupeServiceProvider.php:137-167`, `resources/views/widget.blade.php:2` |
| `projectKey` | `loupe.project_key` | `resources/views/widget.blade.php:7` |
| `user` | `describeUser()` of the signed-in user | `resources/views/widget.blade.php:8` |
| `apiBase` | `url(loupe.path)` | `resources/views/widget.blade.php:9` |
| `headers` | `{'X-CSRF-TOKEN': <csrf token>}` | `resources/views/widget.blade.php:10` |
| `credentials` | `'same-origin'` | `resources/views/widget.blade.php:11` |
| `timeZone` | `loupe.timezone`, else `app.timezone` | `resources/views/widget.blade.php:12` |
| `locale` | `loupe.locale` | `resources/views/widget.blade.php:13` |
| `packageVersion` | the installed `loupekit/laravel` version | `resources/views/widget.blade.php:14` |

## Publish tags

Publish one with `php artisan vendor:publish --tag=<TAG>`, where `<TAG>` is a value from the first
column.

| Tag | Publishes | Destination | Published by `loupe:install` | Source |
|---|---|---|---|---|
| `loupe-config` | `config/loupe.php` | `config/loupe.php` | yes | `src/LoupeServiceProvider.php:171-173` |
| `loupe-migrations` | `database/migrations/*` | `database/migrations` | yes | `src/LoupeServiceProvider.php:175-177` |
| `loupe-provider` | `stubs/LoupeServiceProvider.stub` | `app/Providers/LoupeServiceProvider.php` | yes | `src/LoupeServiceProvider.php:179-181` |
| `loupe-assets` | `resources/dist` | `public/vendor/loupe` | yes | `src/LoupeServiceProvider.php:183-185` |
| `loupe-views` | `resources/views` | `resources/views/vendor/loupe` | no | `src/LoupeServiceProvider.php:187-189` |

## Artisan command

```bash
php artisan loupe:install
php artisan loupe:install --force
```

| Item | Value | Source |
|---|---|---|
| Signature | `loupe:install {--force : Overwrite any existing published files}` | `src/Console/InstallCommand.php:11-12` |
| Publishes | `loupe-config`, `loupe-migrations`, `loupe-assets`, `loupe-provider` | `src/Console/InstallCommand.php:22-33` |
| Registers the provider | Adds `App\Providers\LoupeServiceProvider::class` to `bootstrap/providers.php`. If it cannot, it prints "Could not auto-register the provider. Add App\Providers\LoupeServiceProvider::class to your providers list." | `src/Console/InstallCommand.php:35`, `:78-110` |
| Warns | When the app has no `login` route, it prints a warning that suggests an auth starter kit. | `src/Console/InstallCommand.php:55-76` |

The command does not run migrations. For the full sequence, see
[Install Loupe in a Laravel app](how-to/laravel-install.md).

## HTTP API behavior

All endpoints below are relative to the `loupe.path` prefix.

Errors come in two shapes:

- Errors the controllers return, listed in the tables below, are JSON `{"error": "<message>"}`.
- Errors from middleware and from `abort()` go through Laravel's exception handler. These are the
  403 `You are not authorized to use Loupe.` (`src/Http/Middleware/Authorize.php:29`), the 403 and
  the `AuthenticationException` from `loupe.auth` (`src/Http/Middleware/Authenticate.php:50-55`)
  and the blob 404 (`src/Http/Controllers/BlobController.php:66-68`). Laravel renders them in its
  default format: `{"message": "<message>"}` for a request that expects JSON, otherwise an HTML
  page.

### Comments

| Endpoint | Behavior | Source |
|---|---|---|
| `GET v1/comments` | Returns a JSON array of comments (see [the `Comment` type](reference/shared.md#index-comment)), not wrapped in an object. Filters: `url` (normalized), `repo`, `branch`, `status` (legacy names match too), `priority`, `changeType`, `kind`, `q` (case-insensitive match on title and body). Newest first. Scoped to `loupe.project_key`. | `src/Http/Controllers/CommentController.php:24-76` |
| `POST v1/comments` | Creates the comment, or updates the existing comment with the same `id`. Returns 201 with the comment either way. 422 `id required` without an `id`. 403 `cannot post as another user` when the body carries an `author.id` that differs from the `id` of `describeUser()` for the signed-in user. Without `author.id`, the author is stored as `{id: <that id>, name: "User"}`. `repo` and `branch` are cut to 191 characters, `title` to 255. A `createdAt` is kept on insert only. The lookup by `id` is not scoped to `loupe.project_key`, unlike `PATCH` and `DELETE`. | `src/Http/Controllers/CommentController.php:78-156` (`:94-97`, `:111`, `:127-137`) |
| `PATCH v1/comments/{id}` | 404 `not found`. Patchable fields: `status`, `title`, `body`, `proposal`, `pr`, `priority`, `changeType`. An unknown status returns 422 `unknown status; use one of queue, todo, in_progress, in_review, resolved`. | `src/Http/Controllers/CommentController.php:159-209` |
| `DELETE v1/comments/{id}` | Allowed for the author (matched on `author_id` or `author.id`) or for a user who passes `authorizedForDashboard()`. Otherwise 403 `only the author or an admin can delete this`. Returns 204, also when the comment does not exist. | `src/Http/Controllers/CommentController.php:212-233` |

A new comment is forwarded to Hub when Hub is configured. An update of an existing `id` is
recorded as `comment.update` in the activity feed and is not forwarded
(`src/Http/Controllers/CommentController.php:142-153`).

### Blobs

| Endpoint | Behavior | Source |
|---|---|---|
| `POST v1/blobs` | Body `data` is a data URL. 400 `data (data URL) required` or `invalid data URL`. Stored as `<uuid>.<ext>` under `loupe.blob_path` on `loupe.disk`. Returns 201 `{"url": …}`. The controller sets no size limit. | `src/Http/Controllers/BlobController.php:35-54` |
| `GET v1/blobs/{id}` | Public; no auth middleware. A name with no extension gets `.png`. 404 when missing (Laravel's default error format, see above). Sends `Cache-Control: public, max-age=31536000, immutable`. | `src/Http/Controllers/BlobController.php:56-76`, `routes/loupe.php:18` |

Accepted MIME types (`src/Http/Controllers/BlobController.php:19-25`). A data URL with no MIME type
is treated as `image/png`, and an unmapped type is stored as `png`
(`src/Http/Controllers/BlobController.php:48-49`):

| MIME type | Stored extension |
|---|---|
| `image/png` | `png` |
| `image/jpeg` | `jpg` |
| `image/webp` | `webp` |
| `image/gif` | `gif` |
| `video/webm` | `webm` |
| `video/mp4` | `mp4` |
| `video/quicktime` | `mov` |
| `image/heic` | `heic` |
| `image/heif` | `heif` |
| any other type | `png` |

### Threads, people and notifications

| Endpoint | Behavior | Source |
|---|---|---|
| `GET v1/comments/{id}/messages` | 404 `not found`. Oldest first. Deleted messages are left out unless you pass `includeDeleted=1`. | `src/Http/Controllers/ThreadController.php:25-37` |
| `POST v1/comments/{id}/messages` | 404 `not found` for an unknown comment. 422 `body is required`. The author is `describeUser()`. @mentions are matched against the people list; each match other than the reply's author gets a `mention` notification. The reporter gets a `reply` notification only when they are not the reply's author and were not @mentioned in it. Returns 201 with `mentions` and `unknownMentions`. | `src/Http/Controllers/ThreadController.php:40-86` (`:70-79`) |
| `GET v1/comments/{id}/reactions` | 404 `not found` for an unknown comment. Returns `{"reactions": […]}`. | `src/Http/Controllers/ThreadController.php:89-96` |
| `POST v1/comments/{id}/messages/{messageId}/reactions` | Toggles the signed-in user's emoji. `messageId` may be the comment id. 404 `not found` for an unknown comment, or for a `messageId` that is neither the comment id nor a reply on it. 422 `emoji is required` when `emoji` is empty or longer than 16 characters. Returns `{"reactions": […]}`. | `src/Http/Controllers/ThreadController.php:99-130` |
| `GET v1/people` | The @mention list. See `people_resolver` and `allowed_emails`. | `src/Http/Controllers/PeopleController.php:11-14` |
| `GET v1/notifications` | The signed-in user's newest 50 notifications, as `{"notifications": […]}`. A `recipient` parameter is ignored. | `src/Http/Controllers/NotificationController.php:12-27` |
| `POST v1/notifications/read` | Marks one notification (`id`) or all as read. Returns `{"read": <count>}`. | `src/Http/Controllers/NotificationController.php:30-42` |

### Organization and activity

| Endpoint | Behavior | Source |
|---|---|---|
| `GET v1/org` | This project, its organization and the organization's other projects, as Loupe Hub reports them: `{organization, project, projects}`. `project` has `key`, `id`, `name`, `destination` and `receives`; `receives` is `true` when Hub has an inbound URL for this project. Always 200. Without Hub, `organization` is `null` and `project` has only `key`, `name` and `destination`. When Hub is unreachable, the body also has `"error": "hub_unreachable"`. A good answer is cached for 300 s; the Hub call times out after 5 s. | `src/Http/Controllers/OrganizationController.php:14-17`, `src/Support/Hub.php:27-91` (`:45`, `:77-87`), `packages/hub/store.ts:219` (repository root) |
| `GET v1/activity` | 404 `activity is not enabled` when `activity.enabled` is false or the `loupe_activity` migration has not run. Returns a JSON array of at most 200 rows for `loupe.project_key`, newest first; a `projectKey` query parameter is ignored. Optional `since` filter returns rows at or after that time; a value Carbon cannot parse returns 422 `since must be an ISO 8601 timestamp`. | `src/Http/Controllers/ActivityController.php:22-45` (`:25-26`, `:31-32`, `:37-40`) |

## Loupe Hub sender and receiver

Loupe Hub is an optional service that carries tickets between projects in one organization. The
wire format is in [Loupe Hub reference](reference/hub.md).

### Environment variables

| Env var | Config key |
|---|---|
| `LOUPE_HUB_URL` | `hub.url` |
| `LOUPE_PROJECT_ID` | `hub.project_id` |
| `LOUPE_PROJECT_SECRET` | `hub.project_secret` |

All three must be set (`src/Support/Hub.php:19-24`).

### Sender

| Item | Value | Source |
|---|---|---|
| New ticket | `POST {hub.url}/v1/issues` with `{user, issue, reply_url}`. `reply_url` is this app's `loupe.hub.inbound` route. | `src/Jobs/SendToHub.php:45-61`, `src/Support/Hub.php:101-127` |
| Update | `POST {hub.url}/v1/issues/{id}/updates` | `src/Jobs/SendUpdateToHub.php:45` |
| Signature headers | `X-Loupe-Project`, `X-Loupe-Timestamp`, `X-Loupe-Signature` = hex HMAC-SHA256 of `<timestamp>.<body>` with the project secret | `src/Jobs/SendToHub.php:55-59` |
| No email | A user with no email is not forwarded; a warning is logged. | `src/Support/Hub.php:107-112` |
| Dispatch | When `queue.default` is `sync`, the job runs after the response. Otherwise it is queued. If queueing throws, it runs after the response. | `src/Support/Hub.php:144-156` |
| Timeout | 45 s | `src/Jobs/SendToHub.php:32`, `src/Jobs/SendUpdateToHub.php:24` |
| Tries | 1 | `src/Jobs/SendToHub.php:34`, `src/Jobs/SendUpdateToHub.php:26` |
| Failure | Never throws. Logged, written to the comment's `forwarded` column and to the activity feed. | `src/Jobs/SendToHub.php:63-98` |

Shape of the `forwarded` column after a send (`src/Jobs/SendToHub.php:69-84`, `:117`):

| Field | Value |
|---|---|
| `status` | Hub's `delivery` value (`ok`, `none`, or another string), `rejected`, `unreachable` or `unknown` |
| `deliveryId` | Hub's `id` for the delivery |
| `destinationProjectId` | the receiving project's id |
| `destinationName` | the receiving project's name |
| `error` | set for `rejected` and `unreachable` |
| `at` | ISO 8601 time of the result |
| `remote` | added later by status updates from the receiver (`src/Support/Relay.php:116-128`) |

Activity kinds written: `ticket.forwarded`, `ticket.forward_failed`
(`src/Jobs/SendToHub.php:130-134`) and `ticket.update_failed` (`src/Jobs/SendUpdateToHub.php:51-56`).

### Receiver: `POST v1/hub/inbound`

The request passes `VerifyHubSignature` first. Then:

| Condition | Status | Body | Source |
|---|---|---|---|
| `issue.id` missing or longer than 191 characters | 422 | `issue.id required` | `src/Http/Controllers/InboundTicketController.php:42-44` |
| `user.email` missing | 422 | `user.email required` | `:45-47` |
| `source.project_id` missing | 422 | `source.project_id required` | `:48-50` |
| Ticket already stored | 202 | `{ticket, duplicate: true}` | `:53-55` |
| Stored | 202 | `{ticket}` | `:97-108` |

A stored ticket gets status `queue`, kind `free` by default, author id `hub:<email>` and a `source`
field with `projectId`, `projectName`, `organizationId`, `organizationName`, `deliveryId` (from the
`X-Loupe-Hub-Delivery` header), `receivedAt` and `reporter`
(`src/Http/Controllers/InboundTicketController.php:61-95`).

A body with `"type": "update"` is an update delivery (`:35-37`, `:128-156`):

| Condition | Status | Body |
|---|---|---|
| `issue_id`, `update` or `from.project_id` missing | 422 | `issue_id, update and from.project_id required` |
| status update with a value that is not a stage | 422 | `update.status must be a board stage` |
| message update without `id` and `body` | 422 | `update.message needs id and body` |
| `kind` not `status` or `message` | 422 | `update.kind must be status or message` |
| ticket not found | 404 | `unknown ticket` |
| applied | 202 | the result of `Relay::receive` |

Who sends what (`src/Support/Relay.php:61-96`):

- The project that **received** a ticket sends every status change back to the sender.
- Replies travel both ways.
- Changes applied from Hub are never sent back.

Example: the "Tracker" project receives TCK-42 from Shop, so status changes in Tracker show on
Shop's card as "→ Tracker".

## Migrations

| File (`database/migrations/2024_01_01_…`) | Change | Table |
|---|---|---|
| `000000_create_loupe_comments_table` | creates the comments table | `config('loupe.table')` |
| `000001_add_viewport_to_loupe_comments_table` | adds `viewport` | `config('loupe.table')` |
| `000002_add_recording_and_proposal_to_loupe_comments_table` | adds `recording_url`, `proposal` | `config('loupe.table')` |
| `000003_add_title_and_attachments_to_loupe_comments_table` | adds `title`, `attachments` | `config('loupe.table')` |
| `000004_migrate_loupe_comments_to_board_stages` | rewrites `open` to `queue` and `done` to `resolved`. `down()` does nothing. | `config('loupe.table')` |
| `000005_add_triage_metadata_to_loupe_comments` | adds `priority`, `change_type` | `config('loupe.table')` |
| `000006_add_repo_and_branch_to_loupe_comments` | adds `repo`, `branch` | `config('loupe.table')` |
| `000007_add_pr_to_loupe_comments` | adds `pr` | `loupe_comments` (hardcoded) |
| `000008_add_source_and_forwarded_to_loupe_comments` | adds `source`, `forwarded` | `loupe_comments` (hardcoded) |
| `000009_create_loupe_activity_table` | creates `loupe_activity` | `loupe_activity` |
| `000010_create_loupe_messages_table` | creates `loupe_messages`; skipped if the table exists (`:16`) | `loupe_messages` |
| `000011_create_loupe_reactions_table` | creates `loupe_reactions`; skipped if the table exists (`:12`) | `loupe_reactions` |
| `000012_create_loupe_notifications_table` | creates `loupe_notifications`; skipped if the table exists (`:15`) | `loupe_notifications` |

**Known limitation.** `000007` and `000008` write to `loupe_comments` by name
(`000007_add_pr_to_loupe_comments.php:16`, `:23`; `000008_add_source_and_forwarded_to_loupe_comments.php:19`, `:27`).
If you set `loupe.table` to another name, these two migrations do not reach your table. Add the
`pr`, `source` and `forwarded` JSON columns to it with your own migration.

## Missing columns: `Columns::only`

On writes, the package keeps only attributes that exist as columns in the table
(`src/Support/Columns.php:29-44`). An unmigrated column does not break comment creation; the new
field stays empty. The column list is read on every call, so a long-running worker sees a migration
without a restart.

For each write that drops attributes, it logs a warning:

```text
[loupe] <TABLE> is missing <COLUMNS> — run `php artisan migrate` to add them.
```

`<TABLE>` is the table name and `<COLUMNS>` is a comma-separated list of the dropped attributes.
With one column, the line ends in "add it."

## Data model

### Comments (`config('loupe.table')`, default `loupe_comments`)

| Column | Type | Notes | Source |
|---|---|---|---|
| `id` | string, primary key | set by the client | `000000:13` |
| `project_key` | string(191), indexed | | `000000:17` |
| `url` | string(500) | normalized page URL | `000000:18` |
| `status` | string, default `queue`, indexed | a stage | `000000:19` |
| `priority` | string(16), default `medium` | | `000000:22`, `000005:25` |
| `change_type` | string(16), default `other` | | `000000:23`, `000005:28` |
| `title` | string, nullable | | `000003:14` |
| `body` | text | | `000000:24` |
| `kind` | string, default `element` | `element`, `region` or `free` | `000000:26` |
| `author` | json | `{id, name, email}` | `000000:27` |
| `author_id` | string, nullable, indexed | | `000000:29` |
| `anchor` | json | | `000000:30` |
| `context` | json | element HTML and computed styles | `000000:31` |
| `offset` | json | | `000000:32` |
| `region` | json, nullable | region comments only | `000000:34` |
| `viewport` | json, nullable | | `000001:14` |
| `screenshot_url` | text, nullable | | `000000:35` |
| `recording_url` | text, nullable | screen recording | `000002:14` |
| `proposal` | json, nullable | set by the `propose_change` MCP tool | `000002:18` |
| `attachments` | json, nullable | files the reporter attached | `000003:18` |
| `repo` | string(191), nullable | legacy, optional | `000006:26` |
| `branch` | string(191), nullable | legacy, optional | `000006:29` |
| `pr` | json, nullable | the pull request carrying the fix | `000007:17` |
| `source` | json, nullable | set on tickets received through Hub | `000008:20` |
| `forwarded` | json, nullable | where Hub sent this comment | `000008:21` |
| `created_at`, `updated_at` | timestamps | | `000000:36` |

There is also a composite index on `(project_key, url)` (`000000:38`). The model casts every JSON
column to an array (`src/Models/Comment.php:44-56`) and reads its table from `loupe.table`
(`src/Models/Comment.php:58-61`).

### `loupe_activity`

`000009_create_loupe_activity_table.php:16-25`, `src/Models/Activity.php`

| Column | Type |
|---|---|
| `id` | ULID |
| `project_key` | string(191), indexed |
| `kind` | string(64) |
| `label` | string(255) |
| `detail` | text, nullable |
| `level` | string(8), default `info` (`info`, `warn` or `error`) |
| `comment_id` | string, nullable, indexed |
| `actor` | json, nullable |
| `created_at` | indexed; no `updated_at` |

### `loupe_messages`

`000010_create_loupe_messages_table.php:20-29`, `src/Models/Message.php`

| Column | Type |
|---|---|
| `id` | string(191), primary key |
| `comment_id` | string(191), indexed |
| `author` | json |
| `body` | text |
| `attachments` | json, nullable |
| `origin` | json, nullable; set when the reply came through Hub |
| `deleted_at` | nullable timestamp |
| `created_at`, `updated_at` | timestamps |

### `loupe_reactions`

`000011_create_loupe_reactions_table.php:16-24`, `src/Models/Reaction.php`

| Column | Type |
|---|---|
| `id` | big integer, auto-increment |
| `comment_id` | string(191), indexed |
| `message_id` | string(191) |
| `emoji` | string(32) |
| `user_id` | string(191) |
| `user_name` | string(255), nullable |
| `created_at` | nullable; no `updated_at` |

Unique key: `(message_id, emoji, user_id)`.

### `loupe_notifications`

`000012_create_loupe_notifications_table.php:19-29`, `src/Models/Notification.php`

| Column | Type |
|---|---|
| `id` | ULID |
| `project_key` | string(191) |
| `recipient_id` | string(191) |
| `comment_id` | string(191), indexed |
| `kind` | string(32): `mention`, `reply` or `status` |
| `body` | string(500) |
| `actor_name` | string(255), nullable |
| `read_at` | nullable timestamp |
| `created_at` | no `updated_at` |

Index: `(project_key, recipient_id)`. Recipients with a `hub:` id get no notification
(`src/Support/Inbox.php:15-29`).

## Stages and triage values

**Stages** (`src/Support/Stages.php:14-23`), in board order:

| Value | Label |
|---|---|
| `queue` | Queue |
| `todo` | To Do |
| `in_progress` | In Progress |
| `in_review` | In Review |
| `resolved` | Resolved |

Legacy values are still accepted: `open` maps to `queue`, `done` to `resolved`
(`src/Support/Stages.php:29-33`). Any other value read from a row maps to `queue`
(`src/Support/Stages.php:40-53`).

**Triage** (`src/Support/Triage.php:15-38`):

| Field | Values | Default |
|---|---|---|
| `priority` | `critical`, `high`, `medium`, `low` | `medium` |
| `changeType` (`change_type` column) | `frontend`, `backend`, `api`, `other` | `other` |

## MCP server

The package ships an MCP (Model Context Protocol) server, so an AI coding agent can read and act on
the comments in your database.

`loupekit/laravel` does not install `laravel/mcp`. It is only a `suggest` entry
(`composer.json:42-43`), and without it the service provider skips the MCP route
(`src/LoupeServiceProvider.php:125-127`), so `php artisan mcp:start loupe` fails as an unknown
command. Install it first:

```bash
composer require laravel/mcp:^0.8
```

Check that the command exists:

```bash
php artisan list mcp
```

You should see `mcp:start` with the description "Start the MCP Server for a given handle". Then
start the server:

```bash
php artisan mcp:start loupe
```

It is a local server that an MCP client starts and talks to over stdin and stdout, so it keeps
running until you press `Ctrl+C`. If you see `MCP Server with name [loupe] not found`, the
package's `routes/ai.php` did not load.

To connect the server to Claude Code or another MCP client, see
[Connect Claude Code and other MCP clients](how-to/connect-mcp-clients.md). For the standalone
npm MCP server, see the [MCP server reference](reference/mcp.md).

The server is named `Loupe`, version `1.0.0` (`src/Mcp/Servers/LoupeServer.php:19-21`). Every tool
works on `loupe.project_key` only. For an unknown `id`, `get_comment`, `propose_change` and
`update_status` return the error result `Comment not found.`
(`src/Mcp/Tools/GetComment.php:35`, `src/Mcp/Tools/ProposeChange.php:36`,
`src/Mcp/Tools/UpdateStatus.php:37`).

| Tool | Arguments | Returns | Source |
|---|---|---|---|
| `list_comments` | `status`, `priority`, `changeType`, `repo`, `branch`, `url`; all optional | JSON `{count, comments}`, newest first | `src/Mcp/Tools/ListComments.php:21-82` |
| `get_comment` | `id` (required) | Markdown with the request, element HTML and computed styles, the screenshot URL and the screen recording URL when set, plus the PNG screenshot and image attachments as image blocks. A comment of kind `free` returns a short note instead, without element HTML, styles or the screenshot; it keeps the attachment list and the image attachments. | `src/Mcp/Tools/GetComment.php:28-115` (`:39-56`, `:69-70`) |
| `propose_change` | `id`, `html` (required); `css`, `notes` | Saves the proposal on the comment | `src/Mcp/Tools/ProposeChange.php:19-49` |
| `update_status` | `id`, `status` (required) | JSON `{id, status}`. The status is normalized first: `open` becomes `queue` and `done` becomes `resolved`, and any unrecognized value is stored as `queue` rather than rejected. `PATCH v1/comments/{id}` refuses the same value with 422. | `src/Mcp/Tools/UpdateStatus.php:27-44`, `src/Support/Stages.php:40-53`, `src/Http/Controllers/CommentController.php:170-172` |

## Asset URLs

`Url::asset()` builds the URL of Loupe's published assets under `public/vendor/loupe`. The base is
`loupe.asset_url`, else `app.url`. It does not use Laravel's `asset()` helper, so an `ASSET_URL`
CDN setting does not apply (`src/Support/Url.php:28-33`).

`Url::versioned()` adds `?v=<stamp>` (`src/Support/Url.php:43-46`). The stamp is the modified time
and size of the published file in hex, else of the packaged file in `resources/dist`, else `dev`
(`src/Support/Url.php:53-69`). A new build gets a new URL, so caches never serve an old bundle.

| Asset | Path |
|---|---|
| Widget SDK | `vendor/loupe/sdk/loupe.js` (`src/LoupeServiceProvider.php:137-167`) |
| Dashboard app | `vendor/loupe/dashboard/app.js` (`src/Http/Controllers/DashboardController.php:15-24`) |

Re-publish `loupe-assets` after each upgrade. See [Upgrade Loupe](how-to/upgrade.md).

## Testing

For how the package is tested, the coverage gate and the Composer scripts, see
[TESTING.md](TESTING.md). Release steps are in [RELEASING.md](../RELEASING.md).
