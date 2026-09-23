import { sign } from "./crypto.ts";

export const WEBHOOK_TIMEOUT_MS = 10_000;
/** Waits before attempt 2 and attempt 3 (so 3 attempts in total). */
export const RETRY_BACKOFF_MS = [1_000, 4_000];

export interface DeliveryResult {
  status: "ok" | "failed";
  httpStatus: number | null;
  attempts: number;
  lastError: string | null;
}

/** Seams so tests can drive retries without real waits or a real network. */
export const transport = {
  fetch: (url: string, init: RequestInit) => fetch(url, init),
  sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
};

/**
 * POST `body` to the project's webhook, signed with its webhook secret:
 *   X-Loupe-Hub-Timestamp: <unix seconds>
 *   X-Loupe-Hub-Signature: hex(HMAC-SHA256(timestamp + "." + body, webhook_secret))
 * Any 2xx is success. Anything else (non-2xx, network error, 10s timeout) is
 * retried after 1s and then 4s. Each attempt is signed with a fresh timestamp.
 */
export async function deliver(url: string, body: string, secret: string, deliveryId: string): Promise<DeliveryResult> {
  let httpStatus: number | null = null;
  let lastError: string | null = null;
  const maxAttempts = RETRY_BACKOFF_MS.length + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) await transport.sleep(RETRY_BACKOFF_MS[attempt - 2]!);
    const ts = Math.floor(Date.now() / 1000).toString();
    try {
      const res = await transport.fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "LoupeHub/1",
          "X-Loupe-Hub-Delivery": deliveryId,
          "X-Loupe-Hub-Timestamp": ts,
          "X-Loupe-Hub-Signature": sign(ts, body, secret),
        },
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      });
      httpStatus = res.status;
      // Drain the body so the connection can be reused/closed.
      await res.arrayBuffer().catch(() => undefined);
      if (res.status >= 200 && res.status < 300) {
        return { status: "ok", httpStatus, attempts: attempt, lastError: null };
      }
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      httpStatus = null;
      const e = err as Error;
      lastError = e.name === "TimeoutError" ? `timeout after ${WEBHOOK_TIMEOUT_MS}ms` : String(e.message || e);
    }
  }
  return { status: "failed", httpStatus, attempts: maxAttempts, lastError };
}
