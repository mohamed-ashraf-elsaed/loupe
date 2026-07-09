// Injected into the active tab. Reuses the exact same SDK core as the embedded
// widget — the only difference is the screenshot source: the extension captures
// real pixels via the background worker and crops to the element (with redaction).
import { init } from "@loupekit/sdk";

declare const chrome: any;

async function main() {
  if ((window as any).__loupeInjected) return;
  (window as any).__loupeInjected = true;

  const cfg = await chrome.storage.local.get(["projectKey", "user", "apiBase", "userHmac"]);
  if (!cfg.projectKey || !cfg.user?.id) {
    (window as any).__loupeInjected = false;
    console.warn("[loupe] Set a project key and user in the extension popup first.");
    return;
  }

  init({
    projectKey: cfg.projectKey,
    user: cfg.user,
    apiBase: cfg.apiBase || undefined,
    userHmac: cfg.userHmac || undefined,
    autoOpen: true,
    captureScreenshot: captureViaExtension,
  });
}

/** Ask the background worker for a real screenshot, then crop to the element. */
async function captureViaExtension(el: Element): Promise<string | undefined> {
  const fullDataUrl: string | null = await chrome.runtime.sendMessage({ type: "LOUPE_CAPTURE" });
  if (!fullDataUrl) return undefined;
  const rect = el.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const redactRects = Array.from(document.querySelectorAll("[data-loupe-redact]")).map((n) =>
    (n as Element).getBoundingClientRect(),
  );
  return crop(fullDataUrl, rect, dpr, redactRects);
}

function crop(dataUrl: string, rect: DOMRect, dpr: number, redact: DOMRect[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const sx = rect.left * dpr, sy = rect.top * dpr;
      const sw = Math.max(1, rect.width * dpr), sh = Math.max(1, rect.height * dpr);
      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      // Paint over any redacted regions before the pixels are ever uploaded.
      ctx.fillStyle = "#0f0f14";
      for (const r of redact) {
        ctx.fillRect((r.left - rect.left) * dpr, (r.top - rect.top) * dpr, r.width * dpr, r.height * dpr);
      }
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

main();
