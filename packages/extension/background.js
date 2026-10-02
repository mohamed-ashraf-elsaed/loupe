// Service worker: the extension's edge over the embedded SDK.
//
//  - pixel-perfect screenshots via chrome.tabs.captureVisibleTab (real pixels, no
//    DOM re-render);
//  - native context menus, so a comment can start from whatever was right-clicked
//    rather than only from inside the widget;
//  - per-site show/hide, persisted, so a page you never want Loupe on stays clean.

/** The context menus, in one place so the ids cannot drift from the handlers. */
const MENUS = [
  { id: "loupe-comment", title: "Comment on this page", contexts: ["page", "frame"] },
  { id: "loupe-selection", title: "Comment on “%s”", contexts: ["selection"] },
  { id: "loupe-image", title: "Comment on this image", contexts: ["image"] },
  { id: "loupe-video", title: "Comment on this video", contexts: ["video"] },
  { id: "loupe-audio", title: "Comment on this audio", contexts: ["audio"] },
  { id: "loupe-link", title: "Comment on this link", contexts: ["link"] },
  { id: "loupe-editable", title: "Comment on this field", contexts: ["editable"] },
  { id: "loupe-toggle", title: "Show / hide Loupe on this page", contexts: ["page", "frame"] },
];

/**
 * Which tool a menu lands in. Anything with a real element (an image, a link, a
 * field) is an element comment; a bare page or a text selection is better served by
 * the free note, which needs no element underneath.
 */
const TOOL_FOR = {
  "loupe-comment": "inspect",
  "loupe-selection": "note",
  "loupe-image": "inspect",
  "loupe-video": "inspect",
  "loupe-audio": "inspect",
  "loupe-link": "inspect",
  "loupe-editable": "inspect",
};

chrome.runtime.onInstalled.addListener(() => {
  // removeAll first: creating an id that already exists throws, and this listener
  // also runs on update.
  chrome.contextMenus.removeAll(() => {
    for (const menu of MENUS) chrome.contextMenus.create(menu);
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "LOUPE_CAPTURE" && sender.tab) {
    chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "png" }, (dataUrl) => {
      sendResponse(chrome.runtime.lastError ? null : dataUrl);
    });
    return true; // keep the message channel open for the async response
  }
  // The content script asking whether this site is meant to be hidden.
  if (msg && msg.type === "LOUPE_SITE_STATE") {
    originOf(sender.tab?.url || "").then((origin) =>
      chrome.storage.local.get("hiddenSites").then(({ hiddenSites = {} }) =>
        sendResponse({ hidden: !!hiddenSites[origin] }),
      ),
    );
    return true;
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || tab.id == null) return;
  const target = info.frameId != null ? { tabId: tab.id, frameIds: [info.frameId] } : { tabId: tab.id };

  if (info.menuItemId === "loupe-toggle") {
    const origin = await originOf(tab.url || info.pageUrl || "");
    if (!origin) return;
    const { hiddenSites = {} } = await chrome.storage.local.get("hiddenSites");
    const hidden = !hiddenSites[origin];
    await chrome.storage.local.set({ hiddenSites: { ...hiddenSites, [origin]: hidden } });
    if (hidden) {
      // Tell whichever copy is live to tear itself down.
      chrome.tabs.sendMessage(tab.id, { type: "LOUPE_TEARDOWN" }, () => void chrome.runtime.lastError);
    } else {
      await inject(tab.id, info.frameId);
    }
    return;
  }

  const tool = TOOL_FOR[info.menuItemId] || "inspect";
  try {
    // Already there? Just aim it. Otherwise inject, and the content script is handed
    // the tool it should open with.
    await chrome.tabs.sendMessage(tab.id, { type: "LOUPE_TOOL", tool }, target.frameIds ? { frameId: info.frameId } : undefined);
  } catch {
    await chrome.storage.session.set({ loupeIntent: { tool, at: Date.now() } });
    await inject(tab.id, info.frameId);
  }
});

async function inject(tabId, frameId) {
  await chrome.scripting.executeScript({
    target: frameId != null ? { tabId, frameIds: [frameId] } : { tabId },
    files: ["content.js"],
  });
}

/** The origin of a URL, or null for anything that has none (about:, chrome://). */
async function originOf(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.origin : null;
  } catch {
    return null;
  }
}
