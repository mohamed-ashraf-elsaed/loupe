"use strict";
var Loupe = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/index.ts
  var src_exports = {};
  __export(src_exports, {
    clearActivity: () => clearActivity,
    connectTab: () => connectTab,
    destroy: () => destroy,
    hideLauncher: () => hideLauncher,
    init: () => init,
    openTool: () => openTool,
    requestNavigation: () => requestNavigation2,
    setActivityStatus: () => setActivityStatus,
    setLocalAi: () => setLocalAi,
    showLauncher: () => showLauncher,
    trackActivity: () => trackActivity,
    version: () => SDK_VERSION
  });

  // src/styles.ts
  var STYLES = (
    /* css */
    `
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
.dctl button {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; padding: 0; border: 0; border-radius: 6px;
  background: transparent; color: var(--muted); cursor: pointer;
}
.dctl button:hover { background: var(--bg-3); color: var(--ink); }
.dctl button.on { background: var(--bg-3); color: var(--accent); }
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
   chip, a checks meter and the caret \u2014 more than fits on one line in a narrow
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
.hempty { padding: 14px; text-align: center; color: var(--muted); font-size: 12px; }
.hfoot { margin-top: 14px; padding-top: 10px; border-top: 1px solid var(--line); font-size: 11px; color: var(--muted); text-align: center; }

/* Timeline grouping (project scope) + the repo filter. */
.daylabel { margin: 8px 2px 0; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); font-weight: 700; }
/* The page a comment belongs to, shown in the project scope (Settings \u2192 Page paths). */
.pathtag {
  padding: 1px 6px; border-radius: 999px; background: var(--bg-3); color: var(--muted);
  font-size: 10.5px; font-family: ui-monospace, Menlo, monospace;
  max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.listhead .reposel {
  margin-left: 6px; font-size: 11px; padding: 3px 6px; border: 1px solid var(--line);
  border-radius: 7px; background: var(--bg-2); color: var(--ink);
  text-transform: none; letter-spacing: 0; max-width: 130px;
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
.proj-chip .proj-repo { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; }
.proj-chip.unset .proj-repo { color: var(--muted); font-style: italic; }
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
.pp-search {
  width: 100%; margin-bottom: 6px; padding: 6px 8px; border: 1px solid var(--line);
  border-radius: 8px; background: var(--bg); color: var(--ink); font-size: 12px;
}
.pp-search:focus { outline: none; border-color: var(--accent); }
.pp-list { display: flex; flex-direction: column; gap: 2px; max-height: 30vh; overflow-y: auto; }
.pp-item {
  padding: 6px 8px; border: 1px solid transparent; border-radius: 7px; background: transparent;
  color: var(--ink); font-size: 11.5px; font-family: ui-monospace, Menlo, monospace;
  text-align: left; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.pp-item:hover { background: var(--bg-3); }
.pp-item.on { border-color: var(--accent); color: var(--accent); }
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
/* a revision of another thread \u2014 the conversation carried over */
.iterchip {
  padding: 1px 6px; border-radius: 999px; white-space: nowrap;
  border: 1px dashed var(--line); background: var(--bg); color: var(--muted);
  font-size: 9.5px; font-weight: 700; letter-spacing: .02em; text-transform: uppercase;
}
/* a preview that is actually live \u2014 never shown optimistically */
.previewchip {
  padding: 1px 6px; border-radius: 6px; text-decoration: none; white-space: nowrap;
  border: 1px solid #2f9e6a; background: var(--bg); color: #2f9e6a;
  font-size: 9.5px; font-weight: 700; letter-spacing: .02em; text-transform: uppercase;
}
.previewchip:hover { background: #2f9e6a; color: #fff; }
/* checks meter \u2014 a numerator over a thin bar */
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
   min-height matters \u2014 the iframe is absolutely positioned, so a thread with no
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
/* Same inset as the Activity view \u2014 without it the composer and its Send button sit
   flush against the panel's edge, which reads as a clipped button. */
.chat-view { display: flex; flex-direction: column; gap: 8px; height: 100%; min-height: 0; padding: 10px 12px 16px; }
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
/* "needs you" \u2014 the two reasons the stage cannot express */
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
/* An agent's reply is called out with a left accent bar and a lighter container \u2014
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
     !important) \u2014 on small screens the sheet wins. */
  .composer {
    top: auto !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
    width: auto !important; max-height: 80vh; overflow-y: auto;
    border-radius: 16px 16px 0 0; padding-bottom: 16px;
  }
}
`
  );

  // src/fingerprint.ts
  var TEXT_MAX = 120;
  var ATTR_KEYS = ["role", "aria-label", "name", "type", "alt", "href", "placeholder", "title"];
  var ACCEPT_THRESHOLD = 0.5;
  var W = { tag: 0.12, text: 0.34, attrs: 0.22, testid: 0.22, cssPath: 0.2, position: 0.1 };
  function captureAnchor(el2) {
    const rect = el2.getBoundingClientRect();
    return {
      tag: el2.tagName.toLowerCase(),
      cssPath: cssPath(el2),
      xpath: xPath(el2),
      testid: stableId(el2),
      text: normText(el2.textContent),
      attrs: readAttrs(el2),
      nthOfType: nthOfType(el2),
      rect: {
        x: Math.round(rect.left + window.scrollX),
        y: Math.round(rect.top + window.scrollY),
        w: Math.round(rect.width),
        h: Math.round(rect.height)
      },
      viewport: { w: window.innerWidth, h: window.innerHeight }
    };
  }
  function resolveAnchor(anchor, root = document) {
    if (anchor.testid) {
      const byTestid = safeQueryAll(root, `[data-testid="${cssStr(anchor.testid)}"], [data-test="${cssStr(anchor.testid)}"]`);
      const byId = document.getElementById(anchor.testid);
      const hits = dedupe([...byTestid, ...byId ? [byId] : []]).filter(usable);
      if (hits.length === 1) return { element: hits[0], score: 0.98, via: "testid" };
    }
    if (/^(\[data-testid=|#)/.test(anchor.cssPath)) {
      const hits = safeQueryAll(root, anchor.cssPath).filter(usable);
      if (hits.length === 1 && hits[0].tagName.toLowerCase() === anchor.tag) {
        return { element: hits[0], score: 0.9, via: "cssPath" };
      }
    }
    const candidates = /* @__PURE__ */ new Map();
    const consider = (el2, via) => {
      if (el2 && usable(el2) && !candidates.has(el2)) candidates.set(el2, via);
    };
    consider(safeQuery(root, anchor.cssPath), "cssPath");
    consider(byXPath(anchor.xpath), "xpath");
    for (const el2 of safeQueryAll(root, anchor.tag)) consider(el2, "scan");
    if (anchor.text) {
      for (const el2 of safeQueryAll(root, "*")) {
        if (candidates.size > 4e3) break;
        if (normText(el2.textContent) === anchor.text) consider(el2, "scan");
      }
    }
    let best = null;
    for (const [el2, via] of candidates) {
      const score = similarity(anchor, el2, via);
      if (!best || score > best.score) best = { element: el2, score, via };
    }
    return best && best.score >= ACCEPT_THRESHOLD ? best : null;
  }
  function similarity(a, el2, via) {
    let sum = 0;
    let total = 0;
    const add = (w, v) => {
      sum += w * v;
      total += w;
    };
    add(W.tag, el2.tagName.toLowerCase() === a.tag ? 1 : 0);
    if (a.text) {
      const t = normText(el2.textContent);
      add(W.text, t === a.text ? 1 : t && (t.includes(a.text) || a.text.includes(t)) ? 0.5 : 0);
    }
    const attrKeys = Object.keys(a.attrs ?? {});
    if (attrKeys.length) {
      let matched = 0;
      for (const k of attrKeys) if (el2.getAttribute(k) === (a.attrs ?? {})[k]) matched++;
      add(W.attrs, matched / attrKeys.length);
    }
    if (a.testid) add(W.testid, stableId(el2) === a.testid ? 1 : 0);
    add(W.cssPath, via === "cssPath" ? 1 : 0);
    const r = el2.getBoundingClientRect();
    const cx = r.left + window.scrollX + r.width / 2;
    const cy = r.top + window.scrollY + r.height / 2;
    const ar = a.rect ?? { x: 0, y: 0, w: 0, h: 0 };
    const av = a.viewport ?? { w: 0, h: 0 };
    const ax = ar.x + ar.w / 2;
    const ay = ar.y + ar.h / 2;
    const diag = Math.hypot(av.w, av.h) || 1;
    const dist = Math.hypot(cx - ax, cy - ay);
    add(W.position, Math.max(0, 1 - dist / diag));
    return total ? sum / total : 0;
  }
  function cssPath(el2) {
    const segs = [];
    let node = el2;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      const id = node.getAttribute("id");
      const testid = node.getAttribute("data-testid") || node.getAttribute("data-test");
      if (id && isStable(id)) {
        segs.unshift(`#${cssEsc(id)}`);
        break;
      }
      if (testid) {
        segs.unshift(`[data-testid="${cssStr(testid)}"]`);
        break;
      }
      segs.unshift(`${node.tagName.toLowerCase()}:nth-of-type(${nthOfType(node)})`);
      node = node.parentElement;
      if (node === document.body) {
        segs.unshift("body");
        break;
      }
    }
    return segs.join(" > ");
  }
  function xPath(el2) {
    const segs = [];
    let node = el2;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      segs.unshift(`${node.tagName.toLowerCase()}[${nthOfType(node)}]`);
      node = node.parentElement;
    }
    return "/html/" + segs.join("/");
  }
  function nthOfType(el2) {
    let i = 1;
    let sib = el2.previousElementSibling;
    while (sib) {
      if (sib.tagName === el2.tagName) i++;
      sib = sib.previousElementSibling;
    }
    return i;
  }
  function stableId(el2) {
    const testid = el2.getAttribute("data-testid") || el2.getAttribute("data-test");
    if (testid) return testid;
    const id = el2.getAttribute("id");
    return id && isStable(id) ? id : null;
  }
  function isStable(id) {
    if (id.length > 40) return false;
    if (/^(ember|react|radix|headlessui|:r)/i.test(id)) return false;
    if (/[:]/.test(id)) return false;
    return true;
  }
  function readAttrs(el2) {
    const out = {};
    for (const k of ATTR_KEYS) {
      const v = el2.getAttribute(k);
      if (v != null && v !== "") out[k] = v.length > 200 ? v.slice(0, 200) : v;
    }
    return out;
  }
  function normText(t) {
    return (t || "").replace(/\s+/g, " ").trim().slice(0, TEXT_MAX);
  }
  function usable(el2) {
    if (el2.id === "loupe-root" || el2.closest("#loupe-root")) return false;
    if (el2 === document.body || el2 === document.documentElement) return false;
    return true;
  }
  function byXPath(xp) {
    try {
      const r = document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      return r.singleNodeValue instanceof Element ? r.singleNodeValue : null;
    } catch {
      return null;
    }
  }
  function safeQuery(root, sel) {
    try {
      return sel ? root.querySelector(sel) : null;
    } catch {
      return null;
    }
  }
  function safeQueryAll(root, sel) {
    try {
      return sel ? Array.from(root.querySelectorAll(sel)) : [];
    } catch {
      return [];
    }
  }
  function dedupe(els) {
    return Array.from(new Set(els));
  }
  function cssEsc(s) {
    return window.CSS && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, "\\$&");
  }
  function cssStr(s) {
    return s.replace(/["\\]/g, "\\$&");
  }

  // ../../node_modules/modern-screenshot/dist/index.mjs
  function changeJpegDpi(uint8Array, dpi) {
    uint8Array[13] = 1;
    uint8Array[14] = dpi >> 8;
    uint8Array[15] = dpi & 255;
    uint8Array[16] = dpi >> 8;
    uint8Array[17] = dpi & 255;
    return uint8Array;
  }
  var _P = "p".charCodeAt(0);
  var _H = "H".charCodeAt(0);
  var _Y = "Y".charCodeAt(0);
  var _S = "s".charCodeAt(0);
  var pngDataTable;
  function createPngDataTable() {
    const crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
      }
      crcTable[n] = c;
    }
    return crcTable;
  }
  function calcCrc(uint8Array) {
    let c = -1;
    if (!pngDataTable)
      pngDataTable = createPngDataTable();
    for (let n = 0; n < uint8Array.length; n++) {
      c = pngDataTable[(c ^ uint8Array[n]) & 255] ^ c >>> 8;
    }
    return c ^ -1;
  }
  function searchStartOfPhys(uint8Array) {
    const length = uint8Array.length - 1;
    for (let i = length; i >= 4; i--) {
      if (uint8Array[i - 4] === 9 && uint8Array[i - 3] === _P && uint8Array[i - 2] === _H && uint8Array[i - 1] === _Y && uint8Array[i] === _S) {
        return i - 3;
      }
    }
    return 0;
  }
  function changePngDpi(uint8Array, dpi, overwritepHYs = false) {
    const physChunk = new Uint8Array(13);
    dpi *= 39.3701;
    physChunk[0] = _P;
    physChunk[1] = _H;
    physChunk[2] = _Y;
    physChunk[3] = _S;
    physChunk[4] = dpi >>> 24;
    physChunk[5] = dpi >>> 16;
    physChunk[6] = dpi >>> 8;
    physChunk[7] = dpi & 255;
    physChunk[8] = physChunk[4];
    physChunk[9] = physChunk[5];
    physChunk[10] = physChunk[6];
    physChunk[11] = physChunk[7];
    physChunk[12] = 1;
    const crc = calcCrc(physChunk);
    const crcChunk = new Uint8Array(4);
    crcChunk[0] = crc >>> 24;
    crcChunk[1] = crc >>> 16;
    crcChunk[2] = crc >>> 8;
    crcChunk[3] = crc & 255;
    if (overwritepHYs) {
      const startingIndex = searchStartOfPhys(uint8Array);
      uint8Array.set(physChunk, startingIndex);
      uint8Array.set(crcChunk, startingIndex + 13);
      return uint8Array;
    } else {
      const chunkLength = new Uint8Array(4);
      chunkLength[0] = 0;
      chunkLength[1] = 0;
      chunkLength[2] = 0;
      chunkLength[3] = 9;
      const finalHeader = new Uint8Array(54);
      finalHeader.set(uint8Array, 0);
      finalHeader.set(chunkLength, 33);
      finalHeader.set(physChunk, 37);
      finalHeader.set(crcChunk, 50);
      return finalHeader;
    }
  }
  var b64PhysSignature1 = "AAlwSFlz";
  var b64PhysSignature2 = "AAAJcEhZ";
  var b64PhysSignature3 = "AAAACXBI";
  function detectPhysChunkFromDataUrl(dataUrl) {
    let b64index = dataUrl.indexOf(b64PhysSignature1);
    if (b64index === -1) {
      b64index = dataUrl.indexOf(b64PhysSignature2);
    }
    if (b64index === -1) {
      b64index = dataUrl.indexOf(b64PhysSignature3);
    }
    return b64index;
  }
  var PREFIX = "[modern-screenshot]";
  var IN_BROWSER = typeof window !== "undefined";
  var SUPPORT_WEB_WORKER = IN_BROWSER && "Worker" in window;
  var SUPPORT_ATOB = IN_BROWSER && "atob" in window;
  var SUPPORT_BTOA = IN_BROWSER && "btoa" in window;
  var USER_AGENT = IN_BROWSER ? window.navigator?.userAgent : "";
  var IN_CHROME = USER_AGENT.includes("Chrome");
  var IN_SAFARI = USER_AGENT.includes("AppleWebKit") && !IN_CHROME;
  var IN_FIREFOX = USER_AGENT.includes("Firefox");
  var isContext = (value) => value && "__CONTEXT__" in value;
  var isCssFontFaceRule = (rule) => rule.constructor.name === "CSSFontFaceRule";
  var isCSSImportRule = (rule) => rule.constructor.name === "CSSImportRule";
  var isLayerBlockRule = (rule) => rule.constructor.name === "CSSLayerBlockRule";
  var isElementNode = (node) => node.nodeType === 1;
  var isSVGElementNode = (node) => typeof node.className === "object";
  var isSVGImageElementNode = (node) => node.tagName === "image";
  var isSVGUseElementNode = (node) => node.tagName === "use";
  var isHTMLElementNode = (node) => isElementNode(node) && typeof node.style !== "undefined" && !isSVGElementNode(node);
  var isCommentNode = (node) => node.nodeType === 8;
  var isTextNode = (node) => node.nodeType === 3;
  var isImageElement = (node) => node.tagName === "IMG";
  var isVideoElement = (node) => node.tagName === "VIDEO";
  var isCanvasElement = (node) => node.tagName === "CANVAS";
  var isTextareaElement = (node) => node.tagName === "TEXTAREA";
  var isInputElement = (node) => node.tagName === "INPUT";
  var isStyleElement = (node) => node.tagName === "STYLE";
  var isScriptElement = (node) => node.tagName === "SCRIPT";
  var isSelectElement = (node) => node.tagName === "SELECT";
  var isSlotElement = (node) => node.tagName === "SLOT";
  var isIFrameElement = (node) => node.tagName === "IFRAME";
  var consoleWarn = (...args) => console.warn(PREFIX, ...args);
  function supportWebp(ownerDocument) {
    const canvas = ownerDocument?.createElement?.("canvas");
    if (canvas) {
      canvas.height = canvas.width = 1;
    }
    return Boolean(canvas) && "toDataURL" in canvas && Boolean(canvas.toDataURL("image/webp").includes("image/webp"));
  }
  var isDataUrl = (url) => url.startsWith("data:");
  function resolveUrl(url, baseUrl) {
    if (url.match(/^[a-z]+:\/\//i))
      return url;
    if (IN_BROWSER && url.match(/^\/\//))
      return window.location.protocol + url;
    if (url.match(/^[a-z]+:/i))
      return url;
    if (!IN_BROWSER)
      return url;
    const doc = getDocument().implementation.createHTMLDocument();
    const base = doc.createElement("base");
    const a = doc.createElement("a");
    doc.head.appendChild(base);
    doc.body.appendChild(a);
    if (baseUrl)
      base.href = baseUrl;
    a.href = url;
    return a.href;
  }
  function getDocument(target) {
    return (target && isElementNode(target) ? target?.ownerDocument : target) ?? window.document;
  }
  var XMLNS = "http://www.w3.org/2000/svg";
  function createSvg(width, height, ownerDocument) {
    const svg2 = getDocument(ownerDocument).createElementNS(XMLNS, "svg");
    svg2.setAttributeNS(null, "width", width.toString());
    svg2.setAttributeNS(null, "height", height.toString());
    svg2.setAttributeNS(null, "viewBox", `0 0 ${width} ${height}`);
    return svg2;
  }
  function svgToDataUrl(svg2, removeControlCharacter) {
    let xhtml = new XMLSerializer().serializeToString(svg2);
    if (removeControlCharacter) {
      xhtml = xhtml.replace(/[\u0000-\u0008\v\f\u000E-\u001F\uD800-\uDFFF\uFFFE\uFFFF]/gu, "");
    }
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xhtml)}`;
  }
  function readBlob(blob, type) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.onabort = () => reject(new Error(`Failed read blob to ${type}`));
      if (type === "dataUrl") {
        reader.readAsDataURL(blob);
      } else if (type === "arrayBuffer") {
        reader.readAsArrayBuffer(blob);
      }
    });
  }
  var blobToDataUrl = (blob) => readBlob(blob, "dataUrl");
  function createImage(url, ownerDocument) {
    const img = getDocument(ownerDocument).createElement("img");
    img.decoding = "sync";
    img.loading = "eager";
    img.src = url;
    return img;
  }
  function loadMedia(media, options) {
    return new Promise((resolve) => {
      const { timeout, ownerDocument, onError: userOnError, onWarn } = options ?? {};
      const node = typeof media === "string" ? createImage(media, getDocument(ownerDocument)) : media;
      let timer = null;
      let removeEventListeners = null;
      function onResolve() {
        resolve(node);
        timer && clearTimeout(timer);
        removeEventListeners?.();
      }
      if (timeout) {
        timer = setTimeout(onResolve, timeout);
      }
      if (isVideoElement(node)) {
        const currentSrc = node.currentSrc || node.src;
        if (!currentSrc) {
          if (node.poster) {
            return loadMedia(node.poster, options).then(resolve);
          }
          return onResolve();
        }
        if (node.readyState >= 2) {
          return onResolve();
        }
        const onLoadeddata = onResolve;
        const onError = (error) => {
          onWarn?.(
            "Failed video load",
            currentSrc,
            error
          );
          userOnError?.(error);
          onResolve();
        };
        removeEventListeners = () => {
          node.removeEventListener("loadeddata", onLoadeddata);
          node.removeEventListener("error", onError);
        };
        node.addEventListener("loadeddata", onLoadeddata, { once: true });
        node.addEventListener("error", onError, { once: true });
      } else {
        const currentSrc = isSVGImageElementNode(node) ? node.href.baseVal : node.currentSrc || node.src;
        if (!currentSrc) {
          return onResolve();
        }
        const onLoad = async () => {
          if (isImageElement(node) && "decode" in node) {
            try {
              await node.decode();
            } catch (error) {
              onWarn?.(
                "Failed to decode image, trying to render anyway",
                node.dataset.originalSrc || currentSrc,
                error
              );
            }
          }
          onResolve();
        };
        const onError = (error) => {
          onWarn?.(
            "Failed image load",
            node.dataset.originalSrc || currentSrc,
            error
          );
          onResolve();
        };
        if (isImageElement(node) && node.complete) {
          return onLoad();
        }
        removeEventListeners = () => {
          node.removeEventListener("load", onLoad);
          node.removeEventListener("error", onError);
        };
        node.addEventListener("load", onLoad, { once: true });
        node.addEventListener("error", onError, { once: true });
      }
    });
  }
  async function waitUntilLoad(node, options) {
    if (isHTMLElementNode(node)) {
      if (isImageElement(node) || isVideoElement(node)) {
        await loadMedia(node, options);
      } else {
        await Promise.all(
          ["img", "video"].flatMap((selectors) => {
            return Array.from(node.querySelectorAll(selectors)).map((el2) => loadMedia(el2, options));
          })
        );
      }
    }
  }
  var uuid = /* @__PURE__ */ (function uuid2() {
    let counter = 0;
    const random = () => `0000${(Math.random() * 36 ** 4 << 0).toString(36)}`.slice(-4);
    return () => {
      counter += 1;
      return `u${random()}${counter}`;
    };
  })();
  function splitFontFamily(fontFamily) {
    return fontFamily?.split(",").map((val) => val.trim().replace(/"|'/g, "").toLowerCase()).filter(Boolean);
  }
  var uid = 0;
  function createLogger(debug) {
    const prefix = `${PREFIX}[#${uid}]`;
    uid++;
    return {
      // eslint-disable-next-line no-console
      time: (label) => debug && console.time(`${prefix} ${label}`),
      // eslint-disable-next-line no-console
      timeEnd: (label) => debug && console.timeEnd(`${prefix} ${label}`),
      warn: (...args) => debug && consoleWarn(...args)
    };
  }
  function getDefaultRequestInit(bypassingCache) {
    return {
      cache: bypassingCache ? "no-cache" : "force-cache"
    };
  }
  async function orCreateContext(node, options) {
    return isContext(node) ? node : createContext(node, { ...options, autoDestruct: true });
  }
  async function createContext(node, options) {
    const { scale = 1, workerUrl, workerNumber = 1 } = options || {};
    const debug = Boolean(options?.debug);
    const features = options?.features ?? true;
    const ownerDocument = node.ownerDocument ?? (IN_BROWSER ? window.document : void 0);
    const ownerWindow = node.ownerDocument?.defaultView ?? (IN_BROWSER ? window : void 0);
    const requests = /* @__PURE__ */ new Map();
    const context = {
      // Options
      width: 0,
      height: 0,
      quality: 1,
      type: "image/png",
      scale,
      backgroundColor: null,
      style: null,
      filter: null,
      maximumCanvasSize: 0,
      timeout: 3e4,
      progress: null,
      debug,
      fetch: {
        requestInit: getDefaultRequestInit(options?.fetch?.bypassingCache),
        placeholderImage: "data:image/png;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
        bypassingCache: false,
        ...options?.fetch
      },
      fetchFn: null,
      font: {},
      drawImageInterval: 100,
      workerUrl: null,
      workerNumber,
      onCloneEachNode: null,
      onCloneNode: null,
      onEmbedNode: null,
      onCreateForeignObjectSvg: null,
      includeStyleProperties: null,
      autoDestruct: false,
      ...options,
      // InternalContext
      __CONTEXT__: true,
      log: createLogger(debug),
      node,
      ownerDocument,
      ownerWindow,
      dpi: scale === 1 ? null : 96 * scale,
      svgStyleElement: createStyleElement(ownerDocument),
      svgDefsElement: ownerDocument?.createElementNS(XMLNS, "defs"),
      svgStyles: /* @__PURE__ */ new Map(),
      defaultComputedStyles: /* @__PURE__ */ new Map(),
      workers: [
        ...Array.from({
          length: SUPPORT_WEB_WORKER && workerUrl && workerNumber ? workerNumber : 0
        })
      ].map(() => {
        try {
          const worker = new Worker(workerUrl);
          worker.onmessage = async (event) => {
            const { url, result } = event.data;
            if (result) {
              requests.get(url)?.resolve?.(result);
            } else {
              requests.get(url)?.reject?.(new Error(`Error receiving message from worker: ${url}`));
            }
          };
          worker.onmessageerror = (event) => {
            const { url } = event.data;
            requests.get(url)?.reject?.(new Error(`Error receiving message from worker: ${url}`));
          };
          return worker;
        } catch (error) {
          context.log.warn("Failed to new Worker", error);
          return null;
        }
      }).filter(Boolean),
      fontFamilies: /* @__PURE__ */ new Map(),
      fontCssTexts: /* @__PURE__ */ new Map(),
      acceptOfImage: `${[
        supportWebp(ownerDocument) && "image/webp",
        "image/svg+xml",
        "image/*",
        "*/*"
      ].filter(Boolean).join(",")};q=0.8`,
      requests,
      drawImageCount: 0,
      tasks: [],
      features,
      isEnable: (key) => {
        if (key === "restoreScrollPosition") {
          return typeof features === "boolean" ? false : features[key] ?? false;
        }
        if (typeof features === "boolean") {
          return features;
        }
        return features[key] ?? true;
      },
      shadowRoots: []
    };
    context.log.time("wait until load");
    await waitUntilLoad(node, { timeout: context.timeout, onWarn: context.log.warn });
    context.log.timeEnd("wait until load");
    const { width, height } = resolveBoundingBox(node, context);
    context.width = width;
    context.height = height;
    return context;
  }
  function createStyleElement(ownerDocument) {
    if (!ownerDocument)
      return void 0;
    const style = ownerDocument.createElement("style");
    const cssText = style.ownerDocument.createTextNode(`
.______background-clip--text {
  background-clip: text;
  -webkit-background-clip: text;
}
`);
    style.appendChild(cssText);
    return style;
  }
  function resolveBoundingBox(node, context) {
    let { width, height } = context;
    if (isElementNode(node) && (!width || !height)) {
      const box = node.getBoundingClientRect();
      width = width || box.width || Number(node.getAttribute("width")) || 0;
      height = height || box.height || Number(node.getAttribute("height")) || 0;
    }
    return { width, height };
  }
  async function imageToCanvas(image, context) {
    const {
      log,
      timeout,
      drawImageCount,
      drawImageInterval
    } = context;
    log.time("image to canvas");
    const loaded = await loadMedia(image, { timeout, onWarn: context.log.warn });
    const { canvas, context2d } = createCanvas(image.ownerDocument, context);
    const drawImage = () => {
      try {
        context2d?.drawImage(loaded, 0, 0, canvas.width, canvas.height);
      } catch (error) {
        context.log.warn("Failed to drawImage", error);
      }
    };
    drawImage();
    if (context.isEnable("fixSvgXmlDecode")) {
      for (let i = 0; i < drawImageCount; i++) {
        await new Promise((resolve) => {
          setTimeout(() => {
            context2d?.clearRect(0, 0, canvas.width, canvas.height);
            drawImage();
            resolve();
          }, i + drawImageInterval);
        });
      }
    }
    context.drawImageCount = 0;
    log.timeEnd("image to canvas");
    return canvas;
  }
  function createCanvas(ownerDocument, context) {
    const { width, height, scale, backgroundColor, maximumCanvasSize: max } = context;
    const canvas = ownerDocument.createElement("canvas");
    canvas.width = Math.floor(width * scale);
    canvas.height = Math.floor(height * scale);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    if (max) {
      if (canvas.width > max || canvas.height > max) {
        if (canvas.width > max && canvas.height > max) {
          if (canvas.width > canvas.height) {
            canvas.height *= max / canvas.width;
            canvas.width = max;
          } else {
            canvas.width *= max / canvas.height;
            canvas.height = max;
          }
        } else if (canvas.width > max) {
          canvas.height *= max / canvas.width;
          canvas.width = max;
        } else {
          canvas.width *= max / canvas.height;
          canvas.height = max;
        }
      }
    }
    const context2d = canvas.getContext("2d");
    if (context2d && backgroundColor) {
      context2d.fillStyle = backgroundColor;
      context2d.fillRect(0, 0, canvas.width, canvas.height);
    }
    return { canvas, context2d };
  }
  function cloneCanvas(canvas, context) {
    if (canvas.ownerDocument) {
      try {
        const dataURL = canvas.toDataURL();
        if (dataURL !== "data:,") {
          return createImage(dataURL, canvas.ownerDocument);
        }
      } catch (error) {
        context.log.warn("Failed to clone canvas", error);
      }
    }
    const cloned = canvas.cloneNode(false);
    const ctx = canvas.getContext("2d");
    const clonedCtx = cloned.getContext("2d");
    try {
      if (ctx && clonedCtx) {
        clonedCtx.putImageData(
          ctx.getImageData(0, 0, canvas.width, canvas.height),
          0,
          0
        );
      }
      return cloned;
    } catch (error) {
      context.log.warn("Failed to clone canvas", error);
    }
    return cloned;
  }
  function cloneIframe(iframe, context) {
    try {
      if (iframe?.contentDocument?.documentElement) {
        return cloneNode(iframe.contentDocument.documentElement, context);
      }
    } catch (error) {
      context.log.warn("Failed to clone iframe", error);
    }
    return iframe.cloneNode(false);
  }
  function cloneImage(image) {
    const cloned = image.cloneNode(false);
    if (image.currentSrc && image.currentSrc !== image.src) {
      cloned.src = image.currentSrc;
      cloned.srcset = "";
    }
    if (cloned.loading === "lazy") {
      cloned.loading = "eager";
    }
    return cloned;
  }
  async function cloneVideo(video, context) {
    if (video.ownerDocument && !video.currentSrc && video.poster) {
      return createImage(video.poster, video.ownerDocument);
    }
    const cloned = video.cloneNode(false);
    cloned.crossOrigin = "anonymous";
    if (video.currentSrc && video.currentSrc !== video.src) {
      cloned.src = video.currentSrc;
    }
    const ownerDocument = cloned.ownerDocument;
    if (ownerDocument) {
      let canPlay = true;
      await loadMedia(cloned, { onError: () => canPlay = false, onWarn: context.log.warn });
      if (!canPlay) {
        if (video.poster) {
          return createImage(video.poster, video.ownerDocument);
        }
        return cloned;
      }
      cloned.currentTime = video.currentTime;
      await new Promise((resolve) => {
        cloned.addEventListener("seeked", resolve, { once: true });
      });
      const canvas = ownerDocument.createElement("canvas");
      canvas.width = video.offsetWidth;
      canvas.height = video.offsetHeight;
      try {
        const ctx = canvas.getContext("2d");
        if (ctx)
          ctx.drawImage(cloned, 0, 0, canvas.width, canvas.height);
      } catch (error) {
        context.log.warn("Failed to clone video", error);
        if (video.poster) {
          return createImage(video.poster, video.ownerDocument);
        }
        return cloned;
      }
      return cloneCanvas(canvas, context);
    }
    return cloned;
  }
  function cloneElement(node, context) {
    if (isCanvasElement(node)) {
      return cloneCanvas(node, context);
    }
    if (isIFrameElement(node)) {
      return cloneIframe(node, context);
    }
    if (isImageElement(node)) {
      return cloneImage(node);
    }
    if (isVideoElement(node)) {
      return cloneVideo(node, context);
    }
    return node.cloneNode(false);
  }
  function getSandBox(context) {
    let sandbox = context.sandbox;
    if (!sandbox) {
      const { ownerDocument } = context;
      try {
        if (ownerDocument) {
          sandbox = ownerDocument.createElement("iframe");
          sandbox.id = `__SANDBOX__${uuid()}`;
          sandbox.width = "0";
          sandbox.height = "0";
          sandbox.style.visibility = "hidden";
          sandbox.style.position = "fixed";
          ownerDocument.body.appendChild(sandbox);
          sandbox.srcdoc = '<!DOCTYPE html><meta charset="UTF-8"><title></title><body>';
          context.sandbox = sandbox;
        }
      } catch (error) {
        context.log.warn("Failed to getSandBox", error);
      }
    }
    return sandbox;
  }
  var ignoredStyles = [
    "width",
    "height",
    "-webkit-text-fill-color"
  ];
  var includedAttributes = [
    "stroke",
    "fill"
  ];
  function getDefaultStyle(node, pseudoElement, context) {
    const { defaultComputedStyles } = context;
    const nodeName = node.nodeName.toLowerCase();
    const isSvgNode = isSVGElementNode(node) && nodeName !== "svg";
    const attributes = isSvgNode ? includedAttributes.map((name) => [name, node.getAttribute(name)]).filter(([, value]) => value !== null) : [];
    const key = [
      isSvgNode && "svg",
      nodeName,
      attributes.map((name, value) => `${name}=${value}`).join(","),
      pseudoElement
    ].filter(Boolean).join(":");
    if (defaultComputedStyles.has(key))
      return defaultComputedStyles.get(key);
    const sandbox = getSandBox(context);
    const sandboxWindow = sandbox?.contentWindow;
    if (!sandboxWindow)
      return /* @__PURE__ */ new Map();
    const sandboxDocument = sandboxWindow?.document;
    let root;
    let el2;
    if (isSvgNode) {
      root = sandboxDocument.createElementNS(XMLNS, "svg");
      el2 = root.ownerDocument.createElementNS(root.namespaceURI, nodeName);
      attributes.forEach(([name, value]) => {
        el2.setAttributeNS(null, name, value);
      });
      root.appendChild(el2);
    } else {
      root = el2 = sandboxDocument.createElement(nodeName);
    }
    el2.textContent = " ";
    sandboxDocument.body.appendChild(root);
    const computedStyle = sandboxWindow.getComputedStyle(el2, pseudoElement);
    const styles = /* @__PURE__ */ new Map();
    for (let len = computedStyle.length, i = 0; i < len; i++) {
      const name = computedStyle.item(i);
      if (ignoredStyles.includes(name))
        continue;
      styles.set(name, computedStyle.getPropertyValue(name));
    }
    sandboxDocument.body.removeChild(root);
    defaultComputedStyles.set(key, styles);
    return styles;
  }
  function getDiffStyle(style, defaultStyle, includeStyleProperties) {
    const diffStyle = /* @__PURE__ */ new Map();
    const prefixs = [];
    const prefixTree = /* @__PURE__ */ new Map();
    if (includeStyleProperties) {
      for (const name of includeStyleProperties) {
        applyTo(name);
      }
    } else {
      for (let len = style.length, i = 0; i < len; i++) {
        const name = style.item(i);
        applyTo(name);
      }
    }
    for (let len = prefixs.length, i = 0; i < len; i++) {
      prefixTree.get(prefixs[i])?.forEach((value, name) => diffStyle.set(name, value));
    }
    function applyTo(name) {
      const value = style.getPropertyValue(name);
      const priority = style.getPropertyPriority(name);
      const subIndex = name.lastIndexOf("-");
      const prefix = subIndex > -1 ? name.substring(0, subIndex) : void 0;
      if (prefix) {
        let map = prefixTree.get(prefix);
        if (!map) {
          map = /* @__PURE__ */ new Map();
          prefixTree.set(prefix, map);
        }
        map.set(name, [value, priority]);
      }
      if (defaultStyle.get(name) === value && !priority)
        return;
      if (prefix) {
        prefixs.push(prefix);
      } else {
        diffStyle.set(name, [value, priority]);
      }
    }
    return diffStyle;
  }
  function copyCssStyles(node, cloned, isRoot, context) {
    const { ownerWindow, includeStyleProperties, currentParentNodeStyle } = context;
    const clonedStyle = cloned.style;
    const computedStyle = ownerWindow.getComputedStyle(node);
    const defaultStyle = getDefaultStyle(node, null, context);
    currentParentNodeStyle?.forEach((_, key) => {
      defaultStyle.delete(key);
    });
    const style = getDiffStyle(computedStyle, defaultStyle, includeStyleProperties);
    style.delete("transition-property");
    style.delete("all");
    style.delete("d");
    style.delete("content");
    if (isRoot) {
      style.delete("position");
      style.delete("margin-top");
      style.delete("margin-right");
      style.delete("margin-bottom");
      style.delete("margin-left");
      style.delete("margin-block-start");
      style.delete("margin-block-end");
      style.delete("margin-inline-start");
      style.delete("margin-inline-end");
      style.set("box-sizing", ["border-box", ""]);
    }
    if (style.get("background-clip")?.[0] === "text") {
      cloned.classList.add("______background-clip--text");
    }
    if (IN_CHROME) {
      if (!style.has("font-kerning"))
        style.set("font-kerning", ["normal", ""]);
      if ((style.get("overflow-x")?.[0] === "hidden" || style.get("overflow-y")?.[0] === "hidden") && style.get("text-overflow")?.[0] === "ellipsis" && node.scrollWidth === node.clientWidth) {
        style.set("text-overflow", ["clip", ""]);
      }
    }
    for (let len = clonedStyle.length, i = 0; i < len; i++) {
      clonedStyle.removeProperty(clonedStyle.item(i));
    }
    style.forEach(([value, priority], name) => {
      clonedStyle.setProperty(name, value, priority);
    });
    return style;
  }
  function copyInputValue(node, cloned) {
    if (isTextareaElement(node) || isInputElement(node) || isSelectElement(node)) {
      cloned.setAttribute("value", node.value);
    }
  }
  var pseudoClasses = [
    "::before",
    "::after"
    // '::placeholder', TODO
  ];
  var scrollbarPseudoClasses = [
    "::-webkit-scrollbar",
    "::-webkit-scrollbar-button",
    // '::-webkit-scrollbar:horizontal', TODO
    "::-webkit-scrollbar-thumb",
    "::-webkit-scrollbar-track",
    "::-webkit-scrollbar-track-piece",
    // '::-webkit-scrollbar:vertical', TODO
    "::-webkit-scrollbar-corner",
    "::-webkit-resizer"
  ];
  function copyPseudoClass(node, cloned, copyScrollbar, context, addWordToFontFamilies) {
    const { ownerWindow, svgStyleElement, svgStyles, currentNodeStyle } = context;
    if (!svgStyleElement || !ownerWindow)
      return;
    function copyBy(pseudoClass) {
      const computedStyle = ownerWindow.getComputedStyle(node, pseudoClass);
      let content = computedStyle.getPropertyValue("content");
      if (!content || content === "none")
        return;
      addWordToFontFamilies?.(content);
      content = content.replace(/(')|(")|(counter\(.+\))/g, "");
      const klasses = [uuid()];
      const defaultStyle = getDefaultStyle(node, pseudoClass, context);
      currentNodeStyle?.forEach((_, key) => {
        defaultStyle.delete(key);
      });
      const style = getDiffStyle(computedStyle, defaultStyle, context.includeStyleProperties);
      style.delete("content");
      style.delete("-webkit-locale");
      if (style.get("background-clip")?.[0] === "text") {
        cloned.classList.add("______background-clip--text");
      }
      const cloneStyle = [
        `content: '${content}';`
      ];
      style.forEach(([value, priority], name) => {
        cloneStyle.push(`${name}: ${value}${priority ? " !important" : ""};`);
      });
      if (cloneStyle.length === 1)
        return;
      try {
        cloned.className = [cloned.className, ...klasses].join(" ");
      } catch (err) {
        context.log.warn("Failed to copyPseudoClass", err);
        return;
      }
      const cssText = cloneStyle.join("\n  ");
      let allClasses = svgStyles.get(cssText);
      if (!allClasses) {
        allClasses = [];
        svgStyles.set(cssText, allClasses);
      }
      allClasses.push(`.${klasses[0]}${pseudoClass}`);
    }
    pseudoClasses.forEach(copyBy);
    if (copyScrollbar)
      scrollbarPseudoClasses.forEach(copyBy);
  }
  var excludeParentNodes = /* @__PURE__ */ new Set([
    "symbol"
    // test/fixtures/svg.symbol.html
  ]);
  async function appendChildNode(node, cloned, child, context, addWordToFontFamilies) {
    if (isElementNode(child) && (isStyleElement(child) || isScriptElement(child)))
      return;
    if (context.filter && !context.filter(child))
      return;
    if (excludeParentNodes.has(cloned.nodeName) || excludeParentNodes.has(child.nodeName)) {
      context.currentParentNodeStyle = void 0;
    } else {
      context.currentParentNodeStyle = context.currentNodeStyle;
    }
    const childCloned = await cloneNode(child, context, false, addWordToFontFamilies);
    if (context.isEnable("restoreScrollPosition")) {
      restoreScrollPosition(node, childCloned);
    }
    cloned.appendChild(childCloned);
  }
  async function cloneChildNodes(node, cloned, context, addWordToFontFamilies) {
    let firstChild = node.firstChild;
    if (isElementNode(node)) {
      if (node.shadowRoot) {
        firstChild = node.shadowRoot?.firstChild;
        context.shadowRoots.push(node.shadowRoot);
      }
    }
    for (let child = firstChild; child; child = child.nextSibling) {
      if (isCommentNode(child))
        continue;
      if (isElementNode(child) && isSlotElement(child) && typeof child.assignedNodes === "function") {
        const nodes = child.assignedNodes();
        for (let i = 0; i < nodes.length; i++) {
          await appendChildNode(node, cloned, nodes[i], context, addWordToFontFamilies);
        }
      } else {
        await appendChildNode(node, cloned, child, context, addWordToFontFamilies);
      }
    }
  }
  function restoreScrollPosition(node, chlidCloned) {
    if (!isHTMLElementNode(node) || !isHTMLElementNode(chlidCloned))
      return;
    const { scrollTop, scrollLeft } = node;
    if (!scrollTop && !scrollLeft) {
      return;
    }
    const { transform } = chlidCloned.style;
    const matrix = new DOMMatrix(transform);
    const { a, b, c, d } = matrix;
    matrix.a = 1;
    matrix.b = 0;
    matrix.c = 0;
    matrix.d = 1;
    matrix.translateSelf(-scrollLeft, -scrollTop);
    matrix.a = a;
    matrix.b = b;
    matrix.c = c;
    matrix.d = d;
    chlidCloned.style.transform = matrix.toString();
  }
  function applyCssStyleWithOptions(cloned, context) {
    const { backgroundColor, width, height, style: styles } = context;
    const clonedStyle = cloned.style;
    if (backgroundColor)
      clonedStyle.setProperty("background-color", backgroundColor, "important");
    if (width)
      clonedStyle.setProperty("width", `${width}px`, "important");
    if (height)
      clonedStyle.setProperty("height", `${height}px`, "important");
    if (styles) {
      for (const name in styles) clonedStyle[name] = styles[name];
    }
  }
  var NORMAL_ATTRIBUTE_RE = /^[\w-:]+$/;
  async function cloneNode(node, context, isRoot = false, addWordToFontFamilies) {
    const { ownerDocument, ownerWindow, fontFamilies, onCloneEachNode } = context;
    if (ownerDocument && isTextNode(node)) {
      if (addWordToFontFamilies && /\S/.test(node.data)) {
        addWordToFontFamilies(node.data);
      }
      return ownerDocument.createTextNode(node.data);
    }
    if (ownerDocument && ownerWindow && isElementNode(node) && (isHTMLElementNode(node) || isSVGElementNode(node))) {
      const cloned2 = await cloneElement(node, context);
      if (context.isEnable("removeAbnormalAttributes")) {
        const names = cloned2.getAttributeNames();
        for (let len = names.length, i = 0; i < len; i++) {
          const name = names[i];
          if (!NORMAL_ATTRIBUTE_RE.test(name)) {
            cloned2.removeAttribute(name);
          }
        }
      }
      const style = context.currentNodeStyle = copyCssStyles(node, cloned2, isRoot, context);
      if (isRoot)
        applyCssStyleWithOptions(cloned2, context);
      let copyScrollbar = false;
      if (context.isEnable("copyScrollbar")) {
        const overflow = [
          style.get("overflow-x")?.[0],
          style.get("overflow-y")?.[0]
        ];
        copyScrollbar = overflow.includes("scroll") || (overflow.includes("auto") || overflow.includes("overlay")) && (node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth);
      }
      const textTransform = style.get("text-transform")?.[0];
      const families = splitFontFamily(style.get("font-family")?.[0]);
      const addWordToFontFamilies2 = families ? (word) => {
        if (textTransform === "uppercase") {
          word = word.toUpperCase();
        } else if (textTransform === "lowercase") {
          word = word.toLowerCase();
        } else if (textTransform === "capitalize") {
          word = word[0].toUpperCase() + word.substring(1);
        }
        families.forEach((family) => {
          let fontFamily = fontFamilies.get(family);
          if (!fontFamily) {
            fontFamilies.set(family, fontFamily = /* @__PURE__ */ new Set());
          }
          word.split("").forEach((text) => fontFamily.add(text));
        });
      } : void 0;
      copyPseudoClass(
        node,
        cloned2,
        copyScrollbar,
        context,
        addWordToFontFamilies2
      );
      copyInputValue(node, cloned2);
      if (!isVideoElement(node)) {
        await cloneChildNodes(
          node,
          cloned2,
          context,
          addWordToFontFamilies2
        );
      }
      await onCloneEachNode?.(cloned2);
      return cloned2;
    }
    const cloned = node.cloneNode(false);
    await cloneChildNodes(node, cloned, context);
    await onCloneEachNode?.(cloned);
    return cloned;
  }
  function destroyContext(context) {
    context.ownerDocument = void 0;
    context.ownerWindow = void 0;
    context.svgStyleElement = void 0;
    context.svgDefsElement = void 0;
    context.svgStyles.clear();
    context.defaultComputedStyles.clear();
    if (context.sandbox) {
      try {
        context.sandbox.remove();
      } catch (err) {
        context.log.warn("Failed to destroyContext", err);
      }
      context.sandbox = void 0;
    }
    context.workers = [];
    context.fontFamilies.clear();
    context.fontCssTexts.clear();
    context.requests.clear();
    context.tasks = [];
    context.shadowRoots = [];
  }
  function baseFetch(options) {
    const { url, timeout, responseType, ...requestInit } = options;
    const controller = new AbortController();
    const timer = timeout ? setTimeout(() => controller.abort(), timeout) : void 0;
    return fetch(url, { signal: controller.signal, ...requestInit }).then((response) => {
      if (!response.ok) {
        throw new Error("Failed fetch, not 2xx response", { cause: response });
      }
      switch (responseType) {
        case "arrayBuffer":
          return response.arrayBuffer();
        case "dataUrl":
          return response.blob().then(blobToDataUrl);
        case "text":
        default:
          return response.text();
      }
    }).finally(() => clearTimeout(timer));
  }
  function contextFetch(context, options) {
    const { url: rawUrl, requestType = "text", responseType = "text", imageDom } = options;
    let url = rawUrl;
    const {
      timeout,
      acceptOfImage,
      requests,
      fetchFn,
      fetch: {
        requestInit,
        bypassingCache,
        placeholderImage
      },
      font,
      workers,
      fontFamilies
    } = context;
    if (requestType === "image" && (IN_SAFARI || IN_FIREFOX)) {
      context.drawImageCount++;
    }
    let request = requests.get(rawUrl);
    if (!request) {
      if (bypassingCache) {
        if (bypassingCache instanceof RegExp && bypassingCache.test(url)) {
          url += (/\?/.test(url) ? "&" : "?") + (/* @__PURE__ */ new Date()).getTime();
        }
      }
      const canFontMinify = requestType.startsWith("font") && font && font.minify;
      const fontTexts = /* @__PURE__ */ new Set();
      if (canFontMinify) {
        const families = requestType.split(";")[1].split(",");
        families.forEach((family) => {
          if (!fontFamilies.has(family))
            return;
          fontFamilies.get(family).forEach((text) => fontTexts.add(text));
        });
      }
      const needFontMinify = canFontMinify && fontTexts.size;
      const baseFetchOptions = {
        url,
        timeout,
        responseType: needFontMinify ? "arrayBuffer" : responseType,
        headers: requestType === "image" ? { accept: acceptOfImage } : void 0,
        ...requestInit
      };
      request = {
        type: requestType,
        resolve: void 0,
        reject: void 0,
        response: null
      };
      request.response = (async () => {
        if (fetchFn && requestType === "image") {
          const result = await fetchFn(rawUrl);
          if (result)
            return result;
        }
        if (!IN_SAFARI && rawUrl.startsWith("http") && workers.length) {
          return new Promise((resolve, reject) => {
            const worker = workers[requests.size & workers.length - 1];
            worker.postMessage({ rawUrl, ...baseFetchOptions });
            request.resolve = resolve;
            request.reject = reject;
          });
        }
        return baseFetch(baseFetchOptions);
      })().catch((error) => {
        requests.delete(rawUrl);
        if (requestType === "image" && placeholderImage) {
          context.log.warn("Failed to fetch image base64, trying to use placeholder image", url);
          return typeof placeholderImage === "string" ? placeholderImage : placeholderImage(imageDom);
        }
        throw error;
      });
      requests.set(rawUrl, request);
    }
    return request.response;
  }
  async function replaceCssUrlToDataUrl(cssText, baseUrl, context, isImage) {
    if (!hasCssUrl(cssText))
      return cssText;
    for (const [rawUrl, url] of parseCssUrls(cssText, baseUrl)) {
      try {
        const dataUrl = await contextFetch(
          context,
          {
            url,
            requestType: isImage ? "image" : "text",
            responseType: "dataUrl"
          }
        );
        cssText = cssText.replace(toRE(rawUrl), `$1${dataUrl}$3`);
      } catch (error) {
        context.log.warn("Failed to fetch css data url", rawUrl, error);
      }
    }
    return cssText;
  }
  function hasCssUrl(cssText) {
    return /url\((['"]?)([^'"]+?)\1\)/.test(cssText);
  }
  var URL_RE = /url\((['"]?)([^'"]+?)\1\)/g;
  function parseCssUrls(cssText, baseUrl) {
    const result = [];
    cssText.replace(URL_RE, (raw, quotation, url) => {
      result.push([url, resolveUrl(url, baseUrl)]);
      return raw;
    });
    return result.filter(([url]) => !isDataUrl(url));
  }
  function toRE(url) {
    const escaped = url.replace(/([.*+?^${}()|\[\]\/\\])/g, "\\$1");
    return new RegExp(`(url\\(['"]?)(${escaped})(['"]?\\))`, "g");
  }
  var properties = [
    "background-image",
    "border-image-source",
    "-webkit-border-image",
    "-webkit-mask-image",
    "list-style-image"
  ];
  function embedCssStyleImage(style, context) {
    return properties.map((property) => {
      const value = style.getPropertyValue(property);
      if (!value || value === "none") {
        return null;
      }
      if (IN_SAFARI || IN_FIREFOX) {
        context.drawImageCount++;
      }
      return replaceCssUrlToDataUrl(value, null, context, true).then((newValue) => {
        if (!newValue || value === newValue)
          return;
        style.setProperty(
          property,
          newValue,
          style.getPropertyPriority(property)
        );
      });
    }).filter(Boolean);
  }
  function embedImageElement(cloned, context) {
    if (isImageElement(cloned)) {
      const originalSrc = cloned.currentSrc || cloned.src;
      if (!isDataUrl(originalSrc)) {
        return [
          contextFetch(context, {
            url: originalSrc,
            imageDom: cloned,
            requestType: "image",
            responseType: "dataUrl"
          }).then((url) => {
            if (!url)
              return;
            cloned.srcset = "";
            cloned.dataset.originalSrc = originalSrc;
            cloned.src = url || "";
          })
        ];
      }
      if (IN_SAFARI || IN_FIREFOX) {
        context.drawImageCount++;
      }
    } else if (isSVGElementNode(cloned) && !isDataUrl(cloned.href.baseVal)) {
      const originalSrc = cloned.href.baseVal;
      return [
        contextFetch(context, {
          url: originalSrc,
          imageDom: cloned,
          requestType: "image",
          responseType: "dataUrl"
        }).then((url) => {
          if (!url)
            return;
          cloned.dataset.originalSrc = originalSrc;
          cloned.href.baseVal = url || "";
        })
      ];
    }
    return [];
  }
  function embedSvgUse(cloned, context) {
    const { ownerDocument, svgDefsElement } = context;
    const href = cloned.getAttribute("href") ?? cloned.getAttribute("xlink:href");
    if (!href)
      return [];
    const [svgUrl, id] = href.split("#");
    if (id) {
      const query = `#${id}`;
      const definition = context.shadowRoots.reduce(
        (res, root) => {
          return res ?? root.querySelector(`svg ${query}`);
        },
        ownerDocument?.querySelector(`svg ${query}`)
      );
      if (svgUrl) {
        cloned.setAttribute("href", query);
      }
      if (svgDefsElement?.querySelector(query))
        return [];
      if (definition) {
        svgDefsElement?.appendChild(definition.cloneNode(true));
        return [];
      } else if (svgUrl) {
        return [
          contextFetch(context, {
            url: svgUrl,
            responseType: "text"
          }).then((svgData) => {
            svgDefsElement?.insertAdjacentHTML("beforeend", svgData);
          })
        ];
      }
    }
    return [];
  }
  function embedNode(cloned, context) {
    const { tasks } = context;
    if (isElementNode(cloned)) {
      if (isImageElement(cloned) || isSVGImageElementNode(cloned)) {
        tasks.push(...embedImageElement(cloned, context));
      }
      if (isSVGUseElementNode(cloned)) {
        tasks.push(...embedSvgUse(cloned, context));
      }
    }
    if (isHTMLElementNode(cloned)) {
      tasks.push(...embedCssStyleImage(cloned.style, context));
    }
    cloned.childNodes.forEach((child) => {
      embedNode(child, context);
    });
  }
  async function embedWebFont(clone, context) {
    const {
      ownerDocument,
      svgStyleElement,
      fontFamilies,
      fontCssTexts,
      tasks,
      font
    } = context;
    if (!ownerDocument || !svgStyleElement || !fontFamilies.size) {
      return;
    }
    if (font && font.cssText) {
      const cssText = filterPreferredFormat(font.cssText, context);
      svgStyleElement.appendChild(ownerDocument.createTextNode(`${cssText}
`));
    } else {
      const styleSheets = Array.from(ownerDocument.styleSheets).filter((styleSheet) => {
        try {
          return "cssRules" in styleSheet && Boolean(styleSheet.cssRules.length);
        } catch (error) {
          context.log.warn(`Error while reading CSS rules from ${styleSheet.href}`, error);
          return false;
        }
      });
      const tempDoc = ownerDocument.implementation.createHTMLDocument("");
      const tempStyleEl = tempDoc.createElement("style");
      tempDoc.head.appendChild(tempStyleEl);
      const tempStyleSheet = tempStyleEl.sheet;
      await Promise.all(
        styleSheets.flatMap((styleSheet) => {
          return Array.from(styleSheet.cssRules).map(async (cssRule) => {
            if (isCSSImportRule(cssRule)) {
              const baseUrl = cssRule.href;
              let cssText = "";
              try {
                cssText = await contextFetch(context, {
                  url: baseUrl,
                  requestType: "text",
                  responseType: "text"
                });
              } catch (error) {
                context.log.warn(`Error fetch remote css import from ${baseUrl}`, error);
              }
              const replacedCssText = cssText.replace(
                URL_RE,
                (raw, quotation, url) => raw.replace(url, resolveUrl(url, baseUrl))
              );
              for (const rule of parseCss(replacedCssText)) {
                try {
                  tempStyleSheet.insertRule(rule, tempStyleSheet.cssRules.length);
                } catch (error) {
                  context.log.warn("Error inserting rule from remote css import", { rule, error });
                }
              }
            }
          });
        })
      );
      if (tempStyleSheet.cssRules.length)
        styleSheets.push(tempStyleSheet);
      const cssRules = [];
      styleSheets.forEach((sheet) => {
        unwrapCssLayers(sheet.cssRules, cssRules);
      });
      cssRules.filter((cssRule) => isCssFontFaceRule(cssRule) && hasCssUrl(cssRule.style.getPropertyValue("src")) && splitFontFamily(cssRule.style.getPropertyValue("font-family"))?.some((val) => fontFamilies.has(val))).forEach((value) => {
        const rule = value;
        const cssText = fontCssTexts.get(rule.cssText);
        if (cssText) {
          svgStyleElement.appendChild(ownerDocument.createTextNode(`${cssText}
`));
        } else {
          tasks.push(
            replaceCssUrlToDataUrl(
              rule.cssText,
              rule.parentStyleSheet ? rule.parentStyleSheet.href : null,
              context
            ).then((cssText2) => {
              cssText2 = filterPreferredFormat(cssText2, context);
              fontCssTexts.set(rule.cssText, cssText2);
              svgStyleElement.appendChild(ownerDocument.createTextNode(`${cssText2}
`));
            })
          );
        }
      });
    }
  }
  var COMMENTS_RE = /(\/\*[\s\S]*?\*\/)/g;
  var KEYFRAMES_RE = /((@.*?keyframes [\s\S]*?){([\s\S]*?}\s*?)})/gi;
  function parseCss(source) {
    if (source == null)
      return [];
    const result = [];
    let cssText = source.replace(COMMENTS_RE, "");
    while (true) {
      const matches = KEYFRAMES_RE.exec(cssText);
      if (!matches)
        break;
      result.push(matches[0]);
    }
    cssText = cssText.replace(KEYFRAMES_RE, "");
    const IMPORT_RE = /@import[\s\S]*?url\([^)]*\)[\s\S]*?;/gi;
    const UNIFIED_RE = new RegExp(
      // eslint-disable-next-line
      "((\\s*?(?:\\/\\*[\\s\\S]*?\\*\\/)?\\s*?@media[\\s\\S]*?){([\\s\\S]*?)}\\s*?})|(([\\s\\S]*?){([\\s\\S]*?)})",
      "gi"
    );
    while (true) {
      let matches = IMPORT_RE.exec(cssText);
      if (!matches) {
        matches = UNIFIED_RE.exec(cssText);
        if (!matches) {
          break;
        } else {
          IMPORT_RE.lastIndex = UNIFIED_RE.lastIndex;
        }
      } else {
        UNIFIED_RE.lastIndex = IMPORT_RE.lastIndex;
      }
      result.push(matches[0]);
    }
    return result;
  }
  var URL_WITH_FORMAT_RE = /url\([^)]+\)\s*format\((["']?)([^"']+)\1\)/g;
  var FONT_SRC_RE = /src:\s*(?:url\([^)]+\)\s*format\([^)]+\)[,;]\s*)+/g;
  function filterPreferredFormat(str, context) {
    const { font } = context;
    const preferredFormat = font ? font?.preferredFormat : void 0;
    return preferredFormat ? str.replace(FONT_SRC_RE, (match) => {
      while (true) {
        const [src, , format] = URL_WITH_FORMAT_RE.exec(match) || [];
        if (!format)
          return "";
        if (format === preferredFormat)
          return `src: ${src};`;
      }
    }) : str;
  }
  function unwrapCssLayers(rules, out = []) {
    for (const rule of Array.from(rules)) {
      if (isLayerBlockRule(rule)) {
        out.push(...unwrapCssLayers(rule.cssRules));
      } else if ("cssRules" in rule) {
        unwrapCssLayers(rule.cssRules, out);
      } else {
        out.push(rule);
      }
    }
    return out;
  }
  var SVG_EXTERNAL_RESOURCE_REGEX = /\bx?link:?href\s*=\s*["'](?!data:)[^"']+["']/i;
  function svgHasExternalResources(svg2) {
    return SVG_EXTERNAL_RESOURCE_REGEX.test(svg2.innerHTML);
  }
  async function domToForeignObjectSvg(node, options) {
    const context = await orCreateContext(node, options);
    if (isElementNode(context.node) && isSVGElementNode(context.node) && !svgHasExternalResources(context.node))
      return context.node;
    const {
      ownerDocument,
      log,
      tasks,
      svgStyleElement,
      svgDefsElement,
      svgStyles,
      font,
      progress,
      autoDestruct,
      onCloneNode,
      onEmbedNode,
      onCreateForeignObjectSvg
    } = context;
    log.time("clone node");
    const clone = await cloneNode(context.node, context, true);
    if (svgStyleElement && ownerDocument) {
      let allCssText = "";
      svgStyles.forEach((klasses, cssText) => {
        allCssText += `${klasses.join(",\n")} {
  ${cssText}
}
`;
      });
      svgStyleElement.appendChild(ownerDocument.createTextNode(allCssText));
    }
    log.timeEnd("clone node");
    await onCloneNode?.(clone);
    if (font !== false && isElementNode(clone)) {
      log.time("embed web font");
      await embedWebFont(clone, context);
      log.timeEnd("embed web font");
    }
    log.time("embed node");
    embedNode(clone, context);
    const count = tasks.length;
    let current2 = 0;
    const runTask = async () => {
      while (true) {
        const task = tasks.pop();
        if (!task)
          break;
        try {
          await task;
        } catch (error) {
          context.log.warn("Failed to run task", error);
        }
        progress?.(++current2, count);
      }
    };
    progress?.(current2, count);
    await Promise.all([...Array.from({ length: 4 })].map(runTask));
    log.timeEnd("embed node");
    await onEmbedNode?.(clone);
    const svg2 = createForeignObjectSvg(clone, context);
    svgDefsElement && svg2.insertBefore(svgDefsElement, svg2.children[0]);
    svgStyleElement && svg2.insertBefore(svgStyleElement, svg2.children[0]);
    autoDestruct && destroyContext(context);
    await onCreateForeignObjectSvg?.(svg2);
    return svg2;
  }
  function createForeignObjectSvg(clone, context) {
    const { width, height } = context;
    const svg2 = createSvg(width, height, clone.ownerDocument);
    const foreignObject = svg2.ownerDocument.createElementNS(svg2.namespaceURI, "foreignObject");
    foreignObject.setAttributeNS(null, "x", "0%");
    foreignObject.setAttributeNS(null, "y", "0%");
    foreignObject.setAttributeNS(null, "width", "100%");
    foreignObject.setAttributeNS(null, "height", "100%");
    foreignObject.append(clone);
    svg2.appendChild(foreignObject);
    return svg2;
  }
  async function domToCanvas(node, options) {
    const context = await orCreateContext(node, options);
    const svg2 = await domToForeignObjectSvg(context);
    const dataUrl = svgToDataUrl(svg2, context.isEnable("removeControlCharacter"));
    if (!context.autoDestruct) {
      context.svgStyleElement = createStyleElement(context.ownerDocument);
      context.svgDefsElement = context.ownerDocument?.createElementNS(XMLNS, "defs");
      context.svgStyles.clear();
    }
    const image = createImage(dataUrl, svg2.ownerDocument);
    return await imageToCanvas(image, context);
  }
  async function domToDataUrl(node, options) {
    const context = await orCreateContext(node, options);
    const { log, quality, type, dpi } = context;
    const canvas = await domToCanvas(context);
    log.time("canvas to data url");
    let dataUrl = canvas.toDataURL(type, quality);
    if (["image/png", "image/jpeg"].includes(type) && dpi && SUPPORT_ATOB && SUPPORT_BTOA) {
      const [format, body] = dataUrl.split(",");
      let headerLength = 0;
      let overwritepHYs = false;
      if (type === "image/png") {
        const b64Index = detectPhysChunkFromDataUrl(body);
        if (b64Index >= 0) {
          headerLength = Math.ceil((b64Index + 28) / 3) * 4;
          overwritepHYs = true;
        } else {
          headerLength = 33 / 3 * 4;
        }
      } else if (type === "image/jpeg") {
        headerLength = 18 / 3 * 4;
      }
      const stringHeader = body.substring(0, headerLength);
      const restOfData = body.substring(headerLength);
      const headerBytes = window.atob(stringHeader);
      const uint8Array = new Uint8Array(headerBytes.length);
      for (let i = 0; i < uint8Array.length; i++) {
        uint8Array[i] = headerBytes.charCodeAt(i);
      }
      const finalArray = type === "image/png" ? changePngDpi(uint8Array, dpi, overwritepHYs) : changeJpegDpi(uint8Array, dpi);
      const base64Header = window.btoa(String.fromCharCode(...finalArray));
      dataUrl = [format, ",", base64Header, restOfData].join("");
    }
    log.timeEnd("canvas to data url");
    return dataUrl;
  }
  async function domToPng(node, options) {
    return domToDataUrl(
      await orCreateContext(node, { ...options, type: "image/png" })
    );
  }

  // src/capture.ts
  var STYLE_KEYS = [
    "display",
    "position",
    "width",
    "height",
    "margin",
    "padding",
    "color",
    "background-color",
    "font-size",
    "font-weight",
    "font-family",
    "border",
    "border-radius",
    "box-shadow",
    "flex",
    "grid-template-columns",
    "text-align",
    "line-height",
    "opacity"
  ];
  function captureElementContext(el2) {
    const html = el2.outerHTML.length > 6e3 ? el2.outerHTML.slice(0, 6e3) + "\u2026" : el2.outerHTML;
    const cs = getComputedStyle(el2);
    const styles = {};
    for (const k of STYLE_KEYS) {
      const v = cs.getPropertyValue(k);
      if (v) styles[k] = v.trim();
    }
    return { html, styles };
  }
  var CAPTURE_TIMEOUT = 6e3;
  function withTimeout(p, ms) {
    return Promise.race([p, new Promise((resolve) => setTimeout(() => resolve(void 0), ms))]);
  }
  async function fontsReady() {
    try {
      const fonts = document.fonts;
      if (!fonts?.ready) return;
      await Promise.race([
        fonts.ready,
        new Promise((resolve) => setTimeout(resolve, 800))
      ]);
    } catch {
    }
  }
  function captureFilter(node) {
    if (!(node instanceof Element)) return true;
    if (node.id === "loupe-root") return false;
    if (node.hasAttribute("data-loupe-redact")) return false;
    return true;
  }
  async function captureScreenshot(el2) {
    try {
      await fontsReady();
      return await withTimeout(
        domToPng(el2, {
          scale: Math.min(window.devicePixelRatio || 1, 2),
          backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
          timeout: CAPTURE_TIMEOUT,
          filter: captureFilter
        }),
        CAPTURE_TIMEOUT + 2e3
      );
    } catch (err) {
      console.warn("[loupe] screenshot capture failed", err);
      return void 0;
    }
  }
  async function captureRegionScreenshot(rect) {
    try {
      await fontsReady();
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      const container = regionContainer(rect);
      const origin = container.getBoundingClientRect();
      const full = await withTimeout(
        domToPng(container, {
          scale,
          backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
          timeout: CAPTURE_TIMEOUT,
          filter: captureFilter
        }),
        CAPTURE_TIMEOUT + 2e3
      );
      if (!full) return void 0;
      const redact = Array.from(document.querySelectorAll("[data-loupe-redact]")).map(
        (n) => n.getBoundingClientRect()
      );
      return await cropRegion(full, rect, origin.left, origin.top, scale, redact);
    } catch (err) {
      console.warn("[loupe] region capture failed", err);
      return void 0;
    }
  }
  function regionContainer(rect) {
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    let node = document.elementFromPoint(cx, cy);
    if (node && node.closest("#loupe-root")) node = null;
    const covers = (r) => r.left <= rect.x && r.top <= rect.y && r.right >= rect.x + rect.w && r.bottom >= rect.y + rect.h;
    while (node && node !== document.body && node !== document.documentElement) {
      if (covers(node.getBoundingClientRect())) return node;
      node = node.parentElement;
    }
    return document.body;
  }
  function pickRecordingMime() {
    const MR = window.MediaRecorder;
    if (!MR?.isTypeSupported) return "";
    for (const t of ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]) {
      if (MR.isTypeSupported(t)) return t;
    }
    return "";
  }
  function blobToDataUrl2(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }
  function fileToDataUrl(file) {
    return blobToDataUrl2(file);
  }
  function attachmentKind(mime) {
    return (mime ?? "").startsWith("video/") ? "video" : "image";
  }
  async function captureRegionRecording(rect, opts) {
    const md = navigator.mediaDevices;
    if (!md?.getDisplayMedia || !window.MediaRecorder) return void 0;
    let stream;
    try {
      stream = await md.getDisplayMedia({ video: { frameRate: 30 }, audio: false, preferCurrentTab: true });
    } catch {
      return void 0;
    }
    try {
      return await recordCropped(stream, rect, opts);
    } catch (err) {
      console.warn("[loupe] screen recording failed", err);
      return void 0;
    } finally {
      stream.getTracks().forEach((t) => t.stop());
    }
  }
  async function recordCropped(stream, rect, opts) {
    const maxMs = opts?.maxMs ?? 2e4;
    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play().catch(() => void 0);
    const track = stream.getVideoTracks()[0];
    const s = track?.getSettings?.() ?? {};
    const vw = s.width || video.videoWidth || window.innerWidth;
    const vh = s.height || video.videoHeight || window.innerHeight;
    const sx = vw / window.innerWidth;
    const sy = vh / window.innerHeight;
    const cw = Math.max(2, Math.round(rect.w * sx));
    const ch = Math.max(2, Math.round(rect.h * sy));
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    let raf = 0;
    const draw = () => {
      try {
        ctx.drawImage(video, rect.x * sx, rect.y * sy, cw, ch, 0, 0, cw, ch);
      } catch {
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    const out = canvas.captureStream(30);
    const mime = pickRecordingMime();
    const rec = new MediaRecorder(out, mime ? { mimeType: mime } : void 0);
    const chunks = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };
    const stop = () => {
      if (rec.state !== "inactive") rec.stop();
    };
    opts?.register?.(stop);
    const timer = window.setTimeout(stop, maxMs);
    track?.addEventListener("ended", stop);
    const done = new Promise((resolve) => {
      rec.onstop = () => resolve();
    });
    rec.start();
    await done;
    window.clearTimeout(timer);
    cancelAnimationFrame(raf);
    if (!chunks.length) return void 0;
    return blobToDataUrl2(new Blob(chunks, { type: mime || "video/webm" }));
  }
  function cropRegion(dataUrl, rect, ox, oy, scale, redact) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const sw = Math.max(1, Math.round(rect.w * scale));
        const sh = Math.max(1, Math.round(rect.h * scale));
        const canvas = document.createElement("canvas");
        canvas.width = sw;
        canvas.height = sh;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, (rect.x - ox) * scale, (rect.y - oy) * scale, sw, sh, 0, 0, sw, sh);
        ctx.fillStyle = "#0f0f14";
        for (const r of redact) {
          ctx.fillRect((r.left - rect.x) * scale, (r.top - rect.y) * scale, r.width * scale, r.height * scale);
        }
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  // ../shared/dist/activity.js
  var ACTIVITY_STATUS_LABELS = {
    idle: "Idle",
    working: "Working",
    error: "Error"
  };
  function formatDuration(ms) {
    if (!ms || ms < 0)
      return "\u2014";
    const s = Math.round(ms / 1e3);
    if (s < 60)
      return `${s}s`;
    const m = Math.floor(s / 60);
    const rest = s % 60;
    if (m < 60)
      return rest ? `${m}m ${rest}s` : `${m}m`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  function summarizeActivity(events, status = "idle", now = Date.now()) {
    const files = /* @__PURE__ */ new Set();
    const kinds = /* @__PURE__ */ new Map();
    let errors = 0;
    let first = Infinity;
    for (const e of events) {
      for (const f of e.files ?? [])
        files.add(f);
      kinds.set(e.kind, (kinds.get(e.kind) ?? 0) + 1);
      if (e.level === "error")
        errors++;
      const t = Date.parse(e.at);
      if (!Number.isNaN(t))
        first = Math.min(first, t);
    }
    return {
      status,
      events: events.length,
      errors,
      files: files.size,
      durationMs: events.length && first !== Infinity ? Math.max(0, now - first) : 0,
      byKind: [...kinds.entries()].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind))
    };
  }

  // ../shared/dist/lifecycle.js
  var LIFECYCLE_LABELS = {
    sent: "Sent to agent",
    in_pr: "In PR",
    preview: "Review preview",
    reviewed: "Reviewed"
  };
  function lifecycle(c) {
    const hasProposal = !!c.proposal;
    const pr = c.pr ?? void 0;
    const withPr = (stage) => {
      const out = { stage, label: LIFECYCLE_LABELS[stage] };
      if (pr) {
        out.pr = pr;
        if (typeof pr.checksTotal === "number" && pr.checksTotal > 0) {
          const passed = Math.max(0, Math.min(pr.checksTotal, pr.checksPassed ?? 0));
          out.checks = {
            text: `${passed}/${pr.checksTotal}`,
            ratio: passed / pr.checksTotal
          };
        }
      }
      return out;
    };
    if (c.status === "resolved")
      return hasProposal || pr ? withPr("reviewed") : null;
    if (pr)
      return withPr("in_pr");
    if (c.status === "in_review")
      return { stage: "preview", label: LIFECYCLE_LABELS.preview };
    if (hasProposal)
      return { stage: "sent", label: LIFECYCLE_LABELS.sent };
    return null;
  }
  function awaitingReview(comments) {
    return comments.filter((c) => c.status === "in_review");
  }

  // ../shared/dist/iteration.js
  function emptyIterations() {
    return { items: [], index: -1 };
  }
  function current(state) {
    return state.index >= 0 ? state.items[state.index] ?? null : null;
  }
  function addIteration(state, iteration) {
    const head = state.items.slice(0, state.index + 1);
    const items = [...head, iteration].slice(-MAX_ITERATIONS);
    return { items, index: items.length - 1 };
  }
  var MAX_ITERATIONS = 20;
  function canUndo(state) {
    return state.items.length > 0;
  }
  function undo(state) {
    if (!state.items.length)
      return state;
    const items = state.items.slice(0, -1);
    return { items, index: items.length - 1 };
  }
  function canMove(state, delta) {
    const next = state.index + delta;
    return next >= 0 && next < state.items.length;
  }
  function move(state, delta) {
    return canMove(state, delta) ? { ...state, index: state.index + delta } : state;
  }
  function stackLabel(state) {
    return state.items.length ? `${state.index + 1} / ${state.items.length}` : "";
  }

  // ../shared/dist/consent.js
  function emptyConsent() {
    return { state: "idle", request: null, history: [] };
  }
  function isNavigableUrl(raw) {
    try {
      const u = new URL(raw);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }
  function requestNavigation(record, request) {
    if (!isNavigableUrl(request.url))
      return record;
    return {
      state: "requested",
      request: {
        id: request.id ?? `nav${Date.now().toString(36)}`,
        at: request.at ?? (/* @__PURE__ */ new Date()).toISOString(),
        url: request.url,
        reason: request.reason,
        requester: request.requester
      },
      history: record.history
    };
  }
  function isPending(record) {
    return record.state === "requested" && record.request !== null;
  }
  function decide(record, granted, now = (/* @__PURE__ */ new Date()).toISOString()) {
    if (!isPending(record))
      return { record, navigateTo: null };
    const url = record.request.url;
    return {
      record: {
        state: granted ? "granted" : "denied",
        request: null,
        history: [...record.history, { url, decision: granted ? "granted" : "denied", at: now }]
      },
      navigateTo: granted ? url : null
    };
  }
  function withdraw(record) {
    return isPending(record) ? { ...record, state: "idle", request: null } : record;
  }

  // ../shared/dist/thread.js
  function firstMessageFromComment(comment) {
    return {
      id: `${comment.id}:0`,
      threadId: comment.id,
      author: { ...comment.author, type: "user" },
      body: comment.body,
      attachments: comment.attachments?.length ? comment.attachments : void 0,
      createdAt: comment.createdAt
    };
  }
  function threadConversation(comment, replies, opts = {}) {
    const visible = opts.includeDeleted ? replies : replies.filter((m) => !m.deletedAt);
    return [firstMessageFromComment(comment), ...visible].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  function iterationLabel(link) {
    if (!link.parentThreadId || link.iterationType !== "revision")
      return null;
    return `Iteration ${link.iterationNumber ?? 2}`;
  }

  // ../shared/dist/timeline.js
  function describeTarget(input) {
    const parts = [];
    if (input.anchor?.tag)
      parts.push(`a <${input.anchor.tag}>`);
    if (input.anchor?.selector)
      parts.push(`\`${input.anchor.selector}\``);
    return parts.length ? parts.join(" ") : input.kind === "free" ? "a page note" : "an element";
  }
  function threadTimeline(input, messages = []) {
    const out = [];
    const latest = messages.length ? messages[messages.length - 1].at : input.createdAt;
    out.push({
      at: input.createdAt,
      kind: "captured",
      label: "Feedback captured",
      detail: [input.title, describeTarget(input)].filter(Boolean).join(" \xB7 ")
    });
    for (const m of messages) {
      out.push({
        at: m.at,
        kind: "message",
        label: `${m.authorName} replied`,
        actor: m.fromAgent ? m.authorName : void 0
      });
    }
    const stage = normalizeStage(input.status);
    const reached = (s) => STAGE_ORDER.indexOf(stage) >= STAGE_ORDER.indexOf(s);
    if (input.proposal || reached("in_review")) {
      const agent = input.proposal?.author ?? "Claude Code";
      out.push({
        at: input.proposal?.createdAt ?? latest,
        kind: "sent",
        label: `Change ready from ${agent}`,
        detail: "The rewritten markup is on the thread.",
        actor: agent
      });
    }
    if (input.pr) {
      out.push({
        at: latest,
        kind: "pr",
        label: input.pr.number ? `Pull request #${input.pr.number} opened` : "Pull request opened",
        detail: input.pr.state === "merged" ? "Merged." : input.pr.state === "closed" ? "Closed without merging." : "Waiting on review."
      });
      if (input.pr.previewUrl) {
        out.push({ at: latest, kind: "preview", label: "Preview live", detail: input.pr.previewUrl });
      }
    }
    if (reached("in_review")) {
      out.push({ at: latest, kind: "review", label: "Waiting on a human review", detail: "Only a person can close this." });
    }
    if (stage === "resolved") {
      out.push({ at: latest, kind: "resolved", label: "Resolved", detail: "A person closed this." });
    }
    return out;
  }
  var STAGE_ORDER = ["queue", "todo", "in_progress", "in_review", "resolved"];
  function normalizeStage(status) {
    if (status === "open")
      return "queue";
    if (status === "done")
      return "resolved";
    return status;
  }
  function threadAsText(input, messages = []) {
    const lines = [
      `# ${input.title ?? "Feedback"} (#${input.id})`,
      "",
      `- Stage: ${normalizeStage(input.status)}`,
      `- Page: ${input.url ?? "\u2014"}`
    ];
    if (input.anchor?.selector)
      lines.push(`- Target: \`${input.anchor.selector}\``);
    if (input.pr?.number)
      lines.push(`- PR: #${input.pr.number}${input.pr.previewUrl ? ` \xB7 preview ${input.pr.previewUrl}` : ""}`);
    lines.push("", "## Request", "", input.body);
    if (messages.length) {
      lines.push("", "## Conversation", "");
      for (const m of messages)
        lines.push(`**${m.authorName}**${m.fromAgent ? " (agent)" : ""} \u2014 ${m.at}`, "", m.body, "");
    }
    return lines.join("\n");
  }

  // ../shared/dist/mentions.js
  var HANDLE = /^[A-Za-z0-9][A-Za-z0-9._-]*/;
  function excludedRanges(body) {
    const ranges = [];
    for (const m of body.matchAll(/```[\s\S]*?```/g))
      ranges.push([m.index, m.index + m[0].length]);
    const fenced = (i) => ranges.some(([a, b]) => i >= a && i < b);
    for (const m of body.matchAll(/`[^`\n]*`/g)) {
      if (!fenced(m.index))
        ranges.push([m.index, m.index + m[0].length]);
    }
    return ranges;
  }
  function parseMentions(body) {
    if (!body)
      return [];
    const excluded = excludedRanges(body);
    const inExcluded = (i) => excluded.some(([a, b]) => i >= a && i < b);
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    for (let i = 0; i < body.length; i++) {
      if (body[i] !== "@")
        continue;
      if (inExcluded(i))
        continue;
      const prev = i > 0 ? body[i - 1] : "";
      if (prev && !/[\s([{<"'*_~]/.test(prev))
        continue;
      const match = HANDLE.exec(body.slice(i + 1));
      if (!match)
        continue;
      const raw = match[0];
      const handle = raw.replace(/[._-]+$/, "");
      if (!handle)
        continue;
      const key = handle.toLowerCase();
      if (seen.has(key))
        continue;
      seen.add(key);
      out.push({ handle, start: i, length: handle.length + 1 });
    }
    return out;
  }
  function mentionSegments(body, mentions) {
    if (!mentions.length)
      return [{ text: body, mention: false }];
    const sorted = [...mentions].sort((a, b) => a.start - b.start);
    const out = [];
    let at = 0;
    for (const m of sorted) {
      if (m.start > at)
        out.push({ text: body.slice(at, m.start), mention: false });
      out.push({ text: body.slice(m.start, m.start + m.length), mention: true });
      at = m.start + m.length;
    }
    if (at < body.length)
      out.push({ text: body.slice(at), mention: false });
    return out;
  }
  function mentionSuggestions(body, caret, candidates) {
    const before = body.slice(0, caret);
    const at = before.lastIndexOf("@");
    if (at < 0)
      return [];
    const typed = before.slice(at + 1);
    if (/\s/.test(typed))
      return [];
    const q = typed.toLowerCase();
    return candidates.filter((c) => !q || c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)).slice(0, 6);
  }

  // ../shared/dist/needs-you.js
  var NEEDS_YOU_LABELS = {
    review: "Waiting on your review",
    question: "The agent asked you something",
    failed: "The agent's run failed"
  };
  function looksLikeQuestion(body) {
    const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
    const last = lines[lines.length - 1];
    if (!last)
      return false;
    return /\?["')\]]*$/.test(last);
  }
  function needsYou(input) {
    const stage = normalizeStage2(input.status);
    if (stage === "resolved")
      return { needs: false };
    if (input.agentFailed)
      return { needs: true, reason: "failed", label: NEEDS_YOU_LABELS.failed };
    if (input.last?.fromAgent && looksLikeQuestion(input.last.body)) {
      return { needs: true, reason: "question", label: NEEDS_YOU_LABELS.question };
    }
    if (stage === "in_review")
      return { needs: true, reason: "review", label: NEEDS_YOU_LABELS.review };
    return { needs: false };
  }
  function normalizeStage2(status) {
    if (status === "open")
      return "queue";
    if (status === "done")
      return "resolved";
    return status;
  }

  // ../shared/dist/reactions.js
  var REACTION_CHOICES = ["\u{1F44D}", "\u{1F389}", "\u{1F440}", "\u{1F64F}", "\u2764\uFE0F", "\u{1F680}"];
  function summarizeReactions(reactions, viewerId) {
    const byEmoji = /* @__PURE__ */ new Map();
    for (const r of reactions) {
      const list = byEmoji.get(r.emoji) ?? [];
      list.push(r);
      byEmoji.set(r.emoji, list);
    }
    const rank = (emoji) => {
      const at = REACTION_CHOICES.indexOf(emoji);
      return at < 0 ? REACTION_CHOICES.length : at;
    };
    return [...byEmoji.entries()].map(([emoji, list]) => ({
      emoji,
      count: list.length,
      mine: viewerId ? list.some((r) => r.userId === viewerId) : false,
      users: list.map((r) => r.userName ?? r.userId)
    })).sort((a, b) => b.count - a.count || rank(a.emoji) - rank(b.emoji) || a.emoji.localeCompare(b.emoji));
  }
  function toggleReaction(reactions, next) {
    const has = reactions.some((r) => r.messageId === next.messageId && r.emoji === next.emoji && r.userId === next.userId);
    if (has) {
      return reactions.filter((r) => !(r.messageId === next.messageId && r.emoji === next.emoji && r.userId === next.userId));
    }
    return [...reactions, next];
  }

  // ../shared/dist/presence.js
  var PEER_HEARTBEAT_MS = 6e3;
  function initialsOf(name) {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (!words.length)
      return "?";
    if (words.length === 1)
      return words[0].slice(0, 1).toUpperCase();
    return (words[0].slice(0, 1) + words[words.length - 1].slice(0, 1)).toUpperCase();
  }

  // ../shared/dist/companion-tray.js
  function emptyTray() {
    return { items: [] };
  }
  function addToTray(state, item) {
    const full = { include: true, ...item };
    const at = state.items.findIndex((i) => i.id === full.id);
    if (at < 0)
      return { items: [...state.items, full] };
    const items = [...state.items];
    items[at] = { ...items[at], ...full, include: items[at].include };
    return { items };
  }
  function removeFromTray(state, id) {
    return { items: state.items.filter((i) => i.id !== id) };
  }
  function toggleInclude(state, id) {
    return { items: state.items.map((i) => i.id === id ? { ...i, include: !i.include } : i) };
  }
  function moveInTray(state, id, to) {
    const from = state.items.findIndex((i) => i.id === id);
    if (from < 0)
      return state;
    const target = Math.max(0, Math.min(state.items.length - 1, to));
    if (target === from)
      return state;
    const items = [...state.items];
    const [moved] = items.splice(from, 1);
    items.splice(target, 0, moved);
    return { items };
  }
  function nudgeInTray(state, id, delta) {
    const at = state.items.findIndex((i) => i.id === id);
    if (at < 0)
      return state;
    return moveInTray(state, id, at + delta);
  }
  function includedItems(state) {
    return state.items.filter((i) => i.include);
  }
  function trayCount(state) {
    return { total: state.items.length, included: includedItems(state).length };
  }
  function clearTray() {
    return { items: [] };
  }
  function trayPayload(state) {
    return includedItems(state).map((i) => ({
      kind: i.kind,
      id: i.ref ?? i.id,
      url: i.url,
      label: i.label
    }));
  }
  function traySummary(state) {
    const { total, included } = trayCount(state);
    if (!total)
      return "No context gathered";
    if (included === total)
      return `${total} context${total === 1 ? "" : "s"}`;
    return `${included} of ${total} included`;
  }
  function voiceSupport(env) {
    if (!env.isSecureContext)
      return "insecure";
    return env.hasCtor ? "supported" : "unsupported";
  }
  function voiceMessage(support) {
    if (support === "supported")
      return null;
    if (support === "insecure")
      return "Dictation needs a secure page (https, or localhost).";
    return "This browser cannot dictate \u2014 the Web Speech API is not available.";
  }
  function elapsedLabel(ms) {
    const total = Math.max(0, Math.floor(ms / 1e3));
    const mm = Math.floor(total / 60);
    const ss = total % 60;
    return `${mm}:${String(ss).padStart(2, "0")}`;
  }

  // ../shared/dist/index.js
  var COMMENT_STAGES = ["queue", "todo", "in_progress", "in_review", "resolved"];
  var STAGE_LABELS = {
    queue: "Queue",
    todo: "To Do",
    in_progress: "In Progress",
    in_review: "In Review",
    resolved: "Resolved"
  };
  var LEGACY_STATUS = {
    open: "queue",
    in_progress: "in_progress",
    done: "resolved"
  };
  function normalizeStatus(value) {
    if (typeof value === "string") {
      if (COMMENT_STAGES.includes(value))
        return value;
      if (value in LEGACY_STATUS)
        return LEGACY_STATUS[value];
    }
    return "queue";
  }
  var COMMENT_PRIORITIES = ["critical", "high", "medium", "low"];
  var PRIORITY_LABELS = {
    critical: "Critical",
    high: "High",
    medium: "Medium",
    low: "Low"
  };
  var CHANGE_TYPES = ["frontend", "backend", "api", "other"];
  var CHANGE_TYPE_LABELS = {
    frontend: "Frontend",
    backend: "Backend",
    api: "API",
    other: "Other"
  };
  var DEFAULT_PRIORITY = "medium";
  var DEFAULT_CHANGE_TYPE = "other";
  function normalizePriority(value) {
    if (typeof value === "string" && COMMENT_PRIORITIES.includes(value)) {
      return value;
    }
    return DEFAULT_PRIORITY;
  }

  // src/store.ts
  var LocalStorageAdapter = class {
    key(projectKey, url) {
      return `loupe:${projectKey}:${url}`;
    }
    readAll(projectKey, url) {
      try {
        const raw = localStorage.getItem(this.key(projectKey, url));
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    }
    writeAll(projectKey, url, comments) {
      localStorage.setItem(this.key(projectKey, url), JSON.stringify(comments));
    }
    async list(projectKey, url) {
      return this.readAll(projectKey, url);
    }
    /** Every page's comments for this project, newest first — the "All" scope. */
    async listAll(projectKey) {
      const prefix = `loupe:${projectKey}:`;
      const out = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(prefix)) continue;
        try {
          out.push(...JSON.parse(localStorage.getItem(k) || "[]"));
        } catch {
        }
      }
      return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    async save(comment) {
      const all = this.readAll(comment.projectKey, comment.url);
      all.push(comment);
      this.writeAll(comment.projectKey, comment.url, all);
      return comment;
    }
    /**
     * Offline mode: keep the file inline. localStorage is only a few MB, so refuse
     * anything that would blow the quota rather than silently dropping it.
     */
    async upload(_projectKey, file) {
      if (file.size > 3e6) throw new Error("attachment too large for offline mode");
      return {
        url: await fileToDataUrl(file),
        name: file.name,
        mime: file.type || void 0,
        kind: attachmentKind(file.type),
        size: file.size
      };
    }
    /**
     * Keys that hold a comment list. `loupe:dock` (panel state) and `loupe:msgs:*`
     * (replies) share the prefix but are not comment lists — treating them as one made
     * update()/remove() throw, and would have it hunt a comment id among messages.
     */
    commentKeys() {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("loupe:") && k !== "loupe:dock" && !k.startsWith("loupe:msgs:")) keys.push(k);
      }
      return keys;
    }
    parseList(key) {
      try {
        const value = JSON.parse(localStorage.getItem(key) || "[]");
        return Array.isArray(value) ? value : [];
      } catch {
        return [];
      }
    }
    /** Replies, kept under their own key so they survive a comment being re-saved. */
    msgKey(threadId) {
      return `loupe:msgs:${threadId}`;
    }
    async listMessages(threadId) {
      try {
        const raw = localStorage.getItem(this.msgKey(threadId));
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    async addMessage(threadId, message) {
      const stored = {
        id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        threadId,
        author: message.author,
        body: message.body,
        attachments: message.attachments?.length ? message.attachments : void 0,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      const all = await this.listMessages(threadId);
      all.push(stored);
      localStorage.setItem(this.msgKey(threadId), JSON.stringify(all));
      return stored;
    }
    /** Offline reactions, keyed per thread. */
    async listReactions(threadId) {
      try {
        const raw = localStorage.getItem(`loupe:rxn:${threadId}`);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    async toggleReaction(input) {
      const current2 = await this.listReactions(input.threadId);
      const next = toggleReaction(current2, {
        messageId: input.messageId,
        emoji: input.emoji,
        userId: input.userId,
        userName: input.userName
      });
      localStorage.setItem(`loupe:rxn:${input.threadId}`, JSON.stringify(next));
      return next;
    }
    /** Offline: the people are whoever has already commented locally. */
    async listPeople(projectKey) {
      const prefix = `loupe:${projectKey}:`;
      const seen = /* @__PURE__ */ new Map();
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(prefix)) continue;
        for (const c of this.parseList(k)) {
          if (c.author?.id && !seen.has(c.author.id)) seen.set(c.author.id, c.author);
        }
      }
      return [...seen.values()];
    }
    /** Offline mode has no server to notify anyone from. */
    async listNotifications() {
      return [];
    }
    async markNotificationsRead() {
    }
    async update(id, patch) {
      for (const k of this.commentKeys()) {
        const list = this.parseList(k);
        const idx = list.findIndex((c) => c.id === id);
        if (idx >= 0) {
          list[idx] = { ...list[idx], ...patch };
          localStorage.setItem(k, JSON.stringify(list));
          return;
        }
      }
    }
    async remove(id) {
      for (const k of this.commentKeys()) {
        const list = this.parseList(k);
        const next = list.filter((c) => c.id !== id);
        if (next.length !== list.length) {
          localStorage.setItem(k, JSON.stringify(next));
          return;
        }
      }
    }
  };

  // src/http-adapter.ts
  var HttpAdapter = class {
    constructor(base, user, userHmac, extraHeaders, credentials) {
      this.base = base;
      this.user = user;
      this.userHmac = userHmac;
      this.extraHeaders = extraHeaders;
      this.credentials = credentials;
      this.base = base.replace(/\/$/, "");
    }
    headers() {
      const h = { "Content-Type": "application/json", "X-Loupe-User": this.user.id };
      if (this.userHmac) h["X-Loupe-Hmac"] = this.userHmac;
      if (this.extraHeaders) Object.assign(h, this.extraHeaders);
      return h;
    }
    /** Base fetch options shared by every request (credentials mode, if set). */
    opts(init2) {
      return this.credentials ? { credentials: this.credentials, ...init2 } : { ...init2 };
    }
    async list(projectKey, url) {
      const q = new URLSearchParams({ projectKey, url });
      const res = await fetch(`${this.base}/v1/comments?${q}`, this.opts({ headers: this.headers() }));
      if (!res.ok) throw new Error(`list failed: ${res.status}`);
      return await res.json();
    }
    /** Every comment in the project (no page filter) — the "All" scope. */
    async listAll(projectKey) {
      const q = new URLSearchParams({ projectKey });
      const res = await fetch(`${this.base}/v1/comments?${q}`, this.opts({ headers: this.headers() }));
      if (!res.ok) throw new Error(`listAll failed: ${res.status}`);
      return await res.json();
    }
    /** Upload an inline data-URL asset to object storage; return its URL (or the data URL on failure). */
    async uploadBlob(projectKey, data) {
      try {
        const up = await fetch(`${this.base}/v1/blobs`, this.opts({
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({ projectKey, data })
        }));
        if (up.ok) return (await up.json()).url;
      } catch {
      }
      return data;
    }
    async save(comment) {
      if (comment.screenshot?.startsWith("data:")) {
        comment = { ...comment, screenshot: await this.uploadBlob(comment.projectKey, comment.screenshot) };
      }
      if (comment.recording?.startsWith("data:")) {
        comment = { ...comment, recording: await this.uploadBlob(comment.projectKey, comment.recording) };
      }
      const res = await fetch(`${this.base}/v1/comments`, this.opts({
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(comment)
      }));
      if (!res.ok) throw new Error(`save failed: ${res.status}`);
      return await res.json();
    }
    /** Persist one reporter-attached file to object storage and describe it. */
    async upload(projectKey, file) {
      const data = await fileToDataUrl(file);
      return {
        url: await this.uploadBlob(projectKey, data),
        name: file.name,
        mime: file.type || void 0,
        kind: attachmentKind(file.type),
        size: file.size
      };
    }
    /** Replies on a thread. The comment's own body is message #1, not returned here. */
    async listMessages(threadId) {
      const res = await fetch(`${this.base}/v1/comments/${encodeURIComponent(threadId)}/messages`, this.opts({ headers: this.headers() }));
      if (!res.ok) throw new Error(`listMessages failed: ${res.status}`);
      return await res.json();
    }
    async addMessage(threadId, message) {
      const res = await fetch(`${this.base}/v1/comments/${encodeURIComponent(threadId)}/messages`, this.opts({
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(message)
      }));
      if (!res.ok) throw new Error(`addMessage failed: ${res.status}`);
      return await res.json();
    }
    async listReactions(threadId) {
      const res = await fetch(`${this.base}/v1/comments/${encodeURIComponent(threadId)}/reactions`, this.opts({ headers: this.headers() }));
      if (res.status === 404) return [];
      if (!res.ok) throw new Error(`listReactions failed: ${res.status}`);
      return (await res.json()).reactions;
    }
    async toggleReaction(input) {
      const res = await fetch(
        `${this.base}/v1/comments/${encodeURIComponent(input.threadId)}/messages/${encodeURIComponent(input.messageId)}/reactions`,
        this.opts({
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({ emoji: input.emoji, userId: input.userId, userName: input.userName })
        })
      );
      if (!res.ok) throw new Error(`toggleReaction failed: ${res.status}`);
      return (await res.json()).reactions;
    }
    /** Everyone who has taken part in this project, for mention resolution. */
    async listPeople(projectKey) {
      const q = new URLSearchParams({ projectKey });
      const res = await fetch(`${this.base}/v1/people?${q}`, this.opts({ headers: this.headers() }));
      if (!res.ok) throw new Error(`listPeople failed: ${res.status}`);
      return await res.json();
    }
    async listNotifications(projectKey, recipient) {
      const q = new URLSearchParams({ projectKey, recipient });
      const res = await fetch(`${this.base}/v1/notifications?${q}`, this.opts({ headers: this.headers() }));
      if (!res.ok) throw new Error(`listNotifications failed: ${res.status}`);
      return (await res.json()).notifications;
    }
    async markNotificationsRead(projectKey, recipient, id) {
      await fetch(`${this.base}/v1/notifications/read`, this.opts({
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ projectKey, recipient, id })
      }));
    }
    async update(id, patch) {
      const res = await fetch(`${this.base}/v1/comments/${encodeURIComponent(id)}`, this.opts({
        method: "PATCH",
        headers: this.headers(),
        body: JSON.stringify(patch)
      }));
      if (!res.ok) throw new Error(`update failed: ${res.status}`);
    }
    async remove(id) {
      const res = await fetch(`${this.base}/v1/comments/${encodeURIComponent(id)}`, this.opts({
        method: "DELETE",
        headers: this.headers()
      }));
      if (!res.ok && res.status !== 404) throw new Error(`remove failed: ${res.status}`);
    }
  };

  // src/app.ts
  var SDK_VERSION = true ? "0.11.0" : "dev";
  var FAB_SIZE = 46;
  var FAB_DRAG_THRESHOLD = 6;
  var LAUNCHER_SHORTCUT = "Alt+Shift+L";
  var ACCENTS = [
    { id: "indigo", dark: "#6b73e6", light: "#4a55d6", soft: "rgba(107,115,230,0.12)" },
    { id: "violet", dark: "#a06be6", light: "#7c3fd4", soft: "rgba(160,107,230,0.14)" },
    { id: "teal", dark: "#2fb6a8", light: "#0f8f83", soft: "rgba(47,182,168,0.14)" },
    { id: "amber", dark: "#d99a2b", light: "#a9700f", soft: "rgba(217,154,43,0.14)" },
    { id: "rose", dark: "#e05c86", light: "#c2295a", soft: "rgba(224,92,134,0.14)" }
  ];
  var ACCENT_IDS = ACCENTS.map((a) => a.id);
  var TOUR = [
    // Home first: the panel already opens there, so the first step never moves the
    // user — the tour starts where they are.
    {
      sel: ".hstat",
      tab: "home",
      title: "Home shows what needs you",
      body: "Four tiles count open, needs-you, resolved and stale feedback. Click one to narrow the list to that bucket."
    },
    {
      sel: ".hscope",
      tab: "home",
      title: "This page, or the whole project",
      body: "Switch to All to see every page's feedback as a day-grouped timeline, with a repo filter."
    },
    {
      sel: ".tools",
      tab: "comments",
      title: "Pin feedback anywhere",
      body: "Inspect picks an element, Note drops a page-level comment, Region captures a rectangle, and Record films one."
    },
    {
      sel: '.tabs [data-tab="activity"]',
      tab: "activity",
      title: "Watch the work happen",
      body: "Anything an agent bridge or your app reports lands here \u2014 with tool chips to filter it, and Loupe's own operations alongside."
    },
    {
      sel: '.dctl [data-role="settings"]',
      tab: "activity",
      title: "Make it yours",
      body: "Accents, the visibility switches, and Restart tour all live here."
    }
  ];
  var HINTS = {
    chat: {
      title: "Talk to the agent",
      body: "Gather what you are looking at and send it in one go. The agent gets it on its very next step \u2014 not after it finishes."
    },
    home: { title: "Your triage at a glance", body: "The tiles count this page by default. Switch to All for the whole project, or click a tile to jump straight to that bucket." },
    comments: { title: "Pin, note or record", body: "Inspect selects an element, Note comments anywhere on the page, Region screenshots a rectangle, and Record captures video of one." },
    activity: { title: "Watch the work happen", body: "Every event the bridge or your app reports lands here, alongside Loupe's own operations. Click a tool chip to filter the feed." }
  };
  var BUILTIN_TABS = [
    { id: "home", label: "Home" },
    { id: "comments", label: "Comments" },
    { id: "activity", label: "Activity" },
    { id: "chat", label: "Chat" }
  ];
  var DOCK_MODES = ["left", "right", "bottom", "float"];
  var RECORD_MAX_MS = 2e4;
  var MAX_FILES = 10;
  var MAX_IMAGE_BYTES = 10 * 1024 * 1024;
  var MAX_VIDEO_BYTES = 25 * 1024 * 1024;
  var uid2 = () => crypto.randomUUID ? crypto.randomUUID() : "c_" + Math.abs(hash(String(performance.now()))).toString(36);
  function hash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = h * 31 + s.charCodeAt(i) | 0;
    return h;
  }
  function isTouchDevice() {
    try {
      if (window.matchMedia("(pointer: coarse)").matches) return true;
      if (window.matchMedia("(hover: none)").matches) return true;
    } catch {
    }
    if (typeof navigator !== "undefined" && (navigator.maxTouchPoints ?? 0) > 0) return true;
    return typeof window !== "undefined" && "ontouchstart" in window;
  }
  function coarsePointer() {
    try {
      return window.matchMedia("(pointer: coarse)").matches;
    } catch {
      return false;
    }
  }
  function canShareScreen() {
    return typeof navigator.mediaDevices?.getDisplayMedia === "function";
  }
  function dataUrlToFile(dataUrl, name) {
    const m = /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(dataUrl);
    if (!m) return null;
    const [, type, b64, payload = ""] = m;
    try {
      const raw = b64 ? atob(payload) : decodeURIComponent(payload);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      return new File([bytes], name, { type: type || "image/png" });
    } catch {
      return null;
    }
  }
  var LoupeApp = class {
    constructor(cfg) {
      /** Whether the quick-action minis are expanded out of the primary FAB. */
      this.fabExpanded = false;
      /** Whether pin markers are hidden on the page (a quick-action toggle, persisted). */
      this.markersHidden = false;
      /**
       * Whether the collapsed launcher is hidden altogether (persisted). The way back is
       * Alt+Shift+L, Settings → Launcher, or the host calling `showLauncher()`.
       */
      this.launcherHidden = false;
      /**
       * Where the user dragged the launcher to — the launcher's top-left in viewport px —
       * or null for the default corner on the dock's side. Persisted; clamped on apply so
       * a position saved on a wide screen still lands inside a narrow one.
       */
      this.fabPos = null;
      /** The in-flight launcher drag: pointer start, launcher origin, and whether it has moved past the tap threshold. */
      this.fabDrag = null;
      /** Set for one tick after a drag so the click the browser fires afterwards does not open the panel. */
      this.fabSuppressClick = false;
      this.comments = [];
      /** Free-text filter over the list (title / body / author). */
      this.search = "";
      /** Ids of list items the user expanded — items are collapsed by default. */
      this.expanded = /* @__PURE__ */ new Set();
      /** comment.id → currently resolved element (or null when detached). */
      this.resolved = /* @__PURE__ */ new Map();
      /** comment.id → pin element. */
      this.pins = /* @__PURE__ */ new Map();
      this.mode = "off";
      this.lastUrl = "";
      this.targetOffset = { x: 0.5, y: 0.5 };
      this.pending = null;
      this.dragStart = null;
      /** region comment whose outline is currently highlighted (tracks scroll). */
      this.activeRegionId = null;
      // ---- control-panel state (persisted in localStorage `loupe:dock`) ----------
      this.dockMode = "right";
      this.open = true;
      this.theme = "dark";
      this.tab = "home";
      /** "page" = this URL only; "all" = the whole project (the timeline scope). */
      this.scope = "page";
      /** Every-page comments, fetched the first time the "All" scope is opened. */
      this.allComments = [];
      /** A clicked stat tile, which narrows the list. */
      this.statFilter = "";
      /** Repo filter, offered once the scope is "all". */
      this.repoFilter = "";
      /** Accent preset id (see ACCENTS), applied as inline --accent / --accent-soft. */
      this.accent = "indigo";
      /** Collapsed to the one-line minimize bar. */
      this.minimized = false;
      /** The "help layer": FAB tooltips and the contextual hint cards. */
      this.hoverHints = true;
      /** Show each comment's page path (useful in the project scope). */
      this.showPaths = false;
      /** Views whose hint card has already been shown. */
      this.hintsSeen = /* @__PURE__ */ new Set();
      /** Current guided-tour step, or -1 when the tour is closed. */
      this.tourStep = -1;
      /** The first-run tour has been finished or skipped. */
      this.tourDone = false;
      /** The live Activity feed — in memory only; it is a monitor, not an archive. */
      this.activityEvents = [];
      this.activityStatus = "idle";
      /** A tool chip the user clicked, which narrows the feed to that kind. */
      this.activityFilter = "";
      /** Auto-scroll the feed to the newest event (off while the user is reading). */
      this.activityFollow = true;
      /** The summary card's key/value rows are behind this toggle. */
      this.summaryOpen = false;
      /** Per-browser project settings: a repo override and the environment URLs. */
      this.project = { environments: [] };
      /** Iteration history per thread — generating a change is a stack, not a one-shot. */
      this.iterations = /* @__PURE__ */ new Map();
      /** The thread whose generate pane is open, if any. */
      this.genOpen = null;
      /** Threads with a generation in flight. */
      this.genBusy = /* @__PURE__ */ new Set();
      /** Opacity of the generated plane over the original, 0..1 (the compare slider). */
      this.genOpacity = 0.6;
      /** The navigation consent state machine — a URL only ever comes out of `decide`. */
      this.consent = emptyConsent();
      /** The live SpeechRecognition instance while dictating, if any. */
      this.voice = null;
      this.projSearch = "";
      this.projOpen = false;
      this.projResults = [];
      this.projError = "";
      this.envDraft = "";
      /** Guards against a slow repo search overwriting a newer one. */
      this.repoSeq = 0;
      /** Float-mode window geometry; (x<=0 && y<=0) → placed on first layout. */
      this.floatRect = { x: 0, y: 0, w: 380, h: 540 };
      this.floatDrag = null;
      this.floatResize = null;
      this.raf = 0;
      /** Tab id → its hint slot (custom tabs only; the built-ins have named fields). */
      this.customHintSlots = /* @__PURE__ */ new Map();
      /** The tab strip, in order. */
      this.tabList = [];
      /**
       * Each page's container, keyed by tab id. Display is driven by an "on" class
       * rather than a `.tab-<id>` selector, so host-registered ids need no CSS.
       */
      this.viewEls = /* @__PURE__ */ new Map();
      /** The gather tray: elements and screenshots collected into one message. */
      this.chatTray = emptyTray();
      /** Sent messages and received replies, in one ordered transcript. */
      this.chatLog = [];
      this.chatUnread = 0;
      this.chatSending = false;
      this.chatError = "";
      this.voiceOn = false;
      this.voiceBase = "";
      this.voiceStart = 0;
      this.lastReplyId = "";
      /** In-app notifications: mentions of you, newest first. */
      this.notifications = [];
      // ---- launcher: drag anywhere, hide, bring back ------------------------------
      this.onFabPointerDown = (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        const target = e.currentTarget;
        const r = target.getBoundingClientRect();
        this.fabDrag = { px: e.clientX, py: e.clientY, ox: r.left, oy: r.top, moved: false };
        let captured = false;
        try {
          if (typeof target.setPointerCapture === "function") {
            target.setPointerCapture(e.pointerId);
            captured = true;
          }
        } catch {
          captured = false;
        }
        if (!captured) {
          window.addEventListener("pointermove", this.onFabPointerMove);
          window.addEventListener("pointerup", this.onFabPointerUp);
          window.addEventListener("pointercancel", this.onFabPointerUp);
        }
      };
      this.onFabPointerMove = (e) => {
        const d = this.fabDrag;
        if (!d) return;
        const dx = e.clientX - d.px, dy = e.clientY - d.py;
        if (!d.moved && Math.hypot(dx, dy) < FAB_DRAG_THRESHOLD) return;
        if (!d.moved) {
          d.moved = true;
          this.fabCluster.classList.add("dragging");
          this.collapseFab();
        }
        e.preventDefault();
        this.fabPos = this.clampFabPos(d.ox + dx, d.oy + dy);
        this.applyFabPosition();
      };
      this.onFabPointerUp = () => {
        window.removeEventListener("pointermove", this.onFabPointerMove);
        window.removeEventListener("pointerup", this.onFabPointerUp);
        window.removeEventListener("pointercancel", this.onFabPointerUp);
        const d = this.fabDrag;
        this.fabDrag = null;
        if (!d?.moved) return;
        this.fabCluster.classList.remove("dragging");
        this.saveState();
        this.renderSettings();
        this.fabSuppressClick = true;
        window.setTimeout(() => {
          this.fabSuppressClick = false;
        }, 0);
      };
      // ---- inspector ------------------------------------------------------------
      // Pointer Events, not mouse events: a touch drag on a phone never fires
      // mousemove/mouseup, so Region/Record selection was impossible on touch devices.
      // Pointer events cover mouse, touch and pen with one handler each.
      this.onMove = (e) => {
        if (this.mode !== "inspect") return;
        const target = this.pick(e.clientX, e.clientY);
        if (!target) {
          this.hl.style.display = "none";
          return;
        }
        const r = target.getBoundingClientRect();
        Object.assign(this.hl.style, {
          display: "block",
          left: r.left + "px",
          top: r.top + "px",
          width: r.width + "px",
          height: r.height + "px"
        });
        this.hl.firstChild.textContent = target.tagName.toLowerCase() + (target.id ? "#" + target.id : "");
      };
      this.onClick = (e) => {
        if (this.mode !== "inspect") return;
        const target = this.pick(e.clientX, e.clientY);
        if (!target) return;
        e.preventDefault();
        e.stopPropagation();
        const r = target.getBoundingClientRect();
        this.targetOffset = {
          x: r.width ? clamp((e.clientX - r.left) / r.width) : 0.5,
          y: r.height ? clamp((e.clientY - r.top) / r.height) : 0.5
        };
        this.setMode("off");
        this.openComposer({ kind: "element", element: target }, e.clientX, e.clientY);
      };
      this.onKey = (e) => {
        if (e.key === "Escape") {
          this.cancelDrag();
          this.setMode("off");
          this.closeComposer();
        }
      };
      /**
       * Alt+Shift+L toggles the launcher — the way back once it has been hidden, so it is
       * listened for the whole time the widget is mounted (unlike Escape, which only
       * matters while a tool is armed). `code` is checked too: on some keyboard layouts
       * Alt+Shift+L yields a different `key`.
       */
      this.onLauncherKey = (e) => {
        if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return;
        if (e.code !== "KeyL" && (e.key ?? "").toLowerCase() !== "l") return;
        e.preventDefault();
        this.setLauncherHidden(!this.launcherHidden);
      };
      // ---- region ("free-size screenshot") selection ----------------------------
      this.onRegionDown = (e) => {
        if (this.mode !== "region" && this.mode !== "record") return;
        if (e.pointerType !== "touch" && e.pointerType !== "pen" && e.button !== 0) return;
        const t = e.target;
        if (t && (t.id === "loupe-root" || t.closest?.("#loupe-root"))) return;
        e.preventDefault();
        e.stopPropagation();
        this.dragStart = { x: e.clientX, y: e.clientY };
        document.addEventListener("pointermove", this.onRegionMove, true);
        document.addEventListener("pointerup", this.onRegionUp, true);
        document.addEventListener("pointercancel", this.onRegionCancel, true);
        this.drawSelection(e.clientX, e.clientY);
      };
      this.onRegionMove = (e) => {
        if (!this.dragStart) return;
        e.preventDefault();
        this.drawSelection(e.clientX, e.clientY);
      };
      this.onRegionUp = (e) => {
        if (!this.dragStart) return;
        e.preventDefault();
        e.stopPropagation();
        const start = this.dragStart;
        const wasRecord = this.mode === "record";
        this.cancelDrag();
        const vp = {
          x: Math.min(start.x, e.clientX),
          y: Math.min(start.y, e.clientY),
          w: Math.abs(e.clientX - start.x),
          h: Math.abs(e.clientY - start.y)
        };
        if (vp.w < 8 || vp.h < 8) {
          this.selbox.style.display = "none";
          return;
        }
        this.setMode("off");
        if (wasRecord) void this.finishRecording(vp);
        else this.finishRegion(vp);
      };
      /** The OS took over the gesture (e.g. a system swipe): drop the selection. */
      this.onRegionCancel = () => {
        this.cancelDrag();
        this.selbox.style.display = "none";
      };
      // ---- free note (drop a comment anywhere, no element / no screenshot) -------
      this.onFreeClick = (e) => {
        if (this.mode !== "free") return;
        const t = e.target;
        if (t && (t.id === "loupe-root" || t.closest?.("#loupe-root"))) return;
        e.preventDefault();
        e.stopPropagation();
        const docX = e.clientX + window.scrollX;
        const docY = e.clientY + window.scrollY;
        const docW = Math.max(1, document.documentElement.scrollWidth);
        const docH = Math.max(1, document.documentElement.scrollHeight);
        const offset = { x: clamp(docX / docW), y: clamp(docY / docH) };
        this.setMode("off");
        this.openComposer({ kind: "free", offset, point: { x: docX, y: docY } }, e.clientX, e.clientY);
      };
      /** Reposition every pin, re-resolving anchors whose element has gone. */
      this.position = () => {
        for (const c of this.comments) {
          const pin = this.pins.get(c.id);
          if (!pin) continue;
          if (c.kind === "free") {
            const docW = Math.max(1, document.documentElement.scrollWidth);
            const docH = Math.max(1, document.documentElement.scrollHeight);
            const px = c.offset.x * docW - window.scrollX;
            const py = c.offset.y * docH - window.scrollY;
            const onScreen = px > -24 && px < window.innerWidth + 24 && py > -24 && py < window.innerHeight + 24;
            Object.assign(pin.style, { left: px + "px", top: py + "px", display: onScreen ? "grid" : "none" });
            pin.classList.remove("detached");
            continue;
          }
          let elx = this.resolved.get(c.id) ?? null;
          if (!elx || !elx.isConnected) {
            let r = null;
            try {
              r = resolveAnchor(c.anchor);
            } catch {
              r = null;
            }
            elx = r?.element ?? null;
            this.resolved.set(c.id, elx);
          }
          if (c.kind === "region") {
            const box = this.regionRect(c, elx);
            if (box) {
              const onScreen = box.x + box.w > 0 && box.x < window.innerWidth && box.y + box.h > 0 && box.y < window.innerHeight;
              Object.assign(pin.style, { left: box.x + "px", top: box.y + "px", display: onScreen ? "grid" : "none" });
              pin.classList.toggle("detached", !elx && !c.region?.rel);
            } else {
              pin.style.display = "none";
              pin.classList.add("detached");
            }
            continue;
          }
          if (elx) {
            const rect = elx.getBoundingClientRect();
            const px = rect.left + c.offset.x * rect.width;
            const py = rect.top + c.offset.y * rect.height;
            const onScreen = rect.bottom > 0 && rect.top < window.innerHeight && rect.width > 0;
            Object.assign(pin.style, { left: px + "px", top: py + "px", display: onScreen ? "grid" : "none" });
            pin.classList.remove("detached");
          } else {
            pin.style.display = "none";
            pin.classList.add("detached");
          }
        }
        if (this.activeRegionId) {
          const c = this.comments.find((x) => x.id === this.activeRegionId);
          const box = c && this.regionRect(c, this.resolved.get(c.id) ?? null);
          if (box) {
            Object.assign(this.regionBox.style, {
              display: "block",
              left: box.x + "px",
              top: box.y + "px",
              width: box.w + "px",
              height: box.h + "px"
            });
          }
        }
      };
      this.onWinResize = () => this.applyDockLayout();
      /** Which view's hint has been handled this session (so it is not re-painted). */
      this.hintFor = null;
      // ---- float-mode drag + resize ---------------------------------------------
      this.onHeadPointerDown = (e) => {
        if (this.dockMode !== "float" || e.button !== 0 || this.isMobile()) return;
        if (e.target?.closest(".dctl")) return;
        this.floatDrag = { px: e.clientX, py: e.clientY, ox: this.floatRect.x, oy: this.floatRect.y };
        this.dock.classList.add("dragging");
        window.addEventListener("pointermove", this.onHeadPointerMove);
        window.addEventListener("pointerup", this.onHeadPointerUp);
      };
      this.onHeadPointerMove = (e) => {
        if (!this.floatDrag) return;
        e.preventDefault();
        this.floatRect.x = this.floatDrag.ox + (e.clientX - this.floatDrag.px);
        this.floatRect.y = this.floatDrag.oy + (e.clientY - this.floatDrag.py);
        this.applyDockLayout();
      };
      this.onHeadPointerUp = () => {
        if (!this.floatDrag) return;
        this.floatDrag = null;
        this.dock.classList.remove("dragging");
        window.removeEventListener("pointermove", this.onHeadPointerMove);
        window.removeEventListener("pointerup", this.onHeadPointerUp);
        this.saveState();
      };
      this.onResizeDown = (e) => {
        if (this.dockMode !== "float") return;
        e.preventDefault();
        e.stopPropagation();
        this.floatResize = { px: e.clientX, py: e.clientY, ow: this.floatRect.w, oh: this.floatRect.h };
        window.addEventListener("pointermove", this.onResizeMove);
        window.addEventListener("pointerup", this.onResizeUp);
      };
      this.onResizeMove = (e) => {
        if (!this.floatResize) return;
        e.preventDefault();
        this.floatRect.w = this.floatResize.ow + (e.clientX - this.floatResize.px);
        this.floatRect.h = this.floatResize.oh + (e.clientY - this.floatResize.py);
        this.applyDockLayout();
      };
      this.onResizeUp = () => {
        if (!this.floatResize) return;
        this.floatResize = null;
        window.removeEventListener("pointermove", this.onResizeMove);
        window.removeEventListener("pointerup", this.onResizeUp);
        this.saveState();
      };
      /** Draft follow-ups, kept out of the render path so the input never loses focus. */
      this.iterDraft = /* @__PURE__ */ new Map();
      this.voiceTarget = null;
      /** Replies per thread, loaded lazily when a card is expanded. */
      this.messages = /* @__PURE__ */ new Map();
      /** Reply drafts, kept out of the render path so the textarea keeps focus. */
      this.msgDrafts = /* @__PURE__ */ new Map();
      /** Optimistic replies awaiting the store. */
      this.msgPending = /* @__PURE__ */ new Set();
      /** Optimistic replies the store rejected — offered for retry rather than lost. */
      this.msgFailed = /* @__PURE__ */ new Set();
      this.msgErr = /* @__PURE__ */ new Map();
      /** Other people on this page. Empty unless a bridge is configured. */
      this.peers = [];
      /** Reactions per thread, keyed `${threadId}:${messageId}`, so a re-render is free. */
      this.reactions = /* @__PURE__ */ new Map();
      /** Everyone who has taken part, for mention autocomplete. Fetched once. */
      this.people = /* @__PURE__ */ new Map();
      this.cfg = cfg;
      this.store = cfg.apiBase ? new HttpAdapter(cfg.apiBase, cfg.user, cfg.userHmac, cfg.headers, cfg.credentials) : new LocalStorageAdapter();
    }
    get url() {
      return location.pathname + location.search;
    }
    async start() {
      this.loadState();
      this.loadProject();
      this.buildDom();
      document.addEventListener("keydown", this.onLauncherKey);
      if (this.cfg.autoOpen) this.open = true;
      this.applyDockLayout();
      this.lastUrl = this.url;
      this.comments = await this.store.list(this.cfg.projectKey, this.url);
      this.renderPins();
      this.renderList();
      this.renderHome();
      this.startPresence();
      this.startLiveThreads();
      this.startCompanionStream();
      void this.loadNotifications();
      if (this.scope === "all") void this.loadAllComments();
      this.observe();
      this.watchNavigation();
      if (!this.tourDone && this.open && !this.isMobile()) this.startTour();
      if (this.cfg.autoOpen) this.setMode(this.cfg.tool === "note" ? "free" : "inspect");
    }
    /** Arm a tool from outside — the extension's context menus, or a host's own button. */
    openTool(tool) {
      this.open = true;
      this.applyDockLayout();
      this.setMode(tool === "note" ? "free" : "inspect");
    }
    /**
     * Reload comments when the page URL changes without a full reload (SPA
     * navigation), so each page only ever shows its own comments.
     */
    watchNavigation() {
      const onChange = () => {
        if (this.url === this.lastUrl) return;
        this.lastUrl = this.url;
        void this.reloadComments();
      };
      addEventListener("popstate", onChange);
      for (const key of ["pushState", "replaceState"]) {
        const original = history[key];
        history[key] = function(...args) {
          const result = original.apply(this, args);
          dispatchEvent(new Event("loupe:locationchange"));
          return result;
        };
      }
      addEventListener("loupe:locationchange", onChange);
    }
    async reloadComments() {
      try {
        this.comments = await this.store.list(this.cfg.projectKey, this.url);
        this.renderPins();
        this.renderList();
      } catch {
      }
    }
    // ---- DOM construction -----------------------------------------------------
    buildDom() {
      this.root = document.createElement("div");
      this.root.id = "loupe-root";
      document.body.appendChild(this.root);
      this.shadow = this.root.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = STYLES;
      this.shadow.appendChild(style);
      this.overlay = el("div", "overlay");
      this.hl = el("div", "hl");
      this.hl.appendChild(el("span", "tip"));
      this.selbox = el("div", "selbox");
      this.regionBox = el("div", "region-box");
      this.overlay.append(this.hl, this.selbox, this.regionBox);
      this.shadow.appendChild(this.overlay);
      this.composer = el("div", "composer");
      this.shadow.appendChild(this.composer);
      this.dock = this.buildDock();
      this.fabCluster = this.buildFabCluster();
      this.recBar = this.buildRecBar();
      this.toastEl = el("div", "toast");
      this.toastEl.setAttribute("role", "status");
      this.toastEl.setAttribute("aria-live", "polite");
      this.toastEl.onclick = () => this.toastEl.classList.remove("show");
      this.tourEl = el("div", "tour");
      this.tourSpot = el("div", "tour-spot");
      this.tourCard = el("div", "tour-card");
      this.tourEl.append(this.tourSpot, this.tourCard);
      this.shadow.append(this.dock, this.fabCluster, this.recBar, this.toastEl, this.tourEl);
      this.shadow.addEventListener("click", (e) => {
        const t = e.target;
        if (t?.closest && t.closest(".menu-wrap")) return;
        this.closeMenus();
      });
    }
    /**
     * The dockable control panel:
     * header (brand + dock controls) → tabs → [Comments view: tools + list + integrations]
     * and a [Connect view] with the Claude/MCP onboarding steps.
     */
    buildDock() {
      const dock = el("div", "dock");
      const head = el("div", "dhead");
      const brand = el("div", "brand");
      brand.innerHTML = `<span class="logo">\u25CE</span><span class="title"></span>`;
      brand.querySelector(".title").textContent = this.cfg.label ?? "Loupe";
      head.addEventListener("pointerdown", this.onHeadPointerDown);
      const ctl = el("div", "dctl");
      const posWrap = el("div", "menu-wrap");
      const posBtn = el("button");
      posBtn.dataset.role = "pos";
      posBtn.title = "Panel position";
      posBtn.setAttribute("aria-label", "Panel position");
      posBtn.innerHTML = I_DOCK_RIGHT;
      this.posMenu = el("div", "menu");
      const posMeta = [
        { mode: "left", icon: I_DOCK_LEFT, label: "Left" },
        { mode: "bottom", icon: I_DOCK_BOTTOM, label: "Bottom" },
        { mode: "right", icon: I_DOCK_RIGHT, label: "Right" },
        { mode: "float", icon: I_FLOAT, label: "Float" }
      ];
      this.posMenu.innerHTML = `<div class="menu-label">Position</div><div class="pos-grid">` + posMeta.map((m) => `<button data-pos="${m.mode}">${m.icon}<span>${m.label}</span></button>`).join("") + `</div>`;
      this.posMenu.querySelectorAll("[data-pos]").forEach((b) => {
        b.onclick = () => {
          this.setDock(b.dataset.pos);
          this.closeMenus();
        };
      });
      posBtn.onclick = () => this.toggleMenu(this.posMenu);
      posWrap.append(posBtn, this.posMenu);
      this.themeBtn = el("button");
      this.themeBtn.dataset.role = "theme";
      this.themeBtn.onclick = () => this.toggleTheme();
      const setWrap = el("div", "menu-wrap");
      const setBtn = el("button");
      setBtn.dataset.role = "settings";
      setBtn.title = "Settings";
      setBtn.setAttribute("aria-label", "Settings");
      setBtn.innerHTML = I_GEAR;
      setBtn.onclick = () => this.toggleMenu(this.settingsMenu);
      this.settingsMenu = el("div", "menu");
      this.settingsMenu.innerHTML = `<div class="menu-label">Appearance</div><div class="acc-dots">` + ACCENTS.map((a) => `<button class="acc-dot" data-accent="${a.id}" style="background:${a.dark}" title="${a.id}" aria-label="${a.id} accent"></button>`).join("") + `</div><div class="menu-sep"></div><div class="menu-label">Show</div><button class="menu-row" data-set="hoverHints" aria-pressed="true"><span>Hover hints</span><span class="sw"></span></button><button class="menu-row" data-set="markersHidden" aria-pressed="true"><span>Markers</span><span class="sw"></span></button><button class="menu-row" data-set="showPaths" aria-pressed="false"><span>Page paths</span><span class="sw"></span></button><button class="menu-row" data-set="launcherHidden" aria-pressed="true" title="The \u25CE button shown while the panel is closed. ${LAUNCHER_SHORTCUT} toggles it too."><span>Launcher</span><span class="sw"></span></button><div class="menu-sep"></div><button class="menu-row" data-set="fabReset" hidden><span>Reset launcher position</span></button><button class="menu-row" data-set="tour"><span>Restart tour</span></button><div class="menu-ver"><span>Loupe <b>v${escapeHtml(SDK_VERSION)}</b>${this.packageVersionNote()}</span><span class="menu-mode">${this.cfg.apiBase ? "server" : "offline"}</span></div>`;
      this.settingsMenu.querySelectorAll("[data-accent]").forEach((b) => {
        b.onclick = () => this.setAccent(b.dataset.accent);
      });
      this.settingsMenu.querySelectorAll("[data-set]").forEach((b) => {
        b.onclick = () => {
          const key = b.dataset.set;
          if (key === "tour") {
            this.closeMenus();
            this.startTour();
            return;
          }
          if (key === "fabReset") {
            this.closeMenus();
            this.resetLauncherPosition();
            return;
          }
          this.toggleSetting(key);
        };
      });
      setWrap.append(setBtn, this.settingsMenu);
      const minBtn = el("button");
      minBtn.dataset.role = "min";
      minBtn.title = "Minimize";
      minBtn.setAttribute("aria-label", "Minimize");
      minBtn.innerHTML = I_MINIMIZE;
      minBtn.onclick = () => this.setMinimized(true);
      const closeBtn = el("button");
      closeBtn.dataset.role = "close";
      closeBtn.title = "Close";
      closeBtn.setAttribute("aria-label", "Close");
      closeBtn.innerHTML = I_CLOSE;
      closeBtn.onclick = () => this.closeDock();
      ctl.append(posWrap, this.themeBtn, setWrap, minBtn, closeBtn);
      this.peerEl = el("div", "peers");
      if (!this.cfg.bridge) this.peerEl.style.display = "none";
      head.append(brand, this.peerEl, ctl);
      this.minBar = el("div", "minbar");
      this.minBar.onclick = () => this.setMinimized(false);
      this.tabList = [...BUILTIN_TABS, ...(this.cfg.tabs ?? []).map((t) => ({ id: t.id, label: t.label }))];
      const tabs = el("div", "tabs");
      for (const t of this.tabList) {
        const b = el("button", "tab", t.label);
        b.dataset.tab = t.id;
        b.onclick = () => this.setTab(t.id);
        tabs.appendChild(b);
      }
      const tools = el("div", "tools");
      const inspectBtn = this.toolBtn("\u271B", "Inspect", "inspect");
      inspectBtn.title = "Inspect an element and comment on it";
      inspectBtn.onclick = () => this.setMode(this.mode === "inspect" ? "off" : "inspect");
      const freeBtn = this.toolBtn(NOTE_ICON, "Note", "free");
      freeBtn.title = "Drop a note anywhere on the page \u2014 no element, no screenshot";
      freeBtn.onclick = () => this.setMode(this.mode === "free" ? "off" : "free");
      const regionBtn = this.toolBtn(REGION_ICON, "Region", "region");
      regionBtn.title = "Drag a free-size box, screenshot it, and comment";
      regionBtn.onclick = () => this.setMode(this.mode === "region" ? "off" : "region");
      const recordBtn = this.toolBtn(RECORD_ICON, "Record", "record");
      recordBtn.title = isTouchDevice() ? "Record your screen, then describe the issue" : "Drag a box, record a screen video of it, and comment";
      recordBtn.onclick = () => this.setMode(this.mode === "record" ? "off" : "record");
      if (canShareScreen()) {
        tools.append(inspectBtn, freeBtn, regionBtn, recordBtn);
      } else if (isTouchDevice()) {
        const videoBtn = this.toolBtn(VIDEO_ICON, "Video", "video");
        videoBtn.title = "Attach a video \u2014 record your screen with your phone, then pick it here";
        videoBtn.onclick = () => this.pickVideo();
        tools.append(inspectBtn, freeBtn, regionBtn, videoBtn);
      } else {
        tools.append(inspectBtn, freeBtn, regionBtn);
      }
      const listHead = el("div", "listhead");
      listHead.append(document.createTextNode("Comments"));
      this.countEl = el("span", "count", "0");
      listHead.appendChild(this.countEl);
      const search = el("input", "search");
      search.type = "search";
      search.placeholder = "Search\u2026";
      search.value = this.search;
      search.oninput = () => {
        this.search = search.value;
        this.renderList();
      };
      listHead.appendChild(search);
      this.repoSel = el("select", "reposel");
      this.repoSel.title = "Filter by repository";
      this.repoSel.setAttribute("aria-label", "Filter by repository");
      this.repoSel.onchange = () => {
        this.repoFilter = this.repoSel.value;
        this.renderList();
      };
      this.repoSel.style.display = "none";
      listHead.appendChild(this.repoSel);
      this.listEl = el("div", "list");
      const homeView = el("div", "view home-view");
      this.homeEl = homeView;
      const commentsView = el("div", "view comments-view");
      this.commentsHint = el("div", "hint-slot");
      this.reviewBar = el("div", "reviewbar");
      this.reviewBar.style.display = "none";
      commentsView.append(this.commentsHint, tools, listHead, this.reviewBar, this.listEl, this.buildIntegrations());
      const activityView = el("div", "view activity-view");
      this.activityEl = activityView;
      const chatView = el("div", "view chat-view");
      this.chatEl = chatView;
      const customViews = (this.cfg.tabs ?? []).map((t) => {
        const view = el("div", "view custom-view");
        const slot = el("div", "hint-slot");
        view.appendChild(slot);
        this.customHintSlots.set(t.id, slot);
        try {
          const out = t.render({
            projectKey: this.cfg.projectKey,
            apiBase: this.cfg.apiBase,
            user: this.cfg.user,
            comments: this.comments,
            url: this.url,
            version: SDK_VERSION,
            track: (event) => this.addActivity(event),
            open: (id) => this.setTab(id),
            close: () => this.closeDock()
          });
          if (typeof out === "string") {
            const wrap = el("div", "tab-body");
            wrap.innerHTML = out;
            view.append(...Array.from(wrap.childNodes));
          } else if (out) view.appendChild(out);
        } catch (e) {
          view.appendChild(el("div", "empty", `This tab failed to render: ${e instanceof Error ? e.message : String(e)}`));
        }
        return view;
      });
      const resize = el("div", "resize");
      resize.addEventListener("pointerdown", this.onResizeDown);
      this.consentEl = el("div", "consent");
      this.consentEl.style.display = "none";
      dock.append(head, this.minBar, this.consentEl, tabs, homeView, commentsView, activityView, chatView, ...customViews, resize);
      for (const [id, view] of [["home", homeView], ["comments", commentsView], ["activity", activityView], ["chat", chatView]]) {
        this.viewEls.set(id, view);
      }
      customViews.forEach((v, i) => this.viewEls.set((this.cfg.tabs ?? [])[i].id, v));
      this.buildHomePanel();
      this.buildActivityPanel();
      this.buildChatPanel();
      return dock;
    }
    buildChatPanel() {
      this.chatEl.innerHTML = `<div class="hint-slot" id="loupe-chint"></div><div class="chat-tray" id="loupe-tray"></div><div class="chat-log" id="loupe-chatlog"></div><div class="chat-compose"><textarea class="chat-in" id="loupe-chatin" rows="2" placeholder="Tell the agent what you see\u2026"></textarea><div class="chat-foot"><button class="chat-add" id="loupe-chatadd" title="Add what you have selected">\uFF0B Selection</button><button class="chat-mic" id="loupe-chatmic" title="Dictate">\u{1F399}</button><span class="chat-rec" id="loupe-chatrec" style="display:none"><span class="chat-rec-dot"></span><span id="loupe-chatrectime">0:00</span></span><span class="chat-spacer"></span><span class="chat-err" id="loupe-chaterr"></span><button class="chat-send" id="loupe-chatsend">Send</button></div></div>`;
      const input = this.chatEl.querySelector("#loupe-chatin");
      input.addEventListener("click", (e) => e.stopPropagation());
      input.oninput = () => {
        this.chatError = "";
        this.renderChatError();
      };
      input.onkeydown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          void this.sendCompanion();
        }
      };
      this.chatEl.querySelector("#loupe-chatadd").onclick = (e) => {
        e.stopPropagation();
        void this.addSelectionToTray();
      };
      this.chatEl.querySelector("#loupe-chatsend").onclick = (e) => {
        e.stopPropagation();
        void this.sendCompanion();
      };
      this.chatEl.querySelector("#loupe-chatmic").onclick = (e) => {
        e.stopPropagation();
        this.toggleVoice();
      };
      this.renderChatTray();
      this.renderChatLog();
      this.updateChatBadge();
    }
    /** The Chat tab label carries the unread count, so it is visible from any page. */
    updateChatBadge() {
      const tab = this.tabList.findIndex((t) => t.id === "chat");
      const buttons = this.shadow?.querySelectorAll(".tabs .tab");
      const el2 = buttons?.[tab];
      if (!el2) return;
      el2.textContent = this.chatUnread ? `Chat \xB7 ${this.chatUnread > 9 ? "9+" : this.chatUnread}` : "Chat";
    }
    renderChatError() {
      const box = this.chatEl?.querySelector("#loupe-chaterr");
      if (box) box.textContent = this.chatError;
    }
    renderChatTray() {
      const box = this.chatEl?.querySelector("#loupe-tray");
      if (!box) return;
      box.textContent = "";
      if (!this.chatTray.items.length) {
        box.style.display = "none";
        return;
      }
      box.style.display = "";
      const head = el("div", "tray-head");
      head.append(
        el("span", "tray-title", traySummary(this.chatTray)),
        el("span", "tray-spacer")
      );
      const clear = el("button", "tray-x", "Clear");
      clear.onclick = (e) => {
        e.stopPropagation();
        this.chatTray = clearTray();
        this.renderChatTray();
      };
      head.appendChild(clear);
      box.appendChild(head);
      this.chatTray.items.forEach((item, i) => {
        const chip = el("div", "tray-chip" + (item.include ? "" : " off"));
        const check = el("input");
        check.type = "checkbox";
        check.checked = item.include;
        check.title = "Include in the message";
        check.onchange = (e) => {
          e.stopPropagation();
          this.chatTray = toggleInclude(this.chatTray, item.id);
          this.renderChatTray();
        };
        const label = el("span", "tray-label", item.label);
        label.title = item.label + (item.url ? ` \u2014 ${item.url}` : "");
        const up = el("button", "tray-nudge", "\u2191");
        up.disabled = i === 0;
        up.onclick = (e) => {
          e.stopPropagation();
          this.chatTray = nudgeInTray(this.chatTray, item.id, -1);
          this.renderChatTray();
        };
        const down = el("button", "tray-nudge", "\u2193");
        down.disabled = i === this.chatTray.items.length - 1;
        down.onclick = (e) => {
          e.stopPropagation();
          this.chatTray = nudgeInTray(this.chatTray, item.id, 1);
          this.renderChatTray();
        };
        const x = el("button", "tray-x", "\u2715");
        x.title = "Remove";
        x.onclick = (e) => {
          e.stopPropagation();
          this.chatTray = removeFromTray(this.chatTray, item.id);
          this.renderChatTray();
        };
        chip.append(check, item.thumb ? (() => {
          const img = el("img", "tray-thumb");
          img.src = item.thumb;
          img.alt = "";
          return img;
        })() : el("span", "tray-kind", item.kind), label, up, down, x);
        box.appendChild(chip);
      });
    }
    renderChatLog() {
      const box = this.chatEl?.querySelector("#loupe-chatlog");
      if (!box) return;
      box.textContent = "";
      if (!this.chatLog.length) {
        box.appendChild(el(
          "div",
          "chat-empty",
          this.cfg.bridge ? "Say what you see while the agent works \u2014 it lands on the agent\u2019s very next step." : "Connect a bridge to talk to the agent. Without one there is nothing to deliver to."
        ));
        return;
      }
      for (const m of this.chatLog) {
        const row = el("div", "chat-msg" + (m.mine ? " mine" : ""));
        const head = el("div", "chat-head");
        head.append(
          el("b", "chat-who", m.mine ? "You" : m.author ?? "Agent"),
          el("span", "chat-when", fmtAgo(m.at))
        );
        if (m.count) head.appendChild(el("span", "chat-ctx", `${m.count} context${m.count === 1 ? "" : "s"}`));
        const body = el("div", "chat-body");
        for (const seg of mentionSegments(m.body, parseMentions(m.body))) {
          if (seg.mention) body.appendChild(el("span", "mention", seg.text));
          else body.appendChild(document.createTextNode(seg.text));
        }
        row.append(head, body);
        box.appendChild(row);
      }
      box.scrollTop = box.scrollHeight;
    }
    /** Pull the current selection off the bridge and into the tray. */
    async addSelectionToTray() {
      const base = this.cfg.bridge?.replace(/\/$/, "");
      if (!base) {
        this.chatError = "No bridge configured.";
        this.renderChatError();
        return;
      }
      try {
        const res = await fetch(`${base}/selection/latest`);
        if (!res.ok) throw new Error(String(res.status));
        const { selection } = await res.json();
        if (!selection) {
          this.chatError = "Nothing selected yet.";
          this.renderChatError();
          return;
        }
        this.chatTray = addToTray(this.chatTray, {
          id: selection.correlationId ?? selection.selector ?? String(selection.at),
          kind: "element",
          // The selector is what identifies it; the text makes it recognisable.
          label: `${selection.selector ?? selection.tag ?? "element"}${selection.text ? ` \u2014 \u201C${String(selection.text).slice(0, 24)}\u201D` : ""}`,
          url: selection.url,
          ref: selection.correlationId ?? selection.selector
        });
        this.chatError = "";
        this.renderChatError();
        this.renderChatTray();
      } catch (e) {
        this.chatError = e instanceof Error ? `Could not read the selection: ${e.message}` : "Could not read the selection.";
        this.renderChatError();
      }
    }
    async sendCompanion() {
      const input = this.chatEl.querySelector("#loupe-chatin");
      const body = input.value.trim();
      const contexts = trayPayload(this.chatTray);
      if (!body && !contexts.length) return;
      if (this.chatSending) return;
      const base = this.cfg.bridge?.replace(/\/$/, "");
      if (!base) {
        this.chatError = "No bridge configured \u2014 nothing to deliver to.";
        this.renderChatError();
        return;
      }
      this.chatSending = true;
      this.chatError = "";
      this.renderChatError();
      const optimistic = {
        id: `pending-${Date.now().toString(36)}`,
        at: (/* @__PURE__ */ new Date()).toISOString(),
        mine: true,
        body: body || "(context only)",
        count: contexts.length
      };
      this.chatLog.push(optimistic);
      this.renderChatLog();
      try {
        const res = await fetch(`${base}/companion`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            body: body || "(see the gathered context)",
            author: { id: this.cfg.user.id, name: this.cfg.user.name },
            contexts,
            attachments: includedItems(this.chatTray).filter((i) => i.kind === "screenshot" && i.thumb).map((i) => ({ url: i.thumb, kind: "image", name: i.label })),
            voice: this.voiceBase.length > 0
          })
        });
        if (!res.ok) throw new Error(`the bridge answered ${res.status}`);
        input.value = "";
        this.chatTray = clearTray();
        this.modelVoiceBase("");
        this.renderChatTray();
        this.addActivity({ kind: "message.create", label: `Sent a brief to the agent${contexts.length ? ` (${contexts.length} contexts)` : ""}` });
      } catch (e) {
        this.chatError = e instanceof Error ? e.message : "Could not send.";
        this.renderChatError();
        this.addActivity({ kind: "error", level: "error", label: "Companion message failed to send" });
      } finally {
        this.chatSending = false;
        this.renderChatLog();
      }
    }
    modelVoiceBase(v) {
      this.voiceBase = v;
    }
    /**
     * Dictation.
     *
     * Two different reasons the control can be unavailable, and they need different
     * words: an unsupported browser is a fact, while a non-secure page is something the
     * person can fix. Saying "your browser cannot do this" when the real problem is
     * `http://` sends them looking in the wrong place.
     */
    toggleVoice() {
      const support = voiceSupport({
        hasCtor: typeof globalThis.SpeechRecognition !== "undefined" || typeof globalThis.webkitSpeechRecognition !== "undefined",
        isSecureContext: typeof isSecureContext === "boolean" ? isSecureContext : true
      });
      if (support !== "supported") {
        this.chatError = voiceMessage(support) ?? "Dictation is unavailable.";
        this.renderChatError();
        return;
      }
      if (this.voiceOn) return this.stopChatVoice();
      const Ctor = globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition;
      const input = this.chatEl.querySelector("#loupe-chatin");
      try {
        this.stopChatVoice();
        const rec = new Ctor();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = document.documentElement.lang || "en-US";
        this.voiceBase = input.value ? `${input.value.trim()} ` : "";
        rec.onresult = (ev) => {
          let text = "";
          for (let i = ev.resultIndex; i < ev.results.length; i++) text += ev.results[i][0].transcript;
          input.value = `${this.voiceBase}${text}`;
        };
        rec.onerror = (ev) => {
          this.chatError = ev?.error === "not-allowed" ? "Microphone permission was refused." : "Dictation stopped.";
          this.renderChatError();
          this.stopChatVoice();
        };
        rec.onend = () => {
          if (this.voiceOn) this.stopChatVoice();
        };
        rec.start();
        this.voice = rec;
        this.voiceTarget = input;
        this.voiceOn = true;
        this.voiceStart = Date.now();
        const pill = this.chatEl.querySelector("#loupe-chatrec");
        pill.style.display = "";
        this.voiceTimer = setInterval(() => {
          const t = this.chatEl.querySelector("#loupe-chatrectime");
          if (t) t.textContent = elapsedLabel(Date.now() - this.voiceStart);
        }, 500);
        this.chatEl.querySelector("#loupe-chatmic").classList.add("on");
        this.renderChatTray();
      } catch (e) {
        this.chatError = e instanceof Error ? e.message : "Could not start dictation.";
        this.renderChatError();
      }
    }
    stopChatVoice() {
      this.voiceOn = false;
      if (this.voiceTimer) clearInterval(this.voiceTimer);
      this.voiceTimer = void 0;
      this.stopVoice();
      const pill = this.chatEl?.querySelector("#loupe-chatrec");
      if (pill) pill.style.display = "none";
      this.chatEl?.querySelector("#loupe-chatmic")?.classList.remove("on");
    }
    /**
     * Follow the bridge for replies.
     *
     * With SSE where it works and a poll where it does not, because a reply the person
     * never sees is the same as no reply — and the panel is the only place it appears.
     */
    startCompanionStream() {
      const base = this.cfg.bridge?.replace(/\/$/, "");
      if (!base || this.companionSource) return;
      if (typeof EventSource === "undefined") return;
      try {
        const source = new EventSource(`${base}/events`);
        source.addEventListener("companion", (ev) => {
          let parsed;
          try {
            parsed = JSON.parse(ev.data);
          } catch {
            return;
          }
          if (parsed?.eventType === "reply") this.receiveReply(parsed.data);
        });
        source.onerror = () => {
        };
        this.companionSource = source;
        this.companionPoll = setInterval(() => void this.pollReplies(), 5e3);
      } catch {
        this.companionPoll = setInterval(() => void this.pollReplies(), 4e3);
      }
    }
    async pollReplies() {
      const base = this.cfg.bridge?.replace(/\/$/, "");
      if (!base) return;
      try {
        const res = await fetch(`${base}/companion?since=${encodeURIComponent(this.lastReplyId)}`);
        if (!res.ok) return;
        const { replies } = await res.json();
        for (const r of replies ?? []) this.receiveReply(r);
      } catch {
      }
    }
    receiveReply(reply) {
      if (!reply?.id || !reply.body) return;
      if (this.chatLog.some((m) => m.id === reply.id)) return;
      this.lastReplyId = reply.id;
      this.chatLog.push({ id: reply.id, at: reply.at ?? (/* @__PURE__ */ new Date()).toISOString(), mine: false, body: reply.body });
      if (this.tab !== "chat" || this.minimized) {
        this.chatUnread++;
        this.updateChatBadge();
        this.desktopNotify("Loupe \u2014 the agent replied", reply.body);
      }
      this.addActivity({ kind: "agent.reply", label: "The agent replied" });
      this.renderChatLog();
    }
    /** A desktop notification, when the browser will show one. Never a prompt for it. */
    desktopNotify(title, body) {
      try {
        const N = globalThis.Notification;
        if (!N || N.permission !== "granted") return;
        new N(title, { body: String(body).slice(0, 200), tag: "loupe-companion" });
      } catch {
      }
    }
    buildActivityPanel() {
      this.activityEl.innerHTML = `<div class="hint-slot" id="loupe-ahint"></div><div class="mon-status" id="loupe-mon-status"><span class="mon-dot"></span><span class="mon-status-label"></span><span class="mon-spacer"></span><button class="mon-clear" data-role="mon-clear" title="Clear the feed">Clear</button></div><div class="mon-summary" id="loupe-mon-summary"></div><div class="mon-micro" id="loupe-mon-micro"></div><div class="mon-chips" id="loupe-mon-chips"></div><div class="mon-feed" id="loupe-mon-feed"></div>`;
      this.feedEl = this.activityEl.querySelector("#loupe-mon-feed");
      this.activityHint = this.activityEl.querySelector("#loupe-ahint");
      this.activityEl.querySelector('[data-role="mon-clear"]').onclick = () => this.clearActivity();
      this.feedEl.addEventListener("scroll", () => {
        const el2 = this.feedEl;
        this.activityFollow = el2.scrollHeight - el2.scrollTop - el2.clientHeight < 24;
        this.renderActivityChrome();
      });
      this.renderActivity();
    }
    // ---- activity feed --------------------------------------------------------
    /** Push one event. Called by Loupe itself and by the public trackActivity(). */
    addActivity(input) {
      const event = {
        id: input.id ?? `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        at: input.at ?? (/* @__PURE__ */ new Date()).toISOString(),
        kind: input.kind,
        label: input.label,
        detail: input.detail,
        level: input.level ?? "info",
        files: input.files
      };
      this.activityEvents.push(event);
      if (this.activityEvents.length > 500) this.activityEvents = this.activityEvents.slice(-500);
      this.activityStatus = event.level === "error" ? "error" : "working";
      this.renderActivity();
    }
    setActivityStatus(status) {
      this.activityStatus = status;
      this.renderActivity();
    }
    clearActivity() {
      this.activityEvents = [];
      this.activityFilter = "";
      this.activityStatus = "idle";
      this.renderActivity();
    }
    /** The summary, status row, micro-stats and chips — derived, never stored. */
    renderActivityChrome() {
      if (!this.activityEl) return;
      const status = this.activityEl.querySelector("#loupe-mon-status");
      if (!status) return;
      const s = summarizeActivity(this.activityEvents, this.activityStatus);
      status.querySelector(".mon-status-label").textContent = ACTIVITY_STATUS_LABELS[s.status];
      status.className = `mon-status st-${s.status}`;
      const summary = this.activityEl.querySelector("#loupe-mon-summary");
      if (!s.events) {
        summary.innerHTML = "";
        summary.style.display = "none";
      } else {
        summary.style.display = "";
        const rows = [
          ["Status", ACTIVITY_STATUS_LABELS[s.status]],
          ["Events", String(s.events)],
          ["Duration", formatDuration(s.durationMs)],
          ["Files touched", String(s.files)],
          ["Errors", String(s.errors)],
          ["Tools", s.byKind.map((k) => `${k.kind} \xD7${k.count}`).join(", ") || "\u2014"]
        ];
        summary.innerHTML = `<button class="mon-sum-head" data-role="mon-toggle" aria-expanded="${this.summaryOpen}"><span class="mon-sum-title">Session summary</span><span class="mon-sum-peek">${s.events} events \xB7 ${formatDuration(s.durationMs)} \xB7 ${s.files} files</span><span class="mon-caret">${this.summaryOpen ? "\u25BE" : "\u25B8"}</span></button><div class="mon-sum-body"${this.summaryOpen ? "" : ' style="display:none"'}>` + rows.map(([k, v]) => `<div class="mon-kv"><span>${escapeHtml(k)}</span><b>${escapeHtml(v)}</b></div>`).join("") + `<div class="mon-preview"></div></div>`;
        summary.querySelector(".mon-preview").textContent = this.activityEvents[this.activityEvents.length - 1]?.label ?? "";
        summary.querySelector('[data-role="mon-toggle"]').onclick = () => {
          this.summaryOpen = !this.summaryOpen;
          this.renderActivityChrome();
        };
      }
      const micro = this.activityEl.querySelector("#loupe-mon-micro");
      micro.textContent = "";
      if (s.events) {
        micro.append(
          el("span", "mon-micro-i", `\u23F1 ${formatDuration(s.durationMs)}`),
          el("span", "mon-micro-i", `\u25E6 ${s.events} events`),
          el("span", "mon-micro-i", `\u29C9 ${s.files} files`)
        );
      }
      const chips = this.activityEl.querySelector("#loupe-mon-chips");
      chips.textContent = "";
      if (s.events) {
        const chip = (kind, label, count) => {
          const b = el("button", "mon-chip" + (this.activityFilter === kind ? " on" : ""), `${label} ${count}`);
          b.dataset.kind = kind;
          b.onclick = () => {
            this.activityFilter = this.activityFilter === kind ? "" : kind;
            this.renderActivity();
          };
          return b;
        };
        chips.appendChild(chip("", "All", s.events));
        for (const { kind, count } of s.byKind) chips.appendChild(chip(kind, kind, count));
      }
    }
    /** The feed itself, newest last (so it grows downward like a log). */
    renderActivity() {
      if (!this.activityEl) return;
      this.renderActivityChrome();
      if (!this.feedEl) return;
      const events = this.activityFilter ? this.activityEvents.filter((e) => e.kind === this.activityFilter) : this.activityEvents;
      if (!events.length) {
        this.feedEl.innerHTML = `<div class="mon-empty">` + (this.activityEvents.length ? `Nothing from <b>${escapeHtml(this.activityFilter)}</b> yet.` : `<b>Monitor unavailable.</b> Nothing is feeding this view yet.<br>A bridge or your app can push events with <code>Loupe.trackActivity({ kind, label })</code>, and Loupe reports its own operations here as you work.`) + `</div>`;
        return;
      }
      this.feedEl.innerHTML = events.map((e) => {
        const time = new Date(e.at).toLocaleTimeString(void 0, { hour12: false });
        return `<div class="mon-row lv-${e.level ?? "info"}"><span class="mon-time">${escapeHtml(time)}</span><span class="mon-kind">${escapeHtml(e.kind)}</span><span class="mon-label">${escapeHtml(e.label)}` + (e.detail ? `<span class="mon-detail">${escapeHtml(e.detail)}</span>` : "") + `</span></div>`;
      }).join("");
      if (this.activityFollow) this.feedEl.scrollTop = this.feedEl.scrollHeight;
    }
    /**
     * The Home overview: four stat tiles over the current scope, a scope switch
     * (this page ↔ the whole project), a one-click way into capture, and the
     * most recent feedback. Every tile is a button that narrows the list.
     */
    buildHomePanel() {
      const title = this.cfg.label ?? "Loupe";
      this.homeEl.innerHTML = `<div class="hint-slot" id="loupe-hhint"></div><div class="hstat" id="loupe-hstats"></div><div class="hscope"><button class="hscope-b" data-scope="page">This page <b class="hscope-n"></b></button><button class="hscope-b" data-scope="all">All <b class="hscope-n"></b></button><button class="hrefresh" title="Refresh" aria-label="Refresh">\u27F3</button></div><button class="hpin" data-role="home-pin">\u271B Pin feedback on this page</button><div class="projbar"><span class="proj-label">Project</span><button class="proj-chip" data-role="proj-open" aria-haspopup="dialog" aria-expanded="false"><span class="proj-repo"></span><span class="proj-caret">\u25BE</span></button><div class="proj-pop" id="loupe-proj" role="dialog" aria-label="Project settings"></div></div><div class="hnotif" id="loupe-hnotif"></div><div class="hlabel">Recent</div><div class="hfeed" id="loupe-hfeed"></div><div class="hfoot">${escapeHtml(title)} \xB7 <span class="hver">v${escapeHtml(SDK_VERSION)}</span>${this.packageVersionNote()}</div>`;
      this.homeEl.querySelector('[data-role="proj-open"]').onclick = (e) => {
        e.stopPropagation();
        this.setProjectOpen(!this.projOpen);
      };
      this.homeEl.querySelectorAll(".hscope-b").forEach((b) => {
        b.onclick = () => this.setScope(b.dataset.scope === "all" ? "all" : "page");
      });
      this.homeEl.querySelector('[data-role="home-pin"]').onclick = () => {
        this.setTab("comments");
        this.setMode("inspect");
      };
      this.homeEl.querySelector(".hrefresh").onclick = () => {
        void this.reloadComments();
        if (this.scope === "all") void this.loadAllComments();
      };
    }
    /** The comments the panel is currently looking at (page scope or project scope). */
    get visibleComments() {
      return this.scope === "all" ? this.allComments : this.comments;
    }
    /** Switch the panel between "this page" and the whole project. */
    setScope(scope) {
      this.scope = scope;
      this.saveState();
      if (scope === "all" && !this.allComments.length) void this.loadAllComments();
      this.renderHome();
      this.renderList();
    }
    async loadAllComments() {
      try {
        this.allComments = await this.store.listAll(this.cfg.projectKey);
        this.renderHome();
        this.renderList();
      } catch {
      }
    }
    /**
     * The four buckets a triager actually asks about. "Stale" is open work older
     * than a week — the thing that quietly rots on a board.
     */
    homeStats() {
      const list = this.visibleComments;
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1e3;
      return [
        { key: "open", label: "Open", n: list.filter((c) => normalizeStatus(c.status) !== "resolved").length },
        // The shared predicate, so the panel and the dashboard cannot disagree about
        // what "needs you" means. Only the stage is available here — the reasons that
        // depend on the last message are computed where the messages are loaded.
        { key: "needs_you", label: "Needs you", n: list.filter((c) => needsYou({ status: c.status }).needs).length },
        { key: "resolved", label: "Resolved", n: list.filter((c) => normalizeStatus(c.status) === "resolved").length },
        {
          key: "stale",
          label: "Stale",
          n: list.filter((c) => normalizeStatus(c.status) !== "resolved" && Date.parse(c.createdAt) < weekAgo).length
        }
      ];
    }
    renderHome() {
      if (!this.homeEl) return;
      const stats = this.homeStats();
      const statsEl = this.homeEl.querySelector("#loupe-hstats");
      if (statsEl) {
        statsEl.innerHTML = stats.map((s) => `<button class="hstat-b${this.statFilter === s.key ? " on" : ""}" data-stat="${s.key}"><span class="hstat-n">${s.n}</span><span class="hstat-l">${s.label}</span></button>`).join("");
        statsEl.querySelectorAll(".hstat-b").forEach((b) => {
          b.onclick = () => {
            const key = b.dataset.stat;
            this.statFilter = this.statFilter === key ? "" : key;
            this.setTab("comments");
          };
        });
      }
      const allKnown = this.allComments.length > 0 || this.scope === "all";
      const counts = {
        page: String(this.comments.length),
        all: allKnown ? String(this.allComments.length) : "\u22EF"
      };
      const labels = { page: "This page", all: "All" };
      this.homeEl.querySelectorAll(".hscope-b").forEach((b) => {
        const scope = b.dataset.scope === "all" ? "all" : "page";
        b.classList.toggle("on", scope === this.scope);
        b.setAttribute("aria-pressed", String(scope === this.scope));
        b.setAttribute("aria-label", `${labels[scope]} \u2014 ${counts[scope]} comments`);
        b.querySelector(".hscope-n").textContent = counts[scope];
      });
      this.renderProject();
      this.renderNotifications();
      const feed = this.homeEl.querySelector("#loupe-hfeed");
      if (!feed) return;
      const recent = [...this.visibleComments].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8);
      feed.innerHTML = recent.length ? recent.map((c) => {
        const stage = STAGE_LABELS[normalizeStatus(c.status)];
        const prio = normalizePriority(c.priority);
        return `<button class="hfeed-i" data-id="${escapeAttr(c.id)}"><span class="hfeed-t">${escapeHtml(c.title || (c.body.split("\n")[0] ?? "").slice(0, 60))}</span><span class="hfeed-m">${escapeHtml(c.author?.name ?? "")} \xB7 <span title="${escapeAttr(this.fmtWhen(c.createdAt))}">${fmtAgo(c.createdAt)}</span> \xB7 <span class="hfeed-s hfeed-s-${normalizeStatus(c.status)}">${stage}</span><span class="hfeed-p hfeed-p-${prio}">${PRIORITY_LABELS[prio]}</span></span></button>`;
      }).join("") : `<div class="hempty">Nothing here yet.</div>`;
      feed.querySelectorAll(".hfeed-i").forEach((b) => {
        b.onclick = () => {
          const id = b.dataset.id;
          this.statFilter = "";
          this.setTab("comments");
          this.expanded.add(id);
          this.renderList();
          this.flash(id);
        };
      });
    }
    async loadNotifications() {
      try {
        const list = await this.store.listNotifications(this.cfg.projectKey, this.cfg.user.id);
        this.notifications = Array.isArray(list) ? list : [];
      } catch {
        this.notifications = [];
      }
      this.renderNotifications();
    }
    /**
     * The mentions block. Rendered only when there are unread ones — a permanent empty
     * "0 unread" is noise, and the whole point is that it appears when it matters.
     */
    renderNotifications() {
      const box = this.homeEl?.querySelector("#loupe-hnotif");
      if (!box) return;
      const unread = this.notifications.filter((n) => !n.readAt);
      if (!unread.length) {
        box.innerHTML = "";
        box.style.display = "none";
        return;
      }
      box.style.display = "";
      box.innerHTML = `<div class="nf-head"><span class="nf-dot"></span><b>${unread.length}</b> mention${unread.length === 1 ? "" : "s"} waiting</div>` + unread.slice(0, 3).map((n) => `<button class="nf-i" data-thread="${escapeAttr(n.threadId)}"><span class="nf-b">${escapeHtml(n.body)}</span><span class="nf-w">${escapeHtml(fmtAgo(n.createdAt))}</span></button>`).join("") + `<button class="nf-read">Mark as read</button>`;
      box.querySelectorAll(".nf-i").forEach((b) => {
        b.onclick = () => {
          const id = b.dataset.thread;
          this.scope = "all";
          if (!this.allComments.length) void this.loadAllComments();
          this.statFilter = "";
          this.setTab("comments");
          this.expanded.add(id);
          this.renderList();
          this.flash(id);
        };
      });
      box.querySelector(".nf-read").onclick = async () => {
        try {
          await this.store.markNotificationsRead(this.cfg.projectKey, this.cfg.user.id);
        } catch {
        }
        void this.loadNotifications();
      };
    }
    // ---- project manager (#60) ------------------------------------------------
    /** The repo new comments are filed against: the panel's choice, else the config. */
    effectiveRepo() {
      return this.project.repo || this.cfg.repo || void 0;
    }
    setProjectOpen(open) {
      this.projOpen = open;
      this.projError = "";
      if (open) {
        this.projSearch = "";
        void this.refreshRepos();
      }
      this.renderProject();
    }
    /** Repositories to offer — a fixed list, or the host's search function. */
    async repoChoices() {
      const source = this.cfg.repos;
      if (!source) return [];
      if (Array.isArray(source)) {
        const q = this.projSearch.trim().toLowerCase();
        const all = q ? source.filter((r) => r.toLowerCase().includes(q)) : source;
        return all.slice(0, 50);
      }
      try {
        const out = await source(this.projSearch);
        return (Array.isArray(out) ? out : []).slice(0, 50);
      } catch (e) {
        this.projError = e instanceof Error ? e.message : "Could not load repositories.";
        return [];
      }
    }
    /**
     * Re-run the repo search. The sequence guard matters: typing fires overlapping
     * requests, and without it a slow early reply would overwrite a newer one.
     */
    async refreshRepos() {
      this.projError = "";
      const seq = ++this.repoSeq;
      const out = await this.repoChoices();
      if (seq !== this.repoSeq) return;
      this.projResults = out;
      this.renderRepoList();
      this.renderProjectError();
    }
    /** Only the list is rewritten on search, so the input keeps focus while typing. */
    renderRepoList() {
      const list = this.homeEl?.querySelector("#loupe-pp-repos");
      if (!list) return;
      const repo = this.effectiveRepo();
      list.innerHTML = this.projResults.length ? this.projResults.map((r) => `<button class="pp-item${r === repo ? " on" : ""}" data-repo="${escapeAttr(r)}" title="${escapeAttr(r)}">${escapeHtml(r)}</button>`).join("") : `<div class="pp-empty">No repositories match.</div>`;
      list.querySelectorAll("[data-repo]").forEach((b) => {
        b.onclick = () => {
          this.project.repo = b.dataset.repo;
          this.saveProject();
          this.renderProject();
          this.renderPins();
          this.renderList();
          this.addActivity({ kind: "repo.link", label: `Linked this page to ${b.dataset.repo}` });
        };
      });
    }
    renderProjectError() {
      const box = this.homeEl?.querySelector("#loupe-pp-err");
      if (!box) return;
      box.textContent = this.projError;
      box.style.display = this.projError ? "" : "none";
    }
    renderProject() {
      if (!this.homeEl) return;
      const chip = this.homeEl.querySelector(".proj-chip");
      const pop = this.homeEl.querySelector("#loupe-proj");
      if (!chip || !pop) return;
      const repo = this.effectiveRepo();
      chip.querySelector(".proj-repo").textContent = repo ?? "no repo linked";
      chip.classList.toggle("unset", !repo);
      chip.setAttribute("aria-expanded", String(this.projOpen));
      if (!this.projOpen) {
        pop.classList.remove("open");
        pop.innerHTML = "";
        return;
      }
      pop.classList.add("open");
      const envs = this.project.environments;
      pop.innerHTML = `<div class="pp-head"><span>Repository</span><button class="pp-x" data-role="pp-close" aria-label="Close">\u2715</button></div><div class="pp-cur">${repo ? `New comments are filed against <b>${escapeHtml(repo)}</b>.` : "This page is not linked to a repository yet."}</div>` + (this.cfg.repos ? `<input class="pp-search" type="search" placeholder="Search repositories\u2026" value="${escapeAttr(this.projSearch)}" aria-label="Search repositories"><div class="pp-list" id="loupe-pp-repos"></div>` : `<div class="pp-empty">No repository list to search. Pass <code>repos</code> to <code>init()</code> \u2014 a string array, or a function the panel calls with the search text.</div>`) + (repo ? `<button class="pp-clear" data-role="pp-clear">Unlink this page</button>` : "") + `<div class="pp-sep"></div><div class="pp-head"><span>Environments</span></div><div class="pp-list">` + (envs.length ? envs.map((u, i) => `<div class="pp-env"><span class="pp-env-u" title="${escapeAttr(u)}">${escapeHtml(u)}</span><button class="pp-x" data-env-rm="${i}" aria-label="Remove environment">\u2715</button></div>`).join("") : `<div class="pp-empty">No environment URLs yet.</div>`) + `</div><div class="pp-add"><input class="pp-env-url" type="url" placeholder="https://staging.example.com" value="${escapeAttr(this.envDraft)}" aria-label="Environment URL"><button class="pp-add-b" data-role="env-add">Add</button></div><div class="pp-sep"></div><div class="pp-head"><span>Local AI</span></div><div class="pp-empty">Any OpenAI-compatible server \u2014 used by the Generate pane.</div><div class="pp-add"><input class="pp-ai-url" type="url" placeholder="http://localhost:11434" value="${escapeAttr(this.project.localAi?.url ?? "")}" aria-label="Local AI endpoint"></div><div class="pp-add"><input class="pp-ai-model" type="text" placeholder="llama3.2" value="${escapeAttr(this.project.localAi?.model ?? "")}" aria-label="Model name"><button class="pp-add-b" data-role="ai-save">Save</button></div><div class="pp-add"><button class="pp-clear" data-role="ai-test">Test connection</button></div><div class="pp-ai-out" id="loupe-pp-ai"></div><div class="pp-err" id="loupe-pp-err"></div>`;
      this.renderRepoList();
      this.renderProjectError();
      pop.querySelector('[data-role="pp-close"]').onclick = () => this.setProjectOpen(false);
      pop.querySelector('[data-role="pp-clear"]')?.addEventListener("click", () => {
        this.project.repo = void 0;
        this.saveProject();
        this.renderProject();
        this.renderPins();
        this.renderList();
      });
      const search = pop.querySelector(".pp-search");
      if (search) {
        search.addEventListener("click", (e) => e.stopPropagation());
        search.oninput = () => {
          this.projSearch = search.value;
          void this.refreshRepos();
        };
      }
      pop.querySelectorAll("[data-env-rm]").forEach((b) => {
        b.onclick = () => {
          const i = Number(b.dataset.envRm);
          this.project.environments = this.project.environments.filter((_, n) => n !== i);
          this.saveProject();
          this.renderProject();
        };
      });
      const url = pop.querySelector(".pp-env-url");
      if (url) {
        url.addEventListener("click", (e) => e.stopPropagation());
        url.oninput = () => {
          this.envDraft = url.value;
        };
        url.onkeydown = (e) => {
          if (e.key === "Enter") pop.querySelector('[data-role="env-add"]').click();
        };
      }
      pop.querySelector('[data-role="env-add"]').onclick = () => {
        const normalized = normalizeEnvUrl(this.envDraft);
        if (!normalized) {
          this.projError = "Enter a full http:// or https:// URL.";
          this.renderProjectError();
          return;
        }
        if (this.project.environments.includes(normalized)) {
          this.projError = "That environment is already listed.";
          this.renderProjectError();
          return;
        }
        this.project.environments = [...this.project.environments, normalized];
        this.envDraft = "";
        this.projError = "";
        this.saveProject();
        this.renderProject();
        pop.querySelector(".pp-env-url")?.focus();
      };
      for (const sel of [".pp-ai-url", ".pp-ai-model"]) {
        pop.querySelector(sel)?.addEventListener("click", (e) => e.stopPropagation());
      }
      pop.querySelector('[data-role="ai-save"]').onclick = () => {
        const url2 = normalizeEnvUrl(pop.querySelector(".pp-ai-url").value);
        const model = pop.querySelector(".pp-ai-model").value.trim();
        if (!url2 || !model) {
          this.setLocalAiStatus(this.project.localAi ? `Saved: ${this.project.localAi.model} at ${this.project.localAi.url}` : "Nothing saved yet.");
          this.projError = !url2 ? "Enter a full http:// or https:// endpoint URL." : "Enter a model name.";
          this.renderProjectError();
          return;
        }
        this.projError = "";
        this.setLocalAi({ url: url2, model });
        this.setLocalAiStatus(`Saved: ${model} at ${url2}`);
      };
      pop.querySelector('[data-role="ai-test"]').onclick = () => {
        void this.testLocalAi(pop);
      };
    }
    /** Per-browser project settings, keyed separately from the dock's UI state. */
    loadProject() {
      const fromConfig = (this.cfg.environments ?? []).filter((u) => typeof u === "string");
      try {
        const raw = localStorage.getItem(`loupe:project:${this.cfg.projectKey}`);
        const p = raw ? JSON.parse(raw) : null;
        const repo = typeof p?.repo === "string" && p.repo ? p.repo : void 0;
        const stored = Array.isArray(p?.environments) ? p.environments.filter((u) => typeof u === "string") : null;
        const localAi = p?.localAi && typeof p.localAi.url === "string" && typeof p.localAi.model === "string" ? { url: p.localAi.url, model: p.localAi.model } : void 0;
        this.project = { repo, environments: stored ?? fromConfig, localAi };
      } catch {
        this.project = { environments: fromConfig };
      }
    }
    saveProject() {
      try {
        localStorage.setItem(`loupe:project:${this.cfg.projectKey}`, JSON.stringify(this.project));
      } catch {
      }
    }
    /** The "INTEGRATES WITH" footer on the Comments page (visual only for now). */
    buildIntegrations() {
      const wrap = el("div", "integrations");
      wrap.append(el("div", "ilabel", "INTEGRATES WITH"));
      const row = el("div", "irow");
      const icons = [
        ["GitHub", I_GITHUB],
        ["Slack", I_SLACK],
        ["Telegram", I_TELEGRAM],
        ["Linear", I_LINEAR]
      ];
      for (const [name, icon] of icons) {
        const b = el("span", "ibtn");
        b.title = `${name} \u2014 connect (coming soon)`;
        b.setAttribute("aria-label", name);
        b.innerHTML = icon;
        row.appendChild(b);
      }
      wrap.appendChild(row);
      return wrap;
    }
    /** The floating "recording…" pill with a Stop button (shown only while recording). */
    buildRecBar() {
      const bar = el("button", "recbar");
      bar.title = "Stop recording";
      bar.setAttribute("aria-label", "Stop recording");
      bar.onclick = () => this.stopRecording?.();
      return bar;
    }
    /**
     * The collapsed-state FAB cluster. The primary brand button carries the comment
     * count and OPENS the panel — one tap, the thing most people came for. A drag on
     * it moves the whole cluster anywhere on screen (persisted). The chevron beside it
     * is its own button and toggles the quick actions: pin a comment, drop a note,
     * hide/show the markers already on the page, hide the launcher itself, and — when
     * the host registered one — jump straight to the Connect tab.
     */
    buildFabCluster() {
      const cluster = el("div", "fab-cluster");
      const minis = el("div", "fab-minis");
      const mini = (role, icon, label2, title) => {
        const b = el("button", "fab-mini");
        b.dataset.fab = role;
        b.title = title;
        b.setAttribute("aria-label", title);
        b.innerHTML = `${icon}<span class="fab-tip">${label2}</span>`;
        return b;
      };
      const comment = mini("comment", I_COMMENT, "Pin comment", "Pin feedback on any element");
      comment.onclick = () => {
        this.collapseFab();
        this.openDock();
        this.setMode("inspect");
      };
      const note = mini("note", I_NOTE, "Note", "Drop a note anywhere on the page");
      note.onclick = () => {
        this.collapseFab();
        this.openDock();
        this.setMode("free");
      };
      const markers = mini("markers", I_EYE, "Markers", "Show or hide the markers on this page");
      markers.onclick = () => this.toggleMarkers();
      const hide = mini("hide", I_EYE_OFF, "Hide launcher", `Hide this launcher \u2014 ${LAUNCHER_SHORTCUT} brings it back`);
      hide.onclick = () => this.setLauncherHidden(true);
      minis.append(comment, note, markers, hide);
      if (this.tabList.some((t) => t.id === "connect")) {
        const connect = mini("connect", I_PLUG, "Connect Claude", "Set up the Claude/MCP connection");
        connect.onclick = () => {
          this.collapseFab();
          this.openDock();
          this.setTab("connect");
        };
        minis.appendChild(connect);
      }
      const label = this.cfg.label ?? "Loupe";
      const primary = el("button", "launcher");
      primary.title = `Open ${label} \u2014 drag to move`;
      primary.setAttribute("aria-label", `Open ${label}`);
      primary.innerHTML = `<span class="logo">\u25CE</span><span class="lcount"></span>`;
      this.fabBadge = primary.querySelector(".lcount");
      primary.onclick = () => {
        if (this.fabSuppressClick) return;
        this.openDock();
      };
      primary.addEventListener("pointerdown", this.onFabPointerDown);
      primary.addEventListener("pointermove", this.onFabPointerMove);
      primary.addEventListener("pointerup", this.onFabPointerUp);
      primary.addEventListener("pointercancel", this.onFabPointerUp);
      const more = el("button", "fab-more");
      more.dataset.fab = "more";
      more.title = "Quick actions";
      more.setAttribute("aria-label", "Quick actions");
      more.setAttribute("aria-expanded", "false");
      more.innerHTML = I_FAB_CHEVRON;
      more.onclick = (e) => {
        e.stopPropagation();
        this.toggleFab();
      };
      const main = el("div", "fab-main");
      main.append(primary, more);
      cluster.append(minis, main);
      this.fabMinis = minis;
      return cluster;
    }
    /** Expand/collapse the quick actions out of the primary FAB. */
    toggleFab() {
      this.fabExpanded = !this.fabExpanded;
      this.applyFab();
    }
    /** Keep the launcher fully on screen, with a small margin so it never kisses the edge. */
    clampFabPos(x, y) {
      const m = 8;
      return {
        x: clampPx(Math.round(x), m, Math.max(m, window.innerWidth - FAB_SIZE - m)),
        y: clampPx(Math.round(y), m, Math.max(m, window.innerHeight - FAB_SIZE - m))
      };
    }
    /**
     * Place the cluster. A dragged launcher is anchored to the viewport edge it is
     * nearest, so the quick actions always grow INTO the page: minis open upward from
     * the lower half and downward from the upper half, and their labels point away
     * from the nearest side. With no saved position the cluster sits in the default
     * corner on the dock's side, so reopening feels like the panel sliding back in.
     */
    applyFabPosition() {
      const s = this.fabCluster.style;
      if (this.fabPos) {
        const { x, y } = this.clampFabPos(this.fabPos.x, this.fabPos.y);
        const atTop = y + FAB_SIZE / 2 < window.innerHeight / 2;
        const atLeft = x + FAB_SIZE / 2 < window.innerWidth / 2;
        s.left = atLeft ? `${x}px` : "auto";
        s.right = atLeft ? "auto" : `${Math.max(0, window.innerWidth - x - FAB_SIZE)}px`;
        s.top = atTop ? `${y}px` : "auto";
        s.bottom = atTop ? "auto" : `${Math.max(0, window.innerHeight - y - FAB_SIZE)}px`;
        this.fabCluster.classList.toggle("at-top", atTop);
        this.fabCluster.classList.toggle("at-left", atLeft);
        return;
      }
      const leftSide = this.dockMode === "left";
      s.left = leftSide ? "20px" : "auto";
      s.right = leftSide ? "auto" : "20px";
      s.top = "auto";
      s.bottom = "";
      this.fabCluster.classList.remove("at-top");
      this.fabCluster.classList.toggle("at-left", leftSide);
    }
    resetLauncherPosition() {
      this.fabPos = null;
      this.saveState();
      this.applyDockLayout();
      this.renderSettings();
    }
    /**
     * Hide or show the collapsed launcher. Hidden is persisted, and the way back is
     * announced at the moment of hiding — a control that vanishes with no stated way
     * to return is a support ticket, not a feature.
     */
    setLauncherHidden(hidden) {
      if (this.launcherHidden === hidden) return;
      this.launcherHidden = hidden;
      this.fabExpanded = false;
      this.saveState();
      this.applyDockLayout();
      this.renderSettings();
      const label = this.cfg.label ?? "Loupe";
      this.toast(hidden ? `${escapeHtml(label)} launcher hidden \u2014 press <kbd>${LAUNCHER_SHORTCUT}</kbd> to bring it back` : `${escapeHtml(label)} launcher is back`);
    }
    /** Public seam for the host (`Loupe.showLauncher()`). */
    showLauncher() {
      this.setLauncherHidden(false);
    }
    /** Public seam for the host (`Loupe.hideLauncher()`). */
    hideLauncher() {
      this.setLauncherHidden(true);
    }
    /** A short notice at the bottom of the viewport. `html` is trusted markup built by the caller. */
    toast(html, ms = 6e3) {
      this.toastEl.innerHTML = html;
      this.toastEl.classList.add("show");
      window.clearTimeout(this.toastTimer);
      this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove("show"), ms);
    }
    collapseFab() {
      if (!this.fabExpanded) return;
      this.fabExpanded = false;
      this.applyFab();
    }
    /** Hide/show every pin on the page without losing them (persisted). */
    toggleMarkers() {
      this.markersHidden = !this.markersHidden;
      this.saveState();
      this.applyFab();
    }
    /** Reflect cluster expansion + marker visibility into the DOM. */
    applyFab() {
      this.fabCluster.classList.toggle("expanded", this.fabExpanded);
      const more = this.fabCluster.querySelector('[data-fab="more"]');
      more?.setAttribute("aria-expanded", String(this.fabExpanded));
      more?.setAttribute("aria-label", this.fabExpanded ? "Close quick actions" : "Quick actions");
      const markers = this.fabCluster.querySelector('[data-fab="markers"]');
      markers?.classList.toggle("on", this.markersHidden);
      markers?.setAttribute("aria-pressed", String(this.markersHidden));
      this.overlay.classList.toggle("hide-pins", this.markersHidden);
    }
    /** A tool button with a uniform icon + label layout. `icon` may be an SVG string. */
    toolBtn(icon, label, role) {
      const b = el("button");
      b.dataset.role = role;
      b.setAttribute("aria-label", label);
      b.innerHTML = `<span class="ico">${icon}</span><span class="label">${label}</span>`;
      return b;
    }
    drawSelection(curX, curY) {
      const s = this.dragStart;
      Object.assign(this.selbox.style, {
        display: "block",
        left: Math.min(s.x, curX) + "px",
        top: Math.min(s.y, curY) + "px",
        width: Math.abs(curX - s.x) + "px",
        height: Math.abs(curY - s.y) + "px"
      });
    }
    cancelDrag() {
      this.dragStart = null;
      document.removeEventListener("pointermove", this.onRegionMove, true);
      document.removeEventListener("pointerup", this.onRegionUp, true);
      document.removeEventListener("pointercancel", this.onRegionCancel, true);
    }
    /**
     * Anchor a dragged viewport rect to the element under its center so it survives
     * reflow. `rel` (element-relative fractions) is preferred; document coords are the
     * fallback. Shared by both the Region (screenshot) and Record (video) tools.
     */
    regionFromViewport(vp) {
      const centerEl = this.pick(vp.x + vp.w / 2, vp.y + vp.h / 2);
      let rel;
      if (centerEl) {
        const er = centerEl.getBoundingClientRect();
        if (er.width > 0 && er.height > 0) {
          rel = {
            fx: (vp.x - er.left) / er.width,
            fy: (vp.y - er.top) / er.height,
            fw: vp.w / er.width,
            fh: vp.h / er.height
          };
        }
      }
      const region = { x: vp.x + window.scrollX, y: vp.y + window.scrollY, w: vp.w, h: vp.h, rel };
      return { region, element: centerEl };
    }
    /**
     * Touch path for the Region tool: capture what is on screen right now and open the
     * composer with it already attached. The reporter scrolls to the part of the page they
     * mean FIRST, then taps Region — no drag, so nothing fights the page scroll.
     */
    async captureViewportForComposer() {
      const vp = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
      const capture = this.cfg.captureRegion ?? captureRegionScreenshot;
      let shot;
      try {
        shot = await capture(vp);
      } catch {
        shot = void 0;
      }
      const file = shot ? dataUrlToFile(shot, "screenshot.png") : null;
      const docX = window.scrollX + vp.w / 2;
      const docY = window.scrollY + vp.h / 2;
      const docW = Math.max(1, document.documentElement.scrollWidth);
      const docH = Math.max(1, document.documentElement.scrollHeight);
      const offset = { x: clamp(docX / docW), y: clamp(docY / docH) };
      this.setMode("off");
      this.openComposer(
        { kind: "free", offset, point: { x: docX, y: docY }, label: "Screenshot \xB7 attached" },
        8,
        window.innerHeight / 2,
        file ? [file] : []
      );
    }
    /**
     * Attach a video on a phone, where the page cannot record the screen: the reporter
     * records it with the phone's own screen recorder first, then picks the clip here. No
     * `capture` attribute on purpose — that would force the camera open, and a video of the
     * room is not a screen recording.
     */
    pickVideo() {
      this.setMode("off");
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "video/*";
      input.style.display = "none";
      input.onchange = () => {
        const file = input.files?.[0];
        input.remove();
        if (!file) return;
        const docX = window.scrollX + window.innerWidth / 2;
        const docY = window.scrollY + window.innerHeight / 2;
        const docW = Math.max(1, document.documentElement.scrollWidth);
        const docH = Math.max(1, document.documentElement.scrollHeight);
        const offset = { x: clamp(docX / docW), y: clamp(docY / docH) };
        this.openComposer(
          { kind: "free", offset, point: { x: docX, y: docY }, label: "Video \xB7 attached" },
          8,
          window.innerHeight / 2,
          [file]
        );
      };
      this.shadow.appendChild(input);
      input.click();
    }
    /** Capture the selected viewport rect, then open the composer for a region comment. */
    async finishRegion(vp) {
      this.selbox.style.display = "none";
      const { region, element } = this.regionFromViewport(vp);
      const target = { kind: "region", region, element };
      this.openComposer(target, vp.x + vp.w, vp.y);
      const capture = this.cfg.captureRegion ?? captureRegionScreenshot;
      this.pendingShot = capture(vp);
      void this.pendingShot.then((shot) => {
        if (shot && this.pending === target) target.screenshot = shot;
      }).catch(() => void 0);
    }
    /**
     * Record a screen video of the selected rect (same drag-select as Region), then
     * open the composer with the recording attached. Unlike the screenshot flow this
     * is interactive — the browser share prompt and a Stop button drive it — so the
     * composer opens only once recording has finished.
     */
    async finishRecording(vp) {
      this.selbox.style.display = "none";
      const { region, element } = this.regionFromViewport(vp);
      const capture = this.cfg.captureRecording ?? captureRegionRecording;
      this.showRecBar();
      let recording;
      try {
        recording = await capture(vp, {
          maxMs: RECORD_MAX_MS,
          register: (stop) => {
            this.stopRecording = stop;
          }
        });
      } catch {
        recording = void 0;
      }
      this.hideRecBar();
      if (!recording) return;
      const target = { kind: "region", region, element, recording };
      const x = Math.min(vp.x + vp.w, window.innerWidth - 320);
      this.openComposer(target, x, vp.y);
    }
    showRecBar() {
      this.stopRecording = void 0;
      this.recBar.innerHTML = `<span class="recdot"></span><span>Recording\u2026 <b>Stop</b></span>`;
      this.recBar.classList.add("show");
    }
    hideRecBar() {
      this.recBar.classList.remove("show");
      this.stopRecording = void 0;
    }
    /** elementFromPoint, ignoring our own UI. */
    pick(x, y) {
      const hitHl = this.hl.style.display;
      this.hl.style.display = "none";
      const elAt = document.elementFromPoint(x, y);
      this.hl.style.display = hitHl;
      if (!elAt) return null;
      if (elAt.id === "loupe-root" || elAt.closest?.("#loupe-root")) return null;
      return elAt;
    }
    setMode(mode) {
      if (mode !== "off") {
        if (!this.open) this.open = true;
        if (this.tab !== "comments") {
          this.tab = "comments";
          this.saveState();
        }
        this.applyDockLayout();
      }
      this.mode = mode;
      this.hl.style.display = "none";
      this.selbox.style.display = "none";
      this.cancelDrag();
      document.body.style.cursor = mode === "off" ? "" : "crosshair";
      this.dock.querySelector('[data-role="inspect"]')?.classList.toggle("on", mode === "inspect");
      this.dock.querySelector('[data-role="free"]')?.classList.toggle("on", mode === "free");
      this.dock.querySelector('[data-role="region"]')?.classList.toggle("on", mode === "region");
      this.dock.querySelector('[data-role="record"]')?.classList.toggle("on", mode === "record");
      this.dock.classList.toggle("inspecting", mode !== "off");
      document.removeEventListener("pointermove", this.onMove, true);
      document.removeEventListener("pointerdown", this.onMove, true);
      document.removeEventListener("click", this.onClick, true);
      document.removeEventListener("click", this.onFreeClick, true);
      document.removeEventListener("pointerdown", this.onRegionDown, true);
      if (mode === "off") return;
      document.addEventListener("keydown", this.onKey, true);
      this.closeComposer();
      if (mode === "inspect") {
        document.addEventListener("pointermove", this.onMove, true);
        document.addEventListener("pointerdown", this.onMove, true);
        document.addEventListener("click", this.onClick, true);
      } else if (mode === "free") {
        document.addEventListener("click", this.onFreeClick, true);
      } else if (mode === "region" && isTouchDevice()) {
        void this.captureViewportForComposer();
      } else if (mode === "record" && isTouchDevice()) {
        const vp = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
        this.setMode("off");
        void this.finishRecording(vp);
      } else if (mode === "region" || mode === "record") {
        document.addEventListener("pointerdown", this.onRegionDown, true);
      }
    }
    // ---- composer -------------------------------------------------------------
    openComposer(target, x, y, seedFiles = []) {
      this.pending = target;
      const isRecording = target.kind === "region" && !!target.recording;
      const c = this.composer;
      c.innerHTML = "";
      const label = el(
        "div",
        "target",
        target.kind === "element" ? describe(target.element) : target.kind === "region" ? isRecording ? `\u23FA Recording \xB7 ${Math.round(target.region.w)}\xD7${Math.round(target.region.h)} px` : `Region \xB7 ${Math.round(target.region.w)}\xD7${Math.round(target.region.h)} px` : target.label ?? "Free note \xB7 anywhere on the page"
      );
      const title = el("input", "title");
      title.type = "text";
      title.placeholder = "Title \u2014 one line: what's wrong, or what you need";
      const ta = el("textarea");
      ta.placeholder = isRecording ? "Describe the issue in this recording\u2026" : target.kind === "region" ? "Describe the issue in this area\u2026" : target.kind === "free" ? "Describe this note\u2026" : "Describe what should change here\u2026";
      const files = seedFiles.slice();
      const attach = el("div", "attach");
      const pick = el("button", "pick", "\uFF0B Attach images / videos");
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*,video/*";
      input.multiple = true;
      input.style.display = "none";
      const chips = el("div", "chips");
      const err = el("div", "err");
      const drawChips = () => {
        chips.innerHTML = "";
        files.forEach((f, idx) => {
          const chip = el("span", "chip", `${attachmentKind(f.type) === "video" ? "\u{1F3AC}" : "\u{1F5BC}"} ${f.name}`);
          const x2 = el("button", "x", "\xD7");
          x2.onclick = () => {
            files.splice(idx, 1);
            drawChips();
          };
          chip.appendChild(x2);
          chips.appendChild(chip);
        });
      };
      input.onchange = () => {
        err.textContent = "";
        for (const f of Array.from(input.files ?? [])) {
          if (files.length >= MAX_FILES) {
            err.textContent = `Up to ${MAX_FILES} files.`;
            break;
          }
          const cap = attachmentKind(f.type) === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
          if (f.size > cap) {
            err.textContent = `${f.name} is too large.`;
            continue;
          }
          files.push(f);
        }
        input.value = "";
        drawChips();
      };
      pick.onclick = () => input.click();
      attach.append(pick, input, chips, err);
      if (files.length) drawChips();
      const row = el("div", "row");
      const meta = el("div", "meta2");
      const prioSel = document.createElement("select");
      prioSel.className = "mini";
      prioSel.title = "Priority";
      prioSel.setAttribute("aria-label", "Priority");
      for (const p of COMMENT_PRIORITIES) {
        prioSel.append(optionEl(PRIORITY_LABELS[p], p, p === DEFAULT_PRIORITY));
      }
      const typeSel = document.createElement("select");
      typeSel.className = "mini";
      typeSel.title = "Change type";
      typeSel.setAttribute("aria-label", "Change type");
      for (const t of CHANGE_TYPES) {
        typeSel.append(optionEl(CHANGE_TYPE_LABELS[t], t, t === DEFAULT_CHANGE_TYPE));
      }
      meta.append(prioSel, typeSel);
      let box = null;
      if (target.kind !== "free" && !isRecording) {
        const chk = el("label", "chk");
        box = document.createElement("input");
        box.type = "checkbox";
        box.checked = true;
        chk.append(box, document.createTextNode("Attach screenshot"));
        row.append(chk);
      } else {
        row.style.justifyContent = "flex-end";
      }
      const btns = el("div", "btns");
      const cancel = el("button", "ghost", "Cancel");
      cancel.onclick = () => this.closeComposer();
      const save = el("button", "primary", "Comment");
      save.disabled = true;
      const sync = () => {
        save.disabled = !title.value.trim() || !ta.value.trim();
      };
      title.oninput = sync;
      ta.oninput = sync;
      sync();
      save.onclick = () => this.submit(
        target,
        title.value.trim(),
        ta.value.trim(),
        box ? box.checked : false,
        files.slice(),
        prioSel.value,
        typeSel.value
      );
      btns.append(this.voiceButton(ta), cancel, save);
      row.append(btns);
      c.append(label, title, ta, attach, meta, row);
      const w = 320, h = 380;
      const left = Math.min(Math.max(8, x + 12), window.innerWidth - w - 8);
      const top = Math.min(Math.max(8, y + 12), window.innerHeight - h - 8);
      Object.assign(c.style, { display: "block", left: left + "px", top: top + "px" });
      if (!isTouchDevice()) ta.focus();
    }
    closeComposer() {
      this.composer.style.display = "none";
      this.pending = null;
      this.pendingShot = void 0;
    }
    async submit(target, title, body, withShot, files, priority = DEFAULT_PRIORITY, changeType = DEFAULT_CHANGE_TYPE) {
      if (!title || !body) return;
      const saveBtn = this.composer.querySelector(".primary");
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = "Saving\u2026";
      }
      let anchor, context, offset;
      let screenshot;
      let recording;
      let region;
      let anchoredEl = null;
      if (target.kind === "element") {
        const capture = this.cfg.captureScreenshot ?? captureScreenshot;
        screenshot = withShot ? await capture(target.element) : void 0;
        anchor = captureAnchor(target.element);
        context = captureElementContext(target.element);
        offset = this.targetOffset;
        anchoredEl = target.element;
      } else if (target.kind === "free") {
        screenshot = void 0;
        anchor = pageAnchor(target.point);
        context = { html: "", styles: {} };
        offset = target.offset;
      } else {
        recording = target.recording;
        screenshot = !recording && withShot ? target.screenshot ?? await this.pendingShot : void 0;
        region = target.region;
        offset = { x: 0, y: 0 };
        if (target.element) {
          anchor = captureAnchor(target.element);
          context = captureElementContext(target.element);
          anchoredEl = target.element;
        } else {
          anchor = regionAnchor(region);
          context = { html: regionNote(region), styles: {} };
        }
      }
      const comment = {
        id: uid2(),
        projectKey: this.cfg.projectKey,
        url: this.url,
        author: this.cfg.user,
        title,
        body,
        status: "queue",
        priority,
        changeType,
        // Branch-aware threads: the host declares these once in `init()`, and the
        // panel's project manager can override the repo per browser.
        repo: this.effectiveRepo(),
        branch: this.cfg.branch,
        kind: target.kind,
        anchor,
        context,
        offset,
        region,
        screenshot,
        recording,
        attachments: await this.uploadAttachments(files),
        // The screen this was captured on, plus enough to tell a stale bundle from a real
        // bug when someone reports "it still doesn't work" (see Comment.viewport).
        viewport: {
          w: window.innerWidth,
          h: window.innerHeight,
          v: SDK_VERSION,
          touch: isTouchDevice(),
          coarse: coarsePointer(),
          gdm: canShareScreen()
        },
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      await this.store.save(comment);
      this.comments.push(comment);
      this.resolved.set(comment.id, anchoredEl);
      this.closeComposer();
      this.renderPins();
      this.renderList();
      this.flash(comment.id);
      this.addActivity({
        kind: "comment.create",
        label: `Created \u201C${comment.title || comment.body.split("\n")[0] || "comment"}\u201D`,
        detail: [normalizePriority(comment.priority), comment.kind ?? "element", comment.repo].filter(Boolean).join(" \xB7 "),
        files: comment.repo ? [`${comment.repo}/${shortPath(comment.url)}`] : []
      });
    }
    /** Upload the reporter's picked files. A file that fails is skipped, not fatal. */
    async uploadAttachments(files) {
      if (!files.length) return void 0;
      const out = [];
      for (const f of files) {
        try {
          out.push(await this.store.upload(this.cfg.projectKey, f));
        } catch (e) {
          console.warn("[loupe] attachment upload failed", f.name, e);
        }
      }
      return out.length ? out : void 0;
    }
    // ---- pins + re-anchoring --------------------------------------------------
    renderPins() {
      for (const [id, pin] of this.pins) {
        if (!this.comments.find((c) => c.id === id)) {
          pin.remove();
          this.pins.delete(id);
        }
      }
      this.comments.forEach((c, i) => {
        let pin = this.pins.get(c.id);
        if (!pin) {
          pin = el("button", "pin");
          pin.onclick = () => {
            this.openDock();
            this.flash(c.id);
          };
          this.overlay.appendChild(pin);
          this.pins.set(c.id, pin);
        }
        pin.textContent = String(i + 1);
        pin.classList.toggle("done", isResolved(c));
        pin.classList.toggle("free", c.kind === "free");
      });
      this.updateCount();
      this.position();
    }
    updateCount(shown = this.comments.length) {
      this.countEl.textContent = String(shown);
      const n = this.comments.length;
      this.fabBadge.textContent = n ? String(n) : "";
    }
    /**
     * The current viewport rect for a region comment. Prefers the element-relative
     * fractions (so it tracks reflow across viewports); falls back to the stored
     * document coordinates minus scroll. Returns null if neither is available.
     */
    regionRect(c, elx) {
      const rel = c.region?.rel;
      if (elx && rel) {
        const r = elx.getBoundingClientRect();
        return { x: r.left + rel.fx * r.width, y: r.top + rel.fy * r.height, w: rel.fw * r.width, h: rel.fh * r.height };
      }
      if (c.region) {
        return { x: c.region.x - window.scrollX, y: c.region.y - window.scrollY, w: c.region.w, h: c.region.h };
      }
      return null;
    }
    observe() {
      const reposition = () => {
        cancelAnimationFrame(this.raf);
        this.raf = requestAnimationFrame(this.position);
      };
      window.addEventListener("scroll", reposition, true);
      window.addEventListener("resize", reposition);
      window.addEventListener("resize", this.onWinResize);
      let debounce = 0;
      this.mo = new MutationObserver(() => {
        clearTimeout(debounce);
        debounce = window.setTimeout(() => {
          this.position();
          this.renderList();
        }, 120);
      });
      this.mo.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
      this.tick = window.setInterval(this.position, 800);
    }
    // ---- dock: open / close / mode / theme ------------------------------------
    openDock() {
      this.open = true;
      this.fabExpanded = false;
      this.saveState();
      this.applyDockLayout();
      this.renderList();
    }
    closeDock() {
      this.open = false;
      this.setMode("off");
      this.closeComposer();
      this.saveState();
      this.applyDockLayout();
    }
    setDock(mode) {
      this.dockMode = mode;
      this.open = true;
      this.saveState();
      this.applyDockLayout();
    }
    /** Switch the sidebar page (Home ↔ Comments ↔ Connect Claude). */
    setTab(tab) {
      if (this.tab === tab) return;
      if (tab !== "comments") this.setMode("off");
      this.tab = tab;
      this.hintFor = null;
      this.saveState();
      if (tab === "home") {
        this.renderHome();
        if (this.scope === "all" && !this.allComments.length) void this.loadAllComments();
      }
      if (tab === "comments") this.renderList();
      if (tab === "activity") this.renderActivity();
      this.applyDockLayout();
    }
    toggleTheme() {
      this.theme = this.theme === "dark" ? "light" : "dark";
      this.saveState();
      this.applyDockLayout();
    }
    // ---- panel shell: popovers, minimize, accent ------------------------------
    toggleMenu(menu) {
      const wasOpen = menu.classList.contains("open");
      this.closeMenus();
      if (!wasOpen) menu.classList.add("open");
    }
    closeMenus() {
      this.posMenu?.classList.remove("open");
      this.settingsMenu?.classList.remove("open");
    }
    setAccent(id) {
      if (!ACCENT_IDS.includes(id)) return;
      this.accent = id;
      this.saveState();
      this.applyDockLayout();
    }
    setMinimized(v) {
      this.minimized = v;
      this.closeMenus();
      this.saveState();
      this.applyDockLayout();
    }
    /** Flip one of the "Show …" settings and repaint whatever it governs. */
    toggleSetting(key) {
      if (key === "launcherHidden") {
        this.setLauncherHidden(!this.launcherHidden);
        return;
      }
      if (key === "markersHidden") this.markersHidden = !this.markersHidden;
      else if (key === "hoverHints") this.hoverHints = !this.hoverHints;
      else this.showPaths = !this.showPaths;
      this.saveState();
      if (key === "markersHidden") this.renderPins();
      if (key === "showPaths") {
        this.renderList();
        this.renderHome();
      }
      if (key === "hoverHints") this.hintFor = null;
      this.applyDockLayout();
    }
    /** Reflect the current state into the settings menu (never rebuild it). */
    renderSettings() {
      if (!this.settingsMenu) return;
      const on = {
        hoverHints: this.hoverHints,
        markersHidden: !this.markersHidden,
        showPaths: this.showPaths,
        launcherHidden: !this.launcherHidden
      };
      this.settingsMenu.querySelectorAll("[data-set]").forEach((b) => {
        const key = b.dataset.set;
        if (key in on) b.setAttribute("aria-pressed", String(on[key]));
        if (key === "fabReset") b.hidden = !this.fabPos;
      });
      this.settingsMenu.querySelectorAll("[data-accent]").forEach((b) => b.classList.toggle("on", b.dataset.accent === this.accent));
    }
    /**
     * The contextual hint card for the active view. Shown at most once per view and
     * never again after that — dismissed, or switched off wholesale with "Turn off
     * hints" (the same switch as Settings → Hover hints).
     */
    renderHints() {
      if (!this.homeEl) return;
      if (this.hintFor === this.tab) return;
      this.hintFor = this.tab;
      const slots = {
        home: this.homeEl.querySelector("#loupe-hhint"),
        comments: this.commentsHint ?? null,
        activity: this.activityHint ?? null
      };
      for (const [id, slot2] of this.customHintSlots) slots[id] = slot2;
      const slot = slots[this.tab];
      if (!slot) return;
      slot.innerHTML = "";
      const hint = this.hintForTab(this.tab);
      if (!hint || !this.hoverHints || this.minimized || this.hintsSeen.has(this.tab)) return;
      this.hintsSeen.add(this.tab);
      this.saveState();
      slot.innerHTML = `<div class="hint"><div class="hint-t">${escapeHtml(hint.title)}</div><div class="hint-b">${escapeHtml(hint.body)}</div><button class="hint-off" data-role="hint-off">Turn off hints</button><button class="hint-x" aria-label="Dismiss hint">\u2715</button></div>`;
      slot.querySelector('[data-role="hint-off"]').onclick = () => {
        this.hoverHints = false;
        this.hintFor = null;
        this.saveState();
        this.applyDockLayout();
      };
      slot.querySelector(".hint-x").onclick = () => {
        slot.innerHTML = "";
      };
    }
    /** The built-in hints, plus any a registered tab declared for itself. */
    hintForTab(id) {
      if (id in HINTS) return HINTS[id];
      return (this.cfg.tabs ?? []).find((t) => t.id === id)?.hint;
    }
    // ---- guided tour ----------------------------------------------------------
    startTour() {
      this.tourStep = 0;
      this.open = true;
      this.minimized = false;
      this.applyDockLayout();
      this.renderTour();
    }
    stopTour() {
      this.tourStep = -1;
      this.tourDone = true;
      this.saveState();
      this.tourEl.classList.remove("open");
      this.applyDockLayout();
    }
    gotoTour(step) {
      if (step < 0) {
        this.stopTour();
        return;
      }
      this.tourStep = step;
      this.renderTour();
    }
    /** Position the spotlight over the current step's target and lay out the card. */
    renderTour() {
      if (this.tourStep < 0 || this.tourStep >= TOUR.length) {
        this.tourEl.classList.remove("open");
        return;
      }
      const step = TOUR[this.tourStep];
      if (this.tab !== step.tab) this.setTab(step.tab);
      this.tourEl.classList.add("open");
      const pad = 4;
      const target = this.shadow.querySelector(step.sel);
      const box = target?.getBoundingClientRect();
      const r = box && box.width ? { left: box.left - pad, top: box.top - pad, width: box.width + pad * 2, height: box.height + pad * 2 } : { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 0, height: 0 };
      this.tourSpot.style.left = `${r.left}px`;
      this.tourSpot.style.top = `${r.top}px`;
      this.tourSpot.style.width = `${r.width}px`;
      this.tourSpot.style.height = `${r.height}px`;
      const last = this.tourStep === TOUR.length - 1;
      this.tourCard.innerHTML = `<div class="tour-title">${escapeHtml(step.title)}</div><div class="tour-body">${escapeHtml(step.body)}</div><div class="tour-foot"><span class="tour-dots">${TOUR.map((_, i) => `<i class="${i === this.tourStep ? "on" : ""}"></i>`).join("")}</span>` + (this.tourStep > 0 ? `<button class="t-back">Back</button>` : "") + `<button class="t-skip">Skip</button><button class="t-next">${last ? "Done" : "Next"}</button></div>`;
      const W2 = 252;
      const H = this.tourCard.offsetHeight || 130;
      const overlapsTarget = (x, y) => x < r.left + r.width + 8 && x + W2 > r.left - 8 && y < r.top + r.height + 8 && y + H > r.top - 8;
      const candidates = [
        [r.left + r.width / 2 - W2 / 2, r.top + r.height + 12],
        // below
        [r.left + r.width / 2 - W2 / 2, r.top - H - 12],
        // above
        [r.left - W2 - 12, r.top + r.height / 2 - H / 2],
        // beside (left)
        [r.left + r.width + 12, r.top + r.height / 2 - H / 2]
        // beside (right)
      ];
      let cx = clampPx(candidates[0][0], 8, Math.max(8, window.innerWidth - W2 - 8));
      let cy = clampPx(candidates[0][1], 8, Math.max(8, window.innerHeight - H - 8));
      for (const [x, y] of candidates) {
        const px = clampPx(x, 8, Math.max(8, window.innerWidth - W2 - 8));
        const py = clampPx(y, 8, Math.max(8, window.innerHeight - H - 8));
        cx = px;
        cy = py;
        if (!overlapsTarget(px, py)) break;
      }
      this.tourCard.style.left = `${cx}px`;
      this.tourCard.style.top = `${cy}px`;
      this.tourCard.querySelector(".t-back")?.addEventListener("click", () => this.gotoTour(this.tourStep - 1));
      this.tourCard.querySelector(".t-skip").addEventListener("click", () => this.stopTour());
      this.tourCard.querySelector(".t-next").addEventListener("click", () => {
        if (last) this.stopTour();
        else this.gotoTour(this.tourStep + 1);
      });
    }
    /** Narrow viewports render the panel as a bottom sheet, not a side/float dock. */
    isMobile() {
      return window.innerWidth <= 640;
    }
    loadState() {
      try {
        const s = localStorage.getItem("loupe:dock");
        if (!s) return;
        const p = JSON.parse(s);
        if (DOCK_MODES.includes(p?.mode)) this.dockMode = p.mode;
        if (typeof p?.open === "boolean") this.open = p.open;
        if (p?.theme === "light" || p?.theme === "dark") this.theme = p.theme;
        const known = [...BUILTIN_TABS.map((t) => t.id), ...(this.cfg.tabs ?? []).map((t) => t.id)];
        if (typeof p?.tab === "string" && known.includes(p.tab)) this.tab = p.tab;
        if (p?.scope === "page" || p?.scope === "all") this.scope = p.scope;
        if (typeof p?.statFilter === "string") this.statFilter = p.statFilter;
        if (typeof p?.repoFilter === "string") this.repoFilter = p.repoFilter;
        if (p?.float && typeof p.float.w === "number") this.floatRect = { ...this.floatRect, ...p.float };
        if (typeof p?.markersHidden === "boolean") this.markersHidden = p.markersHidden;
        if (typeof p?.launcherHidden === "boolean") this.launcherHidden = p.launcherHidden;
        if (p?.fab && typeof p.fab.x === "number" && typeof p.fab.y === "number") this.fabPos = { x: p.fab.x, y: p.fab.y };
        if (p?.accent && ACCENT_IDS.includes(p.accent)) this.accent = p.accent;
        if (typeof p?.minimized === "boolean") this.minimized = p.minimized;
        if (typeof p?.hoverHints === "boolean") this.hoverHints = p.hoverHints;
        if (typeof p?.showPaths === "boolean") this.showPaths = p.showPaths;
        if (typeof p?.tourDone === "boolean") this.tourDone = p.tourDone;
        if (Array.isArray(p?.hintsSeen)) this.hintsSeen = new Set(p.hintsSeen.filter((x) => typeof x === "string"));
      } catch {
      }
    }
    saveState() {
      try {
        localStorage.setItem("loupe:dock", JSON.stringify({
          mode: this.dockMode,
          open: this.open,
          theme: this.theme,
          tab: this.tab,
          float: this.floatRect,
          markersHidden: this.markersHidden,
          launcherHidden: this.launcherHidden,
          fab: this.fabPos,
          scope: this.scope,
          statFilter: this.statFilter,
          repoFilter: this.repoFilter,
          accent: this.accent,
          minimized: this.minimized,
          hoverHints: this.hoverHints,
          showPaths: this.showPaths,
          tourDone: this.tourDone,
          hintsSeen: [...this.hintsSeen]
        }));
      } catch {
      }
    }
    /** Reflect all control-panel state (theme, dock mode, geometry, launcher) into the DOM. */
    applyDockLayout() {
      this.root.classList.toggle("theme-light", this.theme === "light");
      this.themeBtn.title = this.theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
      this.themeBtn.innerHTML = this.theme === "dark" ? I_SUN : I_MOON;
      const accent = ACCENTS.find((a) => a.id === this.accent) ?? ACCENTS[0];
      this.root.style.setProperty("--accent", this.theme === "light" ? accent.light : accent.dark);
      this.root.style.setProperty("--accent-soft", accent.soft);
      const d = this.dock;
      d.classList.toggle("open", this.open);
      for (const m of DOCK_MODES) d.classList.toggle("mode-" + m, this.dockMode === m);
      d.classList.toggle("minimized", this.minimized);
      const openCount = this.comments.filter((c) => !isResolved(c)).length;
      this.minBar.innerHTML = `<span class="logo">\u25CE</span><span class="mtext"><b>${openCount}</b> open ${this.scope === "all" ? "in this project" : "on this page"}</span><span class="mrestore" aria-hidden="true">\u25B8</span>`;
      for (const t of this.tabList) d.classList.toggle(`tab-${t.id}`, this.tab === t.id);
      for (const [id, view] of this.viewEls) view.classList.toggle("on", id === this.tab);
      this.renderConsent();
      this.renderHome();
      d.querySelectorAll(".tabs .tab").forEach((b) => b.classList.toggle("on", b.dataset.tab === this.tab));
      this.posMenu.querySelectorAll("[data-pos]").forEach((b) => b.classList.toggle("on", b.dataset.pos === this.dockMode));
      this.renderSettings();
      this.renderHints();
      if (this.dockMode === "float") {
        const vw = window.innerWidth, vh = window.innerHeight;
        let { x, y, w, h } = this.floatRect;
        w = clampPx(w, 280, Math.min(760, vw - 24));
        h = clampPx(h, 220, vh - 24);
        if (x <= 0 && y <= 0) {
          x = Math.max(12, vw - w - 24);
          y = 64;
        }
        x = clampPx(x, 8, Math.max(8, vw - w - 8));
        y = clampPx(y, 8, Math.max(8, vh - h - 8));
        this.floatRect = { x, y, w, h };
        Object.assign(d.style, { left: x + "px", top: y + "px", width: w + "px", height: h + "px", right: "auto", bottom: "auto" });
      } else {
        for (const p of ["left", "top", "right", "bottom", "width", "height"]) d.style[p] = "";
      }
      d.querySelectorAll(".dctl [data-dock]").forEach((b) => b.classList.toggle("on", b.dataset.dock === this.dockMode));
      this.fabCluster.classList.toggle("show", !this.open && !this.launcherHidden);
      this.applyFabPosition();
      this.applyFab();
      this.pushPage();
    }
    /**
     * Push the host page over so the docked panel never covers content (like real
     * DevTools). We shrink the <html> box with a margin on the docked edge — the
     * panel is `position: fixed` (relative to the viewport), so it sits in the
     * gutter the margin frees up. Float mode and the closed state reserve nothing.
     * Only inline styles are touched, so clearing them restores the host exactly.
     */
    pushPage() {
      const de = document.documentElement;
      de.style.marginLeft = de.style.marginRight = de.style.marginBottom = "";
      if (!this.open || this.dockMode === "float" || this.isMobile()) return;
      const r = this.dock.getBoundingClientRect();
      if (this.dockMode === "left") de.style.marginLeft = r.width + "px";
      else if (this.dockMode === "right") de.style.marginRight = r.width + "px";
      else if (this.dockMode === "bottom") de.style.marginBottom = r.height + "px";
    }
    // ---- comment list ---------------------------------------------------------
    renderList() {
      this.listEl.innerHTML = "";
      const q = this.search.trim().toLowerCase();
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1e3;
      let items = this.visibleComments.filter((c) => {
        const stage = normalizeStatus(c.status);
        if (this.statFilter === "open" && stage === "resolved") return false;
        if (this.statFilter === "needs_you" && !needsYou({ status: c.status }).needs) return false;
        if (this.statFilter === "resolved" && stage !== "resolved") return false;
        if (this.statFilter === "stale" && (stage === "resolved" || !(Date.parse(c.createdAt) < weekAgo))) return false;
        if (this.repoFilter && c.repo !== this.repoFilter) return false;
        return !q || `${c.title ?? ""} ${c.body} ${c.author?.name ?? ""}`.toLowerCase().includes(q);
      });
      if (this.scope === "all") items = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      this.renderRepoFilter();
      this.renderReviewBar();
      if (!items.length) {
        this.listEl.appendChild(el(
          "div",
          "empty",
          this.statFilter ? "Nothing in this bucket." : q ? "No comments match your search." : this.scope === "all" ? "No feedback in this project yet." : "No comments yet. Use Inspect to pick an element, or Note to drop a comment anywhere on the page."
        ));
      }
      let lastDay = "";
      items.forEach((c, i) => {
        if (this.scope === "all") {
          const day = dayLabel(c.createdAt);
          if (day !== lastDay) {
            this.listEl.appendChild(el("div", "daylabel", day));
            lastDay = day;
          }
        }
        this.listEl.appendChild(this.itemView(c, i));
      });
      this.updateCount(items.length);
    }
    /** Repo filter — only offered in the project scope, where it means something. */
    renderRepoFilter() {
      if (!this.repoSel) return;
      const repos = [...new Set(this.visibleComments.map((c) => c.repo).filter((r) => !!r))].sort();
      this.repoSel.style.display = this.scope === "all" && repos.length > 1 ? "" : "none";
      const current2 = this.repoFilter;
      this.repoSel.innerHTML = `<option value="">All repos</option>` + repos.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join("");
      this.repoSel.value = current2;
    }
    itemView(c, i) {
      const detached = this.pins.get(c.id)?.classList.contains("detached") && !isResolved(c);
      const open = this.expanded.has(c.id);
      const item = el("div", "item" + (open ? "" : " collapsed"));
      const top = el("div", "top");
      const num = el("span", "num" + (isResolved(c) ? " done" : detached ? " detached" : ""), String(i + 1));
      top.append(num);
      if (c.recording) top.appendChild(el("span", "rectag", "\u23FA recording"));
      const vw = c.viewport?.w;
      if (vw) {
        const kind = vw < 768 ? "mobile" : vw < 1024 ? "tablet" : "desktop";
        const icon = vw < 768 ? "\u{1F4F1}" : vw < 1024 ? "\u25A6" : "\u{1F5A5}";
        top.appendChild(el("span", "device", `${icon} ${kind}`));
      }
      if (isResolved(c)) top.appendChild(el("span", "badge done", "resolved"));
      else if (detached) {
        const b = el("span", "badge detached", "moved");
        b.title = "element moved or removed";
        top.appendChild(b);
      }
      const lc = lifecycle(c);
      if (lc) {
        if (lc.stage !== "reviewed") top.appendChild(el("span", `lifechip st-${lc.stage}`, lc.label));
        if (lc.pr) {
          const pr = el(lc.pr.url ? "a" : "span", `prchip${lc.pr.state ? ` st-${lc.pr.state}` : ""}`, `#${lc.pr.number}`);
          pr.title = `Pull request #${lc.pr.number}${lc.pr.state ? ` \u2014 ${lc.pr.state}` : ""}`;
          if (lc.pr.url) {
            pr.href = lc.pr.url;
            pr.setAttribute("target", "_blank");
            pr.setAttribute("rel", "noreferrer");
            pr.addEventListener("click", (e) => e.stopPropagation());
          }
          top.appendChild(pr);
        }
        if (lc.checks) {
          const meter = el("span", "checks");
          meter.title = `Checks \u2014 ${lc.checks.text} passed`;
          meter.innerHTML = `<span class="checks-n">${escapeHtml(lc.checks.text)}</span><span class="checks-bar"><i style="width:${Math.round(lc.checks.ratio * 100)}%"></i></span>`;
          top.appendChild(meter);
        }
        if (lc.pr?.previewUrl) {
          const preview = el("a", "previewchip", "Preview");
          preview.href = lc.pr.previewUrl;
          preview.target = "_blank";
          preview.rel = "noreferrer";
          preview.title = `Preview live at ${lc.pr.previewUrl}`;
          preview.addEventListener("click", (e) => e.stopPropagation());
          top.appendChild(preview);
        }
      }
      const iteration = iterationLabel(c);
      if (iteration) {
        const chip = el("span", "iterchip", iteration);
        chip.title = `Revision of thread #${c.parentThreadId}`;
        top.appendChild(chip);
      }
      if (this.showPaths && this.scope === "all" && c.url) {
        top.appendChild(el("span", "pathtag", shortPath(c.url)));
      }
      top.appendChild(el("span", "caret", open ? "\u25BE" : "\u25B8"));
      item.appendChild(top);
      const summary = c.title || (c.body.split("\n")[0] ?? "").slice(0, 140) || "(no description)";
      item.appendChild(el("div", "summary", summary));
      const who = el("div", "who");
      const when = this.fmtWhen(c.createdAt);
      who.innerHTML = `<b>${escapeHtml(c.author?.name?.trim() || "Unknown")}</b>` + (when ? ` \xB7 <time datetime="${escapeAttr(c.createdAt)}" title="${escapeAttr(fmtAgo(c.createdAt))}">${escapeHtml(when)}</time>` : "");
      item.appendChild(who);
      const detail = el("div", "detail");
      const repliesForState = this.messages.get(c.id) ?? [];
      const lastMsg = repliesForState.length ? repliesForState[repliesForState.length - 1] : void 0;
      const attention = needsYou({
        status: c.status,
        last: lastMsg ? { fromAgent: lastMsg.author.type === "agent", body: lastMsg.body } : null,
        agentFailed: this.msgFailed.has(lastMsg?.id ?? "")
      });
      if (c.status !== "resolved" && attention.needs && attention.reason !== "review") {
        const line = el("div", "needsline");
        line.append(el("span", "needs-dot"), el("span", "", attention.label ?? "Needs you"));
        detail.appendChild(line);
      }
      if (c.status === "in_review") detail.appendChild(this.reviewBanner(c));
      if (c.proposal) detail.appendChild(this.proposalView(c));
      if (c.title || c.body.includes("\n")) detail.appendChild(el("div", "body", c.body));
      detail.appendChild(el("div", "meta", describeAnchor(c)));
      if (c.recording) {
        const v = el("video", "shot");
        v.src = c.recording;
        v.controls = true;
        v.playsInline = true;
        if (c.screenshot) v.poster = c.screenshot;
        detail.appendChild(v);
      } else if (c.screenshot) {
        const img = el("img", "shot");
        img.src = c.screenshot;
        detail.appendChild(img);
      }
      for (const a of c.attachments ?? []) {
        if (a.kind === "video") {
          const v = el("video", "shot");
          v.src = a.url;
          v.controls = true;
          v.playsInline = true;
          detail.appendChild(v);
        } else {
          const img = el("img", "shot");
          img.src = a.url;
          img.alt = a.name ?? "attachment";
          detail.appendChild(img);
        }
      }
      const actions = el("div", "actions");
      const doneBtn = el("button", "", isResolved(c) ? "Reopen" : "Resolve");
      doneBtn.onclick = async (e) => {
        e.stopPropagation();
        const status = isResolved(c) ? "queue" : "resolved";
        c.status = status;
        await this.store.update(c.id, { status });
        this.renderPins();
        this.renderList();
        this.addActivity({
          kind: status === "resolved" ? "comment.resolve" : "comment.reopen",
          label: `${status === "resolved" ? "Resolved" : "Reopened"} \u201C${c.title || c.body.split("\n")[0] || "comment"}\u201D`
        });
      };
      const del = el("button", "", "Delete");
      del.onclick = async (e) => {
        e.stopPropagation();
        await this.store.remove(c.id);
        this.comments = this.comments.filter((x) => x.id !== c.id);
        this.resolved.delete(c.id);
        this.renderPins();
        this.renderList();
        this.addActivity({
          kind: "comment.delete",
          label: `Deleted \u201C${c.title || c.body.split("\n")[0] || "comment"}\u201D`,
          level: "warn"
        });
      };
      actions.append(doneBtn, del);
      detail.appendChild(actions);
      detail.appendChild(this.conversationView(c));
      detail.appendChild(this.generateView(c));
      item.appendChild(detail);
      item.onclick = () => {
        if (open) this.expanded.delete(c.id);
        else {
          this.expanded.add(c.id);
          void this.loadMessages(c);
        }
        this.renderList();
      };
      return item;
    }
    /**
     * The review banner. This is the one place the panel asks a human to decide
     * something, so it sits above everything else in the detail.
     *
     * Approving resolves the thread. That asymmetry is the rule the whole flow rests
     * on: an agent moves work to In Review, only a person closes it.
     */
    reviewBanner(c) {
      const label = c.title || c.body.split("\n")[0] || "this thread";
      const banner = el("div", "revbanner");
      banner.innerHTML = `<span class="rev-dot"></span><span class="rev-t">Waiting on your review</span><span class="rev-spacer"></span>`;
      const approve = el("button", "rev-approve", "Approve");
      approve.onclick = async (e) => {
        e.stopPropagation();
        approve.disabled = true;
        approve.textContent = "Approving\u2026";
        await this.store.update(c.id, { status: "resolved" });
        c.status = "resolved";
        this.renderPins();
        this.renderList();
        this.renderHome();
        this.addActivity({ kind: "review.approve", label: `Approved \u201C${label}\u201D` });
      };
      const discuss = el("button", "rev-comment", "Add comment");
      discuss.onclick = (e) => {
        e.stopPropagation();
        const target = this.resolved.get(c.id);
        if (target && target.isConnected) {
          const r = target.getBoundingClientRect();
          this.openComposer({ kind: "element", element: target }, r.left + r.width / 2, r.top + r.height);
        } else {
          this.setMode("free");
        }
      };
      banner.append(approve, discuss);
      if (c.proposal) {
        const origin = el("button", "rev-origin", "Show original");
        origin.onclick = (e) => {
          e.stopPropagation();
          const view = banner.parentElement?.querySelector(".origin");
          if (!view) return;
          const shown = view.classList.toggle("show");
          view.style.display = shown ? "" : "none";
          origin.textContent = shown ? "Hide original" : "Show original";
        };
        banner.appendChild(origin);
      }
      return banner;
    }
    /**
     * The original request beside Claude's proposed change. Hidden until the review
     * banner's toggle asks for it — a reviewer who does not care should not pay for
     * the markup.
     */
    proposalView(c) {
      const p = c.proposal;
      const wrap = el("div", "origin");
      wrap.style.display = "none";
      wrap.innerHTML = `<div class="or-col"><div class="or-h">Original request</div><div class="or-b">${escapeHtml(c.title ? `${c.title}

${c.body}` : c.body)}</div>` + (c.context?.html ? `<pre class="or-code">${escapeHtml(c.context.html)}</pre>` : "") + `</div><div class="or-col"><div class="or-h">Proposed change${p.author ? ` \xB7 ${escapeHtml(p.author)}` : ""}</div>` + (p.notes ? `<div class="or-b">${escapeHtml(p.notes)}</div>` : "") + (p.html ? `<pre class="or-code">${escapeHtml(p.html)}</pre>` : "") + (p.css ? `<pre class="or-code">${escapeHtml(p.css)}</pre>` : "") + `</div>`;
      return wrap;
    }
    /** The strips above the list: how many threads are waiting on a human. */
    renderReviewBar() {
      if (!this.reviewBar) return;
      const waiting = awaitingReview(this.visibleComments);
      if (!waiting.length) {
        this.reviewBar.innerHTML = "";
        this.reviewBar.style.display = "none";
        return;
      }
      const on = this.statFilter === "needs_you";
      this.reviewBar.style.display = "";
      this.reviewBar.innerHTML = `<span class="rb-dot"></span><span class="rb-t"><b>${waiting.length}</b> waiting on your review</span><button class="rb-b" data-role="rb-toggle">${on ? "Show all" : "Review"}</button>`;
      this.reviewBar.querySelector('[data-role="rb-toggle"]').onclick = () => {
        this.statFilter = on ? "" : "needs_you";
        this.renderList();
        this.renderHome();
      };
    }
    // ---- generate + iterate ---------------------------------------------------
    /**
     * The generate pane for one thread: the preview plane, its opacity comparison
     * against the original capture, the iteration stack and the iterate input.
     *
     * The panel owns all of that; producing the markup is the host's `generate`
     * function. Without one there is nothing to preview, so the pane offers the
     * access gate instead of a dead button.
     */
    generateView(c) {
      const wrap = el("div", "genwrap");
      const state = this.iterations.get(c.id) ?? emptyIterations();
      const cur = current(state);
      const busy = this.genBusy.has(c.id);
      if (this.genOpen !== c.id) {
        const open = el("button", "gen-open", cur ? "\u2726 Change preview" : "\u2726 Generate a change");
        open.onclick = (e) => {
          e.stopPropagation();
          this.genOpen = c.id;
          this.renderList();
        };
        wrap.appendChild(open);
        return wrap;
      }
      if (!this.cfg.generate) {
        const gate = el("div", "gengate");
        gate.innerHTML = `<div class="gate-t">Generating needs access</div><div class="gate-b">This project has no generator configured for you yet. Ask for access and an owner can switch it on.</div>`;
        const ask = el("button", "gate-ask", "Request access to generate");
        ask.onclick = async (e) => {
          e.stopPropagation();
          ask.disabled = true;
          ask.textContent = "Request sent";
          await this.cfg.onRequestAccess?.({
            capability: "generate",
            user: this.cfg.user,
            projectKey: this.cfg.projectKey
          });
          this.addActivity({
            kind: "access.request",
            label: "Requested access to generate",
            detail: this.cfg.projectKey,
            level: "warn"
          });
        };
        gate.appendChild(ask);
        if (!this.cfg.onRequestAccess) {
          gate.appendChild(el("div", "gate-hint", "Pass onRequestAccess to init() to route this somewhere."));
        }
        wrap.appendChild(gate);
        wrap.appendChild(this.genClose(c));
        return wrap;
      }
      const head = el("div", "genhead");
      head.innerHTML = `<span class="gen-t">Generate</span>`;
      const nav = el("span", "gen-nav");
      const prev = el("button", "gen-step", "\u2039");
      prev.disabled = !canMove(state, -1);
      prev.setAttribute("aria-label", "Previous iteration");
      prev.onclick = (e) => {
        e.stopPropagation();
        this.setIterations(c.id, move(state, -1));
      };
      const label = el("span", "gen-n", stackLabel(state));
      const next = el("button", "gen-step", "\u203A");
      next.disabled = !canMove(state, 1);
      next.setAttribute("aria-label", "Next iteration");
      next.onclick = (e) => {
        e.stopPropagation();
        this.setIterations(c.id, move(state, 1));
      };
      nav.append(prev, label, next);
      head.appendChild(nav);
      const undo2 = el("button", "gen-undo", "Undo");
      undo2.disabled = !canUndo(state) || busy;
      undo2.onclick = (e) => {
        e.stopPropagation();
        this.setIterations(c.id, undo(state));
        this.addActivity({ kind: "generate.undo", label: "Undid a generated change" });
      };
      head.append(undo2, this.genClose(c));
      wrap.appendChild(head);
      if (busy) {
        wrap.appendChild(el("div", "genbusy", "Generating\u2026"));
      } else if (cur) {
        const plane = el("div", "genplane");
        if (c.screenshot) {
          const base = el("img", "genbase");
          base.src = c.screenshot;
          base.alt = "Original capture";
          plane.appendChild(base);
        }
        const frame = el("iframe", "genframe");
        frame.setAttribute("sandbox", "");
        frame.setAttribute("title", "Generated change preview");
        frame.srcdoc = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:10px;background:#fff;font:13px -apple-system,system-ui,sans-serif;color:#111}${cur.css ?? ""}</style>${cur.html}`;
        frame.style.opacity = String(this.genOpacity);
        plane.appendChild(frame);
        wrap.appendChild(plane);
        const slider = el("div", "genslider");
        slider.innerHTML = `<span class="gs-lab">Compare</span>`;
        const range = el("input", "gs-range");
        range.type = "range";
        range.min = "0";
        range.max = "100";
        range.value = String(Math.round(this.genOpacity * 100));
        range.setAttribute("aria-label", "Generated change opacity");
        range.oninput = () => {
          this.genOpacity = Number(range.value) / 100;
          frame.style.opacity = String(this.genOpacity);
        };
        slider.append(range, el("span", "gs-n", `${Math.round(this.genOpacity * 100)}%`));
        wrap.appendChild(slider);
        if (cur.notes) wrap.appendChild(el("div", "gennotes", cur.notes));
      } else {
        wrap.appendChild(el("div", "genempty", "Nothing generated yet."));
      }
      const iter = el("div", "geniter");
      const kind = document.createElement("select");
      kind.className = "mini";
      kind.title = "How to treat your follow-up";
      kind.setAttribute("aria-label", "Iteration kind");
      kind.append(
        optionEl("Refine", "refine", true),
        optionEl("Revise", "revise", false)
      );
      const input = el("input", "iter-in");
      input.type = "text";
      input.placeholder = cur ? "Refine it, e.g. \u201Clarger button\u201D" : "What should change?";
      input.value = this.iterDraft.get(c.id) ?? "";
      input.oninput = () => this.iterDraft.set(c.id, input.value);
      for (const n of [kind, input]) n.addEventListener("click", (e) => e.stopPropagation());
      const send = el("button", "iter-send", "Send");
      send.disabled = busy;
      send.onclick = (e) => {
        e.stopPropagation();
        const prompt = (this.iterDraft.get(c.id) ?? "").trim();
        if (!prompt) return;
        this.iterDraft.delete(c.id);
        void this.runGenerate(c, prompt, kind.value);
      };
      input.onkeydown = (e) => {
        if (e.key === "Enter") send.click();
      };
      iter.append(kind, input, send);
      wrap.appendChild(iter);
      return wrap;
    }
    genClose(c) {
      const x = el("button", "gen-x", "\u2715");
      x.setAttribute("aria-label", "Close");
      x.onclick = (e) => {
        e.stopPropagation();
        this.genOpen = null;
        this.renderList();
      };
      return x;
    }
    setIterations(id, state) {
      this.iterations.set(id, state);
      this.renderList();
    }
    /** Ask the host's generator for a change, and stack the result. */
    async runGenerate(c, prompt, kind) {
      const generate = this.cfg.generate;
      if (!generate) return;
      const state = this.iterations.get(c.id) ?? emptyIterations();
      this.genBusy.add(c.id);
      this.genOpen = c.id;
      this.renderList();
      const started = Date.now();
      try {
        const out = await generate({
          comment: c,
          prompt,
          kind,
          previous: current(state) ?? void 0,
          localAi: this.project.localAi
        });
        const next = addIteration(state, {
          id: `it${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          at: (/* @__PURE__ */ new Date()).toISOString(),
          html: out.html,
          css: out.css,
          notes: out.notes,
          prompt,
          kind
        });
        this.genBusy.delete(c.id);
        this.iterations.set(c.id, next);
        this.addActivity({
          kind: `generate.${kind}`,
          label: `${kind === "generate" ? "Generated" : "Iterated on"} \u201C${c.title || prompt}\u201D`,
          detail: `${Math.round((Date.now() - started) / 1e3)}s \xB7 ${stackLabel(next)}`
        });
      } catch (e) {
        this.genBusy.delete(c.id);
        this.addActivity({
          kind: "generate.error",
          label: `Generation failed: ${e instanceof Error ? e.message : String(e)}`,
          level: "error"
        });
      }
      this.renderList();
    }
    // ---- agent navigation (consent-gated) -------------------------------------
    /**
     * An agent asks to move the browser. Nothing navigates here — the request is
     * queued and the user answers it. `decide()` is the only thing that ever yields a
     * URL, and it yields one only on an explicit grant.
     */
    requestNavigation(url, opts = {}) {
      const next = requestNavigation(this.consent, { url, ...opts });
      if (next === this.consent) return;
      this.consent = next;
      this.open = true;
      this.saveState();
      this.applyDockLayout();
      this.renderConsent();
      this.addActivity({
        kind: "nav.request",
        label: `Asked to open ${url}`,
        detail: opts.requester,
        level: "warn"
      });
    }
    /** Local-AI settings, used as the default in GenerateRequest.localAi. */
    setLocalAi(config) {
      this.project = { ...this.project, localAi: config ?? void 0 };
      this.saveProject();
      this.renderProject();
    }
    setLocalAiStatus(text) {
      const box = this.homeEl?.querySelector("#loupe-pp-ai");
      if (box) box.textContent = text;
    }
    /**
     * Ask the configured endpoint what it serves. A real check against the real
     * server — an OpenAI-compatible `/v1/models` is what Ollama, llama.cpp and the
     * rest all expose — with a timeout, so a wrong port reports rather than hangs.
     */
    async testLocalAi(pop) {
      const url = normalizeEnvUrl(pop.querySelector(".pp-ai-url").value);
      const model = pop.querySelector(".pp-ai-model").value.trim();
      if (!url) {
        this.projError = "Enter a full http:// or https:// endpoint URL.";
        this.renderProjectError();
        return;
      }
      this.projError = "";
      this.setLocalAiStatus("Checking\u2026");
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 4e3);
      try {
        const res = await fetch(`${url}/v1/models`, { signal: ctl.signal });
        if (!res.ok) {
          this.setLocalAiStatus(`Reachable, but it answered ${res.status}.`);
          return;
        }
        const body = await res.json().catch(() => null);
        const ids = Array.isArray(body?.data) ? body.data.map((m) => String(m?.id ?? "")).filter(Boolean) : [];
        if (model && ids.length && !ids.some((i) => i === model || i.startsWith(`${model}:`))) {
          const shown = ids.slice(0, 4).join(", ");
          this.setLocalAiStatus(`Connected, but no \u201C${model}\u201D \u2014 it serves: ${shown}${ids.length > 4 ? ", \u2026" : ""}`);
          return;
        }
        this.setLocalAiStatus(
          ids.length ? `Connected \u2014 ${ids.length} model${ids.length === 1 ? "" : "s"} available.` : "Connected."
        );
      } catch (e) {
        this.setLocalAiStatus(e?.name === "AbortError" ? "Timed out. Is the server running, and does it allow this origin (CORS)?" : "Could not reach it. Check the URL, and that the server allows this origin (CORS).");
      } finally {
        clearTimeout(timer);
      }
    }
    renderConsent() {
      if (!this.consentEl) return;
      if (!isPending(this.consent)) {
        this.consentEl.innerHTML = "";
        this.consentEl.style.display = "none";
        return;
      }
      const r = this.consent.request;
      this.consentEl.style.display = "";
      this.consentEl.innerHTML = `<div class="cs-head"><span class="cs-dot"></span><b>${escapeHtml(r.requester ?? "An agent")}</b> wants to open a page</div><div class="cs-url">${escapeHtml(r.url)}</div>` + (r.reason ? `<div class="cs-why">${escapeHtml(r.reason)}</div>` : "") + `<div class="cs-btns"><button class="cs-deny">Stay here</button><button class="cs-go">Go there</button></div>`;
      this.consentEl.querySelector(".cs-deny").onclick = () => {
        const { record } = decide(this.consent, false);
        this.consent = record;
        this.renderConsent();
        this.addActivity({ kind: "nav.deny", label: `Declined opening ${r.url}` });
      };
      this.consentEl.querySelector(".cs-go").onclick = () => {
        const { record, navigateTo } = decide(this.consent, true);
        this.consent = record;
        this.renderConsent();
        this.addActivity({ kind: "nav.grant", label: `Opened ${navigateTo}` });
        if (navigateTo) window.location.assign(navigateTo);
      };
    }
    /** Drop a pending request without deciding it — e.g. the panel is closing. */
    abandonNavigation() {
      this.consent = withdraw(this.consent);
      this.renderConsent();
    }
    /** The dictation button, or nothing at all where the browser has no speech API. */
    voiceButton(target) {
      const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
      const b = el("button", "voice", "");
      this.voiceEl = b;
      if (!Ctor) {
        b.textContent = "\u{1F3A4}";
        b.disabled = true;
        b.title = "Dictation is not available in this browser";
        b.setAttribute("aria-label", "Dictation unavailable");
        return b;
      }
      const idle = () => {
        b.classList.remove("on");
        b.textContent = "\u{1F3A4}";
        b.setAttribute("aria-label", "Dictate");
        b.title = "Dictate";
      };
      const listening = () => {
        b.classList.add("on");
        b.textContent = "\u23FA";
        b.setAttribute("aria-label", "Stop dictating");
        b.title = "Listening \u2014 click to stop";
      };
      idle();
      b.onclick = (e) => {
        e.stopPropagation();
        if (this.voice) {
          this.stopVoice();
          idle();
          return;
        }
        const rec = new Ctor();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = document.documentElement.lang || "en-US";
        let base = target.value ? `${target.value} ` : "";
        rec.onresult = (ev) => {
          let text = "";
          for (let i = ev.resultIndex; i < ev.results.length; i++) text += ev.results[i][0].transcript;
          target.value = (base + text).replace(/\s+/g, " ").trimStart();
          target.dispatchEvent(new Event("input", { bubbles: true }));
        };
        rec.onerror = (ev) => {
          this.stopVoice();
          idle();
          this.addActivity({ kind: "voice.error", label: `Dictation failed: ${ev?.error ?? "unknown"}`, level: "error" });
        };
        rec.onend = () => {
          this.voice = null;
          idle();
        };
        this.voice = rec;
        this.voiceTarget = target;
        try {
          rec.start();
          listening();
        } catch {
          this.voice = null;
          idle();
        }
      };
      return b;
    }
    stopVoice() {
      try {
        this.voice?.stop();
      } catch {
      }
      this.voice = null;
      this.voiceTarget = null;
    }
    /**
     * The conversation: the replies, a reply box, the activity timeline and the copy
     * actions. Loaded lazily — a list of twenty cards should not fire twenty requests.
     */
    conversationView(c) {
      const wrap = el("div", "convo");
      const replies = this.messages.get(c.id);
      if (replies === void 0) {
        wrap.appendChild(el("div", "convo-loading", "Loading conversation\u2026"));
        return wrap;
      }
      const asRows = replies.map((m) => ({
        at: m.createdAt,
        authorName: m.author.name,
        body: m.body,
        fromAgent: m.author.type === "agent"
      }));
      const conversation = threadConversation(c, replies);
      const list = el("div", "msgs");
      for (const m of conversation) {
        const fromAgent = m.author.type === "agent";
        const state = this.msgPending.has(m.id) ? " pending" : this.msgFailed.has(m.id) ? " failed" : "";
        const row = el("div", "msg" + (fromAgent ? " agent" : "") + state);
        const initials = (m.author.name || "?").trim().slice(0, 1).toUpperCase();
        const head = el("div", "msg-head");
        head.append(
          el("span", "msg-av" + (fromAgent ? " agent" : ""), initials),
          el("b", "msg-name", m.author.name),
          el("span", "msg-when", fmtAgo(m.createdAt))
        );
        head.lastElementChild.title = this.fmtWhen(m.createdAt);
        if (fromAgent) head.appendChild(el("span", "msg-tag", "agent"));
        const body = el("div", "msg-body");
        for (const seg of mentionSegments(m.body, parseMentions(m.body))) {
          if (seg.mention) body.appendChild(el("span", "mention", seg.text));
          else body.appendChild(document.createTextNode(seg.text));
        }
        row.append(head, body);
        const pills = el("div", "rxns");
        for (const r of summarizeReactions(this.reactionsOf(c.id, m.id), this.cfg.user.id)) {
          const pill = el("button", "rxn" + (r.mine ? " mine" : ""));
          pill.append(document.createTextNode(r.emoji), el("span", "rxn-n", String(r.count)));
          pill.title = r.users.join(", ");
          pill.onclick = (e) => {
            e.stopPropagation();
            void this.react(c, m.id, r.emoji);
          };
          pills.appendChild(pill);
        }
        const add = el("button", "rxn-add", "\uFF0B");
        add.title = "Add a reaction";
        add.onclick = (e) => {
          e.stopPropagation();
          const open = pills.querySelector(".rxn-pick");
          pills.querySelectorAll(".rxn-pick").forEach((n) => n.remove());
          if (open) return;
          const pick = el("div", "rxn-pick");
          for (const emoji of REACTION_CHOICES) {
            const b = el("button", "rxn-opt", emoji);
            b.onclick = (ev) => {
              ev.stopPropagation();
              void this.react(c, m.id, emoji);
            };
            pick.appendChild(b);
          }
          pills.appendChild(pick);
        };
        pills.appendChild(add);
        row.appendChild(pills);
        if (m.attachments?.length) {
          const strip = el("div", "msg-atts");
          for (const a of m.attachments) {
            if (a.kind === "image") {
              const img = el("img", "msg-att");
              img.src = a.url;
              img.alt = a.name ?? "attachment";
              img.loading = "lazy";
              img.onclick = (e) => {
                e.stopPropagation();
                window.open(a.url, "_blank", "noopener");
              };
              strip.appendChild(img);
            } else if (a.kind === "video") {
              const video = el("video", "msg-att");
              video.src = a.url;
              video.controls = true;
              video.preload = "metadata";
              video.onclick = (e) => e.stopPropagation();
              strip.appendChild(video);
            }
          }
          if (strip.childElementCount) row.appendChild(strip);
        }
        if (this.msgPending.has(m.id)) row.appendChild(el("div", "msg-state", "Sending\u2026"));
        if (this.msgFailed.has(m.id)) {
          const failed = el("div", "msg-state failed");
          failed.append(document.createTextNode(this.msgErr.get(m.id) ?? "Could not send."));
          const retry = el("button", "msg-retry", "Retry");
          retry.onclick = (e) => {
            e.stopPropagation();
            void this.resend(c, m.id);
          };
          failed.appendChild(retry);
          row.appendChild(failed);
        }
        list.appendChild(row);
      }
      wrap.appendChild(list);
      const reply = el("div", "reply");
      const input = el("textarea", "reply-in");
      input.rows = 2;
      input.placeholder = "Reply\u2026 use @ to mention";
      input.value = this.msgDrafts.get(c.id) ?? "";
      input.oninput = () => this.msgDrafts.set(c.id, input.value);
      input.addEventListener("click", (e) => e.stopPropagation());
      input.onkeydown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          void this.sendReply(c, input.value, [...pending]);
        }
      };
      const foot = el("div", "reply-foot");
      const send = el("button", "reply-send", "\u27A4 Send");
      send.setAttribute("aria-label", "Send reply");
      send.onclick = (e) => {
        e.stopPropagation();
        void this.sendReply(c, input.value, [...pending]);
      };
      const fileIn = el("input");
      fileIn.type = "file";
      fileIn.multiple = true;
      fileIn.accept = "image/*,video/*";
      fileIn.style.display = "none";
      const attachBtn = el("button", "reply-attach", "\u{1F4CE}");
      attachBtn.title = "Attach an image or video";
      attachBtn.setAttribute("aria-label", "Attach a file");
      attachBtn.onclick = (e) => {
        e.stopPropagation();
        fileIn.click();
      };
      const pending = [];
      const chips = el("div", "reply-chips");
      const repaintChips = () => {
        chips.textContent = "";
        pending.forEach((f, i) => {
          const chip = el("span", "chip", `${attachmentKind(f.type) === "video" ? "\u{1F3AC}" : "\u{1F5BC}"} ${f.name}`);
          const x = el("button", "chip-x", "\u2715");
          x.title = "Remove";
          x.onclick = (ev) => {
            ev.stopPropagation();
            pending.splice(i, 1);
            repaintChips();
          };
          chip.appendChild(x);
          chips.appendChild(chip);
        });
      };
      fileIn.onchange = () => {
        for (const f of Array.from(fileIn.files ?? [])) {
          const cap = attachmentKind(f.type) === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
          if (f.size > cap) {
            this.addActivity({ kind: "error", level: "error", label: `${f.name} is too large to attach` });
            continue;
          }
          pending.push(f);
        }
        fileIn.value = "";
        repaintChips();
      };
      chips.addEventListener("click", (e) => e.stopPropagation());
      foot.append(el("span", "reply-hint", "@ to mention"), attachBtn, send);
      const suggest = el("div", "mention-list");
      suggest.style.display = "none";
      const refreshSuggestions = () => {
        const matches = mentionSuggestions(input.value, input.selectionStart ?? input.value.length, this.people.get(this.cfg.projectKey) ?? []);
        suggest.textContent = "";
        if (!matches.length) {
          suggest.style.display = "none";
          return;
        }
        suggest.style.display = "";
        for (const person of matches) {
          const b = el("button", "mention-pick", person.name);
          b.onclick = (e) => {
            e.stopPropagation();
            const before = input.value.slice(0, input.selectionStart ?? input.value.length);
            const at = before.lastIndexOf("@");
            const after = input.value.slice(input.selectionStart ?? input.value.length);
            input.value = `${before.slice(0, at)}@${person.name.replace(/\s+/g, "")} ${after}`;
            this.msgDrafts.set(c.id, input.value);
            suggest.style.display = "none";
            input.focus();
          };
          suggest.appendChild(b);
        }
      };
      input.oninput = () => {
        this.msgDrafts.set(c.id, input.value);
        refreshSuggestions();
      };
      input.onkeyup = () => refreshSuggestions();
      input.onblur = () => setTimeout(() => {
        suggest.style.display = "none";
      }, 150);
      reply.append(input, suggest, chips, fileIn, foot);
      wrap.appendChild(reply);
      const timeline = threadTimeline(c, asRows);
      const tl = el("div", "tl");
      tl.appendChild(el("div", "tl-h", "Activity"));
      for (const entry of timeline) {
        const item = el("div", `tl-i tl-${entry.kind}`);
        item.append(el("span", "tl-dot"), el("span", "tl-l", entry.label));
        if (entry.detail) item.appendChild(el("span", "tl-d", entry.detail));
        tl.appendChild(item);
      }
      wrap.appendChild(tl);
      const copyRow = el("div", "copyrow");
      const copyTextBtn = el("button", "copy-b", "Copy thread text");
      copyTextBtn.onclick = (e) => {
        e.stopPropagation();
        const text = threadAsText(
          {
            id: c.id,
            body: c.body,
            title: c.title,
            url: c.url,
            status: c.status,
            createdAt: c.createdAt,
            kind: c.kind,
            anchor: { tag: c.anchor?.tag, selector: c.anchor?.cssPath },
            proposal: c.proposal,
            pr: c.pr
          },
          asRows
        );
        void this.copyText(copyTextBtn, text);
      };
      const copyImagesBtn = el("button", "copy-b", "Copy images");
      copyImagesBtn.onclick = (e) => {
        e.stopPropagation();
        void this.copyImages(copyImagesBtn, c);
      };
      copyRow.append(copyTextBtn, copyImagesBtn);
      wrap.appendChild(copyRow);
      return wrap;
    }
    /**
     * Join, then keep talking.
     *
     * Presence is a heartbeat, not a flag, because a browser that is closed or crashes
     * sends no goodbye. The bridge expires anything silent past the TTL, and the panel
     * re-joins on a 404 rather than assuming it is still known.
     */
    startPresence() {
      const bridge = this.cfg.bridge;
      if (!bridge) return;
      const base = bridge.replace(/\/$/, "");
      const pageUrl = location.pathname + location.search;
      const tick = async () => {
        try {
          if (!this.peerId) {
            const res = await fetch(`${base}/presence`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ url: pageUrl, userId: this.cfg.user.id, name: this.cfg.user.name })
            });
            if (!res.ok) return;
            const data = await res.json();
            this.peerId = data.peer?.id;
          } else {
            const res = await fetch(`${base}/presence/${encodeURIComponent(this.peerId)}/heartbeat`, { method: "POST" });
            if (res.status === 404) this.peerId = void 0;
          }
          const listed = await fetch(
            `${base}/presence?url=${encodeURIComponent(pageUrl)}&viewer=${encodeURIComponent(this.peerId ?? "")}`
          );
          if (listed.ok) {
            const data = await listed.json();
            this.peers = Array.isArray(data.peers) ? data.peers : [];
            this.renderPeers();
          }
        } catch {
          this.peers = [];
          this.renderPeers();
        }
      };
      void tick();
      this.peerTimer = setInterval(() => void tick(), PEER_HEARTBEAT_MS);
    }
    renderPeers() {
      if (!this.peerEl) return;
      this.peerEl.textContent = "";
      if (!this.peers.length) {
        this.peerEl.style.display = "none";
        return;
      }
      this.peerEl.style.display = "";
      for (const p of this.peers.slice(0, 4)) {
        const av = el("span", "peer-av", initialsOf(p.name));
        av.title = `${p.name} is on this page`;
        this.peerEl.appendChild(av);
      }
      if (this.peers.length > 4) this.peerEl.appendChild(el("span", "peer-more", `+${this.peers.length - 4}`));
    }
    stopPresence() {
      if (this.peerTimer) clearInterval(this.peerTimer);
      this.peerTimer = void 0;
      if (this.cfg.bridge && this.peerId) {
        const base = this.cfg.bridge.replace(/\/$/, "");
        void fetch(`${base}/presence/${encodeURIComponent(this.peerId)}`, { method: "DELETE", keepalive: true }).catch(() => {
        });
      }
      this.peerId = void 0;
      this.peers = [];
    }
    /**
     * Follow the bridge's thread channel while the panel is open.
     *
     * The SSE channel lives in the MCP process, so a reply posted by anyone — an agent, a
     * teammate's browser — arrives here rather than being discovered by the 4 s list
     * poll. Only the threads whose messages are already loaded are refetched: pulling a
     * conversation nobody has open would be work for nothing.
     */
    startLiveThreads() {
      const bridge = this.cfg.bridge;
      if (!bridge || this.liveSource) return;
      if (typeof EventSource === "undefined") return;
      try {
        const source = new EventSource(`${bridge.replace(/\/$/, "")}/thread-updates`);
        source.addEventListener("thread", (ev) => {
          let parsed;
          try {
            parsed = JSON.parse(ev.data);
          } catch {
            return;
          }
          if (!parsed || typeof parsed.threadId !== "string") return;
          if (!this.messages.has(parsed.threadId)) return;
          void this.refreshMessages(parsed.threadId);
        });
        source.onerror = () => {
        };
        this.liveSource = source;
      } catch {
      }
    }
    /** Re-read one thread's replies, replacing the cache. */
    async refreshMessages(threadId) {
      try {
        const list = await this.store.listMessages(threadId);
        if (!Array.isArray(list)) return;
        this.messages.set(threadId, list);
        this.renderList();
      } catch {
      }
    }
    reactionsOf(threadId, messageId) {
      return this.reactions.get(`${threadId}:${messageId}`) ?? [];
    }
    /**
     * Toggle a reaction.
     *
     * Optimistic, then replaced by the server's own set: the server returns the whole
     * list precisely so the count can never drift from what was stored.
     */
    async react(c, messageId, emoji) {
      const key = `${c.id}:${messageId}`;
      const before = this.reactionsOf(c.id, messageId);
      this.reactions.set(key, toggleReaction(before, {
        messageId,
        emoji,
        userId: this.cfg.user.id,
        userName: this.cfg.user.name
      }));
      this.renderList();
      try {
        const next = await this.store.toggleReaction({
          threadId: c.id,
          messageId,
          emoji,
          userId: this.cfg.user.id,
          userName: this.cfg.user.name
        });
        this.reactions.set(key, Array.isArray(next) ? next : this.reactionsOf(c.id, messageId));
      } catch {
        this.reactions.set(key, before);
      }
      this.renderList();
    }
    async loadPeople() {
      if (this.people.has(this.cfg.projectKey)) return;
      try {
        this.people.set(this.cfg.projectKey, await this.store.listPeople(this.cfg.projectKey));
      } catch {
        this.people.set(this.cfg.projectKey, []);
      }
    }
    /** Fetch replies once, when a card is first expanded. */
    async loadMessages(c) {
      if (this.messages.has(c.id)) return;
      void this.loadPeople();
      void this.store.listReactions(c.id).then((all) => {
        if (!Array.isArray(all)) return;
        for (const r of all) {
          const key = `${c.id}:${r.messageId}`;
          const list = this.reactions.get(key) ?? [];
          if (!list.some((x) => x.userId === r.userId && x.emoji === r.emoji)) list.push(r);
          this.reactions.set(key, list);
        }
        this.renderList();
      }).catch(() => {
      });
      try {
        this.messages.set(c.id, await this.store.listMessages(c.id));
      } catch {
        this.messages.set(c.id, []);
      }
      this.renderList();
    }
    /**
     * Post a reply, optimistically.
     *
     * The row appears immediately; if the store rejects it the row stays with a Retry,
     * because losing what someone typed is worse than showing a failed row.
     */
    async sendReply(c, raw, files = []) {
      const body = raw.trim();
      if (!body && !files.length) return;
      const author = {
        id: this.cfg.user.id,
        name: this.cfg.user.name,
        email: this.cfg.user.email,
        type: "user"
      };
      const attachments = files.length ? await this.uploadAttachments(files) : void 0;
      const optimistic = {
        id: `pending-${Date.now().toString(36)}`,
        threadId: c.id,
        author,
        body,
        attachments,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      this.messages.set(c.id, [...this.messages.get(c.id) ?? [], optimistic]);
      this.msgPending.add(optimistic.id);
      this.msgDrafts.delete(c.id);
      this.renderList();
      try {
        const saved = await this.store.addMessage(c.id, { author, body, attachments });
        this.messages.set(c.id, (this.messages.get(c.id) ?? []).map((m) => m.id === optimistic.id ? saved : m));
        this.msgPending.delete(optimistic.id);
        this.addActivity({ kind: "message.create", label: `Replied on \u201C${c.title || body.slice(0, 40)}\u201D` });
      } catch (e) {
        this.msgPending.delete(optimistic.id);
        this.msgFailed.add(optimistic.id);
        this.msgErr.set(optimistic.id, e instanceof Error ? e.message : "Could not send.");
      }
      this.renderList();
    }
    /** Try a failed optimistic reply again, in place. */
    async resend(c, id) {
      const found = (this.messages.get(c.id) ?? []).find((m) => m.id === id);
      if (!found) return;
      this.msgFailed.delete(id);
      this.msgErr.delete(id);
      this.msgPending.add(id);
      this.renderList();
      try {
        const saved = await this.store.addMessage(c.id, { author: found.author, body: found.body });
        this.messages.set(c.id, (this.messages.get(c.id) ?? []).map((m) => m.id === id ? saved : m));
        this.msgPending.delete(id);
      } catch (e) {
        this.msgPending.delete(id);
        this.msgFailed.add(id);
        this.msgErr.set(id, e instanceof Error ? e.message : "Could not send.");
      }
      this.renderList();
    }
    /** Copy text, and say so — silence looks like a no-op. */
    async copyText(button, text) {
      const original = button.textContent;
      try {
        if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
        await navigator.clipboard.writeText(text);
        button.textContent = "Copied \u2713";
      } catch {
        button.textContent = "Copy failed";
      }
      setTimeout(() => {
        button.textContent = original;
      }, 1500);
    }
    /**
     * Copy the captured images. Best-effort and reported as such: an image clipboard
     * write needs a secure context and a user gesture, and a silent failure would look
     * like it worked.
     */
    async copyImages(button, c) {
      const original = button.textContent;
      const sources = [c.screenshot, ...(c.attachments ?? []).filter((a) => a.kind === "image").map((a) => a.url)].filter((s) => !!s);
      if (!sources.length) {
        button.textContent = "No images";
        setTimeout(() => {
          button.textContent = original;
        }, 1500);
        return;
      }
      try {
        const blobs = await Promise.all(sources.slice(0, 4).map(async (src) => (await fetch(src)).blob()));
        const items = {};
        blobs.forEach((blob, i) => {
          items[i === 0 ? "image/png" : `image/png-${i}`] = blob;
        });
        await navigator.clipboard.write([new window.ClipboardItem(items)]);
        button.textContent = "Copied \u2713";
      } catch {
        button.textContent = "Copy failed";
      }
      setTimeout(() => {
        button.textContent = original;
      }, 1500);
    }
    flash(id) {
      const c = this.comments.find((x) => x.id === id);
      const pin = this.pins.get(id);
      if (c?.kind === "free") {
        for (const p of this.pins.values()) p.classList.remove("active");
        pin?.classList.add("active");
        const docW = Math.max(1, document.documentElement.scrollWidth);
        const docH = Math.max(1, document.documentElement.scrollHeight);
        window.scrollTo({
          top: Math.max(0, c.offset.y * docH - window.innerHeight / 2),
          left: Math.max(0, c.offset.x * docW - window.innerWidth / 2),
          behavior: "smooth"
        });
        this.position();
        return;
      }
      if (c?.kind === "region" && c.region) {
        for (const p of this.pins.values()) p.classList.remove("active");
        pin?.classList.add("active");
        this.activeRegionId = id;
        window.clearTimeout(this.regionTimer);
        this.regionTimer = window.setTimeout(() => {
          this.activeRegionId = null;
          this.regionBox.style.display = "none";
        }, 2400);
        const elx2 = this.resolved.get(id);
        if (elx2) elx2.scrollIntoView({ behavior: "smooth", block: "center" });
        else window.scrollTo({ top: Math.max(0, c.region.y - 120), left: Math.max(0, c.region.x - 120), behavior: "smooth" });
        this.position();
        return;
      }
      if (!pin || pin.classList.contains("detached")) return;
      for (const p of this.pins.values()) p.classList.remove("active");
      pin.classList.add("active");
      const elx = this.resolved.get(id);
      if (elx) elx.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    /** Absolute timestamp in the host's configured time zone and locale (see `LoupeConfig.timeZone`). */
    fmtWhen(iso) {
      return fmtAbsolute(iso, this.cfg.locale, this.cfg.timeZone);
    }
    /**
     * " · package v0.11.0", flagged, when the host's package version differs from this
     * bundle's. The two agree on a healthy install; they differ exactly when the
     * package was upgraded but its published JS was not — the trap this makes visible.
     */
    packageVersionNote() {
      const pkg = (this.cfg.packageVersion ?? "").trim().replace(/^v/i, "");
      if (!pkg || pkg === SDK_VERSION) return "";
      const why = `This widget bundle is v${SDK_VERSION} but the installed package is v${pkg}. Re-publish the package assets so the served bundle matches.`;
      return ` \xB7 <span class="ver-stale" title="${escapeAttr(why)}">package v${escapeHtml(pkg)}</span>`;
    }
    destroy() {
      this.liveSource?.close();
      this.liveSource = void 0;
      this.companionSource?.close();
      this.companionSource = void 0;
      if (this.companionPoll) clearInterval(this.companionPoll);
      this.stopVoice();
      this.stopPresence();
      this.stopRecording?.();
      this.setMode("off");
      this.mo?.disconnect();
      if (this.tick) clearInterval(this.tick);
      window.clearTimeout(this.regionTimer);
      window.removeEventListener("resize", this.onWinResize);
      window.removeEventListener("pointermove", this.onHeadPointerMove);
      window.removeEventListener("pointerup", this.onHeadPointerUp);
      window.removeEventListener("pointermove", this.onResizeMove);
      window.removeEventListener("pointerup", this.onResizeUp);
      window.removeEventListener("pointermove", this.onFabPointerMove);
      window.removeEventListener("pointerup", this.onFabPointerUp);
      window.removeEventListener("pointercancel", this.onFabPointerUp);
      window.clearTimeout(this.toastTimer);
      document.removeEventListener("keydown", this.onLauncherKey);
      document.removeEventListener("keydown", this.onKey, true);
      const de = document.documentElement;
      de.style.marginLeft = de.style.marginRight = de.style.marginBottom = "";
      this.root?.remove();
    }
  };
  function el(tag, cls = "", text = "") {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }
  function clamp(n) {
    return Math.max(0, Math.min(1, n));
  }
  function fmtAgo(iso) {
    const then = Date.parse(iso);
    if (Number.isNaN(then)) return "";
    const s = Math.max(0, Math.round((Date.now() - then) / 1e3));
    if (s < 60) return "just now";
    const m = Math.round(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
  }
  var warnedBadTimeZone = false;
  function fmtAbsolute(iso, locale, timeZone) {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return "";
    const opts = {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    };
    try {
      return new Intl.DateTimeFormat(locale || void 0, { ...opts, timeZone: timeZone || void 0 }).format(t);
    } catch (err) {
      if (!warnedBadTimeZone) {
        warnedBadTimeZone = true;
        console.warn(`[loupe] unusable timeZone/locale (${timeZone ?? "-"} / ${locale ?? "-"}); using the browser's`, err);
      }
      return new Intl.DateTimeFormat(void 0, opts).format(t);
    }
  }
  function shortPath(url) {
    try {
      return new URL(url, location.origin).pathname || "/";
    } catch {
      return url;
    }
  }
  function normalizeEnvUrl(raw) {
    const s = raw.trim();
    if (!s) return null;
    try {
      const u = new URL(s);
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      if (!u.hostname) return null;
      const path = u.pathname.replace(/\/+$/, "");
      return u.origin + path;
    } catch {
      return null;
    }
  }
  function dayLabel(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "Earlier";
    const today = /* @__PURE__ */ new Date();
    const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const days = Math.round((startOf(today) - startOf(d)) / 864e5);
    if (days <= 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    return d.toLocaleDateString(void 0, { month: "short", day: "numeric", year: "numeric" });
  }
  function clampPx(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }
  function optionEl(text, value, selected) {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = text;
    o.selected = selected;
    return o;
  }
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]);
  }
  function escapeAttr(s) {
    return escapeHtml(s);
  }
  var svg = (inner) => `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden="true">${inner}</svg>`;
  var DOCK_FRAME = `<rect x="1.5" y="2.5" width="13" height="11" rx="1.6" stroke="currentColor" stroke-width="1.3"/>`;
  var I_DOCK_LEFT = svg(`${DOCK_FRAME}<rect x="2.2" y="3.2" width="4" height="9.6" rx="1" fill="currentColor"/>`);
  var I_DOCK_RIGHT = svg(`${DOCK_FRAME}<rect x="9.8" y="3.2" width="4" height="9.6" rx="1" fill="currentColor"/>`);
  var I_DOCK_BOTTOM = svg(`${DOCK_FRAME}<rect x="2.2" y="9" width="11.6" height="3.8" rx="1" fill="currentColor"/>`);
  var I_FLOAT = svg(
    `<rect x="2.5" y="3.5" width="11" height="9" rx="1.6" stroke="currentColor" stroke-width="1.3"/><path d="M2.5 6.1h11" stroke="currentColor" stroke-width="1.3"/>`
  );
  var I_SUN = svg(
    `<circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.3"/><g stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M8 1.4v1.7"/><path d="M8 12.9v1.7"/><path d="M1.4 8h1.7"/><path d="M12.9 8h1.7"/><path d="M3.3 3.3l1.2 1.2"/><path d="M11.5 11.5l1.2 1.2"/><path d="M12.7 3.3l-1.2 1.2"/><path d="M4.5 11.5l-1.2 1.2"/></g>`
  );
  var I_MOON = svg(
    `<path d="M13 9.4A5.3 5.3 0 1 1 6.6 3 4.3 4.3 0 0 0 13 9.4z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>`
  );
  var I_CLOSE = svg(
    `<path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`
  );
  var I_GEAR = svg(
    `<circle cx="8" cy="8" r="2.2" stroke="currentColor" stroke-width="1.4"/><path d="M8 1.6v1.5M8 12.9v1.5M1.6 8h1.5M12.9 8h1.5M3.5 3.5l1.1 1.1M11.4 11.4l1.1 1.1M12.5 3.5l-1.1 1.1M4.6 11.4l-1.1 1.1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`
  );
  var I_MINIMIZE = svg(
    `<path d="M3.5 8h9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`
  );
  var I_COMMENT = svg(
    `<path d="M2 3.1h12v7.4H6.5l-3.3 2.6v-2.6H2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M8 5.1v3.4M6.3 6.8h3.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>`
  );
  var I_NOTE = svg(
    `<path d="M2.6 2.6h10.8v7.2l-3.6 3.6H2.6z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M13.4 9.8h-3.6v3.6" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>`
  );
  var I_EYE = svg(
    `<path d="M1.4 8S3.9 4 8 4s6.6 4 6.6 4-2.5 4-6.6 4S1.4 8 1.4 8z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.3"/>`
  );
  var I_PLUG = svg(
    `<path d="M6 1.8v3.1M10 1.8v3.1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M4.4 4.9h7.2v2.3a3.6 3.6 0 0 1-7.2 0z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M8 10.8v3.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>`
  );
  var I_EYE_OFF = svg(
    `<path d="M2 2l12 12M6.6 6.7A2 2 0 0 0 9.3 9.4M4.3 4.5C2.9 5.4 1.9 6.7 1.5 8c1.1 3 3.7 5 6.5 5 1.3 0 2.5-.4 3.6-1.1M6.9 3.2C7.3 3.1 7.6 3 8 3c2.8 0 5.4 2 6.5 5-.3.8-.8 1.6-1.4 2.3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`
  );
  var I_FAB_CHEVRON = `<span class="lchev">${svg(`<path d="M4.4 9.6 8 6l3.6 3.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`)}</span>`;
  var REGION_ICON = `<svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true"><rect x="1.5" y="2.5" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2.4 1.8"/></svg>`;
  var NOTE_ICON = `<svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M2 2.5h11v7.5H6l-3 2.5v-2.5H2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
  var RECORD_ICON = `<svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true"><rect x="1.5" y="2.5" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2.4 1.8"/><circle cx="7.5" cy="7.5" r="2.4" fill="currentColor"/></svg>`;
  var VIDEO_ICON = `<svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true"><rect x="1.5" y="2.5" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M6.3 5.5l3.9 2.2-3.9 2.2z" fill="currentColor"/></svg>`;
  var I_GITHUB = `<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 .2a8 8 0 0 0-2.5 15.6c.4.07.55-.17.55-.38v-1.3c-2.2.48-2.67-1.07-2.67-1.07-.36-.92-.88-1.16-.88-1.16-.72-.5.05-.48.05-.48.8.056 1.22.82 1.22.82.71 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.76-.2-3.6-.88-3.6-3.9 0-.86.3-1.57.82-2.12-.08-.2-.36-1 .08-2.1 0 0 .67-.21 2.2.8a7.6 7.6 0 0 1 4 0c1.53-1.02 2.2-.8 2.2-.8.44 1.1.16 1.9.08 2.1.5.55.82 1.26.82 2.12 0 3.03-1.85 3.7-3.61 3.9.28.24.54.72.54 1.46v2.16c0 .21.14.46.55.38A8 8 0 0 0 8 .2z"/></svg>`;
  var I_SLACK = `<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M3.4 10.1a1.6 1.6 0 1 1-1.6-1.6h1.6v1.6zm.8 0a1.6 1.6 0 0 1 3.2 0v4a1.6 1.6 0 1 1-3.2 0v-4zM5.8 3.4a1.6 1.6 0 1 1 1.6-1.6v1.6H5.8zm0 .8a1.6 1.6 0 0 1 0 3.2h-4a1.6 1.6 0 1 1 0-3.2h4zm6.7 1.6a1.6 1.6 0 1 1 1.6 1.6h-1.6V5.8zm-.8 0a1.6 1.6 0 0 1-3.2 0v-4a1.6 1.6 0 1 1 3.2 0v4zm-1.6 6.7a1.6 1.6 0 1 1-1.6 1.6v-1.6h1.6zm0-.8a1.6 1.6 0 0 1 0-3.2h4a1.6 1.6 0 1 1 0 3.2h-4z"/></svg>`;
  var I_TELEGRAM = `<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm3.7 5.4-1.24 5.85c-.09.41-.34.51-.69.32l-1.9-1.4-.92.88c-.1.1-.19.19-.38.19l.14-1.93 3.5-3.17c.15-.13-.03-.2-.24-.07l-4.32 2.72-1.86-.58c-.4-.13-.41-.4.09-.6l7.26-2.8c.34-.12.63.08.52.6z"/></svg>`;
  var I_LINEAR = `<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M.6 9.2a7.4 7.4 0 0 0 6.2 6.2c.3.04.44-.33.22-.55L1.15 9a.33.33 0 0 0-.55.22zM.5 6.9c-.01.13.04.25.13.34l8.13 8.13c.09.09.21.14.34.13a7.4 7.4 0 0 0 1.3-.26c.28-.08.36-.43.15-.63L1.4 5.45c-.2-.2-.55-.13-.63.15-.12.42-.21.86-.26 1.3zM2.05 4c-.1.13-.09.32.03.44l9.48 9.48c.12.12.31.13.44.03.3-.23.58-.48.85-.75.15-.15.15-.4 0-.55L3.35 3.15a.39.39 0 0 0-.55 0c-.27.27-.52.55-.75.85zM4.5 1.9a.35.35 0 0 0-.04.53l9.11 9.11c.16.16.42.13.53-.04A7.4 7.4 0 1 0 4.5 1.9z"/></svg>`;
  function pageAnchor(point) {
    return {
      tag: "page",
      cssPath: "page",
      xpath: "",
      testid: null,
      text: "",
      attrs: {},
      nthOfType: 1,
      rect: { x: Math.round(point.x), y: Math.round(point.y), w: 0, h: 0 },
      viewport: { w: window.innerWidth, h: window.innerHeight }
    };
  }
  function regionAnchor(region) {
    return {
      tag: "region",
      cssPath: `region ${Math.round(region.w)}\xD7${Math.round(region.h)}`,
      xpath: "",
      testid: null,
      text: "",
      attrs: {},
      nthOfType: 1,
      rect: { x: Math.round(region.x), y: Math.round(region.y), w: Math.round(region.w), h: Math.round(region.h) },
      viewport: { w: window.innerWidth, h: window.innerHeight }
    };
  }
  function regionNote(region) {
    return `<!-- Loupe free-region annotation: ${Math.round(region.w)}\xD7${Math.round(region.h)}px at document (${Math.round(region.x)}, ${Math.round(region.y)}). No single DOM element \u2014 see the attached screenshot. -->`;
  }
  function describe(elx) {
    const testid = elx.getAttribute("data-testid") || elx.getAttribute("data-test");
    const tag = elx.tagName.toLowerCase();
    if (testid) return `${tag}[data-testid="${testid}"]`;
    if (elx.id) return `${tag}#${elx.id}`;
    const txt = (elx.textContent || "").trim().replace(/\s+/g, " ").slice(0, 32);
    return txt ? `${tag} \xB7 \u201C${txt}\u201D` : tag;
  }
  function describeAnchor(c) {
    if (c.kind === "free") return "Free note \xB7 page-level";
    return c.anchor.testid ? `[data-testid="${c.anchor.testid}"]` : c.anchor.cssPath;
  }
  function isResolved(c) {
    return normalizeStatus(c.status) === "resolved";
  }

  // src/connect.ts
  var escapeHtml2 = (s) => s.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]);
  function connectTab() {
    return {
      id: "connect",
      label: "Connect",
      hint: {
        title: "Hand it to Claude",
        body: "Add the MCP server to your client and it can list, read and answer this feedback \u2014 screenshot included."
      },
      render: (ctx) => {
        const apiHint = ctx.apiBase ?? "http://localhost:8787";
        const config = JSON.stringify(
          {
            mcpServers: {
              loupe: {
                command: "npx",
                args: ["-y", "@loupekit/mcp"],
                env: { LOUPE_API: apiHint, LOUPE_PROJECT_KEY: ctx.projectKey, LOUPE_ADMIN_KEY: "<your project secret>" }
              }
            }
          },
          null,
          2
        );
        const steps = [
          ["Pin your feedback", "Use Inspect, Region, Record, or Note to leave comments right on the live app."],
          ["Add the Loupe MCP server", "Drop this into your Claude Code config so Claude can read this project's backlog:"],
          ["Let Claude fix it", "Claude reads each comment (with the screenshot, HTML & CSS), rewrites the UI, and calls propose_change \u2014 the modified HTML/CSS then shows up for your dev team in the dashboard."]
        ];
        return `<div class="connect-hero"><div class="chero-logo">\u25CE</div><div class="chero-title">Hand your feedback to <span class="accentink">Claude</span></div><div class="chero-sub">Every pinned comment becomes an actionable, fully-contextualized task Claude Code can act on.</div></div><ol class="connect-steps">` + steps.map(([title, body], i) => `<li><div class="cstep-t">${i + 1}. ${escapeHtml2(title)}</div><div class="cstep-d">${escapeHtml2(body)}</div>` + (i === 1 ? `<pre class="cstep-code">${escapeHtml2(config)}</pre>` : "") + `</li>`).join("") + `</ol>`;
      }
    };
  }

  // src/index.ts
  var app = null;
  function init(config) {
    if (app) return;
    if (!config?.projectKey) {
      console.error("[loupe] init requires a projectKey");
      return;
    }
    if (!config.user?.id) {
      console.error("[loupe] init requires user.id");
      return;
    }
    app = new LoupeApp(config);
    const boot = () => app.start();
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }
  function destroy() {
    app?.destroy();
    app = null;
  }
  function trackActivity(event) {
    app?.addActivity(event);
  }
  function setActivityStatus(status) {
    app?.setActivityStatus(status);
  }
  function clearActivity() {
    app?.clearActivity();
  }
  function requestNavigation2(url, opts) {
    app?.requestNavigation(url, opts);
  }
  function setLocalAi(config) {
    app?.setLocalAi(config);
  }
  function openTool(tool) {
    app?.openTool(tool);
  }
  function showLauncher() {
    app?.showLauncher();
  }
  function hideLauncher() {
    app?.hideLauncher();
  }
  return __toCommonJS(src_exports);
})();
//# sourceMappingURL=index.global.js.map