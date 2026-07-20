import { domToPng } from "modern-screenshot";
import type { ElementContext, RegionRect } from "./types.js";

const STYLE_KEYS = [
  "display", "position", "width", "height", "margin", "padding",
  "color", "background-color", "font-size", "font-weight", "font-family",
  "border", "border-radius", "box-shadow", "flex", "grid-template-columns",
  "text-align", "line-height", "opacity",
];

/** outerHTML + a curated slice of computed styles — the context handed to Claude. */
export function captureElementContext(el: Element): ElementContext {
  const html = el.outerHTML.length > 6000 ? el.outerHTML.slice(0, 6000) + "…" : el.outerHTML;
  const cs = getComputedStyle(el);
  const styles: Record<string, string> = {};
  for (const k of STYLE_KEYS) {
    const v = cs.getPropertyValue(k);
    if (v) styles[k] = v.trim();
  }
  return { html, styles };
}

/** Max time (ms) any single capture may spend fetching/embedding assets. */
const CAPTURE_TIMEOUT = 6000;

/** Resolve `undefined` if `p` doesn't settle within `ms` — so a capture can never hang the UI. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([p, new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms))]);
}

/**
 * Give web fonts a brief chance to finish loading so they embed instead of
 * falling back — but NEVER block on it. On some SPAs `document.fonts.ready`
 * settles slowly (or keeps loading), which would otherwise hang the capture,
 * so we race it against a short cap.
 */
async function fontsReady(): Promise<void> {
  try {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (!fonts?.ready) return;
    await Promise.race([
      fonts.ready,
      new Promise<void>((resolve) => setTimeout(resolve, 800)),
    ]);
  } catch {
    /* FontFaceSet unsupported — carry on */
  }
}

/** Skip Loupe's own UI and redacted elements in any capture. */
function captureFilter(node: Node): boolean {
  if (!(node instanceof Element)) return true;
  if (node.id === "loupe-root") return false;
  if (node.hasAttribute("data-loupe-redact")) return false;
  return true;
}

/**
 * Screenshot the target element. Elements marked [data-loupe-redact] are
 * excluded before anything leaves the browser, and our own UI is never captured.
 */
export async function captureScreenshot(el: Element): Promise<string | undefined> {
  try {
    await fontsReady();
    return await withTimeout(
      domToPng(el as HTMLElement, {
        scale: Math.min(window.devicePixelRatio || 1, 2),
        backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
        timeout: CAPTURE_TIMEOUT,
        filter: captureFilter,
      }),
      CAPTURE_TIMEOUT + 2000,
    );
  } catch (err) {
    console.warn("[loupe] screenshot capture failed", err);
    return undefined;
  }
}

/**
 * Screenshot a free-form rectangle (the "region shot"). `rect` is in **viewport**
 * coordinates (what's on screen now). The default renders the whole page and crops;
 * the extension overrides this with a real captureVisibleTab crop. Redacted regions
 * are painted over before the pixels leave the browser.
 */
export async function captureRegionScreenshot(rect: RegionRect): Promise<string | undefined> {
  try {
    await fontsReady();
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    // Render the SMALLEST element that fully covers the selection, not the whole
    // page. Rendering document.body is heavy and its cross-origin font embedding
    // often times out (→ fallback fonts, reflow); a scoped subtree behaves like
    // the reliable element capture.
    const container = regionContainer(rect);
    const origin = container.getBoundingClientRect();
    const full = await withTimeout(
      domToPng(container, {
        scale,
        backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
        timeout: CAPTURE_TIMEOUT,
        filter: captureFilter,
      }),
      CAPTURE_TIMEOUT + 2000,
    );
    if (!full) return undefined;
    const redact = Array.from(document.querySelectorAll("[data-loupe-redact]")).map((n) =>
      (n as Element).getBoundingClientRect(),
    );
    return await cropRegion(full, rect, origin.left, origin.top, scale, redact);
  } catch (err) {
    console.warn("[loupe] region capture failed", err);
    return undefined;
  }
}

/** The smallest on-page element whose box fully covers the selection rectangle. */
function regionContainer(rect: RegionRect): HTMLElement {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  let node = document.elementFromPoint(cx, cy) as HTMLElement | null;
  if (node && node.closest("#loupe-root")) node = null; // never our own UI
  const covers = (r: DOMRect) =>
    r.left <= rect.x && r.top <= rect.y && r.right >= rect.x + rect.w && r.bottom >= rect.y + rect.h;
  while (node && node !== document.body && node !== document.documentElement) {
    if (covers(node.getBoundingClientRect())) return node;
    node = node.parentElement;
  }
  return document.body;
}

