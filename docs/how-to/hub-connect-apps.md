# Route tickets between apps with Loupe Hub

This guide shows you how to connect two Laravel apps through Loupe Hub so that a comment pinned in one app arrives as a ticket in the other. You also see how status changes and replies flow back.

The example uses two apps in the same organization:

- **Shop** (`https://shop.example.com`) sends tickets. Its users pin comments with the **widget**, the Loupe panel that `loupekit/laravel` adds to your pages. See [Use the Loupe widget](use-the-widget.md).
- **Tracker** (`https://tracker.example.com`) receives tickets. Its team works on them.

**Loupe Hub** is the service that holds your organizations and projects and delivers signed tickets between them. A **project** in Hub is one app; each app identifies itself to Hub with the project's ID and secret.

**Contents**

- [Before you begin](#before-you-begin)
- [Step 1: Create the two projects](#step-1-create-the-two-projects)
- [Step 2: Configure each app](#step-2-configure-each-app)
- [Step 3: Run a queue worker if you need one](#step-3-run-a-queue-worker-if-you-need-one)
- [Step 4: Set Tracker's inbound URL](#step-4-set-trackers-inbound-url)
- [Step 5: Route Shop's tickets to Tracker](#step-5-route-shops-tickets-to-tracker)
- [Step 6: Make sure Shop's users belong to the organization](#step-6-make-sure-shops-users-belong-to-the-organization)
- [Step 7: Pin a comment in Shop](#step-7-pin-a-comment-in-shop)
- [How updates flow](#how-updates-flow)
- [Verify](#verify)
- [Troubleshooting](#troubleshooting)
- [Next steps](#next-steps)

## Before you begin

You need:

- **A running Loupe Hub, version 0.13.0 or later,** that both apps can reach over HTTP or HTTPS. Use HTTPS in production. Hub 0.13.0 adds the update endpoint and the stored reply URL that status changes and replies travel through; with an older Hub, tickets arrive but nothing flows back. See [Self-host Loupe Hub](hub-self-host.md).
- **Both apps on `loupekit/laravel` 0.13.0 or later, migrated.** Run `php artisan migrate` in each app. Version 0.13.0 adds the tables that two-way replies need (`loupe_messages`, `loupe_reactions`, `loupe_notifications`). See [Upgrade Loupe](upgrade.md).
- **The widget working in both apps.** Each app has the package installed and shows the widget to a signed-in user who passes Loupe's authorization. See [Install Loupe in a Laravel app](laravel-install.md) and [Control who can use Loupe in Laravel](laravel-authorize.md).
- **A public address for Tracker.** Hub 0.14.1 and later refuse to deliver to loopback, private and link-local addresses, such as `127.0.0.1`, `localhost` or a `192.168.x.x` LAN host, unless Hub runs with `HUB_ALLOW_PRIVATE_URLS=1`. Set that variable for local development only. To try the whole flow on one machine, follow [Route a ticket between two projects with a local Loupe Hub](../tutorials/hub-two-projects-local.md) instead.
- **Owner access** to the Hub organization. Only an owner can create projects and change routing.

## Step 1: Create the two projects

1. Open `<HUB_URL>` in your browser and click **Sign in with Google**. Hub accounts are Google accounts.
2. Open your organization. If you have none yet, fill in **Name** under **New organization** on the Organizations page and click **Create**.
3. Under **New project**, enter `Shop` in **Project name** and click **Create project**. Leave **External webhook URL** empty.

   You should see Shop's project page. At the top is a one-time card with **Project Secret (LOUPE_PROJECT_SECRET)** and **Webhook signing secret**. The **Project ID** is shown below the card.

   ![The one-time secrets card shown after creating a project, with the project secret and the webhook signing secret](../images/hub-project-secrets.png)

4. Copy the **Project ID** (`prj_…`) and the **Project Secret** (`psk_…`) now. Hub shows the secret only once; to get a new one later, you must rotate it.
5. Click **← `<ORG_NAME>`** at the top of the page, where `<ORG_NAME>` is your organization's name. Repeat steps 3 and 4 for a project named `Tracker`.

   You should see both projects in the organization's **Projects** table. **Receives** shows `no` for both until you set an inbound URL in step 4.

   ![The organization page with its allowed members and a Projects table that lists Tracker and a second project named Demo Project, both with Receives set to no](../images/hub-org.png)

   The screenshot comes from the local tutorial, where the sending project is named Demo Project and has an external webhook URL. In your table, Shop shows `-` under **Tickets go to**.

Both projects must be in the **same organization**. Hub refuses to route tickets to a project in another organization.

## Step 2: Configure each app

1. In Shop's `.env`, set Shop's values:

   ```dotenv
   LOUPE_HUB_URL=<HUB_URL>
   LOUPE_PROJECT_ID=<SHOP_PROJECT_ID>
   LOUPE_PROJECT_SECRET=<SHOP_PROJECT_SECRET>
   ```

   - `<HUB_URL>`: the base URL of your Hub, for example `https://hub.example.com`.
   - `<SHOP_PROJECT_ID>`: Shop's Project ID, `prj_` followed by 24 hex characters.
   - `<SHOP_PROJECT_SECRET>`: Shop's Project Secret, starting with `psk_`.

2. In Tracker's `.env`, set the same three keys with **Tracker's** Project ID and Project Secret.
3. In each app, clear the cached config:

   ```bash
   php artisan config:clear
   ```

   You should see `Configuration cache cleared successfully.`

The package turns Hub on only when all three values are set. With any one missing, comments are not sent and the inbound route answers 503.

## Step 3: Run a queue worker if you need one

Shop sends each new comment to Hub in a queued job, `SendToHub`. How it runs depends on Shop's default queue connection, `queue.default`:

| `queue.default` | What happens | What you do |
|---|---|---|
| `sync` | The job runs after the HTTP response is sent, so the user never waits on Hub. | Nothing. |
| anything else (`database`, `redis`, …) | The job goes onto the queue. | Run a worker. |

1. If Shop's queue is not `sync`, start a worker in Shop:

   ```bash
   php artisan queue:work
   ```

   You should see `INFO  Processing jobs from the [default] queue.`

2. Do the same in Tracker. Tracker sends its status changes and replies back through Hub in a queued job, `SendUpdateToHub`, with the same rule.

Each job runs once and never throws, so your queue does not retry it. Hub itself tries each delivery to the other app up to three times. When a job fails:

- `SendToHub` stores the result on the comment, where the widget shows it as a chip (see [step 7](#step-7-pin-a-comment-in-shop)), and adds an event to the widget's **Activity** tab.
- `SendUpdateToHub` writes a warning to the log and adds a `ticket.update_failed` event to the **Activity** tab. It does not change the comment.

## Step 4: Set Tracker's inbound URL

The **inbound URL** is the address where Hub delivers tickets to an app. The package registers it as `POST /<LOUPE_PATH>/v1/hub/inbound`, where `<LOUPE_PATH>` is `loupe` unless you changed it. If you set `LOUPE_DOMAIN`, the route answers only on that host. If `LOUPE_ENABLED` is `false`, the route does not exist.

1. Open the **Tracker** project page in Hub.
2. Under **Routing**, enter Tracker's inbound URL in the inbound URL field:

   ```text
   https://tracker.example.com/loupe/v1/hub/inbound
   ```

3. Click **Save inbound URL**.

   You should see `Inbound URL https://tracker.example.com/loupe/v1/hub/inbound` near the top of the page. The organization's **Projects** table shows `yes` in Tracker's **Receives** column.

Hub signs every delivery to Tracker with Tracker's own Project Secret, which Tracker already holds as `LOUPE_PROJECT_SECRET`. You add no new secret to receive.

## Step 5: Route Shop's tickets to Tracker

1. Open the **Shop** project page in Hub.
2. Under **Routing**, choose **Tracker** in **Send tickets to**. The list shows only projects in the organization that have an inbound URL.
3. Click **Save route**.

   You should see `Tickets go to Tracker` near the top of the page.

   ![The Routing forms on a sending project's page, with Tracker chosen in Send tickets to, an empty inbound URL field and an external webhook URL from the local tutorial](../images/hub-project-routing.png)

## Step 6: Make sure Shop's users belong to the organization

Hub accepts a ticket only from a user who belongs to the organization. A user belongs when either is true:

- their email is listed under **Allowed members** on the organization page, as an owner or a member; or
- their email's domain equals the organization's **allowed domain** exactly. For example, `sara@acme.com` matches the domain `acme.com`.

1. Check that every Shop user who pins comments has an email address. Shop sends the email that `loupe.user_resolver` returns, or the user's `email` attribute by default.
2. On the organization page, either add those emails under **Allowed members** and click **Add member**, or set the allowed domain and click **Save domain**.

Without an email, Shop does not send the comment and logs `[loupe] not sending comment to Hub: the user has no email`. With an email that is not in the organization, Hub answers `403 user not in organization`.

## Step 7: Pin a comment in Shop

1. Sign in to Shop as a user from step 6 and pin a comment on any page, for example `Checkout button overlaps footer`.
2. Wait a few seconds for the job to finish. On `loupekit/laravel` 0.13.1 and later, the widget re-reads its list every 10 seconds. On 0.13.0, reload the page.

   You should see a `→ Tracker` chip on the comment in Shop's **Comments** list. A **chip** is the small label on a comment that shows where it was sent or where it came from.

3. Sign in to Tracker and open the widget. It opens on the **Home** tab.
4. On the **Home** tab, click **All**, then click the **Comments** tab.

   You should see the same ticket with a `from Shop` chip. A received ticket has no pin on the page, because the element it points at lives in Shop.

## How updates flow

Once Tracker holds the ticket, the two apps keep it in step through Hub:

- **Tracker owns the status.** When the ticket's status changes in Tracker, for example on the Loupe dashboard, Tracker sends it to Shop. The **Loupe dashboard** is the triage board the package serves at `/<LOUPE_PATH>/dashboard` (see [Open the dashboard](laravel-install.md#open-the-dashboard)). Each status is a **stage**, one of the board's five columns: `queue`, `todo`, `in_progress`, `in_review` and `resolved`. Shop moves its own copy to the same stage and shows it on the chip, for example `→ Tracker · In Progress`. Shop refuses any other status value with HTTP 422.
- **Replies travel both ways.** A reply written on the ticket in either app appears in the other app's conversation, marked `from <project>`.
- **Status changes in Shop stay in Shop.** Shop is the sending side, so changing the status there sends nothing to Tracker.

Anything an app applies from Hub is never sent back, so updates do not loop.

![A Comments list with one item showing "from Shop" and another showing the chip "→ Tracker · TCK-42 · In progress" after a status update](../images/sdk-forwarded-chip.png)

To change what Shop's chip says, post replies from your own code, or run code when a ticket arrives, see `Loupe::describeTicket()`, `Loupe::reply()` and the `TicketReceived` event in the [Laravel package reference](../LARAVEL.md#facade-methods).

## Verify

1. Open the **Shop** project page in Hub and find **Last 20 deliveries**.

   You should see a row for the comment with **To** `Tracker` and **Status** `ok`.

   ![A project page showing "Tickets go to Tracker", the Install block and a Last 20 deliveries table with an ok row](../images/hub-project.png)

   The screenshot comes from the local tutorial, where the sending project is named Demo Project and the **Issue** column shows the ticket ID `TCK-42`. On your Shop page, **Issue** shows the ID of the Shop comment.

2. In Tracker, open the widget's **Activity** tab.

   You should see a `ticket.received` event that reads `Received “Checkout button overlaps footer” from Shop`.

3. In Shop's **Activity** tab, you should see a `ticket.forwarded` event that reads `Sent “Checkout button overlaps footer” to Tracker`.

## Troubleshooting

Shop stores the result of each send on the comment and shows it in the widget's **Activity** tab. The chip text and the stored status tell you which row applies.

| Symptom | Cause | Fix |
|---|---|---|
| Chip `→ Hub failed`; stored status `rejected`; log `[loupe] Hub rejected comment` | Hub answered with an error. The chip's tooltip shows Hub's error text, for example `403 user not in organization`, `401 invalid signature` or `401 timestamp out of range`. | For `user not in organization`, do [step 6](#step-6-make-sure-shops-users-belong-to-the-organization). For `invalid signature` or `unknown project`, check Shop's `LOUPE_PROJECT_ID` and `LOUPE_PROJECT_SECRET`, then run `php artisan config:clear`. For `timestamp out of range`, Shop's clock differs from Hub's by more than 300 seconds: sync both clocks, for example with NTP. |
| Chip `→ Hub failed`; stored status `rejected`; tooltip `payload too large` | The comment, with its screenshots and attachments, is over Hub's 5,000,000-byte limit for a ticket. | Attach fewer or smaller files to the comment. |
| Chip `→ Hub failed`; stored status `unreachable`; log `[loupe] could not send comment to Hub` | Shop could not connect to Hub. | Check `LOUPE_HUB_URL` and that Shop's server can reach Hub. |
| No chip; Activity says `no destination is set for this project`; stored status `none` | Hub accepted the ticket but Shop has no route and no webhook. | Do [step 5](#step-5-route-shops-tickets-to-tracker). If **Tracker** is missing from the list, do [step 4](#step-4-set-trackers-inbound-url) first. |
| Chip `→ Tracker failed`; stored status `failed`; log `[loupe] Hub accepted comment but webhook delivery failed` | Hub could not deliver to Tracker's inbound URL after three attempts. The **Error** column in **Last 20 deliveries** on Shop's project page shows why. | Fix the cause shown there, using the delivery error rows below. |
| No chip and no Activity event; log `[loupe] not sending comment to Hub: the user has no email` | The signed-in Shop user has no email. | Give the user an email, or return one from `loupe.user_resolver`. |
| No chip after a while, with no log line | The queue is not `sync` and no worker runs. | Run `php artisan queue:work` ([step 3](#step-3-run-a-queue-worker-if-you-need-one)). |
| Delivery error `HTTP 503` | One of Tracker's three Hub values is empty, so Tracker answers `Loupe Hub is not configured`. | Set all three in Tracker's `.env` and run `php artisan config:clear`. |
| Delivery error `HTTP 401` | Tracker refused Hub's signature. Hub records only the status code, not Tracker's reason. There are three causes: Tracker's `LOUPE_PROJECT_ID` is not the Tracker project's ID (often Shop's ID was copied), Tracker's clock differs from Hub's by more than 300 seconds, or Tracker's `LOUPE_PROJECT_SECRET` does not match the Tracker project. | Check them in this order. Compare Tracker's `LOUPE_PROJECT_ID` with the **Project ID** on the Tracker page in Hub. Sync both servers' clocks, for example with NTP. If both are right, rotate the project secret on the Tracker page in Hub and put the new value in Tracker's `.env`. Rotating changes the secret for every app that uses the Tracker project. Then run `php artisan config:clear`. |
| Delivery error `HTTP 404` | Nothing answers at the inbound URL. The path does not match Tracker's `LOUPE_PATH`, the host does not match Tracker's `LOUPE_DOMAIN` when that is set, or `LOUPE_ENABLED` is `false` in Tracker. | Set the inbound URL to `https://<LOUPE_DOMAIN or Tracker's host>/<LOUPE_PATH>/v1/hub/inbound`, and make sure `LOUPE_ENABLED` is not `false`. |
| Delivery error `HTTP 301` or `HTTP 302` | Tracker redirected the request, for example from `http` to `https` or to add a trailing slash. Hub does not follow redirects. | Use the final URL, with the same scheme and host that Tracker redirects to. |
| Delivery error `timeout after 10000ms` | Tracker did not answer within 10 seconds on each attempt. | Check that Tracker is up and reachable from Hub, and that nothing slow runs while Tracker stores the ticket, such as a synchronous `TicketReceived` listener. |
| Delivery error `refused: <HOST> resolves to a private address (<IP>)` | Hub 0.14.1 and later refuse loopback, private, link-local and other non-public addresses. | Use a public URL for Tracker. For local development only, start Hub with `HUB_ALLOW_PRIVATE_URLS=1`, as in the [local tutorial](../tutorials/hub-two-projects-local.md). |
| Tracker's Activity shows `ticket.update_failed` with `payload too large` | A status change or reply from Tracker is over Hub's 1,000,000-byte limit for an update. This usually means a reply with large attachments. | Send the reply with fewer or smaller attachments. |
| The ticket reaches Tracker, but status changes and replies never reach Shop | Hub did not keep Shop's `reply_url`, the address Shop sends with each ticket for updates. Hub 0.14.0 keeps any `http` or `https` `reply_url`. Hub 0.14.1 and later keep it only when its path ends in `/v1/hub/inbound`, it carries no user name or password, and it has the same origin (scheme, host and port) as Shop's inbound URL when the Shop project has one set in Hub. Hub checks again before each update. | Make sure Shop's routes are enabled (`LOUPE_ENABLED` is not `false`). If you set an inbound URL on the Shop project, use the same scheme and host that Shop's users open Shop on, because Shop builds its `reply_url` from the incoming request. |

## Next steps

- [Route a ticket between two projects with a local Loupe Hub](../tutorials/hub-two-projects-local.md): try the same flow on one machine.
- [Receive and verify Loupe Hub webhooks](verify-hub-webhooks.md): send a project's tickets to an external webhook instead of another project.
- [Laravel package reference](../LARAVEL.md): `Loupe::describeTicket()`, `Loupe::reply()`, the `TicketReceived` event and the inbound route.
- [Loupe Hub reference](../reference/hub.md): the signed API, error codes and dashboard routes.
- [How Loupe Hub works](../explanation/hub.md): organizations, routing and two-way sync explained.
- [Manage Hub organizations and projects](hub-manage-projects.md): add members and rotate secrets.
