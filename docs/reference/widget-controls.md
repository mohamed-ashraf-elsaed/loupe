# Widget controls reference

Every control in the Loupe widget, where it appears, and what it does. For the steps that use
these controls, see [Use the Loupe widget](../how-to/use-the-widget.md). For `init()` options,
the keyboard shortcut details and browser storage keys, see the [SDK reference](sdk.md).

Source lines refer to version 0.14.1 and are in `packages/sdk/src/app.ts` unless another file
is named. Line numbers move between releases.

| Control | Where | What it does | Source line |
|---|---|---|---|
| Launcher (◎) | Page corner, panel closed | Click opens the panel. A drag of 6 pixels or more moves it and saves the position. | `:1964-1977`, `:2020-2048` |
| **Quick actions** chevron | Next to the launcher | Opens or closes the quick actions. | `:1980-1986` |
| **Pin comment** | Quick actions | Opens the panel with Inspect on. | `:1946-1947` |
| **Note** | Quick actions | Opens the panel with Note on. | `:1948-1949` |
| **Markers** | Quick actions | Hides or shows all pins. | `:1950-1951` |
| **Hide launcher** | Quick actions | Hides the launcher and shows how to get it back. | `:1952-1954`, `:2102-2114` |
| **Connect Claude** | Quick actions | Opens the Connect tab. Shown only when the host registered a `connect` tab. | `:1956-1961` |
| **Show the launcher** | Screen edge, touch, launcher hidden | Brings the launcher back. | `:547-551` |
| **Alt+Shift+L** | Keyboard | Hides or shows the launcher. Details in [Keyboard](sdk.md#keyboard). | `:76`, `:2209-2214` |
| **Escape** | Keyboard | Cancels the active tool and closes the composer. | `:2199-2201` |
| **Panel position** | Panel header | **Left**, **Bottom**, **Right** or **Float**. | `:595-614` |
| Theme button | Panel header | Switches light and dark. Its label is **Switch to light theme** or **Switch to dark theme**. | `:616-618`, `:3189` |
| **Settings** | Panel header | Accents, switches, **Reset launcher position**, **Restart tour**, version line. | `:621-659` |
| **Hover hints** / **Markers** / **Page paths** / **Launcher** | Settings | Visibility switches. | `:639-642` |
| **Reset launcher position** | Settings, after a drag | Puts the launcher back in its corner. | `:644`, `:2090` |
| **Restart tour** | Settings | Runs the five-step tour from step 1. | `:645`, `:93-106`, `:3058-3064` |
| Tour **Back** / **Skip** / **Next** / **Done** | Tour card | Steps through the tour. **Skip** and **Done** end it for good. | `:3108-3110`, `:3137-3141` |
| **Minimize** / **Close** | Panel header | Shrinks the panel to a one-line strip, or closes it. | `:663-674` |
| Minimized strip | Where the panel was | Shows the open count for the current scope. Click restores the panel. | `:686-687`, `:3203-3207` |
| **Home**, **Comments**, **Activity**, **Chat** tabs | Below the header | Switch views. **Chat** is dimmed unless enabled. | `:122-127`, `:690-702` |
| Navigation card: **Stay here** / **Go there** | Above the tabs | Declines or opens the page an agent asked for. | `:823`, `:4032-4047` |
| Stat tiles **Open** / **Needs you** / **Resolved** / **Stale** | Home | Counts; click to filter the Comments list, click again to clear. | `:1544-1560`, `:1569-1576` |
| **This page** / **All** | Home | Sets the scope. | `:1479-1480`, `:1590` |
| **⟳** (**Refresh**) | Home | Reloads the comments and counts. | `:1481`, `:1510-1513` |
| **✛ Pin feedback on this page** | Home | Turns on Inspect. | `:1483` |
| Project chip | Home | Opens the project popover. | `:1486` |
| **Mark as read** | Home, mentions block | Clears unread mentions. | `:1691` |
| **Resolve** / **Reopen** / **Open** / **Delete** → **Confirm delete** | Home, recent feed | Acts on a recent comment; delete needs a second click within 3 s. | `:1625-1651` |
| **Add** (environment), **✕** | Project popover | Adds or removes an environment URL. | `:1785-1839` |
| **Save** / **Test connection** | Project popover, Local AI | Saves the local AI server, then checks it against `<URL>/v1/models` with a 4-second timeout. | `:1800-1803`, `:1850-1867`, `:3977-4015` |
| **✛ Inspect** | Comments | Select an element to comment on. | `:706-708`, `:2177-2197` |
| **Note** | Comments | Click anywhere to leave a page note. | `:709-711`, `:2500-2514` |
| **Region** | Comments | Drag a rectangle; on touch, capture the screen. | `:712-714`, `:2256-2268` |
| **Record** | Comments, browsers with screen sharing | Drag a rectangle and record it for up to 20 s. | `:715-719`, `:145`, `:2401-2427` |
| **Recording… Stop** | Floating bar | Stops the recording. | `:2425` |
| **Video** | Comments, touch devices without screen sharing | Attach a video recorded on the phone. | `:728-734` |
| **Search…** | Comments | Filters by title, description and author. | `:746` |
| Status select | Comments | **All statuses** or one stage. | `:751-754` |
| Order select | Comments | **Newest first**, **Oldest first**, **Page order**. | `:756-758` |
| Day group heading | Comments, date order | Folds a day; resets on reload. | `:294`, `:4825-4827` |
| **Review** / **Show all** | Review strip | Shows only comments waiting on your review. | `:3708-3717` |
| Composer: Title, description | Composer | Both required before **Comment** is enabled. | `:2531-2537`, `:2614-2617` |
| **＋ Attach images / videos** | Composer | At most 10 files per comment; images ≤ 10 MB, videos ≤ 25 MB. | `:2547`, `:2563-2568`, `:147-151` |
| **Priority** | Composer | Critical, High, Medium (default), Low. | `:2580-2587` |
| **Change type** | Composer | Frontend, Backend, API, Other (default). | `:2588-2595` |
| **Attach screenshot** | Composer | On by default; not shown for notes or recordings. | `:2598-2608` |
| **🎤** | Composer | Dictates into the description. | `:4057-4075` |
| **Cancel** / **Comment** | Composer | Discards, or saves the comment. | `:2610-2621` |
| **Resolve** / **Reopen** | Comment detail | Sets the stage to Resolved, or back to Queue. | `:3564-3566`, `:3593-3595` |
| **Delete** | Comment detail | Deletes at once. | `:3567-3568`, `:3604-3610` |
| **Approve** / **Add comment** | Review banner | Resolves the comment, or opens the composer on the same element (Note tool if the element is gone). | `:3631-3656` |
| **Show original** / **Hide original** | Review banner | Toggles the original request beside the proposal. | `:3660-3670` |
| **✦ Generate a change** | Comment detail | Opens the generate pane. | `:3735-3736` |
| **Request access to generate** | Generate pane, no generator | Sends an access request. | `:3754-3767` |
| **‹** / **›** / **Undo** / **Compare** / **Refine**·**Revise** | Generate pane | Steps through, removes, compares and iterates on generated changes. | `:3779-3795`, `:3824-3838`, `:3848-3854` |
| Reply box | Comment detail | **Enter** sends, **Shift+Enter** adds a line; `@` suggests people. | `:4243-4252`, `:4300-4318` |
| **📎** | Reply box | Attaches an image or video. | `:4264-4266` |
| **➤ Send** | Reply box | Sends the reply. | `:4255` |
| **Retry** | Failed reply | Sends the reply again. | `:4228-4236` |
| **＋** (**Add a reaction**) | Under a message | Adds 👍 🎉 👀 🙏 ❤️ 🚀. | `:4186-4200`, `packages/shared/src/reactions.ts:20` |
| **Copy thread text** / **Copy images** | Comment detail | Copies the thread as Markdown, or up to 4 images. | `:4341-4356`, `:4641` |
| Kind chips (`All N`, `<KIND> N`) | Activity | Filter the feed by event kind, such as `comment.resolve`. Click again to clear. | `:1414-1427` |
| **INTEGRATES WITH** icons | Comments, bottom | Display only. | `:1895-1908` |

## Related pages

- [Use the Loupe widget](../how-to/use-the-widget.md)
- [SDK reference](sdk.md)
