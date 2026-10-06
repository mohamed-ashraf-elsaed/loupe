# Control who can use Loupe in Laravel

This guide shows you how to decide which signed-in users of your Laravel app can use Loupe. The `loupekit/laravel` package checks two *abilities*:

| Ability | What it unlocks | Gate name | Config key |
|---|---|---|---|
| **use** | The widget (`@loupeWidget` renders it) and the widget's JSON API under `/{path}/v1/`: comments, messages, reactions, people, notifications, org, activity and screenshot upload. It does not cover the public screenshot read `GET /{path}/v1/blobs/{id}` or the Hub inbound endpoint `POST /{path}/v1/hub/inbound`, which checks a Hub signature instead. | `loupe:use` | `authorize.use` |
| **admin** | The triage dashboard page at `/{path}/dashboard`, and deleting comments that other people wrote. The *triage dashboard* is Loupe's board for sorting and updating feedback. Its board loads data from the **use** API, so a dashboard user needs **use** as well. | `loupe:admin` | `authorize.dashboard` |

`{path}` is the route prefix from `config('loupe.path')`, set with `LOUPE_PATH`. It defaults to `loupe`, so the dashboard is at `/loupe/dashboard`.

A *gate* is a named Laravel authorization check that you define with `Gate::define()` and that returns `true` or `false` for a user. See [Authorization: Gates](https://laravel.com/docs/authorization#gates) in the Laravel docs.

Both abilities apply only to users who are already signed in. Loupe does not log anyone in. It reads the user from your app's *guards*, the Laravel components that resolve the signed-in user for a request. See [Authentication](https://laravel.com/docs/authentication) in the Laravel docs.

## Contents

- [How Loupe decides](#how-loupe-decides)
- [Prerequisites](#prerequisites)
- [Allow listed emails with gates](#allow-listed-emails-with-gates)
- [Use a closure in config](#use-a-closure-in-config)
- [Register rules in code](#register-rules-in-code)
- [Turn off the local shortcut](#turn-off-the-local-shortcut)
- [Control who appears in @mention lists](#control-who-appears-in-mention-lists)
- [Change how users are described](#change-how-users-are-described)
- [Verify](#verify)
- [Troubleshooting](#troubleshooting)
- [Next steps](#next-steps)

## How Loupe decides

For each request, Loupe checks these rules in order and stops at the first one that gives an answer:

| Order | Rule | Applies in |
|---|---|---|
| 1 | No signed-in user: deny. | every environment |
| 2 | A closure in `config('loupe.authorize.use')` or `config('loupe.authorize.dashboard')`: its result. | every environment |
| 3 | A closure registered with `Loupe::useWhen()` or `Loupe::adminWhen()`: its result. | every environment |
| 4 | `allow_in_local` is `true` and the app environment is `local`: allow. | `local` only |
| 5 | The gate `loupe:use` or `loupe:admin`: its result. | every environment |

The package defines both gates to return `false` when your app has not defined them, so access is denied by default outside `local`.

For every config key and route, see the [Laravel package reference](../LARAVEL.md#authorization-order).

## Prerequisites

- The package is installed and `php artisan loupe:install` has run. See [Install the Laravel package](laravel-install.md).
- Your app has a sign-in flow, so a user is available from `auth()->user()`. If your app signs users in through more than one guard, set `LOUPE_GUARDS` to a comma-separated list of guard names, for example `LOUPE_GUARDS=web,admin`. When it is empty (the default), Loupe uses your app's default guard. See [Configuration](../LARAVEL.md#configuration).
- Your user model has an `email` attribute, if you use the email-list examples below.

## Allow listed emails with gates

Use this method for most apps. `loupe:install` publishes `app/Providers/LoupeServiceProvider.php` and adds it to `bootstrap/providers.php`. That provider defines the two gates.

1. Open `app/Providers/LoupeServiceProvider.php`.

   You should see a `gate()` method that defines `loupe:use` and `loupe:admin`, each with an empty email list.

2. Add the emails of the people who may use the widget to the `loupe:use` list, and the people who may open the dashboard to the `loupe:admin` list. Put every dashboard user on **both** lists, because the dashboard reads its data through the **use** API:

   ```php
   protected function gate(): void
   {
       Gate::define('loupe:use', function ($user) {
           return in_array($user->email, [
               'sara@acme.com',
               'dev@acme.com',
           ]);
       });

       Gate::define('loupe:admin', function ($user) {
           return in_array($user->email, [
               'sara@acme.com',
           ]);
       });
   }
   ```

   `in_array` compares exact strings, so write each email with the same case your users table stores.

3. Deploy the change the way you deploy any code change. Gates are PHP code, not config, so you do not need to run `php artisan config:clear` or `php artisan config:cache` for them.

   You should see the listed users get access and other users get denied. To check, follow [Verify](#verify).

A gate can hold any rule, not only an email list. For example, return `$user->is_staff` or call `$user->can('...')` on your own permission system.

## Use a closure in config

You can set the rule in `config/loupe.php` instead of a gate. A closure here wins over every other rule, in every environment.

1. Publish the config file if you do not have it yet:

   ```bash
   php artisan vendor:publish --tag=loupe-config
   ```

   You should see `config/loupe.php` created.

2. Set the `authorize` closures:

   ```php
   'authorize' => [
       'use' => fn ($user) => str_ends_with(strtolower($user->email), '@acme.com'),
       'dashboard' => fn ($user) => strtolower($user->email) === 'sara@acme.com',
   ],
   ```

   Each closure receives the signed-in user and returns `true` or `false`. `str_ends_with` and `===` are case-sensitive, so the example lowercases the email first.

   You should see `true` for a matching user and `false` for any other user when you run [Verify](#verify) step 1.

> **Warning:** A closure in a config file cannot be serialized, so `php artisan config:cache` fails when one is set. The package's own config notes the same limit for `user_resolver`. If you cache config, use a gate or `Loupe::useWhen()` in a service provider instead.

## Register rules in code

`Loupe::useWhen()` and `Loupe::adminWhen()` register a closure from PHP code. They are checked after the config closures and before the gates. They work with `config:cache`, because they live in a provider, not in config.

1. Open `app/Providers/LoupeServiceProvider.php`.

2. Import the facade at the top of the file:

   ```php
   use Loupekit\Loupe\Facades\Loupe;
   ```

3. Add the two `Loupe::` calls to the existing `boot()` method. Keep the `$this->gate();` line that the published provider already has:

   ```php
   public function boot(): void
   {
       $this->gate();

       Loupe::useWhen(fn ($user) => $user->hasVerifiedEmail());
       Loupe::adminWhen(fn ($user) => in_array($user->email, ['sara@acme.com']));
   }
   ```

   Each call replaces any closure registered earlier for the same ability. Once a closure is registered, the gate for that ability and the local shortcut are no longer consulted.

   You should see `true` for a user who matches each closure and `false` for any other user when you run [Verify](#verify) step 1.

## Turn off the local shortcut

By default, any signed-in user may use the widget and open the dashboard when `APP_ENV=local`, so a fresh install works without setup. Turn this off to test your real rules on your own machine.

1. Open `config/loupe.php`. Publish it first with `php artisan vendor:publish --tag=loupe-config` if it does not exist.

2. Set the key to `false`:

   ```php
   'allow_in_local' => false,
   ```

   This key has no environment variable. You change it only in the config file.

3. If you cached config on this machine, clear the cache so the edit takes effect:

   ```bash
   php artisan config:clear
   ```

   You should see `Configuration cache cleared successfully.`

4. Sign in as a user who is not on your lists, and reload a page that contains `@loupeWidget`.

   You should see no Loupe launcher button, the floating button that opens the widget. Your gates or closures now decide access in `local` too.

## Control who appears in @mention lists

The widget's @mention autocomplete reads `GET /{path}/v1/people`. This list does not grant access. It only decides who people can mention. By default it holds:

- the users of each configured guard whose email is in `allowed_emails`, and
- recent comment and reply authors: the authors of the latest 500 comments in this project and of the latest 500 replies, except people from other projects (ids that start with `hub:`).

To add people before they have written anything:

1. Add their emails to your `.env` file, separated by commas:

   ```dotenv
   LOUPE_ALLOWED_EMAILS=sara@acme.com,dev@acme.com
   ```

   Loupe trims and lowercases each email. It looks them up in the `email` column of each guard's user model, using the lowercased value. If your database compares strings case-sensitively, store emails in lowercase, or a mixed-case stored email does not match.

2. If you cached config, rebuild the cache:

   ```bash
   php artisan config:cache
   ```

3. Sign in as a user who has the **use** ability, and open `/<PATH>/v1/people` in the browser. Replace `<PATH>` with your `config('loupe.path')` value, by default `loupe`.

   You should see a JSON list with an `id`, a `name` and an `email` for each person you added.

To replace the whole list:

1. Create an *invokable class*, a class with an `__invoke()` method that PHP calls when the object is used as a function. Loupe resolves it through the container and calls it with no arguments:

   ```php
   <?php

   namespace App\Support;

   use App\Models\User;

   class LoupePeople
   {
       public function __invoke(): array
       {
           return User::query()
               ->where('team', 'product')
               ->get()
               ->map(fn (User $u) => [
                   'id' => (string) $u->id,
                   'name' => $u->name,
                   'email' => $u->email,
               ])
               ->all();
       }
   }
   ```

   Return each `id` exactly as Loupe describes that user (see the next section). Loupe matches mentions to these ids when it sends notifications.

2. Point `people_resolver` in `config/loupe.php` at the class:

   ```php
   'people_resolver' => App\Support\LoupePeople::class,
   ```

3. Open `/<PATH>/v1/people` as in step 3 above.

   You should see only the people your class returns.

## Change how users are described

`user_resolver` controls the `id`, `name` and `email` that Loupe stores as a comment's author and passes to the widget. By default Loupe uses the user's auth identifier as `id`, `name` (or the email, or `User`) as `name`, and `email`.

1. Create an invokable class that takes the user and returns an array:

   ```php
   <?php

   namespace App\Support;

   use Illuminate\Contracts\Auth\Authenticatable;

   class LoupeUserResolver
   {
       public function __invoke(Authenticatable $user): array
       {
           return [
               'id' => 'user-'.$user->getAuthIdentifier(),
               'name' => $user->display_name,
               'email' => $user->email,
           ];
       }
   }
   ```

2. Point the config at the class:

   ```php
   'user_resolver' => App\Support\LoupeUserResolver::class,
   ```

   Use a class name, not a closure. A closure breaks `php artisan config:cache`.

3. Check the result from the command line. Replace `<EMAIL>` with the email of a user in your users table:

   ```bash
   php artisan tinker --execute="dump(Loupe::describeUser(App\Models\User::where('email', '<EMAIL>')->firstOrFail()));"
   ```

   You should see an array with the `id`, `name` and `email` your class returns.

Loupe uses this `id` to check that a user posts only as themselves, and that only the author or an admin deletes a comment. If you change the id format after people have commented, they can no longer delete their older comments.

## Verify

Test as a user who is **not** allowed. Run this outside `local`, or set `allow_in_local` to `false` first (see [Turn off the local shortcut](#turn-off-the-local-shortcut)).

In the steps below, replace `<PATH>` with your `config('loupe.path')` value. It is `loupe` unless you set `LOUPE_PATH`.

1. Check the rule from the command line with *tinker*, Laravel's interactive PHP shell. Replace `<EMAIL>` with the user's email exactly as your users table stores it, for example `dev@acme.com`. Run this with `allow_in_local` set to `false`, or in an environment other than `local`, or every user prints `true`:

   ```bash
   php artisan tinker --execute="\$u = App\Models\User::where('email', '<EMAIL>')->firstOrFail(); dump(Loupe::authorizedToUse(\$u), Loupe::authorizedForDashboard(\$u));"
   ```

   You should see `false` twice for a user who is not allowed, and `true` for a user on your lists. If you see `ModelNotFoundException`, no user has that email; fix the email and run the command again.

2. Sign in to your app as a user who **is** allowed, and open any page that contains `@loupeWidget`.

   You should see the Loupe launcher button. This confirms the widget renders, so a missing button in the next step is caused by authorization.

3. Sign in as the user who is not allowed, and open the same page.

   You should not see the launcher button. The directive renders nothing for a user without the **use** ability.

4. On that page, open the browser console and run:

   ```js
   fetch("/<PATH>/v1/comments", { headers: { Accept: "application/json" } })
     .then((r) => r.json().then((body) => console.log(r.status, body)));
   ```

   You should see status `403` and a `message` of `You are not authorized to use Loupe.` With `APP_DEBUG=true`, the body also has debug keys such as `exception` and `trace`.

5. Open `/<PATH>/dashboard` in the same browser.

   You should see a 403 page with the text `You are not authorized to use Loupe.`

6. Sign in as a user on both your `loupe:use` and `loupe:admin` lists, and open `/<PATH>/dashboard`.

   You should see the triage board.

   ![The Loupe dashboard inside a Laravel app, showing feedback cards](../images/laravel-dashboard.png)

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Everyone can use Loupe on your machine, but nobody can on staging. | `allow_in_local` allows any signed-in user only when the environment is `local`. Staging runs in another environment, so your gates decide, and they still have empty lists. | Add the users to the gates in `app/Providers/LoupeServiceProvider.php`, or register `Loupe::useWhen()` / `Loupe::adminWhen()`. |
| Your gates are ignored. | A closure in `config('loupe.authorize.*')` or one registered with `useWhen()` / `adminWhen()` answers first. | Remove the closure, or move your rule into it. |
| A user on your list is still denied. | `in_array` is case-sensitive, or the user is signed in through a guard Loupe does not read. | Match the email's case. If you use several guards, set `LOUPE_GUARDS`, for example `LOUPE_GUARDS=web,admin`. |
| The launcher button is missing even for an allowed user. | `LOUPE_ENABLED` is `false`, or no user is signed in through the guards Loupe reads. | Set `LOUPE_ENABLED=true`, sign in, and check `LOUPE_GUARDS`. |
| The dashboard page opens but shows `Can't reach the API at ... (API 403)`. | The user has the **admin** ability but not **use**. The board's data calls go to the **use** API. | Add the user to `loupe:use` as well. |
| `php artisan config:cache` fails with a "non-serializable" error. | A closure is set in `config/loupe.php` (`authorize.*`, `user_resolver` or `people_resolver`). | Use gates, `Loupe::useWhen()`, or a class name. |
| `/<PATH>/dashboard` shows "Unauthenticated. This app has no [login] route…". | Nobody is signed in, and the app has no route named `login` to redirect to. | Sign in first, or add a `login` route. |
| A user is not offered in @mention autocomplete. | They are not among the recent comment and reply authors, and their email is not in `LOUPE_ALLOWED_EMAILS`. | Add the email to `LOUPE_ALLOWED_EMAILS`, or set `people_resolver`. |
| Deleting a comment returns 403 "only the author or an admin can delete this". | The user is not the comment's author and does not have the **admin** ability. | Add the user to `loupe:admin`, or ask the author to delete it. |

For more problems, see [Troubleshooting](../troubleshooting.md#laravel).

## Next steps

- [Laravel package reference](../LARAVEL.md): every config key, route and event.
- [Install the Laravel package](laravel-install.md): set up the widget and the dashboard.
- [Authentication and privacy](../explanation/auth-and-privacy.md): how Loupe checks identity.
- [Connect apps to Hub](hub-connect-apps.md): send tickets from this app to another project.
