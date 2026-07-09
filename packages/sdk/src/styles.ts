// Scoped to the Shadow DOM — none of this leaks to (or is affected by) the host page.
export const STYLES = /* css */ `
:host { all: initial; }
* { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }

:root, .loupe {
  --accent: #4a55d6;
  --pin: #ff5842;
  --ink: #16181f;
  --panel: #ffffff;
  --panel-2: #f4f5f9;
  --line: #e2e5ee;
  --muted: #6b7180;
}

.overlay {
  position: fixed; inset: 0; z-index: 2147483000; pointer-events: none;
}

/* inspector highlight */
.hl {
  position: fixed; pointer-events: none; z-index: 2147483001;
  border: 2px solid var(--accent);
  background: rgba(74, 85, 214, 0.10);
  border-radius: 4px; display: none;
  transition: all 60ms linear;
}
.hl .tip {
  position: absolute; top: -24px; left: 0; background: var(--accent); color: #fff;
  font-size: 11px; font-weight: 600; padding: 2px 7px; border-radius: 4px; white-space: nowrap;
  font-family: ui-monospace, Menlo, monospace;
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
.pin.active { outline: 3px solid rgba(74,85,214,.4); }

/* toolbar */
.toolbar {
  position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
  z-index: 2147483003; pointer-events: auto;
  display: flex; align-items: center; gap: 4px;
  background: #1b1e27; color: #fff; padding: 6px; border-radius: 12px;
  box-shadow: 0 8px 30px rgba(0,0,0,.4); border: 1px solid #2b2f3b;
}
.toolbar button {
  background: transparent; color: #cfd3de; border: 0; cursor: pointer;
  font-size: 13px; font-weight: 500; padding: 8px 12px; border-radius: 8px;
  display: flex; align-items: center; gap: 6px;
}
.toolbar button:hover { background: #2b2f3b; color: #fff; }
.toolbar button.on { background: var(--accent); color: #fff; }
.toolbar .sep { width: 1px; height: 20px; background: #333846; margin: 0 2px; }
.toolbar .brand { font-weight: 700; padding-left: 8px; padding-right: 4px; letter-spacing: -.01em; }
.toolbar .count {
  background: var(--pin); color: #fff; font-size: 11px; font-weight: 700;
  border-radius: 999px; padding: 1px 7px; margin-left: 2px;
}

/* composer popover */
.composer {
  position: fixed; z-index: 2147483004; pointer-events: auto; width: 300px;
  background: var(--panel); color: var(--ink); border: 1px solid var(--line);
  border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,.22); padding: 12px; display: none;
}
.composer .target {
  font-family: ui-monospace, Menlo, monospace; font-size: 11px; color: var(--accent);
  background: var(--panel-2); border-radius: 6px; padding: 5px 8px; margin-bottom: 8px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.composer textarea {
  width: 100%; min-height: 68px; resize: vertical; border: 1px solid var(--line);
  border-radius: 8px; padding: 8px; font-size: 13px; color: var(--ink); outline: none;
}
.composer textarea:focus { border-color: var(--accent); }
.composer .row { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; gap: 8px; }
.composer label.chk { font-size: 12px; color: var(--muted); display: flex; align-items: center; gap: 6px; cursor: pointer; }
.composer .btns { display: flex; gap: 6px; }
.composer button {
  border: 0; border-radius: 8px; font-size: 13px; font-weight: 600; padding: 7px 12px; cursor: pointer;
}
.composer .primary { background: var(--accent); color: #fff; }
.composer .primary:disabled { opacity: .5; cursor: default; }
.composer .ghost { background: var(--panel-2); color: var(--ink); }

/* panel (comment list) */
.panel {
  position: fixed; right: 16px; bottom: 80px; top: 16px; width: 340px;
  z-index: 2147483003; pointer-events: auto; display: none; flex-direction: column;
  background: var(--panel); color: var(--ink); border: 1px solid var(--line);
  border-radius: 14px; box-shadow: 0 12px 40px rgba(0,0,0,.22); overflow: hidden;
}
.panel.open { display: flex; }
.panel .phead { padding: 14px 16px; border-bottom: 1px solid var(--line); font-weight: 700; display:flex; justify-content:space-between; align-items:center; }
.panel .phead .x { cursor:pointer; color: var(--muted); background:none; border:0; font-size:18px; }
.panel .list { overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 8px; }
.panel .empty { color: var(--muted); font-size: 13px; padding: 24px 12px; text-align: center; }
.item {
  border: 1px solid var(--line); border-radius: 10px; padding: 10px; cursor: pointer; background: var(--panel);
}
.item:hover { border-color: var(--accent); }
.item .top { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.item .num { background: var(--pin); color:#fff; width:20px; height:20px; border-radius:50%; font-size:11px; font-weight:700; display:grid; place-items:center; }
.item .num.detached { background:#9aa0af; }
.item .num.done { background:#10935a; }
.item .who { font-size: 12px; font-weight: 600; }
.item .body { font-size: 13px; line-height: 1.4; }
.item .meta { font-size: 11px; color: var(--muted); margin-top: 6px; font-family: ui-monospace, Menlo, monospace; }
.item .badge { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; padding: 1px 6px; border-radius: 5px; margin-left: auto; }
.badge.detached { background: #eceef2; color: #6b7180; }
.badge.done { background: #d8f0e4; color: #10935a; }
.item .actions { display: flex; gap: 6px; margin-top: 8px; }
.item .actions button { font-size: 11px; border: 1px solid var(--line); background: var(--panel-2); border-radius: 6px; padding: 4px 8px; cursor: pointer; color: var(--ink); }
.item img.shot { width: 100%; border-radius: 6px; margin-top: 8px; border: 1px solid var(--line); }
`;