/** Options for a screen recording. */
export interface RecordOptions {
  /** Auto-stop after this many ms (a safety cap so recordings never run forever). */
  maxMs?: number;
  /** Called once with a `stop()` fn so the caller can wire a Stop button to it. */
  register?: (stop: () => void) => void;
}

/** Best available webm MIME the browser can record, or "" to let MediaRecorder pick. */
function pickRecordingMime(): string {
  const MR: any = (window as any).MediaRecorder;
  if (!MR?.isTypeSupported) return "";
  for (const t of ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]) {
    if (MR.isTypeSupported(t)) return t;
  }
  return "";
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * Record a screen video cropped to `rect` (viewport coords), mirroring the region
 * screenshot flow. Uses getDisplayMedia (real pixels) — the browser shows a share
 * prompt; picking the current tab keeps the crop aligned. Each frame is drawn to a
 * canvas cropped to the selection, then re-encoded to webm. Returns a data URL, or
 * undefined if the user cancels the prompt or recording isn't supported. The default
 * is overridable via LoupeConfig.captureRecording (e.g. the extension).
 */
export async function captureRegionRecording(rect: RegionRect, opts?: RecordOptions): Promise<string | undefined> {
  const md = navigator.mediaDevices as MediaDevices & {
    getDisplayMedia?: (c?: any) => Promise<MediaStream>;
  };
  if (!md?.getDisplayMedia || !(window as any).MediaRecorder) return undefined;

  let stream: MediaStream;
  try {
    stream = await md.getDisplayMedia({ video: { frameRate: 30 }, audio: false, preferCurrentTab: true } as any);
  } catch {
    return undefined; // user dismissed the picker
  }

  try {
    return await recordCropped(stream, rect, opts);
  } catch (err) {
    console.warn("[loupe] screen recording failed", err);
    return undefined;
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}

async function recordCropped(stream: MediaStream, rect: RegionRect, opts?: RecordOptions): Promise<string | undefined> {
  const maxMs = opts?.maxMs ?? 20000;
  const video = document.createElement("video");
  video.srcObject = stream;
  video.muted = true;
  (video as any).playsInline = true;
  await video.play().catch(() => undefined);

  const track = stream.getVideoTracks()[0];
  const s = track?.getSettings?.() ?? {};
  const vw = (s.width as number) || video.videoWidth || window.innerWidth;
  const vh = (s.height as number) || video.videoHeight || window.innerHeight;
  // The shared surface (ideally the current tab) maps to the page viewport by scale.
  const sx = vw / window.innerWidth;
  const sy = vh / window.innerHeight;
  const cw = Math.max(2, Math.round(rect.w * sx));
  const ch = Math.max(2, Math.round(rect.h * sy));

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d")!;
  let raf = 0;
  const draw = () => {
    try { ctx.drawImage(video, rect.x * sx, rect.y * sy, cw, ch, 0, 0, cw, ch); } catch { /* not ready yet */ }
    raf = requestAnimationFrame(draw);
  };
  draw();

  const out = (canvas as HTMLCanvasElement & { captureStream(fps?: number): MediaStream }).captureStream(30);
  const mime = pickRecordingMime();
  const rec = new MediaRecorder(out, mime ? { mimeType: mime } : undefined);
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };

  const stop = () => { if (rec.state !== "inactive") rec.stop(); };
  opts?.register?.(stop);
  // Auto-stop on the cap, or when the user ends the share via the browser UI.
  const timer = window.setTimeout(stop, maxMs);
  track?.addEventListener("ended", stop);

  const done = new Promise<void>((resolve) => { rec.onstop = () => resolve(); });
  rec.start();
  await done;

  window.clearTimeout(timer);
  cancelAnimationFrame(raf);
  if (!chunks.length) return undefined;
  return blobToDataUrl(new Blob(chunks, { type: mime || "video/webm" }));
}

/** Crop `rect` (viewport coords) out of a full-page data URL whose origin sits at (ox, oy). */
function cropRegion(
  dataUrl: string,
  rect: RegionRect,
  ox: number,
  oy: number,
  scale: number,
  redact: DOMRect[],
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const sw = Math.max(1, Math.round(rect.w * scale));
      const sh = Math.max(1, Math.round(rect.h * scale));
      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext("2d")!;
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
