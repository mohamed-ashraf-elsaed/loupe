# Loupe

Loupe is an open-source visual feedback tool. You pin comments to elements of a live web page, and an AI agent such as Claude Code picks them up over MCP (Model Context Protocol, the standard that lets an agent call external tools).

![Screenshot of a Loupe comment thread with a screenshot, a reply with an @mention, and a thumbs-up reaction](docs/images/sdk-thread-detail.png)

## Contents

- [What you can do](#what-you-can-do)
- [Choose how to install](#choose-how-to-install)
- [Try it in five minutes](#try-it-in-five-minutes)
- [Packages](#packages)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [Author](#author)
- [License](#license)

## What you can do

- **Pin feedback where it belongs.** Comment on a single element, drag a region, or leave a free note on the page. Pins re-anchor after a redeploy: Loupe finds the same element again, even when its markup changes.
- **Capture what you see.** Attach a screenshot or a short screen recording of a region. Elements marked with `data-loupe-redact` are left out of every screenshot. Screen recordings capture the real pixels, redacted elements included.
- **Discuss in threads.** Reply under each comment, `@mention` teammates, and react with 👍 🎉 👀 🙏 ❤️ 🚀.
- **Triage on a five-stage board.** Move comments through Queue, To Do, In Progress, In Review and Resolved.
- **Hand the backlog to an agent.** The `@loupekit/mcp` server gives Claude Code 19 tools, including `list_comments`, `get_comment`, `propose_change` and `update_status`. The Laravel package ships its own MCP server with those 4 core tools when the optional `laravel/mcp` package is installed (`php artisan mcp:start loupe`).
- **Run it inside Laravel.** The `loupekit/laravel` package stores comments in your database, uses your authentication and gates, and serves the board on your routes.
- **Route tickets between apps.** Loupe Hub, a separate server you host, sends a comment from one project to another in the same organization (a group of projects in Hub), and syncs status changes and replies both ways.

## Choose how to install

| Integration | Use it when | Guide |
|---|---|---|
| Script tag | You want the widget on any page without a build step. | [Embed Loupe with a script tag](docs/how-to/embed-script-tag.md) |
| npm package | Your app uses a bundler: React, Vue, or any single-page app. | [Install Loupe from npm](docs/how-to/install-npm.md) |
| Laravel | Your app is built on Laravel 11, 12 or 13. | [Install Loupe in a Laravel app](docs/how-to/laravel-install.md) |
| Browser extension | You want to comment on a site you cannot change. | [Use the browser extension](docs/how-to/browser-extension.md) |
| MCP clients | You want Claude Code, or another MCP client, to work through the comments. | [Connect MCP clients](docs/how-to/connect-mcp-clients.md) |
| Local server and dashboard | You want the Node API and the Kanban board (columns that comment cards move across) on your machine. | [Run the local server](docs/how-to/run-local-server.md) |
| Loupe Hub | You want to route tickets between several apps. | [Self-host Loupe Hub](docs/how-to/hub-self-host.md) |

## Try it in five minutes

This quick start runs the local server, leaves one comment on the demo page, and shows it on the board.

### Prerequisites

- **Node 24.** The local server runs its TypeScript files directly with `node index.ts`, which needs Node 24. Run `node --version`. You should see `v24` followed by a minor version.
- **npm**, which comes with Node.
- **git**, to clone the repository.

### Steps

1. Clone the repository and move into it:

   ```bash
   git clone https://github.com/mohamed-ashraf-elsaed/loupe.git
   cd loupe
   ```

   Run every later command from this folder.

2. Install the workspace dependencies:

   ```bash
   npm install
   ```

   You should see npm finish with an `added ... packages` summary.

3. Build the packages:

   ```bash
   npm run build
   ```

   You should see the command finish with no line that starts with `npm error`.

4. Create the demo project:

   ```bash
   npm run seed
   ```

   You should see `Seeded project: pk_demo_acme`, followed by an `admin key` line. The admin key is the project secret. The dashboard asks for it in its address. Its default value is `sk_demo_acme_0f3b9c`.

5. Start the server:

   ```bash
   npm start
   ```

   You should see:

   ```text
   [loupe] API + static on http://localhost:8787  (dashboard: /dashboard/ · demo: /demo/)
   ```

   Leave this terminal running.

6. In your browser, open http://localhost:8787/demo/.

   You should see the **Q3 Performance Overview** page with the Loupe panel open on the right and a short tour. Click **Next** through the tour, then click **Done**.

7. Leave a comment:
   1. In the panel, on the **Home** tab, click **✛ Pin feedback on this page**.
   2. Click the **Send invite** button in the invite form.
   3. Type a title and a description, then click **Comment**.

   You should see a numbered pin, **1**, on the **Send invite** button.

8. In a new browser tab, open the board:

   ```text
   http://localhost:8787/dashboard/?key=<ADMIN_KEY>
   ```

   Replace `<ADMIN_KEY>` with the admin key that `npm run seed` printed in step 4.

   You should see the board with five columns: Queue, To Do, In Progress, In Review and Resolved. Your comment is a card in the **Queue** column.

### Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `npm start` fails, or the server does not start on port 8787. | Another program is using port 8787. | Stop the other program, or start on another port with `PORT=9000 npm start`. |
| `npm start` fails on `node index.ts`. | Your Node version is older than 24. | Install Node 24, check it with `node --version`, then run `npm start` again. |
| Clicking **Comment** on the demo page fails. | You ran `npm run seed` with `LOUPE_DEMO_SECRET` set. The demo page signs requests with the default secret. | Unset `LOUPE_DEMO_SECRET`, run `npm run seed` again, then reload the demo page. |
| The board is empty. | You have not left a comment yet. | Do step 7, then reload the board. |

### Next steps

- Follow the full walkthrough, which also connects Claude Code: [Leave your first comment locally](docs/tutorials/first-comment-local.md).
- Add Loupe to your own app with one of the guides in [Choose how to install](#choose-how-to-install).

## Packages

| Package | Registry | What it is |
|---|---|---|
| [`@loupekit/sdk`](packages/sdk/README.md) | npm | The embeddable widget: inspect, comment, capture, re-anchor. |
| [`@loupekit/shared`](packages/shared/README.md) | npm | Shared types, board stages and helpers used by every package. |
| [`@loupekit/mcp`](packages/mcp/README.md) | npm (bin `loupe-mcp`) | The MCP server over stdio (standard input and output, which Claude Code uses to start and talk to a local server), plus a local bridge on 127.0.0.1: a small HTTP server that lets the widget reach the agent, for example in its Chat tab. |
| [`loupekit/laravel`](packages/laravel/README.md) | Packagist | The Laravel package. Mirrored from `packages/laravel` to [loupe-laravel](https://github.com/mohamed-ashraf-elsaed/loupe-laravel). |
| [Extension](packages/extension) | Not published; load unpacked (see the [guide](docs/how-to/browser-extension.md)) | The Manifest V3 browser extension. A private workspace. |
| [Server](packages/server) | Not published; run from this repo | The Node API that also serves the dashboard and the demo. |
| [Dashboard](packages/dashboard) | Not published; run from this repo | The Kanban triage board. |
| [Hub](packages/hub/README.md) | Not published; run from this repo | Loupe Hub: organizations, projects and ticket routing. See [How Loupe Hub works](docs/explanation/hub.md). |

## Documentation

- [Documentation index](docs/README.md)
- [The Loupe guide](https://mohamed-ashraf-elsaed.github.io/loupe/guide/)
- [The Loupe wiki](https://github.com/mohamed-ashraf-elsaed/loupe/wiki)
- [Changelog](CHANGELOG.md)

## Contributing

- [Contributing to Loupe](CONTRIBUTING.md)
- [Testing](docs/TESTING.md)
- [Releasing](RELEASING.md)

## Author

**Loupe is created and maintained by [Mohamed Ashraf Elsaed](https://www.linkedin.com/in/mohamedashrafelsaed/).**

- 💼 LinkedIn: [mohamedashrafelsaed](https://www.linkedin.com/in/mohamedashrafelsaed/)
- 🐙 GitHub: [@mohamed-ashraf-elsaed](https://github.com/mohamed-ashraf-elsaed)
- ✉️ Email: [m.ashraf.saed@gmail.com](mailto:m.ashraf.saed@gmail.com)

## License

MIT © [Mohamed Ashraf Elsaed](https://www.linkedin.com/in/mohamedashrafelsaed/). See [LICENSE](LICENSE).
