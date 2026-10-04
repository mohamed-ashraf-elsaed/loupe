// Scoped to the Shadow DOM — none of this leaks to (or is affected by) the host page.
export const STYLES = /* css */ `
:host { all: initial; }
* { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }

/* Theme tokens live on :host (inside the Shadow DOM :root matches nothing).
   Dark is the default; the host element gets .theme-light to flip to light. */
:host {
  --accent: #6b73e6;
  --accent-soft: rgba(107, 115, 230, 0.12);
  --pin: #ff5842;
  --bg: #14161d;
  --bg-2: #1b1e27;
  --bg-3: #262a36;
  --ink: #e7e9f0;
  --muted: #9aa0af;
  --line: #2b2f3b;
  --shadow: 0 12px 48px rgba(0,0,0,.42);
}
:host(.theme-light) {
  --accent: #4a55d6;
  --accent-soft: rgba(74, 85, 214, 0.12);
  --pin: #ff5842;
  --bg: #ffffff;
  --bg-2: #f6f7fb;
  --bg-3: #eceef4;
  --ink: #16181f;
  --muted: #6b7180;
  --line: #e2e5ee;
  --shadow: 0 12px 40px rgba(0,0,0,.22);
}

.overlay { position: fixed; inset: 0; z-index: 2147483000; pointer-events: none; }

/* inspector highlight */
.hl {
  position: fixed; pointer-events: none; z-index: 2147483001;
  border: 2px solid var(--accent);
  background: var(--accent-soft);
  border-radius: 4px; display: none;
  transition: all 60ms linear;
}
.hl .tip {
  position: absolute; top: -24px; left: 0; background: var(--accent); color: #fff;
  font-size: 11px; font-weight: 600; padding: 2px 7px; border-radius: 4px; white-space: nowrap;
  font-family: ui-monospace, Menlo, monospace;
}

/* region selection (during drag) + active-comment outline */
.selbox {
  position: fixed; pointer-events: none; z-index: 2147483001; display: none;
  border: 2px dashed var(--accent); background: var(--accent-soft); border-radius: 4px;
}
.region-box {
  position: fixed; pointer-events: none; z-index: 2147483001; display: none;
  border: 2px solid var(--pin); border-radius: 4px;
  box-shadow: 0 0 0 2px rgba(255, 88, 66, .25), 0 4px 16px rgba(0,0,0,.25);
}

/* pins */
.pin {
  position: fixed; pointer-events: auto; z-index: 2147483002;
  width: 26px; height: 26px; border-radius: 50% 50% 50% 2px;
  background: var(--pin); color: #fff; border: 2px solid #fff;
  font-size: 12px; font-weight: 700; cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,.35);
  display: grid; place-items: center; transform: translate(-4px, -4px);
  transition: transform 80ms ease;
}
.pin:hover { transform: translate(-4px, -4px) scale(1.12); }
.pin.detached { background: #9aa0af; }
.pin.done { background: #10935a; }
.pin.free { background: var(--accent); border-radius: 50% 50% 2px 50%; }
.pin.free.done { background: #10935a; }
.pin.active { outline: 3px solid rgba(107,115,230,.45); }
/* The quick-action "Markers" toggle hides every pin without discarding it.
   !important beats the inline display the pin positioner sets on each frame. */
.overlay.hide-pins .pin { display: none !important; }

/* --------------------------------------------------------------- FAB cluster */
/* The collapsed state: a primary brand button (with the comment count) plus the
   quick actions that expand out of it. Replaces the old single launcher. */
.fab-cluster {
  position: fixed; z-index: 2147483003; bottom: 20px; right: 20px;
  display: none; flex-direction: column; align-items: flex-end; gap: 10px;
}
.fab-cluster.show { display: flex; }
/* The way back on a touch screen once the launcher is hidden (no keyboard for Alt+Shift+L):
   a slim tab on the right edge, shown only while the panel is closed. */
.fab-handle {
  position: fixed; z-index: 2147483003; right: 0; bottom: 96px; width: 12px; height: 56px;
  display: none; padding: 0; border: 0; border-radius: 8px 0 0 8px;
  background: var(--accent); opacity: .6; cursor: pointer; touch-action: manipulation;
}
.fab-handle.show { display: block; }
.fab-handle:hover, .fab-handle:focus-visible { opacity: 1; }
/* A dragged launcher is anchored to its nearest edges (JS sets left/right/top/bottom),
   and the quick actions grow INTO the page: downward from the upper half, labels to the
   right from the left half. */
.fab-cluster.at-top { flex-direction: column-reverse; }
.fab-cluster.at-left, .fab-cluster.at-left .fab-minis { align-items: flex-start; }
.fab-cluster.at-left .fab-mini .fab-tip { right: auto; left: calc(100% + 8px); }
.fab-cluster.dragging .launcher { cursor: grabbing; border-color: var(--accent); }
.fab-cluster.dragging .fab-mini .fab-tip { display: none; }

.fab-minis { display: none; flex-direction: column; align-items: flex-end; gap: 10px; }
.fab-cluster.expanded .fab-minis { display: flex; }
.fab-cluster.expanded .fab-minis .fab-mini { animation: loupe-fab-in 180ms cubic-bezier(.16, 1, .3, 1) both; }
.fab-cluster.expanded .fab-minis .fab-mini:nth-child(1) { animation-delay: 0ms; }
.fab-cluster.expanded .fab-minis .fab-mini:nth-child(2) { animation-delay: 30ms; }
.fab-cluster.expanded .fab-minis .fab-mini:nth-child(3) { animation-delay: 60ms; }
.fab-cluster.expanded .fab-minis .fab-mini:nth-child(4) { animation-delay: 90ms; }
.fab-cluster.expanded .fab-minis .fab-mini:nth-child(5) { animation-delay: 120ms; }
@keyframes loupe-fab-in { from { opacity: 0; transform: translateY(8px) scale(.9); } to { opacity: 1; transform: none; } }
.fab-cluster.at-top.expanded .fab-minis .fab-mini { animation-name: loupe-fab-in-down; }
@keyframes loupe-fab-in-down { from { opacity: 0; transform: translateY(-8px) scale(.9); } to { opacity: 1; transform: none; } }

.fab-mini {
  position: relative; width: 40px; height: 40px; border-radius: 50%; padding: 0;
  border: 1px solid var(--line); background: var(--bg); color: var(--ink);
  cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
  box-shadow: var(--shadow);
}
.fab-mini:hover { border-color: var(--accent); color: var(--accent); }
.fab-mini.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.fab-mini.on:hover { color: #fff; }
.fab-mini svg { display: block; width: 16px; height: 16px; }
/* The action's label, revealed on hover so the collapsed cluster stays calm. */
.fab-mini .fab-tip {
  position: absolute; right: calc(100% + 8px); top: 50%; transform: translateY(-50%);
  background: var(--bg); color: var(--ink); border: 1px solid var(--line);
  border-radius: 7px; padding: 4px 8px; font-size: 11px; font-weight: 600; white-space: nowrap;
  box-shadow: var(--shadow); opacity: 0; pointer-events: none; transition: opacity 120ms ease;
}
.fab-mini:hover .fab-tip { opacity: 1; }

/* The launcher and its chevron share a box so the chevron can sit on the launcher's
   corner while being its own button (tap = quick actions; the launcher = open). */
.fab-main { position: relative; display: inline-flex; }
.launcher {
  position: relative; width: 46px; height: 46px; border-radius: 50%; padding: 0;
  border: 1px solid var(--line); background: var(--bg-2); color: var(--ink);
  cursor: grab; display: inline-flex; align-items: center; justify-content: center;
  box-shadow: var(--shadow);
  touch-action: none; user-select: none; -webkit-user-select: none; /* drag with a finger too */
}
.launcher:hover { border-color: var(--accent); }
.launcher:active { cursor: grabbing; }
.launcher .logo { font-size: 24px; line-height: 1; color: var(--accent); }
/* Chevron pinned to the corner: up = actions are tucked away, down = they are out. */
.fab-more {
  position: absolute; right: -3px; bottom: -3px; width: 20px; height: 20px; border-radius: 50%;
  padding: 0; cursor: pointer; z-index: 1;
  background: var(--bg); border: 1px solid var(--line); color: var(--muted);
  display: grid; place-items: center; transition: transform 160ms cubic-bezier(.16, 1, .3, 1);
}
.fab-more:hover { border-color: var(--accent); color: var(--accent); }
.fab-more .lchev { display: grid; place-items: center; }
.fab-more svg { width: 11px; height: 11px; display: block; }
.fab-cluster.expanded .fab-more { transform: rotate(180deg); }
.fab-cluster.at-top .fab-more { bottom: auto; top: -3px; transform: rotate(180deg); }
.fab-cluster.at-top.expanded .fab-more { transform: none; }
.launcher .lcount {
  position: absolute; top: -5px; right: -5px; background: var(--pin); color: #fff;
  font-size: 10px; font-weight: 700; line-height: 1; border-radius: 999px; padding: 3px 6px;
  border: 2px solid var(--bg);
}
.launcher .lcount:empty { display: none; }
@media (prefers-reduced-motion: reduce) {
  .fab-cluster.expanded .fab-minis .fab-mini { animation: none; }
  .launcher .lchev { transition: none; }
  .fab-mini .fab-tip { transition: none; }
}

/* --------------------------------------------------------------------- dock */
/* The control panel. One container, four dock modes (left/right/bottom/float),
   overlaying the host page (never reflows it). */
.dock {
  position: fixed; z-index: 2147483003; pointer-events: auto;
  display: none; flex-direction: column;
  background: var(--bg); color: var(--ink);
  border: 1px solid var(--line); box-shadow: var(--shadow);
  overflow: hidden; font-size: 13px;
}
.dock.open { display: flex; }
.dock.mode-right  { top: 0; right: 0; bottom: 0; width: 360px; border-width: 0 0 0 1px; }
.dock.mode-left   { top: 0; left: 0;  bottom: 0; width: 360px; border-width: 0 1px 0 0; }
.dock.mode-bottom { left: 0; right: 0; bottom: 0; height: 320px; border-width: 1px 0 0 0; }
.dock.mode-float  { border-radius: 14px; /* left/top/width/height set inline */ }

/* header: brand + dock controls */
.dhead {
  display: flex; align-items: center; gap: 8px; flex: none;
  padding: 8px 10px; border-bottom: 1px solid var(--line); background: var(--bg-2);
}
.dock.mode-float .dhead { cursor: grab; }
.dock.mode-float.dragging .dhead { cursor: grabbing; }
.dock.dragging { user-select: none; }
.brand { display: flex; align-items: center; gap: 8px; font-weight: 700; letter-spacing: -.01em; }
.brand .logo { font-size: 16px; line-height: 1; color: var(--accent); flex: none; }
.brand .title { font-size: 13px; }
.dctl { display: flex; align-items: center; gap: 2px; margin-left: auto; }
/* Only the header's own icon buttons. The position and settings popovers live inside
   .dctl too, and a bare .dctl button squeezed their rows and swatches to 26px. */
.dctl > button, .dctl > .menu-wrap > button {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; padding: 0; border: 0; border-radius: 6px;
  background: transparent; color: var(--muted); cursor: pointer;
}
.dctl > button:hover, .dctl > .menu-wrap > button:hover { background: var(--bg-3); color: var(--ink); }
.dctl > button.on, .dctl > .menu-wrap > button.on { background: var(--bg-3); color: var(--accent); }
.dctl svg { display: block; }
.dctl .gap { width: 1px; height: 16px; background: var(--line); margin: 0 4px; flex: none; }

/* tools row */
.tools { display: flex; gap: 6px; flex: none; padding: 10px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.tools button {
  display: flex; align-items: center; gap: 6px; padding: 7px 10px; line-height: 1;
  border: 1px solid var(--line); border-radius: 8px; background: var(--bg-2); color: var(--ink);
  font-size: 12px; font-weight: 600; cursor: pointer;
}
.tools button:hover { background: var(--bg-3); }
.tools button.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.tools .ico { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; }
.tools .ico svg { width: 15px; height: 15px; display: block; }

/* list */
.listhead {
  display: flex; align-items: center; gap: 8px; flex: none; padding: 12px 12px 6px;
  font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); font-weight: 700;
}
.count { background: var(--pin); color: #fff; font-size: 11px; font-weight: 700; line-height: 1; border-radius: 999px; padding: 3px 7px; }
.list { flex: 1; overflow-y: auto; padding: 6px 10px 12px; display: flex; flex-direction: column; gap: 8px; }
.empty { color: var(--muted); font-size: 13px; padding: 24px 12px; text-align: center; line-height: 1.5; }
/* bottom dock lays the list out in flowing columns so it isn't a tall single strip */
.dock.mode-bottom .list { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); align-content: start; }

.item { border: 1px solid var(--line); border-radius: 10px; padding: 10px; cursor: pointer; background: var(--bg-2); }
.item:hover { border-color: var(--accent); }
/* The header row now carries the number, a detached badge, a lifecycle chip, a PR
   chip, a checks meter and the caret — more than fits on one line in a narrow
   panel, so it wraps rather than clipping the last chip. The caret keeps its place
   at the end of the row. */
.item .top { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 8px; margin-bottom: 6px; }
.item .top .caret { margin-left: auto; }
.item .num { background: var(--pin); color: #fff; width: 20px; height: 20px; border-radius: 50%; font-size: 11px; font-weight: 700; display: grid; place-items: center; flex: none; }
.item .num.detached { background: #9aa0af; }
.item .num.done { background: #10935a; }
/* Author + absolute time, visible collapsed too. */
.item .who { display: flex; flex-wrap: wrap; gap: 0 4px; font-size: 11.5px; color: var(--muted); margin-top: 3px; }
.item .who b { color: var(--ink); font-weight: 600; }
.item .who time { font-variant-numeric: tabular-nums; white-space: nowrap; }
.item .device { font-size: 10px; color: var(--muted); background: var(--bg-3); border-radius: 999px; padding: 1px 7px; white-space: nowrap; }
.item .body { font-size: 13px; line-height: 1.4; }
.item .meta { font-size: 11px; color: var(--muted); margin-top: 6px; font-family: ui-monospace, Menlo, monospace; word-break: break-all; }
.item .badge { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; padding: 1px 6px; border-radius: 5px; margin-left: auto; white-space: nowrap; }
.badge.detached { background: var(--bg-3); color: var(--muted); }
.badge.done { background: #d8f0e4; color: #10935a; }
.item .actions { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
.item .actions button { font-size: 11px; border: 1px solid var(--line); background: var(--bg-3); border-radius: 6px; padding: 4px 8px; cursor: pointer; color: var(--ink); }
.item .actions button:hover { border-color: var(--accent); }
.item img.shot { width: 100%; border-radius: 6px; margin-top: 8px; border: 1px solid var(--line); }
.item video.shot { width: 100%; border-radius: 6px; margin-top: 8px; border: 1px solid var(--line); }
.item .caret { margin-left: auto; color: var(--muted); font-size: 11px; }
.item .summary { font-size: 13px; font-weight: 600; line-height: 1.35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.item .detail { margin-top: 6px; }
.item.collapsed .detail { display: none; }
.listhead .search {
  margin-left: auto; flex: 1; max-width: 170px; font-size: 12px; text-transform: none; letter-spacing: 0;
  padding: 4px 8px; border: 1px solid var(--line); border-radius: 7px; background: var(--bg-2); color: var(--ink); outline: none;
}
.listhead .search:focus { border-color: var(--accent); }

/* float resize grip (bottom-right corner) */
.resize { display: none; position: absolute; right: 0; bottom: 0; width: 16px; height: 16px; cursor: nwse-resize; z-index: 1; }
.dock.mode-float .resize { display: block; }
.resize::after {
  content: ""; position: absolute; right: 3px; bottom: 3px; width: 7px; height: 7px;
  border-right: 2px solid var(--muted); border-bottom: 2px solid var(--muted); opacity: .7;
}

/* composer popover */
.composer {
  position: fixed; z-index: 2147483004; pointer-events: auto; width: 320px;
  background: var(--bg); color: var(--ink); border: 1px solid var(--line);
  border-radius: 12px; box-shadow: var(--shadow); padding: 12px; display: none;
}
.composer .target {
  font-family: ui-monospace, Menlo, monospace; font-size: 11px; color: var(--accent);
  background: var(--bg-2); border-radius: 6px; padding: 5px 8px; margin-bottom: 8px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.composer textarea {
  width: 100%; min-height: 68px; resize: vertical; border: 1px solid var(--line);
  border-radius: 8px; padding: 8px; font-size: 13px; color: var(--ink); background: var(--bg-2); outline: none;
}
.composer textarea:focus { border-color: var(--accent); }
.composer .row { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; gap: 8px; }
.composer label.chk { font-size: 12px; color: var(--muted); display: flex; align-items: center; gap: 6px; cursor: pointer; }
.composer .btns { display: flex; gap: 6px; }
.composer button { border: 0; border-radius: 8px; font-size: 13px; font-weight: 600; padding: 7px 12px; cursor: pointer; }
.composer .primary { background: var(--accent); color: #fff; }
.composer .primary:disabled { opacity: .5; cursor: default; }
.composer .ghost { background: var(--bg-3); color: var(--ink); }
.composer input.title {
  width: 100%; border: 1px solid var(--line); border-radius: 8px; padding: 8px; margin-bottom: 8px;
  font-size: 13px; font-weight: 600; color: var(--ink); background: var(--bg-2); outline: none;
}
.composer input.title:focus { border-color: var(--accent); }
.composer .attach { margin-top: 8px; }
.composer .pick {
  width: 100%; border: 1px dashed var(--line); background: transparent; color: var(--muted);
  border-radius: 8px; padding: 7px; font-size: 12px; font-weight: 600; cursor: pointer;
}
.composer .pick:hover { border-color: var(--accent); color: var(--accent); }
.composer .chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.composer .chip {
  display: inline-flex; align-items: center; gap: 4px; max-width: 100%;
  background: var(--bg-3); border-radius: 6px; padding: 2px 4px 2px 7px; font-size: 11px; color: var(--ink);
}
.composer .chip .x { border: 0; background: transparent; color: var(--muted); cursor: pointer; font-size: 13px; line-height: 1; padding: 0 2px; }
.composer .err { color: var(--pin); font-size: 11px; margin-top: 4px; }
.composer .err:empty { display: none; }

/* Priority + change-type pickers, side by side under the attachments. */
.composer .meta2 { display: flex; gap: 6px; margin-top: 8px; }
.composer select.mini {
  flex: 1; min-width: 0; font-size: 12px; padding: 6px 7px; border-radius: 7px;
  border: 1px solid var(--line); background: var(--bg-2); color: var(--ink); outline: none;
}
.composer select.mini:focus { border-color: var(--accent); }

/* ------------------------------------------------------------ sidebar tabs */
.tabs { display: flex; gap: 4px; flex: none; padding: 8px 10px 0; border-bottom: 1px solid var(--line); }
.tabs .tab {
  flex: 1; padding: 8px 10px; border: 0; border-bottom: 2px solid transparent;
  background: transparent; color: var(--muted); font-size: 12px; font-weight: 700; cursor: pointer;
  border-radius: 6px 6px 0 0;
}
.tabs .tab:hover { color: var(--ink); background: var(--bg-2); }
.tabs .tab.on { color: var(--accent); border-bottom-color: var(--accent); }
.tabs .tab.off { opacity: .45; cursor: not-allowed; }
.tabs .tab.off:hover { color: inherit; background: transparent; }

/* Only the active page shows. Driven by an "on" class rather than a .tab-<id>
   selector, so host-registered tab ids need no CSS of their own. */
.view { display: none; }
.view.on { display: block; flex: 1; min-height: 0; overflow-y: auto; }
.view.on.comments-view { display: flex; flex-direction: column; }

/* ------------------------------------------------------------- Home overview */
.home-view { padding: 12px 12px 18px; }
.hstat { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.hstat-b {
  display: flex; flex-direction: column; gap: 2px; text-align: left; padding: 10px;
  border: 1px solid var(--line); border-radius: 10px; background: var(--bg-2); color: var(--ink); cursor: pointer;
}
.hstat-b:hover { border-color: var(--accent); }
.hstat-b.on { border-color: var(--accent); background: var(--bg-3); }
.hstat-n { font-size: 20px; font-weight: 700; line-height: 1.1; font-variant-numeric: tabular-nums; }
.hstat-l { font-size: 11px; color: var(--muted); }
.hscope { display: flex; align-items: center; gap: 6px; margin-top: 10px; }
.hscope-b {
  flex: 1; padding: 7px 8px; border: 1px solid var(--line); border-radius: 8px;
  background: var(--bg-2); color: var(--muted); font-size: 12px; font-weight: 600; cursor: pointer;
}
.hscope-b.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.hrefresh {
  flex: none; width: 30px; height: 30px; border: 1px solid var(--line); border-radius: 8px;
  background: var(--bg-2); color: var(--muted); cursor: pointer; font-size: 14px;
}
.hrefresh:hover { border-color: var(--accent); color: var(--ink); }
.hpin {
  margin-top: 10px; width: 100%; padding: 9px; border: 0; border-radius: 9px;
  background: var(--accent); color: #fff; font-size: 13px; font-weight: 600; cursor: pointer;
}
.hlabel { margin-top: 14px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); font-weight: 700; }
.hfeed { margin-top: 6px; display: flex; flex-direction: column; gap: 4px; }
.hfeed-i {
  display: flex; flex-direction: column; gap: 3px; text-align: left; padding: 8px;
  border: 1px solid var(--line); border-radius: 8px; background: var(--bg-2); color: var(--ink); cursor: pointer;
}
.hfeed-i:hover { border-color: var(--accent); }
.hfeed-t { font-size: 12.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hfeed-m { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 11px; color: var(--muted); }
.hfeed-s { font-weight: 700; }
.hfeed-s-resolved { color: #34c281; }
.hfeed-p { font-weight: 700; }
.hfeed-p-critical { color: var(--pin); }
.hfeed-p-high { color: #e0a92c; }
.hfeed-a { display: flex; gap: 4px; margin-top: 3px; }
.hfeed-act {
  font-size: 11px; padding: 3px 8px; border: 1px solid var(--line); border-radius: 6px;
  background: var(--bg-3); color: var(--ink); cursor: pointer;
}
.hfeed-act:hover { border-color: var(--accent); }
.hfeed-act.danger:hover, .hfeed-act.danger[data-armed] { border-color: var(--pin); color: var(--pin); }
.hempty { padding: 14px; text-align: center; color: var(--muted); font-size: 12px; }
.hfoot { margin-top: 14px; padding-top: 10px; border-top: 1px solid var(--line); font-size: 11px; color: var(--muted); text-align: center; }

/* Timeline grouping (project scope) + the repo filter. */
.daylabel {
  display: flex; align-items: center; gap: 6px; width: 100%; margin: 8px 0 0; padding: 4px 2px;
  border: 0; background: none; cursor: pointer; text-align: left;
  font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); font-weight: 700;
}
.daylabel::before { content: "▾"; font-size: 10px; width: 10px; }
.daylabel.shut::before { content: "▸"; }
.daylabel::after {
  content: attr(data-n); padding: 0 6px; border-radius: 999px; background: var(--bg-3);
  font-size: 10px; letter-spacing: 0;
}
.daylabel:hover { color: var(--ink); }
.listfilters { display: flex; gap: 6px; margin: 6px 0 2px; }
.listfilters select {
  flex: 1; min-width: 0; font-size: 12px; padding: 4px 6px; border: 1px solid var(--line); border-radius: 7px;
  background: var(--bg-2); color: var(--ink); outline: none; cursor: pointer;
}
.listfilters select:focus { border-color: var(--accent); }
/* The page a comment belongs to, shown in the project scope (Settings → Page paths). */
.pathtag {
  padding: 1px 6px; border-radius: 999px; background: var(--bg-3); color: var(--muted);
  font-size: 10.5px; font-family: ui-monospace, Menlo, monospace;
  max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* recording marker + video in the list */
.item .rectag { font-size: 10px; font-weight: 700; color: var(--pin); background: var(--bg-3); border-radius: 999px; padding: 1px 7px; white-space: nowrap; }
.item video.shot { width: 100%; border-radius: 6px; margin-top: 8px; border: 1px solid var(--line); background: #000; display: block; }

/* ------------------------------------------------ "integrates with" footer */
.integrations { flex: none; padding: 12px 12px 14px; border-top: 1px solid var(--line); text-align: center; }
.integrations .ilabel { font-size: 10px; letter-spacing: .12em; color: var(--muted); font-weight: 700; margin-bottom: 8px; }
.integrations .irow { display: flex; align-items: center; justify-content: center; gap: 14px; }
.integrations .ibtn { color: var(--muted); display: inline-flex; opacity: .8; cursor: default; }
.integrations .ibtn:hover { color: var(--accent); opacity: 1; }
.integrations .ibtn svg { display: block; }

/* ------------------------------------------------------- Connect Claude page */
.connect-view { padding: 16px 14px 20px; }
.connect-hero { text-align: center; margin-bottom: 18px; }
.connect-hero .chero-logo { font-size: 34px; line-height: 1; color: var(--accent); }
.connect-hero .chero-title { font-size: 18px; font-weight: 800; letter-spacing: -.02em; margin-top: 8px; }
.connect-hero .chero-sub { font-size: 12.5px; color: var(--muted); line-height: 1.45; margin-top: 6px; }
.accentink { color: var(--accent); }
.connect-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
.connect-steps .cstep-t { font-size: 13px; font-weight: 700; }
.connect-steps .cstep-d { font-size: 12px; color: var(--muted); line-height: 1.45; margin-top: 3px; }
.connect-steps .cstep-code {
  margin: 8px 0 0; padding: 10px; background: var(--bg-2); border: 1px solid var(--line);
  border-radius: 8px; font-family: ui-monospace, Menlo, monospace; font-size: 11px; line-height: 1.4;
  color: var(--ink); white-space: pre; overflow-x: auto;
}

/* ------------------------------------------------------- recording indicator */
.recbar {
  position: fixed; z-index: 2147483005; top: 16px; left: 50%; transform: translateX(-50%);
  display: none; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 999px;
  background: var(--bg); color: var(--ink); border: 1px solid var(--pin);
  box-shadow: var(--shadow); font-size: 12px; font-weight: 600; cursor: pointer;
}
.recbar.show { display: inline-flex; }
.recbar b { color: var(--pin); }
.recbar .recdot { width: 9px; height: 9px; border-radius: 50%; background: var(--pin); animation: loupe-recpulse 1.1s infinite; }
@keyframes loupe-recpulse { 0%,100% { opacity: 1; } 50% { opacity: .25; } }
@media (prefers-reduced-motion: reduce) { .recbar .recdot { animation: none; } }

/* ---------------------------------------------------------------- toast */
/* A short notice (e.g. how to bring a hidden launcher back). Click to dismiss. */
.toast {
  position: fixed; z-index: 2147483006; bottom: 24px; left: 50%;
  transform: translateX(-50%) translateY(8px); opacity: 0; pointer-events: none;
  max-width: calc(100vw - 32px); padding: 9px 14px; border-radius: 999px; text-align: center;
  background: var(--bg); color: var(--ink); border: 1px solid var(--line); box-shadow: var(--shadow);
  font-size: 12px; font-weight: 600; line-height: 1.4;
  transition: opacity 160ms ease, transform 160ms ease;
}
.toast.show { opacity: 1; transform: translateX(-50%); pointer-events: auto; cursor: pointer; }
.toast kbd {
  font-family: ui-monospace, Menlo, monospace; font-size: 11px; padding: 1px 5px;
  border: 1px solid var(--line); border-radius: 4px; background: var(--bg-3);
}
@media (prefers-reduced-motion: reduce) { .toast { transition: none; } }

/* ---------------------------------------------- header popovers (pos + settings) */
.menu-wrap { position: relative; }
.menu {
  position: absolute; top: calc(100% + 6px); right: 0; z-index: 30;
  min-width: 214px; padding: 8px; display: none;
  background: var(--bg-2); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow);
}
.menu.open { display: block; }
.menu-label {
  margin: 2px 5px 6px; font-size: 10px; font-weight: 700; letter-spacing: .06em;
  text-transform: uppercase; color: var(--muted);
}
/* dock-position grid: the four layouts as a 2x2 of buttons */
.pos-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.pos-grid button {
  display: flex; align-items: center; gap: 6px; padding: 7px 8px; cursor: pointer;
  border: 1px solid var(--line); border-radius: 8px; background: var(--bg); color: var(--muted);
  font-size: 11.5px; font-weight: 600;
}
.pos-grid button:hover { border-color: var(--accent); color: var(--ink); }
.pos-grid button.on { border-color: var(--accent); color: var(--accent); }
.pos-grid button svg { width: 14px; height: 14px; flex: none; }
/* settings rows */
.menu-row {
  display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%;
  padding: 7px 6px; border: 0; border-radius: 8px; background: transparent; color: var(--ink);
  font-size: 12.5px; text-align: left; cursor: pointer;
}
.menu-row:hover { background: var(--bg-3); }
.menu-sep { height: 1px; margin: 6px 4px; background: var(--line); }
/* on/off switch inside a settings row */
.sw { flex: none; position: relative; width: 30px; height: 17px; border-radius: 999px; background: var(--line); transition: background .12s; }
.sw::after { content: ""; position: absolute; top: 2px; left: 2px; width: 13px; height: 13px; border-radius: 50%; background: #fff; transition: transform .12s; }
.menu-row[aria-pressed="true"] .sw { background: var(--accent); }
.menu-row[aria-pressed="true"] .sw::after { transform: translateX(13px); }
/* accent swatches */
.acc-dots { display: flex; gap: 8px; padding: 4px 6px 2px; }
.acc-dot { width: 20px; height: 20px; border-radius: 50%; border: 2px solid transparent; padding: 0; cursor: pointer; }
.acc-dot.on { border-color: var(--ink); }

/* ---------------------------------------------------------------- minimize bar */
.minbar { display: none; align-items: center; gap: 8px; padding: 9px 10px; cursor: pointer; background: var(--bg-2); }
.dock.minimized .minbar { display: flex; }
.dock.minimized .tabs, .dock.minimized .view, .dock.minimized .resize,
.dock.minimized .dctl [data-role="min"], .dock.minimized .dctl .menu-wrap { display: none !important; }
.minbar .logo { color: var(--accent); font-size: 14px; }
.minbar .mtext { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--muted); }
.minbar .mtext b { color: var(--ink); }
.minbar .mrestore { flex: none; padding: 0 2px; border: 0; background: transparent; color: var(--accent); font-size: 14px; cursor: pointer; }

/* ---------------------------------------------------------------- activity monitor */
.activity-view { padding: 10px 12px 16px; }
.mon-status { display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 600; color: var(--ink); }
.mon-spacer { flex: 1; }
.mon-live { font-size: 10px; font-weight: 600; color: var(--muted); }
.mon-live.live { color: #2f9e6a; }
.mon-live.offline { color: #d9534f; }
.mon-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); flex: none; }
.mon-status.st-working .mon-dot { background: var(--accent); animation: loupe-pulse 1.4s ease-in-out infinite; }
.mon-status.st-error .mon-dot { background: var(--pin); }
.mon-status.st-idle .mon-dot { background: var(--muted); }
@keyframes loupe-pulse { 0%,100% { opacity: 1; } 50% { opacity: .3; } }
@media (prefers-reduced-motion: reduce) { .mon-status.st-working .mon-dot { animation: none; } }
.mon-clear {
  padding: 3px 8px; border: 1px solid var(--line); border-radius: 7px;
  background: var(--bg-2); color: var(--muted); font-size: 11px; cursor: pointer;
}
.mon-clear:hover { border-color: var(--accent); color: var(--ink); }

.mon-summary { margin-top: 8px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg-2); overflow: hidden; }
.mon-sum-head {
  display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 10px;
  border: 0; background: transparent; color: var(--ink); text-align: left; cursor: pointer;
}
.mon-sum-title { font-size: 12px; font-weight: 700; }
.mon-sum-peek { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: var(--muted); }
.mon-caret { color: var(--muted); font-size: 11px; }
.mon-sum-body { padding: 2px 10px 10px; }
.mon-kv { display: flex; justify-content: space-between; gap: 10px; padding: 3px 0; font-size: 11.5px; color: var(--muted); }
.mon-kv b { color: var(--ink); font-weight: 600; text-align: right; }
.mon-preview {
  margin-top: 8px; padding: 7px 8px; border-radius: 7px; background: var(--bg);
  font-family: ui-monospace, Menlo, monospace; font-size: 10.5px; color: var(--muted);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.mon-micro { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 8px; font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }
.mon-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
.mon-chip {
  padding: 3px 8px; border: 1px solid var(--line); border-radius: 999px;
  background: var(--bg-2); color: var(--muted); font-size: 11px; cursor: pointer;
}
.mon-chip:hover { border-color: var(--accent); color: var(--ink); }
.mon-chip.on { border-color: var(--accent); background: var(--accent); color: #fff; }
.mon-feed {
  margin-top: 8px; max-height: 46vh; overflow-y: auto;
  border: 1px solid var(--line); border-radius: 10px; background: var(--bg);
}
.mon-row {
  display: grid; grid-template-columns: 58px 88px 1fr; gap: 6px;
  padding: 5px 8px; border-bottom: 1px solid var(--line); font-size: 11px; line-height: 1.4;
}
.mon-row:last-child { border-bottom: 0; }
.mon-time { color: var(--muted); font-family: ui-monospace, Menlo, monospace; font-variant-numeric: tabular-nums; }
.mon-kind { color: var(--accent); font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mon-label { color: var(--ink); overflow-wrap: anywhere; }
.mon-detail { display: block; color: var(--muted); font-family: ui-monospace, Menlo, monospace; font-size: 10.5px; overflow-wrap: anywhere; }
.mon-row.lv-warn .mon-label { color: #e0a92c; }
.mon-row.lv-error .mon-label { color: var(--pin); }
.mon-empty { padding: 16px 12px; text-align: center; font-size: 11.5px; line-height: 1.6; color: var(--muted); }
.mon-empty code { font-family: ui-monospace, Menlo, monospace; font-size: 10.5px; color: var(--ink); }

/* ---------------------------------------------- project manager (repo + environments) */
.projbar { display: flex; align-items: center; gap: 8px; margin-top: 12px; position: relative; }
.proj-label { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; font-weight: 700; color: var(--muted); }
.proj-chip {
  display: flex; align-items: center; gap: 5px; flex: 1; min-width: 0; padding: 5px 9px;
  border: 1px solid var(--line); border-radius: 8px; background: var(--bg-2);
  color: var(--ink); font-size: 11.5px; font-family: ui-monospace, Menlo, monospace; cursor: pointer;
}
.proj-chip:hover { border-color: var(--accent); }
.proj-chip .proj-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; }
.proj-caret { color: var(--muted); font-family: inherit; }
.proj-pop {
  position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 25;
  display: none; max-height: 60vh; overflow-y: auto; padding: 10px;
  background: var(--bg-2); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow);
}
.proj-pop.open { display: block; }
.pp-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
.pp-x { padding: 0 4px; border: 0; border-radius: 5px; background: transparent; color: var(--muted); font-size: 12px; line-height: 1; cursor: pointer; }
.pp-x:hover { background: var(--bg-3); color: var(--ink); }
.pp-cur { margin-bottom: 8px; font-size: 11.5px; line-height: 1.45; color: var(--muted); }
.pp-cur b { color: var(--ink); font-family: ui-monospace, Menlo, monospace; }
.pp-list { display: flex; flex-direction: column; gap: 2px; max-height: 30vh; overflow-y: auto; }
.pp-proj {
  display: flex; align-items: center; gap: 6px; padding: 5px 8px; border: 1px solid transparent;
  border-radius: 7px; font-size: 11.5px; color: var(--ink);
}
.pp-proj.on { border-color: var(--accent); }
.pp-proj-n { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pp-badge {
  flex: none; padding: 1px 6px; border-radius: 999px; background: var(--bg-3);
  color: var(--muted); font-size: 10px; white-space: nowrap;
}
.pp-empty { padding: 8px 6px; font-size: 11px; line-height: 1.5; color: var(--muted); }
.pp-empty code { font-family: ui-monospace, Menlo, monospace; color: var(--ink); }
.pp-clear {
  margin-top: 8px; padding: 5px 8px; border: 1px solid var(--line); border-radius: 7px;
  background: var(--bg); color: var(--muted); font-size: 11px; cursor: pointer;
}
.pp-clear:hover { border-color: var(--pin); color: var(--pin); }
.pp-sep { height: 1px; margin: 10px 0; background: var(--line); }
.pp-env { display: flex; align-items: center; gap: 6px; padding: 4px 6px; border-radius: 7px; }
.pp-env:hover { background: var(--bg-3); }
.pp-env-u { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ui-monospace, Menlo, monospace; font-size: 11px; color: var(--ink); }
.pp-add { display: flex; gap: 6px; margin-top: 6px; }
.pp-env-url {
  flex: 1; min-width: 0; padding: 6px 8px; border: 1px solid var(--line); border-radius: 8px;
  background: var(--bg); color: var(--ink); font-size: 11.5px;
}
.pp-env-url:focus { outline: none; border-color: var(--accent); }
.pp-add-b {
  flex: none; padding: 6px 10px; border: 1px solid var(--accent); border-radius: 8px;
  background: var(--accent); color: #fff; font-size: 11.5px; font-weight: 600; cursor: pointer;
}
.pp-err { margin-top: 6px; font-size: 11px; color: var(--pin); }
.hver { font-family: ui-monospace, Menlo, monospace; }
.menu-ver {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  margin: 8px 4px 2px; padding-top: 8px; border-top: 1px solid var(--line);
  font-size: 10.5px; color: var(--muted);
}
.menu-ver b { color: var(--ink); font-family: ui-monospace, Menlo, monospace; font-weight: 600; }
.menu-mode { text-transform: uppercase; letter-spacing: .06em; font-size: 9.5px; }
/* The host package's version, shown only when it differs from this bundle's (a stale publish). */
.ver-stale { color: var(--pin); font-family: ui-monospace, Menlo, monospace; font-weight: 600; cursor: help; }

/* ------------------------------------------------ tickets between projects */
.srcchip, .fwdchip {
  padding: 1px 6px; border-radius: 999px; white-space: nowrap; font-size: 10px;
  border: 1px solid var(--line); background: var(--bg); color: var(--muted);
  max-width: 140px; overflow: hidden; text-overflow: ellipsis;
}
.fwdchip { border-color: var(--accent); color: var(--accent); }
.fwdchip.bad { border-color: #d9534f; color: #d9534f; }
a.fwdchip { text-decoration: none; cursor: pointer; }
.fwdchip[class*="st-"] { max-width: 220px; }
.fwdchip.st-queue { border-color: var(--line); color: var(--muted); }
.fwdchip.st-in_progress { border-color: #3f8ae0; color: #3f8ae0; }
.fwdchip.st-in_review { border-color: #c98a1b; color: #c98a1b; }
.fwdchip.st-resolved { border-color: #2f9e6a; color: #2f9e6a; }

/* ------------------------------------------------ lifecycle chips + review flow */
.lifechip {
  padding: 1px 6px; border-radius: 999px; white-space: nowrap;
  border: 1px solid var(--line); background: var(--bg); color: var(--muted);
  font-size: 9.5px; font-weight: 700; letter-spacing: .02em; text-transform: uppercase;
}
.lifechip.st-sent { border-color: var(--accent); color: var(--accent); }
.lifechip.st-in_pr { border-color: #3f8ae0; color: #3f8ae0; }
.lifechip.st-preview { border-color: var(--accent); background: var(--accent); color: #fff; }
.lifechip.st-reviewed { border-color: #2f9e6a; color: #2f9e6a; }
.prchip {
  padding: 1px 6px; border-radius: 6px; text-decoration: none; cursor: pointer;
  border: 1px solid #3f8ae0; background: var(--bg); color: #3f8ae0;
  font-family: ui-monospace, Menlo, monospace; font-size: 10px; font-weight: 700;
}
.prchip:hover { background: #3f8ae0; color: #fff; }
.prchip.st-merged { border-color: #8250df; color: #8250df; }
.prchip.st-merged:hover { background: #8250df; color: #fff; }
.prchip.st-closed { border-color: var(--line); color: var(--muted); }
/* a revision of another thread — the conversation carried over */
.iterchip {
  padding: 1px 6px; border-radius: 999px; white-space: nowrap;
  border: 1px dashed var(--line); background: var(--bg); color: var(--muted);
  font-size: 9.5px; font-weight: 700; letter-spacing: .02em; text-transform: uppercase;
}
/* a preview that is actually live — never shown optimistically */
.previewchip {
  padding: 1px 6px; border-radius: 6px; text-decoration: none; white-space: nowrap;
  border: 1px solid #2f9e6a; background: var(--bg); color: #2f9e6a;
  font-size: 9.5px; font-weight: 700; letter-spacing: .02em; text-transform: uppercase;
}
.previewchip:hover { background: #2f9e6a; color: #fff; }
/* checks meter — a numerator over a thin bar */
.checks { display: inline-flex; align-items: center; gap: 4px; }
.checks-n { font-family: ui-monospace, Menlo, monospace; font-size: 9.5px; color: var(--muted); font-variant-numeric: tabular-nums; }
.checks-bar { display: block; width: 26px; height: 3px; border-radius: 2px; background: var(--line); overflow: hidden; }
.checks-bar i { display: block; height: 100%; background: #2f9e6a; }

/* the "N waiting on your review" strip above the list */
.reviewbar {
  display: flex; align-items: center; gap: 7px; margin: 8px 12px 0; padding: 7px 10px;
  border: 1px solid var(--accent); border-radius: 9px; background: var(--bg-2);
}
.rb-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); flex: none; animation: loupe-pulse 1.6s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .rb-dot { animation: none; } }
.rb-t { flex: 1; font-size: 11.5px; color: var(--ink); }
.rb-t b { font-variant-numeric: tabular-nums; }
.rb-b {
  padding: 3px 9px; border: 1px solid var(--accent); border-radius: 7px;
  background: var(--accent); color: #fff; font-size: 11px; font-weight: 600; cursor: pointer;
}

/* the review banner inside a thread */
.revbanner {
  display: flex; align-items: center; gap: 6px; margin: 8px 0; padding: 7px 8px;
  border: 1px solid var(--accent); border-radius: 9px; background: var(--bg-3);
}
.rev-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); flex: none; }
.rev-t { flex: 1; font-size: 11.5px; font-weight: 600; color: var(--ink); }
.rev-approve {
  padding: 4px 10px; border: 1px solid var(--accent); border-radius: 7px;
  background: var(--accent); color: #fff; font-size: 11px; font-weight: 600; cursor: pointer;
}
.rev-approve:disabled { opacity: .6; cursor: default; }
.rev-comment, .rev-origin {
  padding: 4px 8px; border: 1px solid var(--line); border-radius: 7px;
  background: var(--bg); color: var(--ink); font-size: 11px; cursor: pointer;
}
.rev-comment:hover, .rev-origin:hover { border-color: var(--accent); }

/* original request beside the proposed change */
.origin { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; margin: 8px 0; }
.or-col { min-width: 0; padding: 7px 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); }
.or-h { margin-bottom: 4px; font-size: 9.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
.or-b { font-size: 11px; line-height: 1.45; color: var(--ink); white-space: pre-wrap; overflow-wrap: anywhere; }
.or-code {
  margin: 6px 0 0; padding: 6px; max-height: 130px; overflow: auto; border-radius: 6px;
  background: var(--bg-2); color: var(--muted); font-family: ui-monospace, Menlo, monospace;
  font-size: 10px; white-space: pre-wrap; overflow-wrap: anywhere;
}

/* ------------------------------------------------- consent-gated agent navigation */
.consent {
  margin: 8px 10px 0; padding: 10px; border: 1px solid var(--pin); border-radius: 10px;
  background: var(--bg-2);
}
.cs-head { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ink); }
.cs-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--pin); flex: none; animation: loupe-pulse 1.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .cs-dot { animation: none; } }
.cs-url {
  margin-top: 6px; padding: 6px 7px; border-radius: 7px; background: var(--bg);
  font-family: ui-monospace, Menlo, monospace; font-size: 10.5px; color: var(--ink);
  overflow-wrap: anywhere;
}
.cs-why { margin-top: 6px; font-size: 11.5px; line-height: 1.45; color: var(--muted); }
.cs-btns { display: flex; justify-content: flex-end; gap: 6px; margin-top: 9px; }
.cs-btns button { padding: 5px 10px; border-radius: 7px; font-size: 11.5px; font-weight: 600; cursor: pointer; }
.cs-deny { border: 1px solid var(--line); background: var(--bg); color: var(--ink); }
.cs-deny:hover { border-color: var(--accent); }
.cs-go { border: 1px solid var(--accent); background: var(--accent); color: #fff; }

/* --------------------------------------------------------------- generate + iterate */
.genwrap { margin-top: 8px; }
.gen-open {
  width: 100%; padding: 7px; border: 1px dashed var(--line); border-radius: 8px;
  background: transparent; color: var(--muted); font-size: 11.5px; font-weight: 600; cursor: pointer;
}
.gen-open:hover { border-color: var(--accent); color: var(--accent); }
.genhead { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.gen-t { flex: 1; font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); }
.gen-nav { display: inline-flex; align-items: center; gap: 2px; }
.gen-step {
  width: 20px; height: 20px; padding: 0; border: 1px solid var(--line); border-radius: 6px;
  background: var(--bg); color: var(--ink); font-size: 13px; line-height: 1; cursor: pointer;
}
.gen-step:disabled { opacity: .4; cursor: default; }
.gen-n { min-width: 32px; text-align: center; font-size: 10.5px; color: var(--muted); font-variant-numeric: tabular-nums; }
.gen-undo, .gen-x {
  padding: 3px 8px; border: 1px solid var(--line); border-radius: 7px;
  background: var(--bg); color: var(--ink); font-size: 11px; cursor: pointer;
}
.gen-undo:disabled { opacity: .4; cursor: default; }
.gen-undo:hover, .gen-x:hover { border-color: var(--accent); }
.genbusy, .genempty { padding: 14px; text-align: center; font-size: 11.5px; color: var(--muted); }
/* the preview plane: generated markup over the original capture, sandboxed.
   min-height matters — the iframe is absolutely positioned, so a thread with no
   screenshot would otherwise give the plane nothing in-flow and collapse it to a
   couple of pixels. */
.genplane { position: relative; min-height: 150px; border: 1px solid var(--line); border-radius: 9px; overflow: hidden; background: var(--bg); }
.genbase { display: block; width: 100%; }
.genframe {
  position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: transparent;
  transition: opacity .08s linear;
}
.genslider { display: flex; align-items: center; gap: 7px; margin-top: 6px; }
.gs-lab { font-size: 10.5px; color: var(--muted); }
.gs-range { flex: 1; min-width: 0; accent-color: var(--accent); }
.gs-n { min-width: 32px; text-align: right; font-size: 10.5px; color: var(--muted); font-variant-numeric: tabular-nums; }
.gennotes {
  margin-top: 6px; padding: 6px 8px; border-radius: 7px; background: var(--bg-3);
  font-size: 11px; line-height: 1.45; color: var(--muted);
}
.geniter { display: flex; gap: 5px; margin-top: 7px; }
.iter-in {
  flex: 1; min-width: 0; padding: 6px 8px; border: 1px solid var(--line); border-radius: 8px;
  background: var(--bg); color: var(--ink); font-size: 11.5px;
}
.iter-in:focus { outline: none; border-color: var(--accent); }
.iter-send {
  flex: none; padding: 6px 10px; border: 1px solid var(--accent); border-radius: 8px;
  background: var(--accent); color: #fff; font-size: 11.5px; font-weight: 600; cursor: pointer;
}
.iter-send:disabled { opacity: .5; cursor: default; }
/* the access gate, when there is no generator */
.gengate { padding: 10px; border: 1px solid var(--line); border-radius: 9px; background: var(--bg-2); }
.gate-t { font-size: 12px; font-weight: 700; color: var(--ink); }
.gate-b { margin-top: 4px; font-size: 11.5px; line-height: 1.45; color: var(--muted); }
.gate-ask {
  margin-top: 8px; padding: 6px 10px; border: 1px solid var(--accent); border-radius: 8px;
  background: var(--accent); color: #fff; font-size: 11.5px; font-weight: 600; cursor: pointer;
}
.gate-ask:disabled { opacity: .6; cursor: default; }
.gate-hint { margin-top: 7px; font-size: 10.5px; color: var(--muted); }
.gate-hint code { font-family: ui-monospace, Menlo, monospace; color: var(--ink); }

/* dictation */
.voice {
  width: 30px; flex: none; padding: 0; border: 1px solid var(--line); border-radius: 8px;
  background: var(--bg-2); color: var(--muted); font-size: 13px; cursor: pointer;
}
.voice:hover:not(:disabled) { border-color: var(--accent); color: var(--ink); }
.voice:disabled { opacity: .45; cursor: not-allowed; }
.voice.on { border-color: var(--pin); color: var(--pin); background: var(--bg-3); }

/* attachments on a reply */
.reply-attach {
  padding: 3px 7px; border: 1px solid var(--line); border-radius: 7px;
  background: var(--bg); color: var(--muted); font-size: 12px; cursor: pointer; line-height: 1.4;
}
.reply-attach:hover { border-color: var(--accent); color: var(--accent); }
.reply-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; }
.msg-atts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.msg-att {
  max-width: 190px; max-height: 130px; border: 1px solid var(--line); border-radius: 8px;
  object-fit: cover; cursor: pointer; background: var(--bg-2);
}

/* ------------------------------------------------------------- companion chat */
/* Same inset as the Activity view — without it the composer and its Send button sit
   flush against the panel's edge, which reads as a clipped button. Scoped to .view.on:
   a bare .chat-view display:flex outranked .view display:none by source
   order, so the chat rendered under every other tab and swallowed their clicks. */
.view.on.chat-view { display: flex; flex-direction: column; gap: 8px; height: 100%; min-height: 0; padding: 10px 12px 16px; }
.chat-tray {
  display: flex; flex-direction: column; gap: 4px; padding: 8px;
  border: 1px solid var(--line); border-radius: 10px; background: var(--bg-2);
}
.tray-head { display: flex; align-items: center; gap: 6px; }
.tray-title { font-size: 11px; color: var(--muted); }
.tray-spacer, .chat-spacer { flex: 1; }
.tray-chip {
  display: flex; align-items: center; gap: 6px; padding: 4px 6px;
  border: 1px solid var(--line); border-radius: 8px; background: var(--bg); font-size: 11px;
}
.tray-chip.off { opacity: .5; }
.tray-thumb { width: 24px; height: 24px; border-radius: 4px; object-fit: cover; flex: none; }
.tray-kind { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; flex: none; }
.tray-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ui-monospace, monospace; }
.tray-nudge, .tray-x {
  border: 0; background: transparent; color: var(--muted); cursor: pointer;
  font-size: 11px; padding: 1px 4px; border-radius: 4px; line-height: 1.2;
}
.tray-nudge:disabled { opacity: .3; cursor: default; }
.tray-nudge:not(:disabled):hover, .tray-x:hover { color: var(--accent); background: var(--accent-soft); }
.chat-log { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding: 2px; }
.chat-empty { color: var(--muted); font-size: 12px; padding: 12px 4px; line-height: 1.5; }
.chat-msg { padding: 8px 10px; border-radius: 10px; background: var(--bg-2); border: 1px solid var(--line); }
.chat-msg.mine { background: var(--accent-soft); border-color: var(--accent); }
.chat-head { display: flex; align-items: baseline; gap: 6px; margin-bottom: 3px; }
.chat-who { font-size: 11px; }
.chat-when { font-size: 10px; color: var(--muted); }
.chat-ctx {
  font-size: 10px; color: var(--accent); border: 1px solid var(--accent);
  border-radius: 999px; padding: 0 5px; margin-left: auto;
}
.chat-body { font-size: 12px; white-space: pre-wrap; word-break: break-word; }
.chat-compose { border-top: 1px solid var(--line); padding-top: 8px; }
.chat-in {
  width: 100%; resize: vertical; min-height: 44px; padding: 7px 9px;
  border: 1px solid var(--line); border-radius: 9px; background: var(--bg);
  color: var(--ink); font: inherit; font-size: 12.5px;
}
.chat-in:focus { outline: none; border-color: var(--accent); }
.chat-foot { display: flex; align-items: center; gap: 6px; margin-top: 6px; }
.chat-add, .chat-mic, .chat-send {
  padding: 4px 9px; border: 1px solid var(--line); border-radius: 7px;
  background: var(--bg); color: var(--ink); font-size: 11px; cursor: pointer;
}
.chat-add:hover, .chat-mic:hover { border-color: var(--accent); color: var(--accent); }
.chat-mic.on { border-color: var(--err, #f2555a); color: #f2555a; background: color-mix(in srgb, #f2555a 14%, transparent); }
.chat-send { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
.chat-send:hover { opacity: .9; }
.chat-rec { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: #f2555a; }
.chat-rec-dot { width: 7px; height: 7px; border-radius: 50%; background: #f2555a; animation: chatpulse 1.2s ease-in-out infinite; }
@keyframes chatpulse { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
.chat-err { font-size: 11px; color: #f2555a; }

/* reactions */
.rxns { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-top: 6px; position: relative; }
.rxn {
  display: inline-flex; align-items: center; gap: 3px; padding: 1px 7px;
  border: 1px solid var(--line); border-radius: 999px; background: var(--bg);
  color: var(--ink); font-size: 11px; cursor: pointer; line-height: 1.7;
}
.rxn:hover { border-color: var(--accent); }
.rxn.mine { border-color: var(--accent); background: var(--accent-soft); }
.rxn-n { color: var(--muted); font-size: 10px; font-variant-numeric: tabular-nums; }
.rxn.mine .rxn-n { color: var(--accent); }
.rxn-add {
  width: 20px; height: 20px; padding: 0; border: 1px dashed var(--line); border-radius: 50%;
  background: transparent; color: var(--muted); font-size: 11px; cursor: pointer; line-height: 1;
}
.rxn-add:hover { border-color: var(--accent); color: var(--accent); }
.rxn-pick {
  display: flex; gap: 2px; padding: 3px; border: 1px solid var(--line); border-radius: 999px;
  background: var(--bg); box-shadow: 0 4px 14px rgb(0 0 0 / 18%); z-index: 3;
}
.rxn-opt {
  width: 24px; height: 24px; padding: 0; border: 0; border-radius: 50%;
  background: transparent; font-size: 14px; cursor: pointer; line-height: 1;
}
.rxn-opt:hover { background: var(--accent-soft); }

/* who else is here */
.peers { display: flex; align-items: center; gap: -2px; margin-right: 8px; }
.peer-av {
  display: inline-flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; margin-left: -5px; border-radius: 50%;
  border: 2px solid var(--bg); background: var(--accent); color: #fff;
  font-size: 9px; font-weight: 700; letter-spacing: .02em;
}
.peer-av:first-child { margin-left: 0; }
.peer-more { margin-left: 3px; font-size: 10px; color: var(--muted); }

/* in-app mentions */
.hnotif { margin-top: 10px; }
.nf-head { display: flex; align-items: center; gap: 6px; margin-bottom: 5px; font-size: 11.5px; color: var(--ink); }
.nf-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); flex: none; }
.nf-i {
  display: flex; align-items: baseline; gap: 7px; width: 100%; text-align: left;
  padding: 6px 8px; margin-bottom: 4px; border: 1px solid var(--accent); border-radius: 8px;
  background: var(--bg-2); color: var(--ink); font-size: 11px; cursor: pointer;
}
.nf-i:hover { background: var(--bg-3); }
.nf-b { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nf-w { flex: none; color: var(--muted); font-size: 10.5px; }
.nf-read {
  margin-top: 2px; padding: 4px 8px; border: 1px solid var(--line); border-radius: 7px;
  background: var(--bg); color: var(--muted); font-size: 10.5px; cursor: pointer;
}
.nf-read:hover { border-color: var(--accent); color: var(--ink); }

/* mention highlighting + autocomplete */
.mention { color: var(--accent); font-weight: 600; }
.mention-list {
  display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;
  padding: 5px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg-2);
}
.mention-pick {
  padding: 3px 8px; border: 1px solid var(--line); border-radius: 999px;
  background: var(--bg); color: var(--ink); font-size: 11px; cursor: pointer;
}
.mention-pick:hover { border-color: var(--accent); color: var(--accent); }
/* "needs you" — the two reasons the stage cannot express */
.needsline {
  display: flex; align-items: center; gap: 7px; margin: 8px 0; padding: 7px 9px;
  border: 1px solid #e0a92c; border-radius: 9px; background: var(--bg-2);
  font-size: 11.5px; font-weight: 600; color: var(--ink);
}
.needs-dot { width: 7px; height: 7px; border-radius: 50%; background: #e0a92c; flex: none; }

/* ------------------------------------------------------------- conversation */
.convo { margin-top: 8px; }
.convo-loading { padding: 10px; text-align: center; font-size: 11.5px; color: var(--muted); }
.msgs { display: flex; flex-direction: column; gap: 6px; }
.msg { padding: 7px 8px; border-radius: 9px; background: var(--bg-2); border: 1px solid transparent; }
/* An agent's reply is called out with a left accent bar and a lighter container —
   it should be obvious at a glance who you are talking to. */
.msg.agent { border-left: 3px solid var(--accent); background: var(--bg-3); }
.msg.pending { opacity: .65; }
.msg.failed { border-color: var(--pin); }
.msg-head { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
.msg-av {
  width: 20px; height: 20px; border-radius: 50%; flex: none;
  display: grid; place-items: center; background: var(--bg-3); color: var(--muted);
  font-size: 10px; font-weight: 700;
}
.msg-av.agent { background: var(--accent); color: #fff; }
.msg-name { font-size: 11.5px; color: var(--ink); }
.msg-when { flex: 1; font-size: 10.5px; color: var(--muted); }
.msg-tag {
  padding: 0 5px; border-radius: 999px; background: var(--accent); color: #fff;
  font-size: 9px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
}
.msg-body { font-size: 11.5px; line-height: 1.45; color: var(--ink); white-space: pre-wrap; overflow-wrap: anywhere; }
.msg-state { margin-top: 4px; font-size: 10.5px; color: var(--muted); }
.msg-state.failed { color: var(--pin); }
.msg-retry {
  margin-left: 6px; padding: 1px 7px; border: 1px solid var(--pin); border-radius: 6px;
  background: transparent; color: var(--pin); font-size: 10.5px; cursor: pointer;
}
.reply { margin-top: 7px; }
.reply-in {
  width: 100%; resize: vertical; min-height: 40px; padding: 7px 8px;
  border: 1px solid var(--line); border-radius: 9px; background: var(--bg);
  color: var(--ink); font: inherit; font-size: 11.5px;
}
.reply-in:focus { outline: none; border-color: var(--accent); }
.reply-foot { display: flex; align-items: center; gap: 7px; margin-top: 5px; }
.reply-hint { flex: 1; font-size: 10.5px; color: var(--muted); }
.reply-send {
  padding: 5px 10px; border: 1px solid var(--accent); border-radius: 8px;
  background: var(--accent); color: #fff; font-size: 11.5px; font-weight: 600; cursor: pointer;
}
/* the activity timeline */
.tl { margin-top: 10px; }
.tl-h { margin-bottom: 5px; font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
.tl-i { position: relative; padding: 0 0 7px 14px; font-size: 11px; color: var(--muted); }
.tl-i::before { content: ""; position: absolute; left: 3px; top: 4px; bottom: -3px; width: 1px; background: var(--line); }
.tl-i:last-child::before { display: none; }
.tl-dot { position: absolute; left: 0; top: 3px; width: 7px; height: 7px; border-radius: 50%; background: var(--line); }
.tl-i.tl-resolved .tl-dot { background: #2f9e6a; }
.tl-i.tl-pr .tl-dot, .tl-i.tl-preview .tl-dot { background: #3f8ae0; }
.tl-i.tl-review .tl-dot { background: var(--accent); }
.tl-l { color: var(--ink); }
.tl-d { display: block; font-size: 10.5px; color: var(--muted); overflow-wrap: anywhere; }
.copyrow { display: flex; gap: 6px; margin-top: 8px; }
.copy-b {
  flex: 1; padding: 5px 8px; border: 1px solid var(--line); border-radius: 8px;
  background: var(--bg-2); color: var(--muted); font-size: 11px; cursor: pointer;
}
.copy-b:hover { border-color: var(--accent); color: var(--ink); }

/* ------------------------------------------------------- hint card (once per view) */
.hint {
  position: relative; margin: 8px 12px 0; padding: 10px 28px 10px 11px;
  border: 1px solid var(--accent); border-radius: 10px; background: var(--bg-2);
}
.hint-t { margin-bottom: 3px; font-size: 12.5px; font-weight: 700; color: var(--ink); }
.hint-b { font-size: 11.5px; line-height: 1.45; color: var(--muted); }
.hint-off { display: inline-block; margin-top: 6px; padding: 0; border: 0; background: transparent; color: var(--accent); font-size: 11px; text-decoration: underline; cursor: pointer; }
.hint-x {
  position: absolute; top: 6px; right: 6px; width: 18px; height: 18px; padding: 0;
  border: 0; border-radius: 5px; background: transparent; color: var(--muted); font-size: 13px; line-height: 1; cursor: pointer;
}
.hint-x:hover { background: var(--bg-3); color: var(--ink); }

/* ---------------------------------------------------------------- guided tour */
/* Non-modal on purpose: the dimmer and the spotlight are click-through, so a tour
   can never trap someone mid-task. Only the card itself takes pointer events. */
.tour { position: fixed; inset: 0; z-index: 2147483200; display: none; pointer-events: none; }
.tour.open { display: block; }
.tour-spot {
  position: fixed; border: 2px solid var(--accent); border-radius: 10px; pointer-events: none;
  box-shadow: 0 0 0 9999px rgba(8, 10, 16, .62);
  transition: all .18s ease;
}
.tour-card {
  position: fixed; width: 252px; padding: 12px; pointer-events: auto;
  background: var(--bg-2); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); color: var(--ink);
}
.tour-title { margin-bottom: 4px; font-size: 13px; font-weight: 700; }
.tour-body { font-size: 11.5px; line-height: 1.5; color: var(--muted); }
.tour-foot { display: flex; align-items: center; gap: 6px; margin-top: 10px; }
.tour-dots { display: flex; flex: 1; gap: 4px; }
.tour-dots i { width: 5px; height: 5px; border-radius: 50%; background: var(--line); }
.tour-dots i.on { background: var(--accent); }
.tour-foot button {
  padding: 5px 9px; border: 1px solid var(--line); border-radius: 7px;
  background: var(--bg); color: var(--ink); font-size: 11.5px; font-weight: 600; cursor: pointer;
}
.tour-foot .t-next { border-color: var(--accent); background: var(--accent); color: #fff; }
.tour-foot .t-skip { border: 0; background: transparent; color: var(--muted); }

/* Mobile: left/right/float docking is a desktop affordance. On small screens the
   panel collapses to a bottom sheet that OVERLAYS the page (pushing a side dock
   here would squeeze the page to a useless sliver), regardless of the chosen dock
   mode. !important overrides the inline geometry JS applies for float mode. */
@media (max-width: 640px) {
  .dock.open {
    top: auto !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
    width: auto !important; height: 76vh !important;
    border-width: 1px 0 0 0 !important; border-radius: 16px 16px 0 0 !important;
  }
  .dctl [data-role="pos"], .dctl .gap { display: none; } /* dock positions don't apply on mobile */
  .menu { min-width: 190px; }
  .resize { display: none !important; }
  .tools button { flex: 1; justify-content: center; } /* full-width tap targets */
  .dock.mode-bottom .list { grid-template-columns: 1fr; }
  .fab-cluster { bottom: 16px; right: 16px; }
  /* While a tool is active, shrink the sheet to just header + tools so most of the
     page stays visible and tappable; the list returns when the tool closes. */
  .dock.inspecting { height: auto !important; }
  .dock.inspecting .listhead, .dock.inspecting .list { display: none; }
  /* The composer is a bottom sheet on a phone: full width, thumb-reachable, and it
     scrolls when the on-screen keyboard is up. JS sets its position inline (hence the
     !important) — on small screens the sheet wins. */
  .composer {
    top: auto !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
    width: auto !important; max-height: 80vh; overflow-y: auto;
    border-radius: 16px 16px 0 0; padding-bottom: 16px;
  }
}
`;
