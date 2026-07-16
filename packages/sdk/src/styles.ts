// Scoped to the Shadow DOM — none of this leaks to (or is affected by) the host page.
export const STYLES = /* css */ `
:host { all: initial; }
* { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }

/* Theme tokens live on :host (inside the Shadow DOM :root matches nothing).
   Dark is the default; the host element gets .theme-light to flip to light. */
:host {
  --accent: #6b73e6;
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
  background: rgba(107, 115, 230, 0.12);
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
  border: 2px dashed var(--accent); background: rgba(107, 115, 230, 0.14); border-radius: 4px;
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

/* ------------------------------------------------------------------ launcher */
/* The collapsed state: a small floating button that reopens the panel. */
.launcher {
  position: fixed; z-index: 2147483003; bottom: 20px; right: 20px;
  width: 46px; height: 46px; border-radius: 50%; padding: 0;
  border: 1px solid var(--line); background: var(--bg-2); color: var(--ink);
  cursor: pointer; display: none; align-items: center; justify-content: center;
  box-shadow: var(--shadow);
}
.launcher.show { display: inline-flex; }
.launcher:hover { border-color: var(--accent); }
.launcher .logo { font-size: 24px; line-height: 1; color: var(--accent); }
.launcher .lcount {
  position: absolute; top: -5px; right: -5px; background: var(--pin); color: #fff;
  font-size: 10px; font-weight: 700; line-height: 1; border-radius: 999px; padding: 3px 6px;
  border: 2px solid var(--bg);
}
.launcher .lcount:empty { display: none; }

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
.item .top { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.item .num { background: var(--pin); color: #fff; width: 20px; height: 20px; border-radius: 50%; font-size: 11px; font-weight: 700; display: grid; place-items: center; flex: none; }
.item .num.detached { background: #9aa0af; }
.item .num.done { background: #10935a; }
.item .who { font-size: 12px; font-weight: 600; }
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

/* float resize grip (bottom-right corner) */
.resize { display: none; position: absolute; right: 0; bottom: 0; width: 16px; height: 16px; cursor: nwse-resize; z-index: 1; }
.dock.mode-float .resize { display: block; }
.resize::after {
  content: ""; position: absolute; right: 3px; bottom: 3px; width: 7px; height: 7px;
  border-right: 2px solid var(--muted); border-bottom: 2px solid var(--muted); opacity: .7;
}

/* composer popover */
.composer {
  position: fixed; z-index: 2147483004; pointer-events: auto; width: 300px;
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
  .dctl [data-dock], .dctl .gap { display: none; } /* dock positions don't apply on mobile */
  .resize { display: none !important; }
  .tools button { flex: 1; justify-content: center; } /* full-width tap targets */
  .dock.mode-bottom .list { grid-template-columns: 1fr; }
  .launcher { bottom: 16px; right: 16px; }
  /* While a tool is active, shrink the sheet to just header + tools so most of the
     page stays visible and tappable; the list returns when the tool closes. */
  .dock.inspecting { height: auto !important; }
  .dock.inspecting .listhead, .dock.inspecting .list { display: none; }
}
`;
