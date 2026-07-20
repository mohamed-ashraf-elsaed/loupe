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
    destroy: () => destroy,
    init: () => init
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

/* ------------------------------------------------------------ sidebar tabs */
.tabs { display: flex; gap: 4px; flex: none; padding: 8px 10px 0; border-bottom: 1px solid var(--line); }
.tabs .tab {
  flex: 1; padding: 8px 10px; border: 0; border-bottom: 2px solid transparent;
  background: transparent; color: var(--muted); font-size: 12px; font-weight: 700; cursor: pointer;
  border-radius: 6px 6px 0 0;
}
.tabs .tab:hover { color: var(--ink); background: var(--bg-2); }
.tabs .tab.on { color: var(--accent); border-bottom-color: var(--accent); }

/* Two sidebar pages: only the active one shows. */
.view { display: none; }
.dock.tab-comments .comments-view { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.dock.tab-connect .connect-view { display: block; flex: 1; overflow-y: auto; }

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
    const attrKeys = Object.keys(a.attrs);
    if (attrKeys.length) {
      let matched = 0;
      for (const k of attrKeys) if (el2.getAttribute(k) === a.attrs[k]) matched++;
      add(W.attrs, matched / attrKeys.length);
    }
    if (a.testid) add(W.testid, stableId(el2) === a.testid ? 1 : 0);
    add(W.cssPath, via === "cssPath" ? 1 : 0);
    const r = el2.getBoundingClientRect();
    const cx = r.left + window.scrollX + r.width / 2;
    const cy = r.top + window.scrollY + r.height / 2;
    const ax = a.rect.x + a.rect.w / 2;
    const ay = a.rect.y + a.rect.h / 2;
    const diag = Math.hypot(a.viewport.w, a.viewport.h) || 1;
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
    let current = 0;
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
        progress?.(++current, count);
      }
    };
    progress?.(current, count);
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
    async save(comment) {
      const all = this.readAll(comment.projectKey, comment.url);
      all.push(comment);
      this.writeAll(comment.projectKey, comment.url, all);
      return comment;
    }
    async update(id, patch) {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith("loupe:")) continue;
        const list = JSON.parse(localStorage.getItem(k) || "[]");
        const idx = list.findIndex((c) => c.id === id);
        if (idx >= 0) {
          list[idx] = { ...list[idx], ...patch };
          localStorage.setItem(k, JSON.stringify(list));
          return;
        }
      }
    }
    async remove(id) {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith("loupe:")) continue;
        const list = JSON.parse(localStorage.getItem(k) || "[]");
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
  var DOCK_MODES = ["left", "right", "bottom", "float"];
  var RECORD_MAX_MS = 2e4;
  var uid2 = () => crypto.randomUUID ? crypto.randomUUID() : "c_" + Math.abs(hash(String(performance.now()))).toString(36);
  function hash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = h * 31 + s.charCodeAt(i) | 0;
    return h;
  }
  var LoupeApp = class {
    constructor(cfg) {
      this.comments = [];
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
      this.tab = "comments";
      /** Float-mode window geometry; (x<=0 && y<=0) → placed on first layout. */
      this.floatRect = { x: 0, y: 0, w: 380, h: 540 };
      this.floatDrag = null;
      this.floatResize = null;
      this.raf = 0;
      // ---- inspector ------------------------------------------------------------
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
      // ---- region ("free-size screenshot") selection ----------------------------
      this.onRegionDown = (e) => {
        if (this.mode !== "region" && this.mode !== "record" || e.button !== 0) return;
        const t = e.target;
        if (t && (t.id === "loupe-root" || t.closest?.("#loupe-root"))) return;
        e.preventDefault();
        e.stopPropagation();
        this.dragStart = { x: e.clientX, y: e.clientY };
        document.addEventListener("mousemove", this.onRegionMove, true);
        document.addEventListener("mouseup", this.onRegionUp, true);
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
            const r = resolveAnchor(c.anchor);
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
      this.cfg = cfg;
      this.store = cfg.apiBase ? new HttpAdapter(cfg.apiBase, cfg.user, cfg.userHmac, cfg.headers, cfg.credentials) : new LocalStorageAdapter();
    }
    get url() {
      return location.pathname + location.search;
    }
    async start() {
      this.loadState();
      this.buildDom();
      if (this.cfg.autoOpen) this.open = true;
      this.applyDockLayout();
      this.lastUrl = this.url;
      this.comments = await this.store.list(this.cfg.projectKey, this.url);
      this.renderPins();
      this.renderList();
      this.observe();
      this.watchNavigation();
      if (this.cfg.autoOpen) this.setMode("inspect");
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
      this.launcher = this.buildLauncher();
      this.recBar = this.buildRecBar();
      this.shadow.append(this.dock, this.launcher, this.recBar);
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
      const dockBtn = (mode, icon, title) => {
        const b = el("button");
        b.dataset.dock = mode;
        b.title = title;
        b.setAttribute("aria-label", title);
        b.innerHTML = icon;
        b.onclick = () => this.setDock(mode);
        return b;
      };
      ctl.append(
        dockBtn("left", I_DOCK_LEFT, "Dock to left"),
        dockBtn("bottom", I_DOCK_BOTTOM, "Dock to bottom"),
        dockBtn("right", I_DOCK_RIGHT, "Dock to right"),
        dockBtn("float", I_FLOAT, "Float"),
        el("span", "gap")
      );
      this.themeBtn = el("button");
      this.themeBtn.dataset.role = "theme";
      this.themeBtn.onclick = () => this.toggleTheme();
      const closeBtn = el("button");
      closeBtn.dataset.role = "close";
      closeBtn.title = "Close";
      closeBtn.setAttribute("aria-label", "Close");
      closeBtn.innerHTML = I_CLOSE;
      closeBtn.onclick = () => this.closeDock();
      ctl.append(this.themeBtn, closeBtn);
      head.append(brand, ctl);
      const tabs = el("div", "tabs");
      const commentsTab = el("button", "tab", "Comments");
      commentsTab.dataset.tab = "comments";
      commentsTab.onclick = () => this.setTab("comments");
      const connectTab = el("button", "tab", "Connect Claude");
      connectTab.dataset.tab = "connect";
      connectTab.onclick = () => this.setTab("connect");
      tabs.append(commentsTab, connectTab);
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
      recordBtn.title = "Drag a box, record a screen video of it, and comment";
      recordBtn.onclick = () => this.setMode(this.mode === "record" ? "off" : "record");
      tools.append(inspectBtn, freeBtn, regionBtn, recordBtn);
      const listHead = el("div", "listhead");
      listHead.append(document.createTextNode("Comments"));
      this.countEl = el("span", "count", "0");
      listHead.appendChild(this.countEl);
      this.listEl = el("div", "list");
      const commentsView = el("div", "view comments-view");
      commentsView.append(tools, listHead, this.listEl, this.buildIntegrations());
      const connectView = this.buildConnectPanel();
      const resize = el("div", "resize");
      resize.addEventListener("pointerdown", this.onResizeDown);
      dock.append(head, tabs, commentsView, connectView, resize);
      return dock;
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
    /** The "Connect Claude" onboarding page: how to wire the MCP server to this project. */
    buildConnectPanel() {
      const view = el("div", "view connect-view");
      const key = this.cfg.projectKey;
      const apiHint = this.cfg.apiBase ?? "http://localhost:8787";
      const config = JSON.stringify(
        {
          mcpServers: {
            loupe: {
              command: "npx",
              args: ["-y", "@loupekit/mcp"],
              env: { LOUPE_API: apiHint, LOUPE_PROJECT_KEY: key, LOUPE_ADMIN_KEY: "<your project secret>" }
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
      const hero = el("div", "connect-hero");
      hero.innerHTML = `<div class="chero-logo">\u25CE</div><div class="chero-title">Hand your feedback to <span class="accentink">Claude</span></div><div class="chero-sub">Every pinned comment becomes an actionable, fully-contextualized task Claude Code can act on.</div>`;
      view.appendChild(hero);
      const list = el("ol", "connect-steps");
      steps.forEach(([t, d], i) => {
        const li = el("li");
        li.innerHTML = `<div class="cstep-t">${i + 1}. ${escapeHtml(t)}</div><div class="cstep-d">${escapeHtml(d)}</div>`;
        if (i === 1) {
          const pre = el("pre", "cstep-code");
          pre.textContent = config;
          li.appendChild(pre);
        }
        list.appendChild(li);
      });
      view.appendChild(list);
      return view;
    }
    /** The floating "recording…" pill with a Stop button (shown only while recording). */
    buildRecBar() {
      const bar = el("button", "recbar");
      bar.title = "Stop recording";
      bar.setAttribute("aria-label", "Stop recording");
      bar.onclick = () => this.stopRecording?.();
      return bar;
    }
    buildLauncher() {
      const b = el("button", "launcher");
      b.title = `Open ${this.cfg.label ?? "Loupe"}`;
      b.setAttribute("aria-label", "Open Loupe");
      b.innerHTML = `<span class="logo">\u25CE</span><span class="lcount"></span>`;
      this.launchCount = b.querySelector(".lcount");
      b.onclick = () => this.openDock();
      return b;
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
      document.removeEventListener("mousemove", this.onRegionMove, true);
      document.removeEventListener("mouseup", this.onRegionUp, true);
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
      document.removeEventListener("mousemove", this.onMove, true);
      document.removeEventListener("click", this.onClick, true);
      document.removeEventListener("click", this.onFreeClick, true);
      document.removeEventListener("mousedown", this.onRegionDown, true);
      if (mode === "off") return;
      document.addEventListener("keydown", this.onKey, true);
      this.closeComposer();
      if (mode === "inspect") {
        document.addEventListener("mousemove", this.onMove, true);
        document.addEventListener("click", this.onClick, true);
      } else if (mode === "free") {
        document.addEventListener("click", this.onFreeClick, true);
      } else if (mode === "region" || mode === "record") {
        document.addEventListener("mousedown", this.onRegionDown, true);
      }
    }
    // ---- composer -------------------------------------------------------------
    openComposer(target, x, y) {
      this.pending = target;
      const isRecording = target.kind === "region" && !!target.recording;
      const c = this.composer;
      c.innerHTML = "";
      const label = el(
        "div",
        "target",
        target.kind === "element" ? describe(target.element) : target.kind === "region" ? isRecording ? `\u23FA Recording \xB7 ${Math.round(target.region.w)}\xD7${Math.round(target.region.h)} px` : `Region \xB7 ${Math.round(target.region.w)}\xD7${Math.round(target.region.h)} px` : "Free note \xB7 anywhere on the page"
      );
      const ta = el("textarea");
      ta.placeholder = isRecording ? "What's the issue in this recording?" : target.kind === "region" ? "What's the issue in this area?" : target.kind === "free" ? "Leave a note about this page\u2026" : "What should change here?";
      const row = el("div", "row");
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
      ta.oninput = () => {
        save.disabled = !ta.value.trim();
      };
      save.onclick = () => this.submit(target, ta.value.trim(), box ? box.checked : false);
      btns.append(cancel, save);
      row.append(btns);
      c.append(label, ta, row);
      const w = 300, h = 190;
      const left = Math.min(Math.max(8, x + 12), window.innerWidth - w - 8);
      const top = Math.min(Math.max(8, y + 12), window.innerHeight - h - 8);
      Object.assign(c.style, { display: "block", left: left + "px", top: top + "px" });
      ta.focus();
    }
    closeComposer() {
      this.composer.style.display = "none";
      this.pending = null;
      this.pendingShot = void 0;
    }
    async submit(target, body, withShot) {
      if (!body) return;
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
        body,
        status: "open",
        kind: target.kind,
        anchor,
        context,
        offset,
        region,
        screenshot,
        recording,
        // Record the screen the feedback was captured on (desktop / tablet / mobile).
        viewport: { w: window.innerWidth, h: window.innerHeight },
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      await this.store.save(comment);
      this.comments.push(comment);
      this.resolved.set(comment.id, anchoredEl);
      this.closeComposer();
      this.renderPins();
      this.renderList();
      this.flash(comment.id);
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
        pin.classList.toggle("done", c.status === "done");
        pin.classList.toggle("free", c.kind === "free");
      });
      this.updateCount();
      this.position();
    }
    updateCount() {
      const n = this.comments.length;
      this.countEl.textContent = String(n);
      this.launchCount.textContent = n ? String(n) : "";
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
    /** Switch the sidebar page (Comments ↔ Connect Claude). */
    setTab(tab) {
      if (this.tab === tab) return;
      if (tab !== "comments") this.setMode("off");
      this.tab = tab;
      this.saveState();
      this.applyDockLayout();
      if (tab === "comments") this.renderList();
    }
    toggleTheme() {
      this.theme = this.theme === "dark" ? "light" : "dark";
      this.saveState();
      this.applyDockLayout();
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
        if (p?.tab === "comments" || p?.tab === "connect") this.tab = p.tab;
        if (p?.float && typeof p.float.w === "number") this.floatRect = { ...this.floatRect, ...p.float };
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
          float: this.floatRect
        }));
      } catch {
      }
    }
    /** Reflect all control-panel state (theme, dock mode, geometry, launcher) into the DOM. */
    applyDockLayout() {
      this.root.classList.toggle("theme-light", this.theme === "light");
      this.themeBtn.title = this.theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
      this.themeBtn.innerHTML = this.theme === "dark" ? I_SUN : I_MOON;
      const d = this.dock;
      d.classList.toggle("open", this.open);
      for (const m of DOCK_MODES) d.classList.toggle("mode-" + m, this.dockMode === m);
      d.classList.toggle("tab-comments", this.tab === "comments");
      d.classList.toggle("tab-connect", this.tab === "connect");
      d.querySelectorAll(".tabs .tab").forEach((b) => b.classList.toggle("on", b.dataset.tab === this.tab));
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
      this.launcher.classList.toggle("show", !this.open);
      const leftSide = this.dockMode === "left";
      this.launcher.style.left = leftSide ? "20px" : "auto";
      this.launcher.style.right = leftSide ? "auto" : "20px";
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
      if (!this.comments.length) {
        this.listEl.appendChild(el(
          "div",
          "empty",
          "No comments yet. Use Inspect to pick an element, or Note to drop a comment anywhere on the page."
        ));
      }
      this.comments.forEach((c, i) => this.listEl.appendChild(this.itemView(c, i)));
      this.updateCount();
    }
    itemView(c, i) {
      const detached = this.pins.get(c.id)?.classList.contains("detached") && c.status !== "done";
      const item = el("div", "item");
      const top = el("div", "top");
      const num = el("span", "num" + (c.status === "done" ? " done" : detached ? " detached" : ""), String(i + 1));
      top.append(num);
      if (c.recording) top.appendChild(el("span", "rectag", "\u23FA recording"));
      const vw = c.viewport?.w;
      if (vw) {
        const kind = vw < 768 ? "mobile" : vw < 1024 ? "tablet" : "desktop";
        const icon = vw < 768 ? "\u{1F4F1}" : vw < 1024 ? "\u25A6" : "\u{1F5A5}";
        top.appendChild(el("span", "device", `${icon} ${kind}`));
      }
      if (c.status === "done") top.appendChild(el("span", "badge done", "done"));
      else if (detached) top.appendChild(el("span", "badge detached", "element moved/removed"));
      item.appendChild(top);
      item.appendChild(el("div", "body", c.body));
      item.appendChild(el("div", "meta", describeAnchor(c)));
      if (c.recording) {
        const v = el("video", "shot");
        v.src = c.recording;
        v.controls = true;
        v.playsInline = true;
        if (c.screenshot) v.poster = c.screenshot;
        item.appendChild(v);
      } else if (c.screenshot) {
        const img = el("img", "shot");
        img.src = c.screenshot;
        item.appendChild(img);
      }
      const actions = el("div", "actions");
      const doneBtn = el("button", "", c.status === "done" ? "Reopen" : "Mark done");
      doneBtn.onclick = async (e) => {
        e.stopPropagation();
        const status = c.status === "done" ? "open" : "done";
        c.status = status;
        await this.store.update(c.id, { status });
        this.renderPins();
        this.renderList();
      };
      const claudeBtn = el("button", "", "Copy for Claude");
      claudeBtn.onclick = async (e) => {
        e.stopPropagation();
        await this.copyForClaude(c);
        claudeBtn.textContent = "Copied \u2713";
      };
      const del = el("button", "", "Delete");
      del.onclick = async (e) => {
        e.stopPropagation();
        await this.store.remove(c.id);
        this.comments = this.comments.filter((x) => x.id !== c.id);
        this.resolved.delete(c.id);
        this.renderPins();
        this.renderList();
      };
      actions.append(doneBtn, claudeBtn, del);
      item.appendChild(actions);
      item.onclick = () => this.flash(c.id);
      return item;
    }
    async copyForClaude(c) {
      const lines = c.kind === "free" ? [
        `# Product feedback from ${c.author.name}`,
        ``,
        `**Note:** ${c.body}`,
        `**Page:** ${c.url}`,
        `**Type:** Free note \u2014 a page-level comment not tied to a specific element.`
      ] : [
        `# Product feedback from ${c.author.name}`,
        ``,
        `**Comment:** ${c.body}`,
        `**Page:** ${c.url}`,
        `**Element:** \`${c.anchor.cssPath}\``,
        c.anchor.testid ? `**Stable id:** \`${c.anchor.testid}\`` : ``,
        c.recording ? `**Screen recording (webm):** ${c.recording}` : ``,
        ``,
        `## Target element`,
        "```html",
        c.context.html,
        "```",
        ``,
        `## Computed styles`,
        "```json",
        JSON.stringify(c.context.styles, null, 2),
        "```"
      ];
      const prompt = lines.filter(Boolean).join("\n");
      try {
        await navigator.clipboard.writeText(prompt);
      } catch {
        console.log("[loupe] copy failed; prompt:\n" + prompt);
      }
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
    destroy() {
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
  function clampPx(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]);
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
  var REGION_ICON = `<svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true"><rect x="1.5" y="2.5" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2.4 1.8"/></svg>`;
  var NOTE_ICON = `<svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M2 2.5h11v7.5H6l-3 2.5v-2.5H2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
  var RECORD_ICON = `<svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true"><rect x="1.5" y="2.5" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2.4 1.8"/><circle cx="7.5" cy="7.5" r="2.4" fill="currentColor"/></svg>`;
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
  return __toCommonJS(src_exports);
})();
//# sourceMappingURL=index.global.js.map