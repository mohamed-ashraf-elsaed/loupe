const $ = (id) => document.getElementById(id);
const fields = ["projectKey", "userId", "userName", "apiBase", "userHmac"];

// hydrate from storage
chrome.storage.local.get(["projectKey", "user", "apiBase", "userHmac"]).then((c) => {
  $("projectKey").value = c.projectKey || "";
  $("userId").value = c.user?.id || "";
  $("userName").value = c.user?.name || "";
  $("apiBase").value = c.apiBase || "";
  $("userHmac").value = c.userHmac || "";
});

function collect() {
  return {
    projectKey: $("projectKey").value.trim(),
    user: { id: $("userId").value.trim(), name: $("userName").value.trim() || "Reviewer" },
    apiBase: $("apiBase").value.trim(),
    userHmac: $("userHmac").value.trim(),
  };
}

async function save() {
  await chrome.storage.local.set(collect());
  $("msg").textContent = "Saved ✓";
  setTimeout(() => ($("msg").textContent = ""), 1500);
}

$("save").addEventListener("click", save);

$("start").addEventListener("click", async () => {
  await save();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
  window.close();
});
