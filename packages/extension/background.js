// Service worker: the extension's edge over the embedded SDK — pixel-perfect
// screenshots via chrome.tabs.captureVisibleTab (real pixels, no DOM re-render).
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "LOUPE_CAPTURE" && sender.tab) {
    chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "png" }, (dataUrl) => {
      sendResponse(chrome.runtime.lastError ? null : dataUrl);
    });
    return true; // keep the message channel open for the async response
  }
});
