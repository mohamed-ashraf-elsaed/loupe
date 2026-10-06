# @loupekit/shared

[![npm version](https://img.shields.io/npm/v/@loupekit/shared?color=4a55d6&label=npm)](https://www.npmjs.com/package/@loupekit/shared)
![Zero dependencies](https://img.shields.io/badge/dependencies-0-4a55d6)
![MIT license](https://img.shields.io/npm/l/@loupekit/shared?color=4a55d6)

TypeScript types and pure helpers shared by the [Loupe](https://github.com/mohamed-ashraf-elsaed/loupe) SDK, local server, dashboard, Hub and MCP server, so a comment means the same thing in every part of Loupe. The package has no runtime dependencies and is ESM only. It ships compiled JavaScript and `.d.ts` files.

The [SDK](https://www.npmjs.com/package/@loupekit/sdk) bundles this package's runtime code, so a page that uses the SDK does not need it. The SDK re-exports only a subset of these types, such as `Comment`, `Anchor`, `RegionRect`, `LoupeUser` and the activity types. Install `@loupekit/shared` when you need any other type or helper.

> **Note:** `@loupekit/sdk` currently publishes no `.d.ts` files, so its re-exported types do not reach TypeScript projects that install it from npm.

## Prerequisites

- Node.js with ES module support. The Loupe CI builds and tests on Node.js 24.
- An ES module project (`"type": "module"` in `package.json`, or `.mjs` files) or a bundler.
- TypeScript is optional. The types ship in `dist/*.d.ts`.

The package exports only an `import` entry. `require("@loupekit/shared")` fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`. In a CommonJS file, load it with a dynamic import:

```js
const { normalizeStatus } = await import("@loupekit/shared");
```

## Install

1. Install the package:

   ```bash
   npm i @loupekit/shared
   ```

2. Verify the install. Run this command from the same project directory:

   ```bash
   node --input-type=module -e 'import { normalizeStatus } from "@loupekit/shared"; console.log(normalizeStatus("done"))'
   ```

   You should see `resolved`.

## Examples

Run each example in a `.mjs` or `.ts` file inside an ES module project that has the package installed.

A *stage* is a comment's position on the Loupe triage board. `normalizeStatus` maps any status value to one of the five stages: `queue`, `todo`, `in_progress`, `in_review` and `resolved`. It also accepts the statuses Loupe used before the five-stage board and maps them: `open` to `queue`, `in_progress` to `in_progress`, and `done` to `resolved`. Any other value becomes `queue`.

```ts
import { normalizeStatus } from "@loupekit/shared";

normalizeStatus("done");      // "resolved"
normalizeStatus("open");      // "queue"
normalizeStatus("archived");  // "queue"
```

`normalizeUrl` reduces a page URL to path and query, so tracking parameters do not split one page into many. It accepts a full URL or a path with a query string. It drops every `utm_*` parameter, click ids such as `gclid` and `fbclid`, and also `api`, `key` and `ref`. If your page uses `?key=` or `?ref=` for its own purposes, that parameter is removed too. See the [reference](https://github.com/mohamed-ashraf-elsaed/loupe/blob/main/docs/reference/shared.md) for the full list. It then sorts the remaining parameters and removes the origin, the hash and a trailing slash. If the input cannot be parsed, it returns the part before `?`.

```ts
import { normalizeUrl } from "@loupekit/shared";

normalizeUrl("https://shop.example.com/checkout/?utm_source=mail&step=2&gclid=abc&coupon=SPRING#total");
// "/checkout?coupon=SPRING&step=2"
```

`parseMentions` finds `@handles` in a message body. It skips email addresses and code spans, trims trailing punctuation and keeps only the first mention of each handle (case-insensitive).

```ts
import { parseMentions } from "@loupekit/shared";

parseMentions("Thanks @sara, can @jane.doe check? Mail sara@acme.com or see `@ignored`. @Sara again.");
// [ { handle: "sara", start: 7, length: 5 }, { handle: "jane.doe", start: 18, length: 9 } ]
```

## Modules

Import everything from `@loupekit/shared`. The modules below are internal files; subpath imports such as `@loupekit/shared/mentions` are not exported and fail with `ERR_PACKAGE_PATH_NOT_EXPORTED`.

Terms used in the table:

- **Loupe Hub**: the service that holds an organization's projects and routes tickets between them.
- **Agent**: an AI coding agent that works on the fix for a thread.
- **Companion tray**: the list of page elements, regions, notes and screenshots a person gathers to send as one visual brief.

| Module | Contents |
| --- | --- |
| `index` | `Comment` and its parts (`Anchor`, `RegionRect`, `Attachment`, `Proposal`), stages, priorities, change types, types for sending tickets to Loupe Hub, `normalizeStatus`, `normalizeUrl` |
| `activity` | Activity events, `summarizeActivity` and `formatDuration` |
| `lifecycle` | Pull request info and the lifecycle of a thread's change: Sent to agent / In PR / Review preview / Reviewed |
| `iteration` | History of a generated change as it is generated, refined and revised, with undo, capped at 20 iterations |
| `consent` | Requests from an agent to navigate the browser, which a person grants or denies |
| `preview` | URL glob matching and preview URL templates |
| `thread` | Thread messages, authors and revision links |
| `timeline` | A thread's timeline and its Markdown export |
| `mentions` | Parse, resolve and suggest `@mentions` |
| `needs-you` | Whether a thread waits on a person, and why |
| `reactions` | The six reaction emoji, toggling and summaries |
| `presence` | Who else is on the page, heartbeats and avatar initials |
| `companion-tray` | Items in the companion tray, and dictation support checks |

Every type, constant and helper: [reference](https://github.com/mohamed-ashraf-elsaed/loupe/blob/main/docs/reference/shared.md).

## License

MIT, as declared in the `license` field of `package.json`.
