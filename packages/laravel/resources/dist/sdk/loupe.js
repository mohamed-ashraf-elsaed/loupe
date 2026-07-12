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

/* Custom properties must live on :host \u2014 inside the Shadow DOM, :root matches
   nothing and no element carries a .loupe class, so they'd never resolve. */
:host {
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

/* region selection (during drag) + active-comment outline */
.selbox {
  position: fixed; pointer-events: none; z-index: 2147483001; display: none;
  border: 2px dashed var(--accent); background: rgba(74, 85, 214, 0.12); border-radius: 4px;
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
.pin.active { outline: 3px solid rgba(74,85,214,.4); }

/* toolbar */
.toolbar {
  position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
  z-index: 2147483003; pointer-events: auto;
  display: flex; align-items: center; gap: 4px;
  background: #1b1e27; color: #fff; padding: 6px; border-radius: 12px;
  box-shadow: 0 8px 30px rgba(0,0,0,.4); border: 1px solid #2b2f3b;
}
/* every toolbar item (brand + buttons) shares one icon+label layout so they align */
.toolbar button, .toolbar .brand {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 12px; border-radius: 8px;
  font-size: 13px; font-weight: 500; line-height: 1;
}
.toolbar button {
  background: transparent; color: #cfd3de; border: 0; cursor: pointer;
}
.toolbar button:hover, .toolbar .brand:hover { background: #2b2f3b; color: #fff; }
.toolbar .ico { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; }
.toolbar .ico svg { width: 16px; height: 16px; display: block; }
.toolbar .label { white-space: nowrap; }
.toolbar button.on { background: var(--accent); color: #fff; }
.toolbar .sep { width: 1px; height: 20px; background: #333846; margin: 0 2px; }
.toolbar .brand {
  font-weight: 700; letter-spacing: -.01em; cursor: pointer; user-select: none;
}
/* collapsed \u2192 show only the brand/logo; click it again to expand */
.toolbar.collapsed { gap: 0; }
.toolbar.collapsed > *:not(.brand) { display: none; }
.toolbar .count {
  background: var(--pin); color: #fff; font-size: 11px; font-weight: 700;
  border-radius: 999px; padding: 1px 7px; margin-left: 2px;
}

/* mobile \u2192 compact, icon-only, pinned to the left */
@media (max-width: 640px) {
  .toolbar { left: 12px; right: auto; transform: none; bottom: 12px; padding: 4px; gap: 2px; }
  .toolbar .label { display: none; }
  .toolbar button, .toolbar .brand { padding: 10px; }
  .toolbar .sep { display: none; }
  .toolbar .count { position: absolute; top: -4px; right: -4px; margin: 0; }
  .toolbar [data-role="comments"] { position: relative; }
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
.item .device { font-size: 10px; color: var(--muted); background: var(--panel-2); border-radius: 999px; padding: 1px 7px; white-space: nowrap; }
.item .body { font-size: 13px; line-height: 1.4; }
.item .meta { font-size: 11px; color: var(--muted); margin-top: 6px; font-family: ui-monospace, Menlo, monospace; }
.item .badge { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; padding: 1px 6px; border-radius: 5px; margin-left: auto; }
.badge.detached { background: #eceef2; color: #6b7180; }
.badge.done { background: #d8f0e4; color: #10935a; }
.item .actions { display: flex; gap: 6px; margin-top: 8px; }
.item .actions button { font-size: 11px; border: 1px solid var(--line); background: var(--panel-2); border-radius: 6px; padding: 4px 8px; cursor: pointer; color: var(--ink); }
.item img.shot { width: 100%; border-radius: 6px; margin-top: 8px; border: 1px solid var(--line); }
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
    const svg = getDocument(ownerDocument).createElementNS(XMLNS, "svg");
    svg.setAttributeNS(null, "width", width.toString());
    svg.setAttributeNS(null, "height", height.toString());
    svg.setAttributeNS(null, "viewBox", `0 0 ${width} ${height}`);
    return svg;
  }
  function svgToDataUrl(svg, removeControlCharacter) {
    let xhtml = new XMLSerializer().serializeToString(svg);
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
  function svgHasExternalResources(svg) {
    return SVG_EXTERNAL_RESOURCE_REGEX.test(svg.innerHTML);
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
    const svg = createForeignObjectSvg(clone, context);
    svgDefsElement && svg.insertBefore(svgDefsElement, svg.children[0]);
    svgStyleElement && svg.insertBefore(svgStyleElement, svg.children[0]);
    autoDestruct && destroyContext(context);
    await onCreateForeignObjectSvg?.(svg);
    return svg;
  }
  function createForeignObjectSvg(clone, context) {
    const { width, height } = context;
    const svg = createSvg(width, height, clone.ownerDocument);
    const foreignObject = svg.ownerDocument.createElementNS(svg.namespaceURI, "foreignObject");
    foreignObject.setAttributeNS(null, "x", "0%");
    foreignObject.setAttributeNS(null, "y", "0%");
    foreignObject.setAttributeNS(null, "width", "100%");
    foreignObject.setAttributeNS(null, "height", "100%");
    foreignObject.append(clone);
    svg.appendChild(foreignObject);
    return svg;
  }
  async function domToCanvas(node, options) {
    const context = await orCreateContext(node, options);
    const svg = await domToForeignObjectSvg(context);
    const dataUrl = svgToDataUrl(svg, context.isEnable("removeControlCharacter"));
    if (!context.autoDestruct) {
      context.svgStyleElement = createStyleElement(context.ownerDocument);
      context.svgDefsElement = context.ownerDocument?.createElementNS(XMLNS, "defs");
      context.svgStyles.clear();
    }
    const image = createImage(dataUrl, svg.ownerDocument);
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
  async function fontsReady() {
    try {
      const fonts = document.fonts;
      if (fonts?.ready) await fonts.ready;
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
      return await domToPng(el2, {
        scale: Math.min(window.devicePixelRatio || 1, 2),
        backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
        // Give cross-origin font/asset fetches time to embed (default is short) so
        // the capture matches the page instead of falling back to system fonts.
        timeout: 3e4,
        filter: captureFilter
      });
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
      const full = await domToPng(container, {
        scale,
        backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
        timeout: 3e4,
        filter: captureFilter
      });
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
    async save(comment) {
      if (comment.screenshot?.startsWith("data:")) {
        try {
          const up = await fetch(`${this.base}/v1/blobs`, this.opts({
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify({ projectKey: comment.projectKey, data: comment.screenshot })
          }));
          if (up.ok) comment = { ...comment, screenshot: (await up.json()).url };
        } catch {
        }
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
      this.collapsed = false;
      this.lastUrl = "";
      this.targetOffset = { x: 0.5, y: 0.5 };
      this.pending = null;
      this.dragStart = null;
      /** region comment whose outline is currently highlighted (tracks scroll). */
      this.activeRegionId = null;
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
        if (this.mode !== "region" || e.button !== 0) return;
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
        this.finishRegion(vp);
      };
      /** Reposition every pin, re-resolving anchors whose element has gone. */
      this.position = () => {
        for (const c of this.comments) {
          const pin = this.pins.get(c.id);
          if (!pin) continue;
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
      this.cfg = cfg;
      this.store = cfg.apiBase ? new HttpAdapter(cfg.apiBase, cfg.user, cfg.userHmac, cfg.headers, cfg.credentials) : new LocalStorageAdapter();
    }
    get url() {
      return location.pathname + location.search;
    }
    async start() {
      this.buildDom();
      this.lastUrl = this.url;
      this.comments = await this.store.list(this.cfg.projectKey, this.url);
      this.renderPins();
      this.renderPanel();
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
        this.renderPanel();
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
      this.panel = el("div", "panel");
      this.shadow.appendChild(this.panel);
      this.toolbar = this.buildToolbar();
      this.shadow.appendChild(this.toolbar);
    }
    buildToolbar() {
      const bar = el("div", "toolbar");
      const brand = el("span", "brand");
      brand.innerHTML = `<span class="ico">\u25CE</span><span class="label">Loupe</span>`;
      brand.title = "Collapse / expand the Loupe bar";
      brand.setAttribute("role", "button");
      brand.onclick = () => this.toggleCollapsed();
      const inspectBtn = this.toolBtn("\u271B", "Inspect & comment", "inspect");
      inspectBtn.onclick = () => this.setMode(this.mode === "inspect" ? "off" : "inspect");
      const regionBtn = this.toolBtn(REGION_ICON, "Region shot", "region");
      regionBtn.title = "Drag a free-size box, screenshot it, and comment";
      regionBtn.onclick = () => this.setMode(this.mode === "region" ? "off" : "region");
      const listBtn = this.toolBtn("\u2630", "Comments", "comments");
      this.countEl = el("span", "count", "0");
      listBtn.appendChild(this.countEl);
      listBtn.onclick = () => this.togglePanel();
      bar.append(brand, sep(), inspectBtn, regionBtn, listBtn);
      return bar;
    }
    /** A toolbar button with a uniform icon + label layout. `icon` may be an SVG string. */
    toolBtn(icon, label, role) {
      const b = el("button");
      b.dataset.role = role;
      b.title = label;
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
    /** Capture the selected viewport rect, then open the composer for a region comment. */
    async finishRegion(vp) {
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
      const capture = this.cfg.captureRegion ?? captureRegionScreenshot;
      const screenshot = await capture(vp);
      this.selbox.style.display = "none";
      const region = { x: vp.x + window.scrollX, y: vp.y + window.scrollY, w: vp.w, h: vp.h, rel };
      this.openComposer({ kind: "region", region, element: centerEl, screenshot }, vp.x + vp.w, vp.y);
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
      this.mode = mode;
      this.hl.style.display = "none";
      this.selbox.style.display = "none";
      this.cancelDrag();
      document.body.style.cursor = mode === "off" ? "" : "crosshair";
      this.toolbar.querySelector('[data-role="inspect"]')?.classList.toggle("on", mode === "inspect");
      this.toolbar.querySelector('[data-role="region"]')?.classList.toggle("on", mode === "region");
      document.removeEventListener("mousemove", this.onMove, true);
      document.removeEventListener("click", this.onClick, true);
      document.removeEventListener("mousedown", this.onRegionDown, true);
      if (mode === "off") return;
      document.addEventListener("keydown", this.onKey, true);
      this.closeComposer();
      if (mode === "inspect") {
        document.addEventListener("mousemove", this.onMove, true);
        document.addEventListener("click", this.onClick, true);
      } else if (mode === "region") {
        document.addEventListener("mousedown", this.onRegionDown, true);
      }
    }
    // ---- composer -------------------------------------------------------------
    openComposer(target, x, y) {
      this.pending = target;
      const c = this.composer;
      c.innerHTML = "";
      const label = el(
        "div",
        "target",
        target.kind === "element" ? describe(target.element) : `Region \xB7 ${Math.round(target.region.w)}\xD7${Math.round(target.region.h)} px`
      );
      const ta = el("textarea");
      ta.placeholder = target.kind === "region" ? "What's the issue in this area?" : "What should change here?";
      const row = el("div", "row");
      const chk = el("label", "chk");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = target.kind === "region" ? !!target.screenshot : true;
      if (target.kind === "region" && !target.screenshot) box.disabled = true;
      chk.append(box, document.createTextNode("Attach screenshot"));
      const btns = el("div", "btns");
      const cancel = el("button", "ghost", "Cancel");
      cancel.onclick = () => this.closeComposer();
      const save = el("button", "primary", "Comment");
      save.disabled = true;
      ta.oninput = () => {
        save.disabled = !ta.value.trim();
      };
      save.onclick = () => this.submit(target, ta.value.trim(), box.checked);
      btns.append(cancel, save);
      row.append(chk, btns);
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
      let region;
      let anchoredEl = null;
      if (target.kind === "element") {
        const capture = this.cfg.captureScreenshot ?? captureScreenshot;
        screenshot = withShot ? await capture(target.element) : void 0;
        anchor = captureAnchor(target.element);
        context = captureElementContext(target.element);
        offset = this.targetOffset;
        anchoredEl = target.element;
      } else {
        screenshot = withShot ? target.screenshot : void 0;
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
        // Record the screen the feedback was captured on (desktop / tablet / mobile).
        viewport: { w: window.innerWidth, h: window.innerHeight },
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      await this.store.save(comment);
      this.comments.push(comment);
      this.resolved.set(comment.id, anchoredEl);
      this.closeComposer();
      this.renderPins();
      this.renderPanel();
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
            this.openPanel();
            this.flash(c.id);
          };
          this.overlay.appendChild(pin);
          this.pins.set(c.id, pin);
        }
        pin.textContent = String(i + 1);
        pin.classList.toggle("done", c.status === "done");
      });
      this.countEl.textContent = String(this.comments.length);
      this.position();
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
      let debounce = 0;
      this.mo = new MutationObserver(() => {
        clearTimeout(debounce);
        debounce = window.setTimeout(() => {
          this.position();
          this.renderPanel();
        }, 120);
      });
      this.mo.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
      this.tick = window.setInterval(this.position, 800);
    }
    // ---- panel ----------------------------------------------------------------
    openPanel() {
      this.panel.classList.add("open");
      this.renderPanel();
    }
    togglePanel() {
      this.panel.classList.toggle("open");
      this.renderPanel();
    }
    /** Collapse the toolbar to just the logo (or expand it back). */
    toggleCollapsed() {
      this.collapsed = !this.collapsed;
      this.toolbar.classList.toggle("collapsed", this.collapsed);
      if (this.collapsed) {
        this.setMode("off");
        this.panel.classList.remove("open");
        this.closeComposer();
        this.overlay.style.display = "none";
      } else {
        this.overlay.style.display = "";
        this.renderPins();
      }
    }
    renderPanel() {
      const p = this.panel;
      p.innerHTML = "";
      const head = el("div", "phead");
      head.append(document.createTextNode(`Comments \xB7 ${this.comments.length}`));
      const x = el("button", "x", "\xD7");
      x.onclick = () => p.classList.remove("open");
      head.appendChild(x);
      p.appendChild(head);
      const list = el("div", "list");
      if (!this.comments.length) {
        list.appendChild(el("div", "empty", "No comments yet. Click \u201CInspect & comment\u201D, then click any element."));
      }
      this.comments.forEach((c, i) => list.appendChild(this.itemView(c, i)));
      p.appendChild(list);
    }
    itemView(c, i) {
      const detached = this.pins.get(c.id)?.classList.contains("detached") && c.status !== "done";
      const item = el("div", "item");
      const top = el("div", "top");
      const num = el("span", "num" + (c.status === "done" ? " done" : detached ? " detached" : ""), String(i + 1));
      const who = el("span", "who", c.author.name);
      top.append(num, who);
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
      if (c.screenshot) {
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
        this.renderPanel();
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
        this.renderPanel();
      };
      actions.append(doneBtn, claudeBtn, del);
      item.appendChild(actions);
      item.onclick = () => this.flash(c.id);
      return item;
    }
    async copyForClaude(c) {
      const prompt = [
        `# Product feedback from ${c.author.name}`,
        ``,
        `**Comment:** ${c.body}`,
        `**Page:** ${c.url}`,
        `**Element:** \`${c.anchor.cssPath}\``,
        c.anchor.testid ? `**Stable id:** \`${c.anchor.testid}\`` : ``,
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
      ].filter(Boolean).join("\n");
      try {
        await navigator.clipboard.writeText(prompt);
      } catch {
        console.log("[loupe] copy failed; prompt:\n" + prompt);
      }
    }
    flash(id) {
      const c = this.comments.find((x) => x.id === id);
      const pin = this.pins.get(id);
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
      this.setMode("off");
      this.mo?.disconnect();
      if (this.tick) clearInterval(this.tick);
      window.clearTimeout(this.regionTimer);
      document.removeEventListener("keydown", this.onKey, true);
      this.root?.remove();
    }
  };
  function el(tag, cls = "", text = "") {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }
  function sep() {
    return el("span", "sep");
  }
  function clamp(n) {
    return Math.max(0, Math.min(1, n));
  }
  var REGION_ICON = `<svg class="ico" width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true"><rect x="1.5" y="2.5" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2.4 1.8"/></svg>`;
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