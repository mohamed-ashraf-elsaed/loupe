# Changelog

All notable changes to Loupe are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Releases are
published via [GitHub Releases](https://github.com/mohamed-ashraf-elsaed/loupe/releases);
see [RELEASING.md](RELEASING.md) for the process.

## [Unreleased]

_Nothing yet._

## [0.10.28] — 2026-10-02

### Added

- **The integration framework** (milestone 0.16; #31). One lifecycle for every provider — *save
  credentials → test connection → map repos to targets* — so a new provider is an adapter and nothing else.
  - **Credentials are encrypted at rest (AES-256-GCM) and never returned by the API.** The write goes only
    into a `sealed` column; the plaintext column is deliberately kept empty so a `SELECT *` cannot leak a
    token, and the response carries *which fields are set*, never their values. There is no "reveal"
    endpoint, because a reveal endpoint is a plaintext endpoint with extra steps.
  - **Encryption is authenticated**, so a tampered ciphertext fails rather than yielding attacker-chosen
    garbage that then gets sent somewhere as a credential. A wrong-size base64 key is **rejected with the
    fix** rather than silently padded — a padded key is a key nobody can explain, and it would work right
    up until it didn't. A missing key refuses to store anything at all, since a silent downgrade is how a
    "we encrypt tokens" claim stops being true.
  - **A connection-test contract** each provider implements, returning its identity and the targets a
    person can map to. The failure modes are the point: Slack answers HTTP 200 with `{ok:false}` (so a
    status code alone reports success for a rejected token), and its codes are not self-explanatory —
    so `not_in_channel` becomes "invite the bot", `missing_scope` names the scope to add. Errors are
    separated from `<b>hints</b>` because the provider's words and the fix are different things.
  - **Delivery with bounded retries** (3 attempts, 1s then 4s), a timeout, and **a delivery log** — every
    attempt, success or failure, so "it did not arrive" has an answer that is not guesswork. Dispatch is
    fire-and-forget, because a Slack outage must not make creating a comment slow, and it never throws.
    A *credential* rejection marks the integration broken and stops retrying it; a transient 500 does not.
  - `scrubSecrets` runs over anything provider-shaped before it is logged, including tokens we were handed
    directly — an API that echoes back the request it rejected is the most likely place for one to reappear.
- **Slack and Telegram** (milestone 0.16; #32). Four lifecycle events each — thread created, agent
  working, PR created, resolved — plus agent replies. Slack lists channels via `conversations.list`;
  Telegram cannot list chats at all, so its targets come from `getUpdates` and the UI says what to do
  about the empty first run instead of showing a blank table.
- **The Integrations page** in the dashboard: a card per provider with Connect / Test / Disconnect, the
  credential fields with their hints, and a repo → destination mapping table. An unencrypted-key server is
  reported once at the top rather than on every card.

### Fixed

- **The dashboard could not load in a browser at all.** Its tsup config did not bundle workspace deps, so
  the emitted file kept a **bare `@loupekit/shared` import** and the page died with "Failed to resolve
  module specifier". It only ever worked for whoever's `dist` happened to be current — `dist` is
  gitignored, so every fresh clone hit this. Now bundled, like the SDK has always been.
- Two CSS blocks and a `@loupekit` import check that had silently not applied, because the check tested
  the string being built rather than the file on disk.

## [0.10.27] — 2026-10-02

### Added

- **Companion panel** (milestone 0.15; #28). A Chat page in the panel: a gather tray, a composer with
  dictation, and the transcript of what was said and answered.
  - **The gather tray** collects several elements and screenshots into **one** message, because a visual
    brief is usually about several things at once — "these three cards, not the header" — and one click
    at a time forces a person to write what they could have shown. Order is part of the message, so the
    chips reorder; unchecking keeps an item without sending it; re-adding the same element *replaces*
    rather than duplicates, since clicking add twice is a person confirming. A tray-only send works: a
    blank body is not an empty message when three things are attached.
  - **Dictation** via the Web Speech API, with the panel's existing recogniser rather than a second one —
    two running at once would fight over the microphone and each would transcribe the other's session.
    The red recording pill shows elapsed `m:ss`. The two reasons the control can be unavailable get
    **different wording**: an unsupported browser is a fact, while a non-secure page is something the
    person can fix, and telling them their browser cannot do it when the real problem is `http://` sends
    them looking in the wrong place.
  - A **unread badge on the Chat tab** and a desktop notification, both only when the person is not
    already looking at the chat — a badge you are staring at is noise.
- **Activity dashboard** (milestone 0.15; #30). `GET /monitor` on the bridge serves a self-contained page:
  live timeline, sessions, tool-usage bars, files touched, and a failure count. No build step and no
  dependencies, because it has to work mid-task when nothing else is running — which is exactly when a
  broken asset pipeline would be discovered. Read-only by design, so a stray click cannot affect the work
  being watched. The headline numbers come from the **same aggregation the tools use**, so the page
  cannot disagree with what an agent would be told.
- **Desktop notifications**, best-effort per platform: `notify-send` on Linux, `osascript` on macOS, and
  Windows reported as unsupported rather than pretended — a toast needs a module or a signed app id that
  a background process does not have. **No shell**: the title and body are arbitrary text from a person,
  so arguments are passed as an array with `shell: false`, and the body is escaped for AppleScript, which
  has no argv. Only companion messages notify — one popup per tool call would be unusable, and a
  notification people turn off is worse than none.
- **Tools**: `get_recent_events`, `get_files_touched`, `get_dashboard_url`.

### Fixed

- **Every SSE stream was silently dead.** The bridge names its events (`event: <type>`), so a client
  listening on `onmessage` — which only receives *unnamed* events — got nothing at all. That meant
  **v0.10.25's live thread refresh never worked**, and **v0.10.26's companion reply push never worked**
  either: replies arrived only through the 5-second poll, which is precisely what hid it. The dashboard
  made it visible because it has no poll for the timeline.
  - Fixed in all three clients (thread stream, companion stream, dashboard) by listening by name. The test
    fakes now behave like a real `EventSource` — named events through `addEventListener`, `onmessage` only
    for unnamed ones — because a fake exposing only `onmessage` is what let this pass while the transport
    was dead. The wire format itself is now pinned in the bridge's tests.
- **The Chat view had no padding**, so the composer and its Send button sat flush against the panel's
  rounded edge and read as clipped. Same inset as the Activity view now.

## [0.10.26] — 2026-10-02

### Added

- **Companion chat** (milestone 0.15; #27). The panel can send a message to the agent *while it is
  working*, and the agent cannot miss it: any pending message is prepended to the **next tool result**.
  - **Queue with an explicit delivery guarantee.** `take()` marks messages in flight; only `ack()`
    removes them, and `requeue()` puts them back. That is what makes "never lost *and* never delivered
    twice" possible — the two pull in opposite directions, and a plain drain satisfies only the second.
    The wrapper takes the queue **only after the handler has returned**, so a tool that throws does not
    consume a message it never delivered. Asserted end to end against the real MCP server over stdio,
    including that the one after next does *not* carry it again.
  - **The nudge is unmissable and short**, because it is the first thing the agent reads on the way into
    a result it was expecting: who said it, what they said, what it refers to, and how to answer. The
    original result is kept beneath it, never replaced.
  - Multi-context payloads (several elements plus screenshots, and a voice flag), and a reply path back
    to the panel over SSE with a `?since=` polling fallback for a client that cannot hold a stream open.
  - Tools: `get_companion_messages` (with `drain: false` to read without consuming) and
    `reply_to_companion`.
- **Agent instrumentation** (milestone 0.15; #29). Claude Code hooks report tool use, prompts, sessions
  and notifications to the bridge.
  - **An idempotent, reversible installer.** Read-modify-write against `~/.claude/settings.json`: every
    key Loupe does not own is preserved, someone else's hook entries are never rewritten, ours is
    *appended* so a hook that must run first still does, a backup is taken before the first change, the
    write is atomic, and a file that cannot be parsed is **refused rather than overwritten**. A moved
    checkout is repaired in place rather than duplicated. Every failure is returned, never thrown.
  - **Opt-in, not on startup.** An MCP server that silently edits your agent's settings the first time
    you run it is the kind of thing that gets a package uninstalled, whatever its README says. The
    `install_agent_hooks` tool does it when asked, and the comment says so plainly.
  - **A hook script that cannot get in the way**: 1.2 s timeout, never throws, always exits 0, and —
    because Claude Code interprets hook stdout — writes nothing to stdout at all. Verified live with
    malformed stdin, no stdin, and no bridge present; all three exit 0 in silence.
  - **The bridge publishes its own port.** It binds an ephemeral port, but the hook runs as a separate
    process with no way to be told which; a small state file in `~/.loupe/` is the hand-off. Removed on
    close, and only if the file is still ours — a second bridge may have overwritten it meanwhile.
  - **A bounded event store** (1000, newest-last) with debounced atomic persistence and reload. The cap
    is the feature: hooks fire on every tool call, and an unbounded store is a memory leak. Tool
    payloads are recursively shrunk — a long string, a long array and a deep object are the same problem.
    A corrupt file is dropped rather than fatal.
  - **Sessions are folded from the events, not maintained alongside them.** A parallel structure has to
    be updated on every event and reconciled on every restart, and it fails by drifting; folding 1000
    events is microseconds and cannot disagree with the events it came from.
  - Tools: `get_activity_summary`, `install_agent_hooks`. Endpoints: `POST /events/ingest`,
    `GET /events/recent`, `GET /sessions`, `POST /companion`, `GET /companion`, `POST /companion/reply`.

### Notes

- The 12 existing tools now register through one `registerTool` chokepoint, so the companion wrapper is
  applied in a single place rather than remembered at each call site.
- The hook script ships in the package (`files: ["dist", "hooks"]`), and its path is resolved for both
  layouts — run from source it is `./hooks`, and in the published package the entry is bundled into
  `dist/` so it is `../hooks`. Resolving it wrongly would install a command pointing at a file that does
  not exist, which fails silently: the hook simply never runs.

## [0.10.25] — 2026-10-02

### Added

- **Per-message attachments** (milestone 0.13; #19). A reply can carry images and video of its own, not
  just the comment. The reply box gets an attach control with a removable chip per file, and uploads go
  through the **same blob seam** as the comment form — sent before the optimistic row renders, so the row
  shows the real URLs and never has to be patched once the blobs land. A reply with only an attachment is
  still a reply; one with neither is not sent. Attachments render inline (images and `<video>`) under the
  message that carries them.
- **Soft delete** (milestone 0.13; #19). Retracting a reply sets `deleted_at`; the row survives, so a
  thread's history stays auditable and an agent reading it later can tell "removed" from "never existed".
  `listMessages` excludes them by default and `?includeDeleted=1` returns them; `threadConversation`
  filters for display while `includeDeleted` opts in. Retracting twice is a **no-op returning 404**, not
  an error — a retry after a flaky network is safe, and the test asserts a second delete does not claim
  success.
- **Thread-update events** (milestone 0.13; #19). A new reply and a retraction both publish
  `message_added` / `message_deleted`. The SSE channel lives in the MCP process and the data lives in the
  API, so the API relays through the bridge's `POST /thread-updates` ingest — **env-gated on
  `LOUPE_BRIDGE_URL`** and best-effort (a 1 s timeout, never thrown), because a reply must not fail
  because a browser-facing relay is unreachable, and an API shared by many developers has no single
  bridge to talk to. With it unset this is a no-op, which is the honest default.
  - The panel follows that channel while it is open and refetches a thread only when it is one whose
    messages are already loaded — pulling a conversation nobody has open would be work for nothing. The
    stream is closed on `destroy()`.

### Fixed

- **Reactions never loaded from the server.** The HTTP adapter requested
  `/v1/comments/:id/messages/all/reactions` — a literal `all` in place of a message id, on an endpoint
  that did not exist — so it 404'd, was treated as "no reactions", and **every reaction pill would have
  been missing against a real backend**. There is now a thread-level `GET /v1/comments/:id/reactions`
  (which is what the store function already returned) and the adapter uses it. The offline adapter
  passed throughout, and the SDK tests stubbed `fetch`, so only a real browser against a real server
  could show it.
- **A 4 s timeout in the local-AI probe was aborted after the request settled**, leaving a stray
  `AbortError` on the console. Cleared in `finally` now, and the SDK tests that configure a bridge stub
  `fetch` for presence rather than letting a real request be aborted at teardown.

## [0.10.24] — 2026-10-02

### Added

- **Reactions** (milestone 0.13; #22). Emoji on a reply, with counts and per-user state.
  - **The primary key is the toggle invariant.** `reactions(thread_id, message_id, emoji, user_id)` means
    reacting twice *cannot* create two rows, so a count can never drift from what was stored — the
    uniqueness rule is the database's, not the client's.
  - The toggle is a pure function in `@loupekit/shared` (`toggleReaction`) that the server, the offline
    adapter and the panel all use, so all three agree. **Idempotent in both directions**, because a
    flaky network resends: applying the same toggle twice adds one and then removes it, never two.
  - Pills under each message with a count, highlighted when one of them is you, and a tooltip naming who
    reacted. The picker is a popup, not a permanent row of six emoji — a permanent picker under every
    message is noise for something most people do occasionally. Optimistic, then replaced by the
    server's own set; a failed request puts it back rather than showing a reaction that did not save.
  - Boundaries: an empty emoji and anything longer than a few code points are refused (400), and a
    reaction on a message that does not exist is a 404.
- **Multiplayer presence** (milestone 0.13; #22). Who else has this page open.
  - The rules are pure and in `@loupekit/shared` (`joinPresence`, `sweepPresence`, `throttleDelay`,
    `initialsOf`), used by both the bridge and the panel. A peer is identified by **page + user**, so a
    reload or a second tab is the same person rather than two.
  - **Liveness is a heartbeat, not a flag** — a closed tab or a crashed browser sends no goodbye, so
    silence past a 20 s TTL means gone. Without it the peer list fills with ghosts and stops being
    believed. A peer *vanishing* is broadcast too, not just one arriving.
  - On the bridge: `POST /presence`, `GET /presence?url=`, `POST /presence/:id/heartbeat`,
    `DELETE /presence/:id`, and a `peers` count in `/health`. A 404 from a heartbeat means the bridge
    forgot you, so the panel re-joins rather than beating forever against an unknown id.
  - In the panel: a small avatar cluster in the header, capped at four plus a count. **Hidden entirely
    when no bridge is configured**, because "nobody is here" is a different claim from "we cannot know
    who is here".
  - Cursor broadcasting is throttled (`throttleDelay`, 80 ms, first move never delayed) but collaborative
    cursors are not rendered yet.

### Fixed

- **`auth.projectKey` was `undefined` on every route that took its project from the authenticated
  request** — a 500 on write and a silent empty list on read. `Auth` carries the project *row*, so the
  field is `auth.project.project_key`. This shipped in **v0.10.20** and broke: registering and reading
  back a working branch, listing and deleting repo URL patterns, and the preview lookup — plus the new
  notification and people routes, which would have made the in-app mentions block permanently empty.
  - It was invisible because **the server has no `tsconfig` and is never typechecked**, and because the
    existing tests called the store functions directly and never crossed the HTTP boundary. Route-level
    tests now cover every one of these endpoints, and a **source scan** fails with the exact file and
    line if `auth.projectKey` reappears (verified by reintroducing it).
- **Deleting a repo URL never matched.** The route passed the URL *pattern* to a store function that
  matches on `id`, so it deleted nothing and reported `ok: false` for a successful-looking call.
- **Mentions were parsed but never wired to the message endpoint** — `resolveMentions` and the
  notification fan-out were written and tested, but the edit that connected them to `POST
  /v1/comments/:id/messages` had failed silently, so `mentions`/`unknownMentions` never came back over
  HTTP. Caught by driving the real endpoint rather than by the unit tests, which passed throughout.

## [0.10.23] — 2026-10-02

### Added

- **Mentions** (milestone 0.13; #21). `@name` in a reply is parsed, resolved and acted on.
  - **`parseMentions` / `resolveMentions` in `@loupekit/shared`** — conservative on purpose, because
    the failure that matters is a *silent* one. An email address is not a mention (`sara@acme.test`
    is preceded by a word character, which no mention ever is); a name inside a code span or a fenced
    block is not one either; trailing punctuation is not part of the handle, so `@sara,` mentions
    `sara` while `@jane.doe` keeps its dot. The same person mentioned twice is one mention.
  - **Unresolved handles are returned, not dropped.** `resolveMentions` reports them and the message
    endpoint returns `unknownMentions`, so the client can say "no such person" rather than leaving a
    mention that quietly did nothing — which is the acceptance criterion.
  - **Highlighting uses segments** rather than re-scanning the body, so the highlight lands on the
    right occurrence and the rendered text is provably identical to the original.
  - **Autocomplete** while a handle is being typed, matching on name, squashed name, email local part
    or id, capped at six. The list is replaced in place, so the caret never moves.
- **In-app notifications.** A `notifications` table with `GET /v1/notifications`,
  `POST /v1/notifications/read` and an unread count. A mention creates one per person (never for the
  author of the reply), and the panel shows a **"N mentions waiting"** block in Home — rendered only
  when there are unread ones, since a permanent "0 unread" is noise — with a click through to the
  thread and a *Mark as read* action.
- **"Needs you", centralised.** `needsYou()` in `@loupekit/shared` is the one predicate, so the panel
  and the dashboard cannot disagree about it. It flags a thread **in review**, an **agent's unanswered
  question**, and a **failed agent run** — and, as importantly, it does *not* flag a thread an agent is
  still working on, because counting those would train people to ignore the filter. A failure outranks
  a question, and both outrank a routine review. Ten truth-table rows are asserted.
  - The predicate has two levels: the board filter uses the stage (all it can see), and the thread
    detail — where the messages are loaded — additionally catches an agent's question and a failed run.
- **`GET /v1/people`** — who can be mentioned, derived from who has actually taken part rather than a
  members table. There is no membership model yet (that is 0.17); inventing one here would be either a
  stub or a lie.

### Fixed

- **The same person could appear twice in the mention list**, which would have notified them twice. A
  comment carries the author's email and a reply may not, so `UNION` kept both rows. It uses
  `DISTINCT ON (id)` preferring the row with an email.

## [0.10.22] — 2026-10-02

### Added

- **The conversation is now in the panel** (milestone 0.13; #20). Expanding a thread shows its replies,
  a reply box, the activity timeline and the copy actions.
  - **Message list** — avatar, name, relative time, body. An agent's reply carries a left accent bar, a
    tinted container and an `agent` tag, so who you are talking to is obvious at a glance.
  - **Reply composer** — optimistic: the row appears immediately, and if the store rejects it the text
    **stays on screen** flagged with a **Retry**. Losing what someone typed is worse than showing a
    failed row. Typing never re-renders (the draft lives outside the render path), so the caret does not
    jump; Enter sends, Shift+Enter is a newline; `@ to mention` is hinted under the box.
  - **Activity timeline** — captured → replied → change ready → PR opened → preview live → waiting on a
    human → resolved. Built from what the thread already carries rather than a separate event log, so it
    cannot drift: if it says a PR was opened, there is a `pr` on the comment saying so. Steps that were
    skipped do not appear, and a preview row only exists when a URL is actually known.
  - **Copy thread text** — a readable summary that leads with the element selector, because pasted
    somewhere without Loupe the selector is the only part that still identifies what is being discussed.
    **Copy images** is best-effort and says so rather than failing silently.
  - Replies load **lazily** — opening one card fetches one thread, not twenty.
- **`threadTimeline()` and `threadAsText()` in `@loupekit/shared`** — pure, so the panel and the
  dashboard render the same story from the same function.
- **Thread messages through the storage seam** — `StorageAdapter` gains `listMessages`/`addMessage`,
  implemented for both the HTTP adapter and offline `localStorage`.
- **Participants** (`thread_participants`) — recorded on message write, so a notification can target
  them without walking the conversation, with the thread's own author folded in on read: a reporter who
  has never replied is still a participant, and dropping them from a notification list would be a silent
  bug. Exposed at `GET /v1/comments/:id/participants`.

### Fixed

- The offline adapter's comment-key scan also matched `loupe:msgs:*`, so update/remove would have hunted
  a comment id among a thread's replies.

## [0.10.21] — 2026-10-02

### Added

- **One pull request per repo, not one per fix** (`packages/mcp/src/tools/create-pr.ts`). A repo keeps a
  single working branch; each fix is a commit on it and the PR body keeps a table of every fix with its
  commit. When that PR is merged or closed, the next fix starts a fresh branch. (Milestone 0.12; #16.)
  - The table is edited by inserting **before a fixed sentinel** rather than regexing existing rows, so a
    formatting change cannot lose or reorder them. If the sentinel is missing — someone edited the body
    by hand — the row is appended *and* the anchor restored, rather than dropped.
  - A description containing a pipe is escaped, because one unescaped `|` silently adds a column.
  - `create_pr_for_thread` reports whether it **created**, **appended** or **restarted**, so the caller
    never has to assume.
  - A revision never joins the accumulating branch: it gets its own `revision-*` branch, because adding
    to a PR a reviewer already approved is the one thing that must not happen.
- **Thread handoff tools** (milestone 0.12; #18): `mark_thread_addressed`, `add_thread_message` and
  `get_thread_conversation`.
  - **`mark_thread_addressed` has no status parameter.** "In Review" is not a default, it is the only
    thing the function can do — a tool that *could* resolve would eventually resolve, and then "only a
    human closes a thread" is a convention rather than a property. `AGENT_ALLOWED_STATUSES` has no
    `resolved` in it, and a test asserts both.
  - `add_thread_message` replies without touching the status at all, for progress notes and preview URLs.
- **Thread messages** (`packages/shared/src/thread.ts`, the `thread_messages` table, and
  `GET`/`POST /v1/comments/:id/messages`) — a thread is a conversation now, with authors typed
  `user | agent | guest`. The comment's own `body` is presented as **message #1** by
  `firstMessageFromComment` rather than copied into the table: no backfill to run, and no window where a
  thread renders with nothing in it.
- **Revision linkage** — `parentThreadId`, `iterationType` and `iterationNumber` on a comment, with the
  panel showing an **Iteration N** chip that names the thread it revises. A parent link with no revision
  type gets no chip, because labelling a mistake is worse than staying quiet.

### Fixed

- **Committed to the branch of a merged PR.** Setting `outcome = "restarted"` after detecting a stale PR
  did not flip `startFresh`, so the fix fell through to the append path and landed on a dead branch. The
  test that caught it asserts a *new* PR was opened, not just that the outcome string changed.
- **`GitHubError` used a constructor parameter property**, which Node's strip-only TypeScript mode
  rejects — the second time this pattern has broken the MCP server's startup. There is now a test that
  **scans every shipped source file** for parameter properties, enums and namespaces and fails with the
  offending lines, so it cannot happen a third time.

## [0.10.20] — 2026-10-02

### Added

- **A GitHub client** (`packages/mcp/src/github/github-client.ts`) — Loupe could store a proposal but
  not act on it. It now commits and opens pull requests. (Milestone 0.12; #15.)
  - **One atomic commit for a multi-file fix**, via the Git Data API (blob → tree → commit → ref)
    rather than the contents API, which writes one file per commit. A three-file fix is one commit,
    which is a better review and a clean revert.
  - `createPullRequest`, `getPullRequest`, `get/updatePullRequestBody`, `isPullRequestOpen`,
    `findOpenPullRequest`, `branchExists`, `branchHead`, `createBranchFromBase`, `commitChanges`.
  - **Token resolution**: `GITHUB_TOKEN` (or `GH_TOKEN`), else `gh auth token`, else a message saying
    exactly what to do — and noting that everything else still works without one.
  - **Placeholder detection.** A config copied from a README contains `<your token>`; treating that as
    real produces a 401 at the moment an agent opens a PR, far from the cause. Seventeen shapes are
    recognised, including the too-short-to-be-real case.
  - **The token never leaves the Authorization header**, and errors are redacted before they are
    returned — asserted.
- **Working branches and preview URLs** (milestone 0.12; #17).
  - `working_branches` — which branch accumulates a repo's fixes, its PR, its head sha, its preview URL
    and a **running fix count** that increments rather than overwrites. A plain update keeps the fields
    it was not told about, so moving the head cannot wipe the PR link.
  - `repo_urls` — per-repo URL patterns, one per environment, so a deployment can be *recognised*
    rather than guessed.
  - **`resolvePreview()`** answers "is there a preview yet?" by trying, in order: a URL already reported
    on the branch, then each registered pattern (preview-shaped environments first), then GitHub Pages'
    own `pr-preview/pr-N` convention — probing each so "ready" means a URL that responded. Otherwise
    **"not ready"**, listing what it tried. A URL is never guessed.
  - **URL pattern matching** in `@loupekit/shared` — `*` within a segment, `**` across them, and
    `https://host/**` also matching the bare host. Regex metacharacters in a pattern are escaped, so a
    hostname's dots are literal and `acmeXtest` does not match `acme.test`.
  - **Template expansion** returns `null` rather than a half-substituted URL: a preview is never
    `https://undefined.github.io/...`.
  - Server routes for both tables plus `GET /v1/preview`, all scoped by the project's own auth.
- **A preview link in the panel** — a card shows **Preview** only once a URL is known. There is no
  optimistic "deploying…" state, because there is nothing truthful to put in it.

### Fixed

- **A test of mine was corrupting a global.** The navigation-consent test replaced the entire
  `window.location` object with `{ ...window.location, assign }` — but spreading a `Location` does not
  copy the getters that live on its prototype, so `pathname` and `search` became `undefined` for
  **every test after it**. It now stubs only `assign`, and restores it. This is what made a later test
  fail in a full-file run and pass in isolation.
- `deleteWorkingBranch` / `removeRepoUrl` used `rowCount`, which the embedded driver does not populate —
  a successful delete looked like a miss. They use `RETURNING` now, like `removeComment` does.
- `upsertWorkingBranch` passed a nullable status into a `NOT NULL` column; the insert now defaults it
  while the conflict clause still reads the raw value, so a plain update cannot reset a merged branch
  to "open".

## [0.10.19] — 2026-10-02

### Added

- **The workspace source mapper** (`packages/mcp/src/mapper.ts`) — the single highest-value parity gap.
  Loupe used to hand an agent raw HTML, so it had to re-find the file that rendered it every single
  time. `mapElementToSource()` walks the workspace and returns ranked `file:line` candidates instead.
  (Milestone 0.11; #13.)
  - **Signal weights in one table**, so the model is tunable and readable: id 0.85, aria-label 0.8,
    text 0.7, class 0.5. Boosts for a PascalCase component basename, a view file, a path under `src/`,
    several signals agreeing on one file, and repeated matches.
  - **Utility classes are filtered before searching.** `flex`, `mt-4`, `bg-blue-500`, `hover:x` and
    `md:y` appear in a stylesheet, never in the JSX that renders the button — searching for them
    produces noise, not answers.
  - **Build output is skipped**, by directory (`node_modules`, `dist`, `build`, `.next`, `vendor`,
    caches…) *and* by shape: a file with a line over 1500 characters is generated, wherever it lives.
    That second rule matters — the extension's own `content.js` sits in a package root and ranked first
    for every signal until it existed.
  - Breadth-first walk with a file cap (default 4000), a per-file size cap, a total scan budget, a
    short-lived file-list cache, and bounded read concurrency.
  - An empty result is an answer, not an error: no match, a missing root and a blank workspace all
    resolve to `[]`.
- **Four element-context MCP tools** (milestone 0.11; #14): `get_latest_selection`,
  `get_selection_history`, `get_element_context` and `find_source_for_selection`.
  - Each takes **either a live selection** (bridged from the browser) **or a `thread_id`**, and
    `threadContextToPayload()` normalises a stored comment into the identical shape — so an agent never
    has to care which it got.
  - `get_element_context` returns the element, the page, its key computed styles, the ranked source
    candidates and a **ready-made edit prompt**.
  - **`generateEditPrompt()`** pins the work: smallest diff that satisfies the request, follow the
    file's own conventions, keep the element's behaviour and accessibility, don't touch unrelated files.
    It also tells the agent to **say why it chose a file**, so a wrong guess is visible rather than
    silently plausible, and — for a thread — spells out propose → In Review, with the reminder that
    **only a person resolves**.
  - With nothing selected yet they explain what to do rather than erroring.

### Changed

- The MCP tool registration test is now a snapshot of all eight tools plus an assertion that every
  tool carries a description long enough to choose on, so a tool cannot be added without one.

## [0.10.18] — 2026-10-02

### Fixed

- **A package upgrade can no longer break a host app's writes.** `POST /comments` returned **500**
  on an app whose database had not run the migration that adds a column the controller writes —
  reproduced against the package itself: with `pr` absent, every create raised a
  `QueryException` and **zero rows were written**. The write path now keeps only the attributes the
  table actually has, so a pending migration degrades (the newest fields stay empty) instead of
  taking feedback down, and logs one clear warning naming the migration to run.

  If your app was upgraded to 0.10.15+ without migrating, run `php artisan migrate` — that is the
  real fix, and this release means the window before you do is no longer an outage.

  The column list is deliberately **not** cached: under Octane or a queue worker the process
  outlives a migration, so a worker started before `php artisan migrate` would keep writing the old
  shape until restarted. Caught by a test that checks the write path still carries `pr` after a
  migration in the same process.

## [0.10.17] — 2026-10-02

### Added

- **A local bridge in the MCP server** (`packages/mcp/src/bridge/`). A browser tab and an agent process
  have no way to see each other; this is the seam that fixes it. `startHttpBridge()` binds **127.0.0.1
  only** — this is a hand-off between two programs on one machine, and putting it on a LAN interface
  would turn "the page you are looking at" into something anyone on the network could read or forge.
  (Milestone 0.11; #11.)
  - **A selection store** — a bounded ring (default 50) of element payloads with `latest()`,
    `history()` and `correlationId` lookup. Bounded deliberately: an agent that has not looked in fifty
    selections is not going to want the first one.
  - **Strict ingest validation.** A half-formed selection is worse than a rejected one — the agent
    would act on a payload silently missing the selector it needs — so required fields are required,
    optional fields are still type-checked, and unknown keys are dropped rather than passed through as
    "element context".
  - **Routes**: `POST /selection`, `GET /selection/latest`, `GET /selection/history`, `GET /selection`,
    `DELETE /selection`, `GET /health`, the agent routes below, and the SSE streams.
  - **CORS limited to `chrome-extension://` and loopback origins** — a random site cannot read what you
    have selected.
  - **A busy port is not fatal.** `EADDRINUSE` is retried five times, 1.5s apart, then logged and the
    server continues with `bridge=disabled`; the MCP tools work without it, they just cannot see the
    browser.
  - Request bodies are capped, and `SIGINT`/`SIGTERM` close the listener cleanly.
- **An agent registry with heartbeat and an SSE channel.** Agents register with `(name, type,
  workspace)`, heartbeat, and are evicted after 30s of silence (swept every 10s). Ids are **derived
  from the identity** rather than random, so an agent that restarts lands on the same row instead of
  leaving a ghost in the picker until its TTL expires. (Milestone 0.11; #12.)
  - **SSE** on `/events`, with `/thread-updates` as the thread-only view. A 15s keep-alive comment keeps
    proxies and browsers from dropping an idle stream; disconnects remove the subscriber.
  - **`emitThreadUpdate` is wired into the tools** — `update_status` publishes `status_changed` /
    `thread_resolved` and `propose_change` publishes `preview_live`, so an open panel can update in
    place. Publishing is best-effort and never throws into a tool call: a dead browser tab is not a
    reason for `update_status` to fail.
  - The MCP process **registers itself on startup** and unregisters on exit, so the picker is accurate
    without any extra configuration.

### Fixed

- **The MCP server could not start from source at all.** `SelectionStore` and `AgentRegistry` used
  constructor parameter properties (`constructor(private readonly capacity = 50)`), which Node's
  strip-only TypeScript mode rejects — `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. Caught by the existing
  MCP test suite, which spawns the server as a child process; without it this would have shipped as a
  server that dies on launch for anyone running from a checkout.

## [0.10.16] — 2026-10-02

### Added

- **Generate a change from a thread, and iterate on it.** With `init({ generate })`, a thread's detail
  gains a Generate pane: a **sandboxed preview plane** for the result, an **opacity slider** to compare
  it against the original capture, **undo**, **prev/next** through every iteration, and an iterate
  input with a refine / revise selector. The panel owns the preview, the comparison and the history;
  producing the markup is the host's job, so any model works. (Milestone 0.20; #62.)
- **`iteration.ts` in `@loupekit/shared`** — the pure history model behind that pane: preview-per-push,
  step without discarding, undo *does* discard, branching from a point in the middle drops the
  abandoned tail rather than silently mixing two lineages, and the stack is capped at 20.
- **Local-AI configuration** — endpoint URL and model name in the project manager, with a **real
  connection check** against an OpenAI-compatible `/v1/models` (what Ollama, llama.cpp and the rest
  expose). It reports reachable-but-erroring, times out rather than hanging, tells you when the named
  model is not among those served, and explains the CORS failure you will actually hit. (Milestone
  0.20; #62.)
- **An access gate.** Without a generator, the pane offers *Request access to generate* and hands the
  request to `init({ onRequestAccess })` — the seam the Team tab will land on when 0.17/0.18 exist.
  With no handler at all it says so rather than doing nothing. (Milestone 0.20; #62.)
- **Consent-gated agent navigation.** `requestNavigation(url, { reason, requester })` asks the user;
  the panel shows who wants to go where and why, and **only an explicit grant navigates** —
  `decide()` returns a URL on nothing else, and the panel navigates from that return value rather
  than from the request. Every decision is kept as an audit trail. `javascript:`, `data:` and `file:`
  requests are refused outright, and a second request replaces the first rather than stacking prompts.
  (Milestone 0.20; #64.)
- **Dictation in the composer** — a mic button backed by `SpeechRecognition`, with a visible
  recording state. Where the browser has no such API the button is disabled and says so, instead of
  offering something that cannot work. (Milestone 0.20; #64.)
- **Context menus in the extension** — comment on the page, a selection, an image, a video, an audio
  element, a link or an editable field, plus **show / hide Loupe on this site**, persisted per origin.
  A menu that lands on an already-open widget aims it at the right tool via a new `openTool()`;
  otherwise it injects the content script with the intent, which is why `init()` gained `tool`.
  (Milestone 0.20; #64.)

### Fixed

- **The preview plane collapsed to two pixels on any thread without a screenshot.** The generated
  markup lives in an absolutely-positioned iframe, which contributes no height — so with no captured
  image under it the plane had nothing in flow. It has a minimum height now.
- **A generated change rendered as a dark box.** Generated markup is usually a *fragment*, so on a
  transparent body it read as an empty panel. The plane gives it a white surface, like any other
  design preview.
- The iterate input's placeholder no longer truncates.

### Not in this release

- **Notifications** from #64 ("Claude finished your fix"). Those need something to notify *about* —
  the bridge daemon (#11) — and a service worker with no events to report would be decoration.

## [0.10.15] — 2026-10-02

### Added

- **A thread's change now has a lifecycle.** `Comment.pr` records the pull request carrying a fix
  (`number`, `url`, `state`, `checksPassed`, `checksTotal`), and `lifecycle()` in `@loupekit/shared`
  turns that plus the thread's stage into one chip: **Sent to agent → In PR → Review preview →
  Reviewed**. Precedence is deliberate — a PR outranks the board column, because "In PR" is more
  specific than the column it happens to sit in. A thread with nothing attached wears no badge at
  all. (Milestone 0.20; #71.)
- **PR chips and a checks meter on every card.** The number is a monospace chip that links out to the
  PR; the checks render as a numerator over a thin bar, and the bar reflects the fraction, not just
  the count. (Milestone 0.20; #71.)
- **A review banner.** Threads in In Review lead their detail with a banner — *Waiting on your
  review* — carrying **Approve** and **Add comment**. Approving resolves the thread and is recorded in
  the Activity feed, like every other operation. That asymmetry is the rule the flow rests on: an
  agent moves work to In Review, only a human closes it. (Milestone 0.20; #61, #71.)
- **An origin compare.** When Claude has proposed a change, *Show original* puts the original request
  (its text and the element's captured HTML) beside the proposal (its notes, HTML and CSS), in two
  columns that collapse to one in a narrow panel. (Milestone 0.20; #61, #71.)
- **A review strip** above the list — *2 waiting on your review* with a **Review** button that
  narrows the list to them and back again. (Milestone 0.20; #61, #71.)
- **`pr` is stored end to end** — a new `pr` column on the server (additive, `ALTER TABLE … IF NOT
  EXISTS`) and in the Laravel package (additive migration), accepted on create and on PATCH,
  returned in the canonical comment shape. A non-object `pr` is dropped rather than stored, so the
  panel never renders a chip from something that is not a pull request.

### Fixed

- **The card's header row could overflow.** It now carries the number, a badge, a lifecycle chip, a
  PR chip, a checks meter and the caret — more than fits on one line in a 360px panel, so the last
  chip and the caret were spilling past the card edge. The row wraps now, and the "element
  moved/removed" badge became **moved** with the full wording on hover — at 158px it was eating a
  third of the row on its own.
- **A resolved thread no longer wears two green pills.** The "resolved" badge already says it, so the
  lifecycle chip is suppressed for that stage; its PR chip and meter stay, since those are the part
  you cannot read off the badge.

## [0.10.14] — 2026-10-02

### Added

- **A reusable tab API — the panel is now extensible without forking it.** `init({ tabs: [...] })`
  registers your own sidebar pages. Each tab gets a `LoupeTabContext` (project key, apiBase, user,
  the page's comments, the page URL, the running version, plus `track` / `open` / `close`) and returns
  markup or an element, so a tab never reaches into the panel and the panel never reaches into a tab.
  A tab that throws is caught and shown as an error card instead of taking the panel down. (#59.)
- **The Connect Claude page is now an opt-in tab.** The panel no longer ships it: register it with
  `init({ tabs: [connectTab()] })`, which also brings back the FAB's Connect shortcut. It doubles as
  the worked example of the tab API. (Requested change.)
- **An in-panel Activity Monitor** — a status dot (idle / working / error), a collapsible session
  summary (status, events, duration, files touched, errors, per-tool counts), a micro-stat row, tool
  chips that filter the feed, and a live event feed. The feed pauses as you scroll back through it and
  resumes when you return to the end. With nothing connected it says *Monitor unavailable* and explains
  how to feed it, rather than erroring. (Milestone 0.20; #59.)
- **A public activity seam** — `trackActivity(event)`, `setActivityStatus(status)` and
  `clearActivity()`, exported from the package. An agent bridge or the host app pushes through them;
  Loupe's own operations (create, resolve, reopen, delete, link a repo) feed the same stream, so the
  view is useful before a bridge exists. `summarizeActivity` / `formatDuration` are shared, so any
  other consumer derives the same numbers. (#59.)
- **The running package version is visible in the UI** — in the Home footer (`Acme · v0.10.14`) and in
  the settings dropdown, which also shows whether the panel is in `server` or `offline` mode.
  (Requested change.)
- **A project manager** in the Home view — link the current page to a repository, searching a list the
  host supplies (`repos`: a string array, or a function the panel calls with the search text, so a host
  can back it with its own API). Overlapping searches are sequence-guarded, the list is re-rendered
  without rebuilding the input so typing keeps focus, and the choice persists per browser and is filed
  on new comments. (Milestone 0.20; #60.)
- **Environment URLs** — add, validate and remove the environments for a project. Only absolute
  `http(s)` URLs are accepted (a bare `staging.example.com` is a typo, not an environment), they are
  normalized so two spellings of one place cannot both be listed, and duplicates are refused with an
  inline message. (Milestone 0.20; #60.)
- **Scope chips carry counts** — *This page 3* / *All 14*, with the project total showing `⋯` until it
  has been read rather than a number we would be inventing. (Milestone 0.20; #60.)

### Changed

- The sidebar is `Home · Comments · Activity` by default, plus whatever the host registers. The
  guided tour is five steps now (it covers the Activity view and the settings menu).

### Fixed

- **A host tab could be swallowed by a startup ordering bug.** `render()` runs while the panel is
  still being built, so a tab that reported an event hit the Activity view before its own markup
  existed — and the exception silently replaced the whole tab with an error card. The monitor now
  keeps events reported before it was built and paints them when it is. Found by the tab test.
- **The project popover rendered off the bottom of the panel.** It was a sibling of the row it
  anchors to, so its `top: 100%` resolved against the panel instead of the row — it landed at y=866
  in an 860px-tall window. It is now a child of that row. Found by measuring the rect instead of
  eyeballing the screenshot.

## [0.10.13] — 2026-10-02

### Added

- **A minimize bar.** The header's new minimize button collapses the panel to a one-line strip that
  keeps its context on screen (`3 open on this page`) and restores on click. (Milestone 0.20; #56.)
- **A dock-position menu.** The four layout buttons became one button opening a 2×2 grid — left,
  bottom, right, float — which leaves the header room for the settings and minimize controls. The
  active layout is marked. (Milestone 0.20; #56.)
- **Accent colours.** Five presets (indigo, violet, teal, amber, rose) in Settings, applied as an
  inline `--accent` custom property so they beat the theme token blocks and follow dark/light.
  (Milestone 0.20; #56.)
- **A settings dropdown** — accents, the visibility switches, and *Restart tour*. (Milestone 0.20; #63.)
- **Visibility switches** for **hover hints**, **markers** and **page paths** — the last labels each row
  in the project scope with the page it came from. (Milestone 0.20; #63.)
- **A guided spotlight tour** — four steps over the stat tiles, the scope switch, the capture tools and
  Connect Claude. It runs once on first open, is skippable, and is replayable from Settings. The
  spotlight is a `box-shadow` cut-out and the overlay is click-through, so a tour can never trap
  someone mid-task. (Milestone 0.20; #63, #72.)
- **Contextual hint cards**, one per view, shown once each and dismissible — with a *Turn off hints*
  link that silences the whole help layer, persisted. (Milestone 0.20; #72.)

### Fixed

- **A malformed stored anchor no longer takes the panel down.** `resolveAnchor` reads `attrs`, `rect`
  and `viewport` off the anchor, but a row written by an older client (or by hand) can be missing
  them — `Object.keys(undefined)` threw, which aborted `start()` entirely: no pins, no list, no tour.
  The scorer now defaults those fields, and the pin positioner isolates a failing anchor to that one
  comment. Found by seeding the demo with a minimal anchor.

## [0.10.12] — 2026-10-02

### Added

- **The panel opens on a Home overview.** The widget's sidebar is now three pages — **Home · Comments ·
  Connect Claude** — and it leads with Home: four stat tiles (**Open**, **Needs you** (`in_review`),
  **Resolved**, **Stale** = open for over a week), each a button that narrows the list; a **scope
  switch** between this page and the whole project; a one-click **Pin feedback**; and the most recent
  feedback with author, age and stage. (Milestones 0.20; #57.)
- **The project scope is a timeline.** Switching to **All** lists the whole project's feedback, newest
  first and **grouped by day** (`Today`, `Yesterday`, …), with a repo filter that appears once there is
  more than one repo in play. (Milestones 0.20; #58.)
- **`StorageAdapter.listAll()`** — every comment in a project, across pages. Implemented for both the
  HTTP adapter (`GET /v1/comments` with no page filter) and offline `localStorage`.

### Fixed

- **Offline mode could not update or delete a comment once the panel had saved its state.**
  `LocalStorageAdapter.update()/remove()` treated every `loupe:` key as a comment list, but
  `loupe:dock` holds the panel state as an object — so `JSON.parse` returned an object and
  `.findIndex` threw. The scan now skips the dock key and tolerates any non-array value. (Found by
  the new Home tab, which is the first thing to persist state before a comment is resolved.)

## [0.10.11] — 2026-10-02

### Added

- **The card leads with the captured pixels.** A card now opens with its screenshot (or a recording's
  poster frame) above the text, so a board reads visually instead of as a wall of titles. The
  screenshot is no longer repeated on expand — expanding now reveals the recording player and any
  attachments. (Milestone 0.14; #26.)
- **Copy for agent.** Every card has a one-click brief: stage, priority, change type, repo/branch,
  page, target selector, the element HTML and its computed styles — the same context the MCP
  `get_comment` tool returns, as pasteable Markdown. (The "Copy-for-Claude" affordance the docs
  described but the board never actually shipped.)
- **Compact density.** A header toggle trades the media strip and the card padding for scanability on
  a long board. The choice persists in `localStorage`.
- **A loading state.** The board says _Loading feedback…_ on first paint instead of showing an empty
  board while the first fetch is in flight.

### Changed

- **A card is a keyboard-reachable disclosure.** It is focusable, carries `role="button"` and
  `aria-expanded`, and expands on `Enter` / `Space`; clicking a card no longer collapses when you
  interact with its selects. Each card also shows its repo/branch as a chip when it has one.

## [0.10.10] — 2026-10-02

### Added

- **Branch-aware threads.** A comment now records the **`repo`** and **`branch`** it was filed against.
  The widget takes both from `init({ repo, branch })`, the API and dashboard store and filter them, and
  both MCP servers report them per item and accept them as filters — so an agent can be pointed at one
  repository or branch. (Milestone 0.14; #25.)
- **Filtering moves into SQL.** `GET /v1/comments` (and the matching Laravel route) now accept `repo`,
  `branch`, `status`, `priority`, `changeType`, `kind` and `q` — so a board with thousands of rows never
  ships them all to the client. A stage filter still matches the legacy `open` / `done` rows.
- **Saved views.** The board gains a Repo and a Branch filter plus a view switcher: **All feedback**,
  **Needs you (In Review)**, **Critical only** and **Not linked to a repo**. The choice is remembered in
  `localStorage` and reflected in the URL (`?view=…`), so a filtered board can be shared as a link.

## [0.10.9] — 2026-10-02

### Added

- **Priorities and change types on every comment.** A comment now carries a **priority**
  (critical → low, default medium) and a **change type** (frontend / backend / api / other, default
  other). The reporter picks both in the widget's composer; the board renders them as chips and lets
  you re-triage straight from the card. `COMMENT_PRIORITIES`, `PRIORITY_RANK`, `CHANGE_TYPES` and the
  `normalize*` helpers in `@loupekit/shared` are the single source of truth, mirrored in the Laravel
  package by `Loupekit\Loupe\Support\Triage`. (Milestone 0.14; #24.)
- **Filter and sort by both.** The board gains Priority and Type filters and a **Priority** sort
  (most urgent first, newest within a priority). Both MCP servers report priority and change type for
  every comment — `list_comments` prints them and accepts them as filters — so an agent can start
  with what actually matters.

### Changed

- **Existing rows need no backfill.** A comment written before this release has no triage columns;
  every read path defaults it to **Medium · Other** rather than leaving it blank, and an unrecognised
  value is coerced the same way instead of being stored raw.

## [0.10.8] — 2026-10-02

### Added

- **The board is five stages, not three.** A comment now moves through **Queue → To Do → In
  Progress → In Review → Resolved** rather than open / in_progress / done. The extra columns are
  what let a team tell "not triaged yet" apart from "waiting on me" and "waiting on a preview" —
  and they give the agent handoff somewhere to land: an agent may move a comment to **In Review**,
  but only a person resolves it. `COMMENT_STAGES`, `STAGE_LABELS` and `normalizeStatus()` in
  `@loupekit/shared` are the single source of truth, mirrored in the Laravel package by
  `Loupekit\Loupe\Support\Stages`. (Milestone 0.14; #23.)

### Changed

- **`Comment.status` is now one of the five stages.** Rows written before the board are migrated
  (`open` → `queue`, `done` → `resolved`; `in_progress` is unchanged) by the server's `migrate()`
  and by a new Laravel migration, and every read path normalizes as it reads — so a pre-board row
  still lands on a column even if the migration has not run yet.
- **The old names are still accepted everywhere.** The HTTP API, the SDK and both MCP servers
  (`list_comments` filtering, `update_status`) normalize `open` / `done` onto the board, so an
  older widget or an agent configured before the board keeps working. Anything unrecognised lands
  in **Queue** rather than falling off the board.
- **The dashboard board is five columns** with a swatch per stage, and the widget's comment list
  reads `resolved` where it used to say `done`.
- **`update_status` guidance changed for agents:** move a comment to **In Review** when a change is
  ready for a human, and never set **Resolved** yourself.

## [0.10.7] — 2026-10-02

### Changed

- **Laravel: the package supports PHP 8.2+ (was 8.4+).** The constraint was `^8.4`, with only
  8.4 in CI — which locked out most real apps for no reason. Laravel 11/12 need PHP ^8.2 (13
  needs ^8.3) and there is no 8.4-only syntax in the package, so the floor is now `^8.2`, and
  the CI matrix tests that claim: 8.2 · Laravel 11/12, 8.3 · 11/12/13, 8.4 · 11/12/13.

### Added

- **`loupe:install` now says when the app has nobody to sign in.** Laravel 11+ ships no auth
  scaffolding and Loupe only shows the widget to an authenticated user, so a fresh install
  looked broken with no explanation. The installer warns, and the README states the
  prerequisite up front.
- **A stranger test in CI** (`packages/laravel/bin/stranger-test.sh`): it creates a brand-new
  Laravel app, installs this working tree, wires it up the way the docs say, and asserts the
  widget renders for a signed-in user but not for a guest, `/loupe/dashboard` never 5xxs, the
  versioned SDK bundle downloads, and a comment posts and comes back in the list. It runs at
  both ends of the support matrix — and it is the check that would have caught the
  `Route [login] not defined` 500 that 0.10.5 fixed.

## [0.10.6] — 2026-10-02

### Added

- **The collapsed widget is now a quick-action cluster.** `@loupekit/sdk` replaces its single
  launcher button with a FAB cluster: a primary brand button carrying the live comment-count
  badge, plus four quick actions — **Pin comment**, **Note**, **Markers** and **Connect
  Claude** — each with a hover label, a chevron that flips on expand, and a staggered reveal
  that is switched off under `prefers-reduced-motion`. The cluster sits on the dock's edge and
  gets out of the way when the panel opens. (Milestone 0.20; #70.)

### Changed

- **Markers can be hidden without discarding them.** A new quick action hides every pin on the
  page and remembers the choice in `loupe:dock` next to the rest of the panel state, so a
  reporter can read the page without the pins in the way.
- **The primary FAB now expands the quick actions rather than opening the panel directly.**
  Opening the panel from the cluster is one of the quick actions (`Pin comment` or `Note`), or
  `Connect Claude` to land straight on the MCP setup page. The panel itself is unchanged.

## [0.10.5] — 2026-10-02

### Fixed

- **A fresh Laravel app no longer 500s on `/loupe/dashboard`.** Found by installing the
  package as a stranger would in a brand-new app: Laravel 11+ ships no auth scaffolding, so
  there is no `login` route — and the auth middleware's `AuthenticationException` is turned
  into a redirect to it, which threw `Route [login] not defined`. A browser guest now gets a
  **403 that says what to do**; apps with a login route are unchanged; JSON still gets 401.
  (The suite never caught it because the testbench app registers a `[login]` route.)

## [0.10.4] — 2026-10-02

### Fixed

- **An iPhone screen recording reaches the ticket as a playable video.** The blob MIME maps
  knew png/jpeg/webp/gif/webm/mp4 but not `video/quicktime` — what iOS hands a file picker
  for a screen recording. Unmapped values fall back to `png`, so the clip was stored as
  `.png` and served as `image/png`: the video the reporter had just recorded arrived as a
  broken image. `video/quicktime`, `image/heic` and `image/heif` are now mapped (Laravel
  package and Node server).

## [0.10.3] — 2026-10-02

### Fixed

- **The Camera tool is gone.** It opened the phone's camera, so the clip filmed the room
  instead of the screen — wrong by design. It was added on the belief that `getDisplayMedia`
  was an iOS gap; it is not. **No mobile browser supports it** (iOS Safari never has;
  Chrome/Firefox on Android exposed the method in old versions but every call fails), so
  in-page screen recording is desktop-only.
- Record is therefore offered where the API genuinely exists (desktop, including Safari on
  macOS) and nowhere else. On a phone — which cannot record the screen from a page at all —
  the **Video** tool opens the picker for a clip the phone's own screen recorder produced,
  with **no `capture` attribute**, because that is what was forcing the camera open.

## [0.10.2] — 2026-10-02

### Fixed

- **A phone in "Request Desktop Site" mode is recognised as touch again.** Detection keyed
  off `(pointer: coarse)` alone, and a desktop-mode phone reports a **fine** pointer — so
  those users got the mouse path: a composer that grabbed the focus (keyboard over the
  page) and a drag-select that fought the page scroll. It now also accepts `(hover: none)`
  and a touch-capable screen (`maxTouchPoints` / `ontouchstart`).
- **Video is possible on iOS again — via the camera.** Every iOS browser is WebKit, which
  has no `getDisplayMedia`, so screen recording cannot work there and the tool was hidden.
  Touch devices without it now get a **Camera** tool: one tap opens the phone's video
  recorder and the clip is attached to the composer, like the screen-capture flows.

### Added

- Every comment records `viewport.{v, touch, coarse, gdm}` — the SDK build that produced it
  and what the browser could do. A "still broken" report can then be checked against the
  build that actually ran instead of guessed at.

## [0.10.1] — 2026-10-02

### Fixed

- **Record works on a phone again.** 0.10.0 hid the tool on every coarse pointer: right
  for iOS Safari, which has no `getDisplayMedia` at all, but wrong for **Android Chrome**,
  which can capture the screen — so touch users lost video entirely. Record is now offered
  wherever `getDisplayMedia` exists; on touch there is no box to drag, so tapping it
  records the **whole screen** (the call stays synchronous with the tap, as the API
  requires), the tap-to-**Stop** pill ends it, and the composer opens with the video
  attached. Desktop keeps its drag-select.

## [0.10.0] — 2026-10-02

### Added

- **A touch-first capture flow.** On a phone the Region tool now captures the **visible
  viewport** in one tap and opens the composer with the screenshot already attached —
  scroll to what you mean first, then tap Region. Drag-select was unusable on touch: a
  finger hides the area it draws and the drag fought the page scroll.
- The composer is a **bottom sheet** on small screens (full width, thumb-reachable,
  scrollable when the keyboard is up).

### Fixed

- **The composer no longer steals focus on touch**, which threw the on-screen keyboard up
  over the page being described. It still focuses for a mouse/pen.
- **The Region/Record drag no longer locks page scrolling** (the `touch-action: none` page
  lock is gone).
- **Record is not offered on touch at all** — there is no `getDisplayMedia` on iOS Safari,
  and no pointer with which to drag a selection box.

## [0.9.3] — 2026-10-02

### Fixed

- **Laravel: `config('loupe.user_resolver')` may be a class-string.** A Closure cannot be
  serialized, so `php artisan config:cache` failed ("the value at loupe.user_resolver is
  non-serializable") — and since config:cache boots the providers before serializing, a
  Closure injected at runtime broke it too, leaving the app with no config cache. A
  class-string (or `[class, method]`) is now accepted and survives the cache.

## [0.9.2] — 2026-10-02

### Fixed

- **The widget is usable by touch, not just with a mouse.** Inspect, Region and Record
  listened for `mousemove`/`mousedown`/`mouseup`, which a touch drag never fires — so on a
  phone a region could not be drawn and Inspect gave no highlight to aim with. The
  selection layer now uses **Pointer Events** (one path for mouse, touch and pen, with
  `pointercancel` handled); `touch-action: none` is applied to the page only while a
  drag-select tool is active so it cannot scroll mid-drag; and Inspect highlights on
  **finger-down**, since touch has no hover.
- **Record is hidden where `getDisplayMedia` is unavailable** (e.g. iOS Safari) instead of
  offering a tool that can never work.

## [0.9.1] — 2026-10-01

### Fixed

- **Laravel: a custom `config('loupe.user_resolver')` is honoured by the identity check.**
  `CommentController::store()` compared the client's `author.id` against the raw session
  user, so an app that describes a different identity — the documented way to attribute
  comments made while an admin impersonates a user to the **admin** rather than the
  impersonated account — was rejected with *"cannot post as another user"*. The check and
  `author_id` now use the identity the widget was handed (`describeUser()`), which is
  unchanged when no resolver is configured.

## [0.9.0] — 2026-10-01

### Added

- **A real issue form in the widget.** The composer now takes a **Title** and a
  **Description** (the old single field), plus **Attachments** — several images and/or
  videos, picked or dropped in, each shown as a removable chip (images ≤10 MB, videos
  ≤25 MB, up to 10 files). Free notes ("Note") get the same form.
- **`Comment.title` and `Comment.attachments[]`** in `@loupekit/shared`, with an
  `Attachment { url, name?, mime?, kind: image|video, size? }`. Additive — the
  auto-captured `screenshot` / `recording` are unchanged.
- **Search, filters and a sort** on the dashboard board (title/body/author search,
  kind + device filters, newest/oldest), and a **search box** in the widget list.
- **Collapsible comment cards** in both the widget list and the board: a title
  summary that expands to the full card, with an attachment gallery.
- **MCP**: `get_comment` reports the title and every attachment and embeds each
  image attachment as an image content block (plus the auto screenshot);
  `list_comments` reports the title and attachment count.
- **Laravel**: a migration adding `title` and `attachments` to `loupe_comments`,
  model/controller support, and the re-vendored SDK + dashboard bundles.

### Removed

- **"Copy for Claude"** in the widget and the dashboard. The MCP `get_comment` tool
  is the supported way to hand a comment to Claude, and it carries more than the
  clipboard prompt ever did.

### Changed

- **Tickets filed from a Hub issue no longer dump element HTML into the description**
  (the CRM receiver): the description reads like a request, while the raw element
  markup, computed styles and anchor are stored in the ticket's `loupe_context`
  column — still available to the tech team and to Claude over MCP. Every attached
  image **and video** is attached to the ticket, and the ticket drawer renders
  videos with a real player.

## [0.8.1] — 2026-10-01

### Fixed

- **The Laravel widget and dashboard asset URLs are now versioned** (`…/loupe.js?v=…`, from the
  published bundle's mtime+size). A new build is a new URL, so no CDN edge or browser cache can
  keep serving the previous bundle after an upgrade. In the field an app behind Cloudflare kept
  handing users the old SDK — missing the Record tool — until the edge TTL expired, and a
  package user has no way to purge someone else's cache. Versioning fixes it for every host.

## [0.8.0] — 2026-09-24

### Added

- **Loupe Hub** (`packages/hub`, private): a minimal hosted service with Google sign-in where
  org owners create organizations, add allowed members (Google emails and/or one email
  domain) and create projects with a generated Project ID (`prj_…`), Project Secret (`psk_…`),
  webhook URL and webhook signing secret (`whs_…`). Secrets are shown once and can be rotated.
  `POST /v1/issues` verifies the project HMAC (±5 min timestamp), checks the submitter's email
  belongs to the organization (`403` otherwise), and forwards the issue to the project webhook,
  signed, with a 10 s timeout and 3 attempts. The dashboard lists the last 20 deliveries.
  Ships with `deploy/` scripts for a GCP e2-micro VM (Node 24, Postgres 16, Caddy HTTPS,
  systemd).
- **Laravel → Hub forwarding.** New `loupe.hub.url` / `loupe.hub.project_id` /
  `loupe.hub.project_secret` config (`LOUPE_HUB_URL`, `LOUPE_PROJECT_ID`,
  `LOUPE_PROJECT_SECRET`). When all three are set, each new comment dispatches a queued
  `SendToHub` job (after the response on the sync queue) signed with the Project Secret and
  carrying the logged-in user's email. Hub failures are logged and never break comment creation.

## [0.7.0] — 2026-07-20

### Added

- **Claude modification loop (round-trip).** The MCP `get_comment` tool now returns the
  **actual screenshot as an image** (not just a URL) alongside the element HTML and computed
  styles, and a new **`propose_change(id, html, css?, notes?)`** tool lets Claude write its
  **modified HTML/CSS back onto the comment**. The dashboard renders that proposal for the dev
  team as copyable code plus a **live before/after preview** (the "after" rendered in a
  sandboxed iframe). Mirrored in the Laravel MCP server (`propose_change` tool + image block).
- **Screen recording.** A new **Record** tool captures a screen video of a drag-selected
  region (same selection UX as Region) via `getDisplayMedia` + per-frame canvas crop, saved as
  `.webm` (duration-capped, with a Stop button). Recordings play back inline in the widget and
  the dashboard. Overridable via the new `captureRecording` config seam.
- **Two-page sidebar on both surfaces.** The SDK widget dock and the dashboard now each have a
  **Comments** page and a **Connect Claude** page (numbered steps + copyable MCP config), plus
  an **"Integrates with"** row (GitHub / Slack / Telegram / Linear — visual for now). The
  widget's comment list no longer shows the author's name/email.

### Changed

- **Data model (additive).** `Comment` gains optional `recording` (webm URL) and `proposal`
  (`{ html, css?, notes?, author?, createdAt }`) fields; new nullable DB columns
  (`recording_url`, `proposal`) on both the Node and Laravel schemas. Blob storage now carries
  a file extension / content type so it serves `video/webm` as well as `image/png` (legacy
  extensionless ids still resolve to PNG). The comment `PATCH` accepts `proposal`. All changes
  are back-compat — upgrading is drop-in.

## [0.6.0] — 2026-07-17

### Added

- **Dockable, DevTools-style control.** The widget is now a single dockable panel —
  header (`◎ Loupe` + dock controls) → tools (Inspect / Note / Region) → comment list —
  that you dock to the **left**, **right**, or **bottom** edge, or **float** as a movable,
  resizable window. Docked edges **push the host page over** (reflow the `<html>` margin) so
  the panel never hides content; float overlays. The chosen position, open/closed state, and
  float geometry all persist in `localStorage`.
- **Light / dark theme toggle** in the panel header (dark by default); persists.
- **Mobile bottom sheet.** On viewports ≤ 640px the panel becomes a full-width bottom sheet
  (docking is a desktop affordance), and shrinks to a compact header-plus-tools bar while a
  tool is active so most of the page stays visible and tappable.
- **`label` config** — sets the brand name shown in the control header (defaults to `"Loupe"`).

### Changed

- The floating pill toolbar and the separate comment panel are unified into the single
  dockable panel; when closed it collapses to a small `◎` launcher button. Comments render
  inline in the panel. **UI-only** — no DB migration and no change to the SDK `init` config
  (additive `label` only), HTTP API, or MCP tools, so upgrading is drop-in.

## [0.5.2] — 2026-07-15

### Fixed

- **`loupe-mcp` binary now actually starts.** After 0.5.1 shipped compiled JS, launching the
  installed `loupe-mcp` binary still did nothing — it started and exited without serving.
  The entrypoint guard compared `import.meta.url` to `argv[1]`, but the npm `bin` is a
  **symlink** into `node_modules/.bin`: Node resolves the symlink for `import.meta.url` while
  `argv[1]` stays the symlink path, so the two never matched and the stdio transport never
  connected. The check now resolves symlinks (`realpathSync`) before comparing, so
  `loupe-mcp` (and MCP-directory introspection like Glama) works. Verified by running the
  published binary through its `node_modules/.bin` symlink.

## [0.5.1] — 2026-07-15

### Fixed

- **`@loupekit/mcp` now installs and runs from npm.** The package shipped its raw
  TypeScript entry (`index.ts`) and relied on Node stripping types at runtime — but
  Node refuses to strip types for files under `node_modules`
  (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`), so `npm i -g @loupekit/mcp` followed
  by `loupe-mcp` failed for every consumer (and blocked containerized introspection on
  MCP directories like Glama). The package now compiles to `dist/index.js` (tsup, bundled
  in the root build with a `prepublishOnly` safety net) and points `bin`/`main` there.
  Running the server from a source checkout (`node packages/mcp/index.ts`) is unchanged.
  Its type-only dependency on `@loupekit/shared` moved to `devDependencies`, so a fresh
  install no longer pulls an unrelated `shared` version.

## [0.5.0] — 2026-07-14

### Added

- **Free comments — drop a note anywhere, no element or screenshot.** A new **"Note"**
  toolbar mode lets you click any spot on the page and leave a page-level comment that
  isn't tied to a DOM element and carries no screenshot — the lightest way to say "this
  whole area feels off." New `kind: "free"` in `@loupekit/shared`; the drop point is
  stored in the existing `offset` field as a fraction of the document, so **no database
  migration is needed** on the Node server or in `loupekit/laravel`. Free notes render as
  page-level items in the SDK panel, the dashboard, and both MCP servers (Node + Laravel),
  which omit the element-HTML/styles sections for them. _Ships to the SDK, the browser
  extension, and the Laravel widget together (shared `@loupekit/sdk` core)._
- **Draggable, edge-aware toolbar.** Grab the `◎ Loupe` logo and drop the bar anywhere on
  screen; its position persists across reloads (`localStorage`). When expanded it grows
  **inward** so it's always fully visible — docked to a left/right edge it opens as a
  vertical column, along the top/bottom or in a corner it opens as a horizontal row.
  Clicking the logo still collapses/expands; a drag no longer triggers a toggle.

### Changed

- **Version alignment.** All publishable packages move to `0.5.0`. The previously stale
  `@loupekit/server` (`0.2.0`), the extension `manifest.json` (`0.2.0`), and the Node MCP
  server (`McpServer` `0.2.0`) are now `0.5.0` in lockstep with the rest.

## [0.4.3] — 2026-07-13

### Fixed
- **`loupekit/laravel`: multi-guard apps no longer 403 with "cannot post as another
  user".** Apps that use separate auth guards (e.g. `web` for users, `admin` for admins)
  could render the widget under one guard and authenticate the API under another, so the
  ids mismatched. Loupe now resolves identity through a configurable, ordered guard list
  (`LOUPE_GUARDS`, e.g. `web,admin`) and uses the **same** resolution everywhere — the
  widget author, the `loupe:use`/`loupe:admin` gates, the API middleware (new `loupe.auth`,
  which accepts a session on any configured guard), and the anti-spoof check. Fully
  backward compatible: unset = the app's default guard, identical to before.

## [0.4.2] — 2026-07-12

### Fixed
- **`loupekit/laravel`: widget/dashboard assets now load behind a CDN.** The package
  loaded its own JS via `asset('vendor/loupe/...')`, which respects the host's
  `ASSET_URL` — so apps that point `ASSET_URL` at a CDN (with only their Vite build
  uploaded there) got 404s and a silently missing widget. Loupe now resolves its own
  published assets from the **app URL** via `Url::asset()`, bypassing `ASSET_URL`. New
  `LOUPE_ASSET_URL` env / `config('loupe.asset_url')` to override the origin if you serve
  `public/vendor/loupe` elsewhere. Backward-compatible (same result on non-CDN hosts).

## [0.4.1] — 2026-07-12

### Fixed
- **Captures no longer hang the widget.** `await document.fonts.ready` (added in 0.3.4)
  could stall indefinitely on SPAs that keep loading fonts, making **Inspect** feel
  stuck ("loads too hard") and **Region shot** never open its composer. The font wait
  is now capped (~0.8s), the capture timeout lowered to 6s, and every capture is
  wrapped in a hard outer timeout so it can never block the UI.
- **Region shot opens instantly.** The composer now appears immediately and the
  screenshot is captured in the background (attached on submit), instead of blocking on
  the capture first. Fixes the region "Attach screenshot" checkbox being disabled
  because the shot hadn't been captured yet.

_SDK fix — applies to the SDK, the browser extension, and the `loupekit/laravel` widget._

## [0.4.0] — 2026-07-12

### Added
- **Device / viewport tracking (end to end).** Each comment now records the viewport
  it was captured on; the SDK panel, the dashboard, and the MCP payload show a
  **desktop / tablet / mobile** badge, and it's persisted in the database
  (`comments.viewport` on the server; a new `viewport` column via
  `add_viewport_to_loupe_comments_table` on Laravel). New `deviceType(width)` helper
  in `@loupekit/shared`.
- **Per-page comments on SPA navigation.** The widget reloads comments when the URL
  changes without a full page load (patched `history.pushState`/`replaceState` +
  `popstate`), so each page shows only its own comments.

### Changed
- **Mobile toolbar.** On small screens the bar is compact, **icon-only, and pinned to
  the left**; every item now uses one consistent icon+label layout (fixes the
  misaligned icons/text). Collapsing the bar (click the ◎ logo) now also hides the pins.
- **Region-shot capture** renders the smallest element that covers the selection
  instead of the whole page — faster, and it embeds web fonts reliably (the full-page
  render was timing out and falling back to system fonts, distorting the shot).

_All changes above are in `@loupekit/sdk`/`@loupekit/shared`, so they apply to the SDK,
the browser extension, and the `loupekit/laravel` widget; released together at 0.4.0._

## [0.3.4] — 2026-07-12

### Fixed
- **Screenshots fell back to system fonts (wrong layout).** The DOM-based capture
  rasterized before the page's web fonts were embedded, so headings/buttons rendered
  in a fallback font and reflowed (e.g. button text wrapping). Capture now awaits
  `document.fonts.ready` and allows a generous 30s timeout for cross-origin font/asset
  embedding, so the screenshot matches the page. Applies to `@loupekit/sdk` (and thus
  the browser extension and the `loupekit/laravel` widget).
  _Note: fonts served without CORS headers still can't be embedded by any DOM-based
  capture — the pixel-perfect browser extension is the fallback for those._

## [0.3.3] — 2026-07-12

### Added
- **Collapsible toolbar (all SDK surfaces).** Clicking the "◎ Loupe" logo now
  collapses the toolbar to just the logo and expands it again — so the bar can be
  tucked away while browsing. This lives in `@loupekit/sdk`, so it applies
  everywhere the SDK renders: the standalone SDK, the browser extension, and the
  `loupekit/laravel` widget.

### Fixed
- **`loupekit/laravel` — "You are not authorized to use Loupe" on a fresh install.**
  Loupe is now frictionless for any authenticated user in the `local` environment
  (governed by the new `config('loupe.allow_in_local')`, default `true`); the
  `loupe:use` / `loupe:admin` gates and `authorize` closures govern other
  environments. Baseline gates now deny by default (secure in production). An
  explicit `authorize` closure still wins in every environment.

### Changed
- All publishable packages released together at 0.3.3 (`@loupekit/shared`,
  `@loupekit/sdk`, `@loupekit/mcp`, and `loupekit/laravel`).

## [0.3.2] — 2026-07-12

### Fixed
- **`loupekit/laravel` migration failed on MySQL** — the `loupe_comments.url` column
  was a `TEXT`, which MySQL cannot include in the `(project_key, url)` index without a
  key length (`SQLSTATE[42000] 1170: BLOB/TEXT column 'url' used in key specification
  without a key length`). `url` is now `VARCHAR(500)` and `project_key` `VARCHAR(191)`
  so the composite index fits MySQL's key-length limit. Works on MySQL, PostgreSQL and
  SQLite. (Normalized URLs are short, so 500 chars is ample.)

## [0.3.1] — 2026-07-12

### Changed
- **SEO / GEO — author & entity metadata.** Made the project and its author,
  **Mohamed Ashraf Elsaed**, discoverable by search engines and AI answer engines
  (ChatGPT, Claude, Perplexity, Gemini, Copilot): a schema.org `@graph`
  (`Person` + `Organization` + `WebSite` + `SoftwareApplication`) with `sameAs`
  links to LinkedIn/GitHub and `mailto:`, `rel="me"`/`rel="author"` links, a visible
  author byline, an explicit AI-crawler allow-list in `robots.txt`, an **Author**
  section in `llms.txt`, `author` fields across the npm packages, and updated
  `composer.json` author (email `m.ashraf.saed@gmail.com`, LinkedIn homepage).

### Fixed
- **Release/CI:** synced `package-lock.json` with the bumped versions so `npm ci`
  (and therefore the npm publish + CI) no longer fails on release tags.

## [0.3.0] — 2026-07-12

### Added
- **Loupe for Laravel (`loupekit/laravel`).** A Composer package that installs the whole
  Loupe loop into any Laravel app: the `@loupeWidget` Blade directive embeds the SDK,
  comments persist to the host's own database (`loupe_comments` Eloquent model), access is
  gated per-user via `loupe:use` / `loupe:admin` Gate abilities **and** config closures,
  the Kanban dashboard is served on a host route (`/loupe/dashboard`) behind the host's
  auth, and a first-party **MCP server** (`php artisan mcp:start loupe`, on
  `laravel/mcp`) hands the backlog to Claude Code. Screenshots use the Laravel filesystem.
  Supports **PHP 8.4+** and **Laravel 11/12/13**, with a CI matrix and a **100%
  line-coverage** gate. See [docs/LARAVEL.md](docs/LARAVEL.md).

### Changed
- **SDK:** `LoupeConfig` gained two generic options — `headers` (extra request headers,
  e.g. a CSRF token) and `credentials` (fetch credentials mode) — so the widget can
  authenticate via a session cookie instead of the HMAC identity header. Fully
  back-compatible with the standalone server.
- **Dashboard:** now reads an injected `window.__LOUPE__` (api/project/csrf) when present
  and sends `X-CSRF-TOKEN`, so it can run behind a host's authenticated session (used by
  the Laravel package). Falls back to the existing `?api/?project/?key` query params.

## [0.2.1] — 2026-07-12

### Changed
- **Docs:** professional npm READMEs for `@loupekit/sdk`, `@loupekit/mcp`, and
  `@loupekit/shared` — hero banner, shields.io badges, product screenshots, feature tables,
  and the re-anchor before/after visuals. No code changes.

## [0.2.0] — 2026-07-12

### Added
- **Free-region screenshots ("Region shot")** — a new toolbar mode lets you drag a
  free-size box anywhere on the page, screenshot exactly that area, and pin a comment to
  it — no element required. The region is anchored to the element under its center and
  stored as fractions of that element's box, so the pin **tracks responsive reflow and a
  different viewport** (a region drawn on mobile lands correctly on desktop) as well as
  scrolling; it re-shows the outline when highlighted and detaches gracefully if the
  anchor is gone. Persists through the whole loop (SDK/extension → API → dashboard →
  MCP); the extension captures real pixels via `captureVisibleTab`, the SDK default via
  `modern-screenshot`. New optional `captureRegion` config hook mirrors `captureScreenshot`.

### Changed
- **Automated dual-registry publishing.** Every push to `main` now publishes a
  `X.Y.Z-next.<n>` prerelease to the `next` dist-tag, and tagging `vX.Y.Z` publishes a
  stable `latest` — both to **public npm** (`@loupekit/*`) and **GitHub Packages**
  (`@mohamed-ashraf-elsaed/*`). See `RELEASING.md`.
- **npm package pages.** Added full, professional READMEs and keywords to
  `@loupekit/shared`, `@loupekit/sdk`, and `@loupekit/mcp` (previously blank on npm).

### Fixed
- **SDK widget styling** — the theme custom properties (`--accent`, `--panel`, `--line`, …)
  were declared on `:root, .loupe`, neither of which resolves inside the Shadow DOM, so every
  `var(…)` fell back to nothing: composer/panel backgrounds went transparent and buttons lost
  their fills and borders (the "Comment" button was white-on-transparent → invisible; panel
  actions rendered as bare text). Declared them on `:host` so they inherit through the shadow
  tree. Affects the SDK widget and the browser extension (which reuses the SDK core).

## [0.1.0] — 2026-07-09

The first release — the full loop, end to end.

### Added
- **`@loupekit/sdk`** — embeddable Shadow-DOM widget: element inspector, comment composer,
  screenshot capture, and redeploy-surviving re-anchoring (multi-signal fingerprint).
- **`@loupekit/server`** — `node:http` API with Postgres (PGlite locally, `pg` in prod),
  object storage for screenshots, per-project HMAC authentication, and static hosting.
- **`@loupekit/dashboard`** — Kanban triage board (status columns, page filter, live refresh).
- **`@loupekit/mcp`** — MCP server exposing comments to Claude Code (`list_comments`,
  `get_comment`, `update_status`).
- **`@loupekit/extension`** — MV3 browser extension reusing the SDK core with pixel-perfect
  `captureVisibleTab` screenshots.
- **`@loupekit/shared`** — canonical types + `normalizeUrl`.
- Vitest test suite (~91% line coverage), Mermaid architecture docs, a GitHub Wiki, and an
  SEO/GEO-optimized landing page.

[Unreleased]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.8.0...HEAD
[0.8.0]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.5.2...v0.6.0
[0.5.2]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.4.3...v0.5.0
[0.4.3]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.4.2...v0.4.3
[0.4.2]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.3.4...v0.4.0
[0.3.4]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.3.3...v0.3.4
[0.3.3]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.2.1...v0.3.0
[0.1.0]: https://github.com/mohamed-ashraf-elsaed/loupe/releases/tag/v0.1.0
