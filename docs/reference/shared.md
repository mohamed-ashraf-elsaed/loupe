# @loupekit/shared reference

This page lists every type, constant and function that `@loupekit/shared` 0.14.1 exports. The
package is the canonical data model for the Loupe JavaScript packages: the SDK, the local server,
the dashboard and the MCP server all import their comment, thread and status shapes from it.

No function reads the DOM, the network or storage, so you can call them in a browser, in Node or
in a test. Functions that take an optional `now` (or a request without `at`/`id`) read the system
clock; pass the value in to make them deterministic (`consent.ts:67-68`, `:92`, `activity.ts:85`,
`presence.ts:48`, `:55`, `:65`, `:79`).

Each table has a **Source** column. It gives the file and line in the
[Loupe repository](https://github.com/mohamed-ashraf-elsaed/loupe) that defines the fact. Paths are
relative to `packages/shared/src/` unless they start with `packages/`.

## Contents

1. [Package](#package)
2. [What is not in this package](#what-is-not-in-this-package)
3. [index: stages and statuses](#index-stages-and-statuses)
4. [index: priority and change type](#index-priority-and-change-type)
5. [index: core types](#index-core-types)
6. [index: Comment](#index-comment)
7. [index: Loupe Hub types](#index-loupe-hub-types)
8. [index: normalizeUrl](#index-normalizeurl)
9. [activity](#activity)
10. [lifecycle](#lifecycle)
11. [iteration](#iteration)
12. [consent](#consent)
13. [preview](#preview)
14. [thread](#thread)
15. [timeline](#timeline)
16. [mentions](#mentions)
17. [needs-you](#needs-you)
18. [reactions](#reactions)
19. [presence](#presence)
20. [companion-tray](#companion-tray)

## Package

| Name | Value | Description | Source |
|---|---|---|---|
| Package name | `@loupekit/shared` | Published to npm with public access. | `packages/shared/package.json:2`, `:26-28` |
| Version | `0.14.1` | Moves in lockstep with the other Loupe packages. | `packages/shared/package.json:8` |
| Module format | ESM only | `"type": "module"`. There is no CommonJS build. | `packages/shared/package.json:29` |
| Entry | `./dist/index.js` | Types are in `./dist/index.d.ts`. One export, `.`. | `packages/shared/package.json:30-37` |
| Published files | `dist` | Built with `tsc -p tsconfig.json`. | `packages/shared/package.json:38-43` |
| Runtime dependencies | none | The package has no `dependencies` field. | `packages/shared/package.json:1-44` |
| Modules | 13 | `index.ts` defines the core model and re-exports 12 modules. | `index.ts:3-14` |

Install it and import any name from the package root:

```bash
npm i @loupekit/shared
```

```ts
import { normalizeStatus, STAGE_LABELS, type Comment } from "@loupekit/shared";

const stage = normalizeStatus("done"); // "resolved"
console.log(STAGE_LABELS[stage]);      // "Resolved"
```

All names come from the package root. There are no deep imports such as
`@loupekit/shared/thread`.

## What is not in this package

These types belong to the SDK and are defined in `packages/sdk/src/types.ts`. See the
[SDK reference](sdk.md) for them.

| Type | Where it lives | Source |
|---|---|---|
| `LoupeConfig` | [SDK init options](sdk.md#init-options) | `packages/sdk/src/types.ts:92` |
| `StorageAdapter` | [SDK storage adapters](sdk.md#storage-adapters) | `packages/sdk/src/types.ts:202` |
| `ResolveResult` | SDK re-anchoring | `packages/sdk/src/types.ts:250` |
| `LoupeTab`, `LoupeTabContext` | [SDK init options](sdk.md#loupetab) | `packages/sdk/src/types.ts:81`, `:55` |
| `GenerateRequest`, `GenerateResult`, `AccessRequest`, `LocalAiConfig` | [SDK init options](sdk.md#generaterequest) | `packages/sdk/src/types.ts:15-49` |

The SDK source re-exports everything from this package internally
(`packages/sdk/src/types.ts:3`). The SDK's public entry exports only a few of these types, such as
`Comment`, `Anchor`, `RegionRect`, `LoupeUser` and the activity types
(`packages/sdk/src/index.ts:7-13`). For any other name, install `@loupekit/shared` directly.

## index: stages and statuses

A **stage** is the column a comment sits in on the triage board. There are five stages. The design
rule is that an agent may move a comment to `in_review`, and only a person resolves it
(`index.ts:20-26`).

### Types and constants

| Name | Type | Value | Description | Source |
|---|---|---|---|---|
| `CommentStage` | type | `"queue" \| "todo" \| "in_progress" \| "in_review" \| "resolved"` | A board stage. | `index.ts:27` |
| `CommentStatus` | type | same as `CommentStage` | Deprecated alias, kept so older imports compile. | `index.ts:29-30` |
| `COMMENT_STAGES` | `readonly CommentStage[]` | `["queue", "todo", "in_progress", "in_review", "resolved"]` | Board order, left to right. | `index.ts:33` |
| `STAGE_LABELS` | `Record<CommentStage, string>` | see below | Column labels. | `index.ts:36-42` |

| Stage | Label |
|---|---|
| `queue` | Queue |
| `todo` | To Do |
| `in_progress` | In Progress |
| `in_review` | In Review |
| `resolved` | Resolved |

### Legacy statuses

Before the five-stage board, Loupe stored three statuses. They are still accepted on input. The
map is internal (`LEGACY_STATUS` is not exported).

| Legacy value | Maps to | Source |
|---|---|---|
| `open` | `queue` | `index.ts:50` |
| `in_progress` | `in_progress` | `index.ts:51` |
| `done` | `resolved` | `index.ts:52` |

### Functions

| Signature | Behavior | Source |
|---|---|---|
| `normalizeStatus(value: unknown): CommentStage` | Returns a valid stage unchanged and maps a legacy value to its stage. Anything else, including non-strings, returns `"queue"`. | `index.ts:60-66` |
| `isOpenStage(stage: CommentStage): boolean` | `true` for every stage except `resolved`. | `index.ts:69-71` |
| `statusAliases(stage: CommentStage): string[]` | Returns the stage followed by every legacy value that maps to it. Use it to build an SQL filter that also finds older rows. | `index.ts:78-84` |

```ts
statusAliases("resolved"); // ["resolved", "done"]
statusAliases("queue");    // ["queue", "open"]
statusAliases("todo");     // ["todo"]
```

## index: priority and change type

| Name | Type | Value | Source |
|---|---|---|---|
| `CommentPriority` | type | `"critical" \| "high" \| "medium" \| "low"` | `index.ts:90` |
| `COMMENT_PRIORITIES` | `readonly CommentPriority[]` | `["critical", "high", "medium", "low"]`, most urgent first | `index.ts:93` |
| `PRIORITY_LABELS` | `Record<CommentPriority, string>` | Critical, High, Medium, Low | `index.ts:96-101` |
| `PRIORITY_RANK` | `Record<CommentPriority, number>` | `critical` 0, `high` 1, `medium` 2, `low` 3. Sort with `a - b` to put the most urgent first. | `index.ts:104-109` |
| `ChangeType` | type | `"frontend" \| "backend" \| "api" \| "other"` | `index.ts:115` |
| `CHANGE_TYPES` | `readonly ChangeType[]` | `["frontend", "backend", "api", "other"]` | `index.ts:118` |
| `CHANGE_TYPE_LABELS` | `Record<ChangeType, string>` | Frontend, Backend, API, Other | `index.ts:121-126` |
| `DEFAULT_PRIORITY` | `CommentPriority` | `"medium"` | `index.ts:129` |
| `DEFAULT_CHANGE_TYPE` | `ChangeType` | `"other"` | `index.ts:130` |

| Signature | Behavior | Source |
|---|---|---|
| `normalizePriority(value: unknown): CommentPriority` | Returns the value if it is a known priority, else `"medium"`. | `index.ts:133-138` |
| `normalizeChangeType(value: unknown): ChangeType` | Returns the value if it is a known change type, else `"other"`. | `index.ts:141-146` |

## index: core types

### LoupeUser

The person who writes a comment. Source: `index.ts:148-152`.

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Stable user id from your app. |
| `name` | string | yes | Display name. |
| `email` | string | no | Email address. |

### Anchor

The fingerprint of the element a comment is pinned to. The SDK uses it to find the element again
after a redeploy. Source: `index.ts:154-164`.

| Field | Type | Description |
|---|---|---|
| `tag` | string | Element tag name. |
| `cssPath` | string | CSS path to the element. |
| `xpath` | string | XPath to the element. |
| `testid` | `string \| null` | A stable test id, or `null`. |
| `text` | string | Text content of the element. |
| `attrs` | `Record<string, string>` | Selected attributes of the element. |
| `nthOfType` | number | Position among siblings of the same tag. |
| `rect` | `{ x; y; w; h }` (numbers) | Element box when captured. |
| `viewport` | `{ w; h }` (numbers) | Viewport size when captured. |

For how these fields are captured and scored, see the
[SDK re-anchoring summary](sdk.md#re-anchoring-summary).

### ElementContext

Source: `index.ts:166-169`.

| Field | Type | Description |
|---|---|---|
| `html` | string | Element markup. |
| `styles` | `Record<string, string>` | Computed style values. |

### Proposal

A UI change an agent writes back for a comment, through the MCP `propose_change` tool or the API.
The dashboard renders it as code plus a live preview. Source: `index.ts:177-187`.

| Field | Type | Required | Description |
|---|---|---|---|
| `html` | string | yes | The modified element markup. |
| `css` | string | no | Accompanying CSS. May be empty when styles are inline in `html`. |
| `notes` | string | no | The agent's explanation of what changed and why. |
| `author` | string | no | Who produced it, for example `"Claude Code via MCP"`. |
| `createdAt` | string | yes | Timestamp. |

### Attachment

A file the reporter attached to a comment. In server mode `url` is an object-storage URL; offline
it is an inline data URL. Source: `index.ts:195-204`.

| Field | Type | Required | Description |
|---|---|---|---|
| `url` | string | yes | File URL or data URL. |
| `name` | string | no | Original filename. |
| `mime` | string | no | MIME type, for example `"image/png"` or `"video/webm"`. |
| `kind` | `"image" \| "video"` | yes | How to render it. |
| `size` | number | no | Size in bytes. |

Thread replies use a different type, `MessageAttachment`, which also allows `"file"`. See
[thread](#thread).

### RegionRect

A rectangle in document coordinates: page pixels, scroll included. Source: `index.ts:207-219`.

| Field | Type | Required | Description |
|---|---|---|---|
| `x`, `y`, `w`, `h` | number | yes | Position and size in document coordinates. |
| `rel` | `{ fx; fy; fw; fh }` (numbers) | no | The same rectangle as fractions of the region's anchor element. Present when an anchor element was found. Used to re-place the region after a responsive reflow. The absolute values are the fallback when the anchor is gone. |

### CommentKind

`"element" | "region" | "free"`. Source: `index.ts:221-229`.

| Value | Meaning |
|---|---|
| `element` | Default. Anchored to a DOM element through its `Anchor`. |
| `region` | A rectangle the user dragged. Carries `region`. |
| `free` | A page-level note tied to no element and carrying no screenshot. Its drop point is in `offset`, as fractions of the document (x and y in [0, 1]). |

### DeviceType and deviceType

| Name | Signature or type | Behavior | Source |
|---|---|---|---|
| `DeviceType` | `"mobile" \| "tablet" \| "desktop"` | Device class of the capture. | `index.ts:232` |
| `deviceType` | `deviceType(width: number): DeviceType` | Under 768 returns `mobile`. From 768 up to 1023 returns `tablet`. From 1024 returns `desktop`. | `index.ts:235-239` |

Pass `comment.viewport.w` to get the device a comment was captured on.

## index: Comment

`Comment` is one piece of feedback and the first message of its thread. Source:
`index.ts:310-388`.

| Field | Type | Required | Description | Source |
|---|---|---|---|---|
| `id` | string | yes | Comment id. | `index.ts:311` |
| `projectKey` | string | yes | The project the comment belongs to. | `index.ts:312` |
| `url` | string | yes | The page, normally the output of [`normalizeUrl`](#index-normalizeurl). | `index.ts:313` |
| `author` | `LoupeUser` | yes | Who wrote it. | `index.ts:314` |
| `title` | string | no | One-line summary. Falls back to the first line of `body` when absent. | `index.ts:315-316` |
| `body` | string | yes | The reporter's description. | `index.ts:317-318` |
| `status` | `CommentStatus` | yes | Board stage. | `index.ts:319` |
| `priority` | `CommentPriority` | no | Absent on older rows. Treat absent as `"medium"`. | `index.ts:320-321` |
| `changeType` | `ChangeType` | no | Absent on older rows. Treat absent as `"other"`. | `index.ts:322-323` |
| `repo` | string | no | Legacy. The SDK stopped writing it in 0.12.0; older rows still carry it. | `index.ts:324-328` |
| `branch` | string | no | Legacy, like `repo`. | `index.ts:329-330` |
| `source` | [`TicketSource`](#ticketsource) | no | Set when another project in the organization sent this ticket here through Loupe Hub. | `index.ts:331-332` |
| `forwarded` | [`TicketForward`](#ticketforward) | no | What Loupe Hub did with this ticket after it was filed here. | `index.ts:333-334` |
| `kind` | `CommentKind` | no | Treat absent as `"element"`. | `index.ts:335-336` |
| `anchor` | `Anchor` | yes | Element fingerprint. | `index.ts:337` |
| `context` | `ElementContext` | yes | Element markup and styles. | `index.ts:338` |
| `offset` | `{ x: number; y: number }` | yes | Pin offset. For `free` notes, fractions of the document. | `index.ts:339` |
| `region` | `RegionRect` | no | The dragged rectangle, for `region` comments. | `index.ts:340-341` |
| `viewport` | object | no | The capture viewport. See the next table. | `index.ts:342-360` |
| `screenshot` | string | no | A storage URL in server mode, or a data URL offline. | `index.ts:361-362` |
| `recording` | string | no | A webm screen recording of the region, made with the Record tool. URL or data URL. | `index.ts:363-367` |
| `attachments` | `Attachment[]` | no | Files the reporter attached by hand. Separate from `screenshot` and `recording`. | `index.ts:368-372` |
| `proposal` | `Proposal` | no | The agent's proposed UI change. | `index.ts:373-374` |
| `pr` | [`PrInfo`](#lifecycle) | no | The pull request carrying the fix. Drives the lifecycle chip and checks meter. | `index.ts:375-379` |
| `parentThreadId` | string | no | Set when this thread is a revision of another. | `index.ts:380-384` |
| `iterationType` | [`IterationType`](#thread) | no | `"original"` or `"revision"`. | `index.ts:385` |
| `iterationNumber` | number | no | 1 for the original, 2 for the first revision. | `index.ts:386` |
| `createdAt` | string | yes | Creation timestamp. | `index.ts:387` |

### Comment.viewport

| Field | Type | Required | Description |
|---|---|---|---|
| `w` | number | yes | Viewport width. Pass it to `deviceType`. |
| `h` | number | yes | Viewport height. |
| `v` | string | no | SDK version that created the comment. |
| `touch` | boolean | no | The browser reports a touch-capable screen. |
| `coarse` | boolean | no | `(pointer: coarse)` matched. |
| `gdm` | boolean | no | `getDisplayMedia` exists, so screen recording is possible. |

Source: `index.ts:349-360`.

## index: Loupe Hub types

These types describe tickets that move between projects through Loupe Hub. For how Hub routes
tickets, see [How Loupe Hub works](../explanation/hub.md).

### TicketSource

Set on a comment that another project in the organization sent here. Source: `index.ts:241-250`.

| Field | Type | Required |
|---|---|---|
| `projectId` | string | yes |
| `projectName` | `string \| null` | no |
| `organizationId` | `string \| null` | no |
| `organizationName` | `string \| null` | no |
| `deliveryId` | `string \| null` | no |
| `receivedAt` | `string \| null` | no |
| `reporter` | `{ email: string; name?: string }` | no |

### TicketForwardStatus

The outcome of sending a ticket to Loupe Hub. Source: `index.ts:252-253`.

`"ok" | "none" | "failed" | "unknown" | "rejected" | "unreachable"`

### TicketForward

Source: `index.ts:255-268`.

| Field | Type | Required | Description |
|---|---|---|---|
| `status` | `TicketForwardStatus` | yes | The forwarding outcome. |
| `deliveryId` | `string \| null` | no | Hub delivery id. |
| `destinationProjectId` | `string \| null` | no | The project that received it. |
| `destinationName` | `string \| null` | no | Name of the receiving project. `null` when Hub delivered to an external webhook. |
| `error` | string | no | Error text, when forwarding failed. |
| `at` | string | no | Timestamp. |
| `remote` | `TicketRemoteState` | no | Where the ticket stands in the receiving project. Absent until the receiver changes its status. |

### TicketRemoteState

The receiving project's view of a forwarded ticket. Source: `index.ts:270-282`.

| Field | Type | Required | Description |
|---|---|---|---|
| `status` | `CommentStatus` | yes | The board stage this app mapped the receiver's state to. |
| `label` | string | no | The receiver's own words for the state, for example `"Ready for testing"`. |
| `reference` | string | no | The receiver's ticket reference, for example `"TCK-42"`. |
| `url` | string | no | Link to the ticket in the receiver. |
| `projectName` | string | no | Receiving project name. |
| `at` | string | no | Timestamp. |

Example of a forwarded comment's `forwarded` field:

```json
{
  "status": "ok",
  "destinationName": "Tracker",
  "remote": { "status": "in_progress", "label": "In progress", "reference": "TCK-42" }
}
```

### OrgProject

A project in the organization, as Hub describes it. It never carries a secret. Source:
`index.ts:284-292`.

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Project id. |
| `name` | string | yes | Project name. |
| `receives` | boolean | yes | The project has an inbound URL, so other projects can send it tickets. |
| `isDestination` | boolean | no | This is where the current project's tickets go. |

### OrgInfo

The organization this project belongs to, read from Hub through the host app. Source:
`index.ts:294-308`.

| Field | Type | Required | Description |
|---|---|---|---|
| `organization` | `{ id: string; name: string } \| null` | yes | `null` when the app is not connected to Hub or Hub could not be reached. |
| `project` | object | yes | `{ id?: string; key?: string; name: string \| null; destination: { id; name } \| null; receives?: boolean }` |
| `projects` | `OrgProject[]` | yes | The other projects in the organization. |
| `error` | string | no | Error code, when the read failed. |

## index: normalizeUrl

`normalizeUrl(input: string): string` turns a page URL into the key comments are stored under, so
comments do not split across tracking parameters. Source: `index.ts:390-418`.

| Rule | Detail | Source |
|---|---|---|
| Input | A full URL or a path plus query string. It is parsed relative to `http://loupe.local`. | `index.ts:402` |
| Output | Path plus filtered query. The origin and the `#hash` are dropped. | `index.ts:403`, `:413` |
| Dropped keys | Any key starting with `utm_`, and these exact keys: `api`, `key`, `fbclid`, `gclid`, `gbraid`, `wbraid`, `msclkid`, `ref`, `ref_src`, `mc_cid`, `mc_eid`, `_hsenc`, `_hsmi`, `igshid`. Keys are compared in lower case. | `index.ts:390-393`, `:406-407` |
| Sort | Remaining parameters are sorted by key, then by value. | `index.ts:410` |
| Trailing slash | One trailing slash is removed, except on the root path `/`. | `index.ts:412` |
| Parse failure | Returns the input cut at the first `?`. | `index.ts:414-417` |

```ts
normalizeUrl("https://shop.example.com/checkout/?utm_source=mail&b=2&a=1#top");
// "/checkout?a=1&b=2"
normalizeUrl("/");
// "/"
```

## activity

The shape of the Activity feed in the widget panel. Agents, the host app and the SDK all push
events in this shape. Source: `activity.ts`.

### Types and constants

| Name | Type or value | Description | Source |
|---|---|---|---|
| `ActivityStatus` | `"idle" \| "working" \| "error"` | Run status shown by the panel's status dot. | `activity.ts:11` |
| `ACTIVITY_STATUSES` | `["idle", "working", "error"]` | All statuses. | `activity.ts:13` |
| `ACTIVITY_STATUS_LABELS` | Idle, Working, Error | Labels. | `activity.ts:15-19` |
| `ActivityLevel` | `"info" \| "warn" \| "error"` | Severity. Drives row colour, not filtering. | `activity.ts:22` |
| `ActivityEventInput` | `ActivityEvent` without `id` and `at`, both optional | What a caller supplies. The SDK fills in `id` and `at`. | `activity.ts:49` |

### ActivityEvent

Source: `activity.ts:25-46`.

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Event id. |
| `at` | string | yes | ISO timestamp. |
| `kind` | string | yes | Chip label, for example `"Edit"` for an agent or `"comment.create"` for Loupe. Chips group by this exact string. |
| `label` | string | yes | One-line summary. |
| `detail` | string | no | Second line: a command, a path or an error message. |
| `level` | `ActivityLevel` | no | Severity. |
| `files` | `string[]` | no | Files the event touched. |
| `commentId` | string | no | The comment the event is about. |
| `actor` | `{ id: string; name: string }` | no | Who did it. |

### ActivitySummary

Source: `activity.ts:52-64`.

| Field | Type | Description |
|---|---|---|
| `status` | `ActivityStatus` | The status passed in. |
| `events` | number | Events held. |
| `errors` | number | Events with `level: "error"`. |
| `files` | number | Distinct files touched. |
| `durationMs` | number | From the earliest event to `now`; 0 when there are no events. |
| `byKind` | `{ kind: string; count: number }[]` | Count per kind, most frequent first, then alphabetical. |

### Functions

| Signature | Behavior | Source |
|---|---|---|
| `formatDuration(ms: number): string` | Returns `"—"` for 0, negative or missing. Rounds to whole seconds first; under 60 rounded seconds returns `"48s"` (59,600 ms returns `"1m"`). Under 60 min returns `"2m 14s"`, or `"2m"` with no seconds. Otherwise returns `"1h 5m"`. | `activity.ts:67-76` |
| `summarizeActivity(events: ActivityEvent[], status: ActivityStatus = "idle", now: number = Date.now()): ActivitySummary` | Builds the summary above. Unparseable `at` values are ignored when finding the earliest event. | `activity.ts:82-110` |

## lifecycle

How a thread's fix moves through an agent, a pull request and a preview. The rule: only a person
resolves a thread. Source: `lifecycle.ts`.

### Types and constants

| Name | Type or value | Source |
|---|---|---|
| `LifecycleStage` | `"sent" \| "in_pr" \| "preview" \| "reviewed"` | `lifecycle.ts:31` |
| `LIFECYCLE_LABELS` | `sent` "Sent to agent", `in_pr` "In PR", `preview` "Review preview", `reviewed` "Reviewed" | `lifecycle.ts:33-38` |

**PrInfo** (`lifecycle.ts:15-29`):

| Field | Type | Required | Description |
|---|---|---|---|
| `number` | number | yes | PR number. |
| `url` | string | no | Link to the PR. |
| `state` | `"open" \| "merged" \| "closed"` | no | PR state. |
| `checksPassed` | number | no | Check runs that passed. |
| `checksTotal` | number | no | Total check runs. |
| `previewUrl` | string | no | Where the change is deployed. Absent until something reports one; it is never guessed. |

**Lifecycle** (`lifecycle.ts:40-47`):

| Field | Type | Required | Description |
|---|---|---|---|
| `stage` | `LifecycleStage` | yes | Lifecycle stage. |
| `label` | string | yes | Label from `LIFECYCLE_LABELS`. |
| `pr` | `PrInfo` | no | The PR, when the thread has one. |
| `checks` | `{ text: string; ratio: number }` | no | Checks meter, for example `{ text: "3/4", ratio: 0.75 }`. |

### Functions

| Signature | Behavior | Source |
|---|---|---|
| `lifecycle(c: { status: CommentStage; proposal?: unknown; pr?: PrInfo \| null }): Lifecycle \| null` | Rules, checked in order: (1) `resolved` with a proposal or PR returns `reviewed`; `resolved` without either returns `null`. (2) Any PR returns `in_pr`. (3) `in_review` returns `preview`. (4) A proposal returns `sent`. (5) Otherwise `null`. `pr` and `checks` are set only on `reviewed` and `in_pr`. `checks` appears only when `checksTotal > 0`; passed is clamped to [0, total]. | `lifecycle.ts:57-85` |
| `awaitingReview<T extends { status: CommentStage }>(comments: T[]): T[]` | Returns the comments whose status is `in_review`. | `lifecycle.ts:88-90` |

## iteration

The history of generated changes in the widget's generate pane: generate, refine, look again.
Source: `iteration.ts`.

### Types and constants

| Name | Type or value | Description | Source |
|---|---|---|---|
| `IterationKind` | `"generate" \| "refine" \| "revise"` | How the iteration was produced. | `iteration.ts:10` |
| `Iteration` | `{ id; at; html; css?; notes?; prompt?; kind }` | One generated change. `at` is ISO; `prompt` is what the user asked for. | `iteration.ts:12-24` |
| `IterationState` | `{ items: Iteration[]; index: number }` | `items` oldest first, never reordered. `index` is the previewed item, `-1` when empty. | `iteration.ts:26-31` |
| `MAX_ITERATIONS` | `20` | The stack keeps at most this many items. | `iteration.ts:57` |

### Functions

| Signature | Behavior | Source |
|---|---|---|
| `emptyIterations(): IterationState` | Returns `{ items: [], index: -1 }`. | `iteration.ts:33-35` |
| `current(state): Iteration \| null` | The previewed iteration, or `null`. | `iteration.ts:38-40` |
| `addIteration(state, iteration): IterationState` | Appends after the current index and drops anything after it, then keeps the last 20. The new item becomes current. | `iteration.ts:50-54` |
| `canUndo(state): boolean` | `true` when there is at least one item. | `iteration.ts:59-61` |
| `undo(state): IterationState` | Discards the newest item and previews the one before it. | `iteration.ts:67-71` |
| `canMove(state, delta: number): boolean` | `true` when `index + delta` is inside the list. | `iteration.ts:73-76` |
| `move(state, delta: number): IterationState` | Changes `index` without discarding anything. Returns the state unchanged when it cannot move. | `iteration.ts:79-81` |
| `stackLabel(state): string` | `"2 / 3"`, or `""` when empty. | `iteration.ts:84-86` |

## consent

Agent navigation consent. An agent asks to move the browser; a person grants or denies. `decide`
is the only function that returns a URL, and only on an explicit grant. Source: `consent.ts`.

### Types

| Name | Shape | Description | Source |
|---|---|---|---|
| `ConsentState` | `"idle" \| "requested" \| "granted" \| "denied"` | Current state. | `consent.ts:14` |
| `NavigationRequest` | `{ id; url; reason?; requester?; at }` | A request. `requester` is who is asking, for example `"Claude Code"`. `at` is ISO. | `consent.ts:16-26` |
| `ConsentDecision` | `{ url; decision: "granted" \| "denied"; at }` | One answer. | `consent.ts:28-32` |
| `ConsentRecord` | `{ state; request: NavigationRequest \| null; history: ConsentDecision[] }` | `history` is every decision, oldest first. | `consent.ts:34-39` |

### Functions

| Signature | Behavior | Source |
|---|---|---|
| `emptyConsent(): ConsentRecord` | `{ state: "idle", request: null, history: [] }`. | `consent.ts:41-43` |
| `isNavigableUrl(raw: string): boolean` | `true` only for absolute `http:` or `https:` URLs. | `consent.ts:46-53` |
| `requestNavigation(record, request): ConsentRecord` | Ignores a URL that is not navigable. Otherwise replaces any pending request and sets state `requested`. Default `id` is `nav` plus the time in base 36; default `at` is now. | `consent.ts:59-75` |
| `isPending(record): boolean` | `true` when state is `requested` and a request is set. | `consent.ts:77-79` |
| `decide(record, granted: boolean, now?: string): { record; navigateTo: string \| null }` | With no pending request, returns the record unchanged and `null`. Otherwise sets state `granted` or `denied`, clears the request, appends to `history`, and returns the URL only when `granted` is `true`. | `consent.ts:89-104` |
| `withdraw(record): ConsentRecord` | Drops a pending request without recording a decision. | `consent.ts:107-109` |

## preview

Matching real preview URLs against registered patterns, so a preview URL is matched rather than
guessed. Source: `preview.ts`.

### Types

| Name | Shape | Source |
|---|---|---|
| `PreviewVars` | `{ owner?; name?; repo?; branch?; pr?: number \| string }`. For example `owner` `"org"`, `name` `"web"`, `repo` `"org/web"`. | `preview.ts:59-69` |
| `RepoUrlPattern` | `{ repo; environment; pattern }`. `environment` is any string, for example `"staging"`. `pattern` is a glob. | `preview.ts:120-126` |

### Functions

| Signature | Behavior | Source |
|---|---|---|
| `matchUrlPattern(pattern: string, url: string): boolean` | Glob match. `*` matches within one path segment, `**` spans segments, `?` matches one character other than `/`. Trailing slashes are ignored on both sides. `https://x/**` also matches `https://x`. Empty input returns `false`. | `preview.ts:22-57` |
| `expandPreviewTemplate(template: string, vars: PreviewVars): string \| null` | Replaces `{owner}`, `{name}`, `{repo}`, `{branch}` and `{pr}`. Returns `null` if any placeholder is missing or empty, or if an unknown placeholder or a stray brace remains. | `preview.ts:77-99` |
| `githubPagesPreviewUrl(repo: string, pr?: number \| string): string \| null` | For `"owner/name"` returns `https://<owner lower case>.github.io/<name>/pr-preview/pr-<pr>/`. When `name` is `<owner>.github.io`, the repo segment is omitted. Returns `null` without a valid repo or PR. | `preview.ts:109-117` |
| `matchRepoUrl(patterns: RepoUrlPattern[], url: string): { pattern; environment } \| null` | The first pattern that matches, or `null`. | `preview.ts:129-134` |

```ts
matchUrlPattern("https://staging.shop.example.com/**", "https://staging.shop.example.com");        // true
matchUrlPattern("https://staging.shop.example.com/*", "https://staging.shop.example.com/a/b");     // false
githubPagesPreviewUrl("Acme/web", 12); // "https://acme.github.io/web/pr-preview/pr-12/"
```

## thread

Thread messages. A comment's `body` is also message 1 of its thread, synthesized rather than
stored. Source: `thread.ts`.

### Types and constants

| Name | Shape | Description | Source |
|---|---|---|---|
| `ThreadAuthorType` | `"user" \| "agent" \| "guest"` | Who is speaking. | `thread.ts:12` |
| `ThreadAuthor` | `{ id; name; email?; type }` | Message author. | `thread.ts:14-20` |
| `MessageAttachment` | `{ url; name?; mime?; kind: "image" \| "video" \| "file"; size? }` | Reply attachment. Unlike `Attachment`, allows `"file"`. | `thread.ts:22-28` |
| `ThreadMessageInput` | `ThreadMessage` without `id`, `threadId`, `createdAt`; `id` and `createdAt` optional | A new message before the store assigns an id. | `thread.ts:52-55` |
| `IterationType` | `"original" \| "revision"` | Whether a thread revises another. | `thread.ts:117` |
| `RevisionLink` | `{ parentThreadId?; iterationType?; iterationNumber? }` | `iterationNumber` is 1 for the original, 2 for the first revision. | `thread.ts:119-125` |
| `THREAD_MESSAGE_ADDED` | `"message_added"` | Event name a new reply publishes. | `thread.ts:135` |
| `THREAD_MESSAGE_DELETED` | `"message_deleted"` | Event name a retraction publishes. | `thread.ts:137` |

**ThreadMessage** (`thread.ts:30-49`):

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Message id. |
| `threadId` | string | yes | The comment id. |
| `author` | `ThreadAuthor` | yes | Author. |
| `body` | string | yes | Markdown. |
| `attachments` | `MessageAttachment[]` | no | Attachments. |
| `createdAt` | string | yes | Timestamp. |
| `deletedAt` | string | no | Set when the message was retracted. Deletion is soft. |
| `origin` | `{ projectId: string; projectName?: string }` | no | Set when the reply was written in another project and arrived through Loupe Hub. |

### Functions

| Signature | Behavior | Source |
|---|---|---|
| `firstMessageFromComment(comment: { id; body; author; createdAt; attachments? }): ThreadMessage` | Builds message 1 with id `<commentId>:0`, `threadId` the comment id, and author type `"user"`. `attachments` is omitted when empty. | `thread.ts:64-79` |
| `threadConversation(comment, replies: ThreadMessage[], opts?: { includeDeleted?: boolean }): ThreadMessage[]` | Message 1 plus the replies, sorted by `createdAt`. Retracted replies are dropped unless `includeDeleted` is `true`. | `thread.ts:82-91` |
| `visibleMessages(messages): ThreadMessage[]` | Drops messages with `deletedAt`. | `thread.ts:94-96` |
| `participantsOf(messages): ThreadAuthor[]` | Unique authors by id, in the order they first spoke. | `thread.ts:99-103` |
| `isAgentMessage(m): boolean` | `true` when `author.type` is `"agent"`. | `thread.ts:106-108` |
| `iterationLabel(link: RevisionLink): string \| null` | `"Iteration N"` for a revision with a `parentThreadId`, where N defaults to 2. Otherwise `null`. | `thread.ts:128-131` |

## timeline

A thread's history, built from what the thread already carries: its stage, PR, proposal and
replies. Source: `timeline.ts`.

### Types

**TimelineEntry** (`timeline.ts:12-21`): `{ at; label; detail?; actor?; kind }`, where `kind` is
one of `"captured" | "message" | "sent" | "pr" | "preview" | "review" | "resolved"`.

**TimelineInput** (`timeline.ts:23-32`):

| Field | Type | Required |
|---|---|---|
| `createdAt` | string | yes |
| `status` | string | yes |
| `kind` | string | no |
| `anchor` | `{ selector?; tag?; text? }` | no |
| `proposal` | `{ author?; createdAt? } \| null` | no |
| `pr` | `{ number?; url?; state?; previewUrl? } \| null` | no |
| `title` | string | no |

### Functions

| Signature | Behavior | Source |
|---|---|---|
| `describeTarget(input: TimelineInput): string` | Joins `a <tag>` and `` `selector` `` when present. Otherwise returns `"a page note"` for kind `free`, else `"an element"`. | `timeline.ts:35-40` |
| `threadTimeline(input, messages?: { at; authorName; fromAgent }[]): TimelineEntry[]` | See the entries below. | `timeline.ts:51-109` |
| `threadAsText(input & { id; body; url?; authorName? }, messages?: { at; authorName; body; fromAgent }[]): string` | A Markdown export: `# <title or "Feedback"> (#id)`, then Stage, Page (`—` when unknown), Target (only when the anchor has a selector) and PR with preview (only when the PR has a number), then `## Request` with the body, then `## Conversation` when there are messages. Agent messages are marked `(agent)`. | `timeline.ts:126-144` |

`threadTimeline` adds entries in this order. Legacy `open` and `done` are read as `queue` and
`resolved`. Steps with no stored time use the time of the last message passed in (pass messages oldest
first), or `createdAt` when there are no messages.

| # | Entry | When | Source |
|---|---|---|---|
| 1 | "Feedback captured", detail title · target | Always | `timeline.ts:58-63` |
| 2 | "\<name\> replied" | Once per message. `actor` is set only for agent messages. | `timeline.ts:65-72` |
| 3 | "Change ready from \<agent\>" | There is a proposal, or the stage is `in_review` or later. The agent defaults to "Claude Code". | `timeline.ts:77-86` |
| 4 | "Pull request #N opened", or "Pull request opened" when the PR has no number | There is a PR. Detail is "Merged.", "Closed without merging." or "Waiting on review." | `timeline.ts:88-94` |
| 5 | "Preview live" | The PR has a `previewUrl`. | `timeline.ts:96-98` |
| 6 | "Waiting on a human review" | The stage is `in_review` or later. | `timeline.ts:101-103` |
| 7 | "Resolved" | The stage is `resolved`. | `timeline.ts:104-106` |

## mentions

`@mentions` in thread messages. Handles that match nobody are returned, not dropped, so the caller
can say so. Source: `mentions.ts`.

### Types

| Name | Shape | Description | Source |
|---|---|---|---|
| `Mention` | `{ handle; start; length }` | `handle` without the `@`; `start` is the index of the `@`; `length` includes the `@`. | `mentions.ts:9-16` |
| `MentionCandidate` | `{ id; name; email? }` | A person who can be mentioned. | `mentions.ts:76-80` |
| `ResolvedMention` | `{ mention: Mention; user: MentionCandidate }` | A match. | `mentions.ts:82-85` |
| `MentionResolution` | `{ resolved: ResolvedMention[]; unknown: string[] }` | Matches and unmatched handles. | `mentions.ts:87-96` |

### Functions

| Signature | Behavior | Source |
|---|---|---|
| `parseMentions(body: string): Mention[]` | Finds handles matching `[A-Za-z0-9][A-Za-z0-9._-]*`. Skips fenced code blocks and inline code. An `@` must be at the start of the body or follow whitespace or one of `( [ { < " ' * _ ~`, so `sara@acme.com` is not a mention. Trailing `.`, `_` and `-` are stripped; a dot inside a handle is kept. Duplicates are dropped case-insensitively, keeping the first position. | `mentions.ts:19`, `:43-74` |
| `resolveMentions(body: string, candidates: MentionCandidate[]): MentionResolution` | Matches each handle, ignoring case, against a candidate's full name, name without spaces, first word of the name, email local part, or id. Each person is resolved once. | `mentions.ts:99-121` |
| `mentionSegments(body: string, mentions: Mention[]): { text: string; mention: boolean }[]` | Splits the body into text and mention segments for highlighting. | `mentions.ts:127-139` |
| `mentionSuggestions(body: string, caret: number, candidates: MentionCandidate[]): MentionCandidate[]` | Reads the text from the last `@` before the caret. Returns `[]` if there is no `@` or a space was typed. Otherwise returns candidates whose name or id contains it, ignoring case, up to 6. | `mentions.ts:142-158` |

```ts
resolveMentions("Thanks @sara, can @Dev check? cc sara@acme.com", [
  { id: "u_92", name: "Sara Lee", email: "sara@acme.com" },
]);
// { resolved: [{ mention: { handle: "sara", ... }, user: { id: "u_92", ... } }], unknown: ["Dev"] }
```

## needs-you

The single rule for "what is waiting on a person". The widget's Needs you tile and the dashboard
use it. Source: `needs-you.ts`.

### Types and constants

| Name | Shape or value | Source |
|---|---|---|
| `NeedsYouReason` | `"review" \| "question" \| "failed"` | `needs-you.ts:13` |
| `NEEDS_YOU_LABELS` | `review` "Waiting on your review", `question` "The agent asked you something", `failed` "The agent's run failed" | `needs-you.ts:15-19` |
| `NeedsYouInput` | `{ status: string; last?: { fromAgent: boolean; body: string } \| null; agentFailed?: boolean }`. `last` is the newest reply. Set `agentFailed` from the Activity stream; messages do not carry it. | `needs-you.ts:21-32` |
| `NeedsYou` | `{ needs: boolean; reason?: NeedsYouReason; label?: string }` | `needs-you.ts:34-38` |

### Functions

| Signature | Behavior | Source |
|---|---|---|
| `looksLikeQuestion(body: string): boolean` | `true` when the last non-empty line ends with `?`, optionally followed by `"`, `'`, `)` or `]`. | `needs-you.ts:41-47` |
| `needsYou(input: NeedsYouInput): NeedsYou` | Rules, checked in order: (1) `resolved` (or legacy `done`) never needs anyone. (2) `agentFailed` returns `failed`. (3) The newest reply is from an agent and looks like a question: returns `question`. A person's question does not count. (4) `in_review` returns `review`. (5) Otherwise `{ needs: false }`. | `needs-you.ts:56-73` |
| `needsYouThreads<T extends NeedsYouInput>(threads: T[]): T[]` | Keeps the threads where `needsYou` is true, in their input order. | `needs-you.ts:76-78` |

## reactions

Emoji reactions on thread messages. A reaction is a toggle, not a counter. Source: `reactions.ts`.

### Types and constants

| Name | Shape or value | Source |
|---|---|---|
| `Reaction` | `{ messageId; emoji; userId; userName? }` | `reactions.ts:11-17` |
| `REACTION_CHOICES` | `["👍", "🎉", "👀", "🙏", "❤️", "🚀"]` | `reactions.ts:20` |
| `ReactionSummary` | `{ emoji; count; mine: boolean; users: string[] }`. `users` holds `userName`, or `userId` when there is no name, in reaction order. | `reactions.ts:22-29` |

### Functions

| Signature | Behavior | Source |
|---|---|---|
| `summarizeReactions(reactions: Reaction[], viewerId?: string): ReactionSummary[]` | Groups by emoji. Sorts by count (highest first), then by position in `REACTION_CHOICES`, then by emoji. `mine` is `false` without a `viewerId`. | `reactions.ts:37-58` |
| `toggleReaction(reactions: Reaction[], next: Reaction): Reaction[]` | Removes the reaction if one with the same `messageId`, `emoji` and `userId` exists; otherwise appends `next`. | `reactions.ts:67-73` |
| `reactionsByMessage(reactions: Reaction[], viewerId?: string): Map<string, ReactionSummary[]>` | `summarizeReactions` per message id. | `reactions.ts:76-86` |

## presence

Who else has a page open. Liveness is a heartbeat; silence past the TTL means the peer is gone.
Source: `presence.ts`.

### Types and constants

| Name | Shape or value | Description | Source |
|---|---|---|---|
| `Peer` | `{ id; userId; name; url; lastSeen: number; tab? }` | `id` is stable per page and user. `url` is normalized. `lastSeen` is epoch ms. | `presence.ts:12-23` |
| `JoinInput` | `{ url; userId; name; tab? }` | What a client sends to join. | `presence.ts:41-46` |
| `PEER_TTL_MS` | `20000` | Silence after which a peer is gone. | `presence.ts:26` |
| `PEER_HEARTBEAT_MS` | `6000` | How often a client should heartbeat. | `presence.ts:28` |

### Functions

| Signature | Behavior | Source |
|---|---|---|
| `peerId(url: string, userId: string): string` | FNV-1a hash of url and user id, formatted `p_` plus 8 hex digits. | `presence.ts:31-39` |
| `joinPresence(peers: Peer[], input: JoinInput, now?: number): Peer[]` | Replaces any peer with the same id and appends the new one with `lastSeen` = `now`. | `presence.ts:48-52` |
| `heartbeatPresence(peers: Peer[], id: string, now?: number): Peer[]` | Updates `lastSeen`. An unknown id is ignored. | `presence.ts:55-58` |
| `leavePresence(peers: Peer[], id: string): Peer[]` | Removes the peer. | `presence.ts:60-62` |
| `sweepPresence(peers: Peer[], now?: number, ttlMs: number = PEER_TTL_MS): Peer[]` | Keeps peers where `now - lastSeen < ttlMs`. | `presence.ts:65-67` |
| `peersOnPage(peers: Peer[], url: string, viewerId?: string): Peer[]` | Peers on `url`, excluding the peer whose `id` equals `viewerId`. | `presence.ts:70-72` |
| `throttleDelay(lastSentAt: number, now?: number, minMs = 80): number` | 0 when `lastSentAt` is 0 or `minMs` has passed; otherwise the milliseconds left to wait. | `presence.ts:79-83` |
| `initialsOf(name: string): string` | One word gives its first letter. Several words give the first and last initials. Empty gives `"?"`. Upper case. | `presence.ts:86-91` |

## companion-tray

The gather tray for the experimental Chat page, plus dictation helpers. The tray is an ordered
list; order tells the agent which item matters most. Source: `companion-tray.ts`.

### Types

| Name | Shape | Description | Source |
|---|---|---|---|
| `TrayItem` | `{ id; kind: "element" \| "region" \| "note" \| "screenshot"; label; url?; thumb?; ref?; include: boolean }` | `label` is the chip text. `ref` is the element or comment it came from. Unchecked items stay in the tray but are not sent. | `companion-tray.ts:12-25` |
| `TrayState` | `{ items: TrayItem[] }` | The tray. | `companion-tray.ts:27-29` |
| `VoiceSupport` | `"supported" \| "unsupported" \| "insecure"` | Dictation availability. | `companion-tray.ts:117` |

### Functions

| Signature | Behavior | Source |
|---|---|---|
| `emptyTray(): TrayState` | `{ items: [] }`. | `companion-tray.ts:31-33` |
| `addToTray(state, item): TrayState` | `include` defaults to `true`. An item with an existing id replaces that item in place and keeps its `include` flag. | `companion-tray.ts:42-49` |
| `removeFromTray(state, id): TrayState` | Removes the item. | `companion-tray.ts:51-53` |
| `toggleInclude(state, id): TrayState` | Flips `include`. | `companion-tray.ts:55-57` |
| `moveInTray(state, id, to: number): TrayState` | Moves the item to position `to`, clamped to the list. | `companion-tray.ts:60-69` |
| `nudgeInTray(state, id, delta: number): TrayState` | Moves the item by `delta` positions. | `companion-tray.ts:72-76` |
| `includedItems(state): TrayItem[]` | Included items, order kept. | `companion-tray.ts:79-81` |
| `trayCount(state): { total: number; included: number }` | Counts. | `companion-tray.ts:83-85` |
| `clearTray(): TrayState` | `{ items: [] }`. | `companion-tray.ts:87-89` |
| `trayPayload(state): { kind; id?; url?; label? }[]` | The included items as the bridge expects them, in order. `id` is `ref` when set, else the item id. | `companion-tray.ts:98-105` |
| `traySummary(state): string` | `"No context gathered"`, `"N context"` / `"N contexts"` when all are included, else `"X of N included"`. | `companion-tray.ts:108-113` |
| `voiceSupport(env: { hasCtor: boolean; isSecureContext: boolean }): VoiceSupport` | `insecure` when not a secure context; otherwise `supported` or `unsupported` by `hasCtor`. | `companion-tray.ts:127-133` |
| `voiceMessage(support: VoiceSupport): string \| null` | `null` when supported. Insecure: "Dictation needs a secure page (https, or localhost)." Unsupported: "This browser cannot dictate — the Web Speech API is not available." | `companion-tray.ts:135-139` |
| `elapsedLabel(ms: number): string` | `m:ss`, for example `"1:05"`. Negative values give `"0:00"`. | `companion-tray.ts:142-147` |

## Related

- [SDK reference](sdk.md): `init()` options, `StorageAdapter`, and the HTTP calls that carry these types.
- [Local server reference](server.md): endpoints that store and return `Comment` objects.
- [Laravel package](../LARAVEL.md): the PHP side of the same data model.
- [Architecture](../ARCHITECTURE.md): how the packages fit together.
