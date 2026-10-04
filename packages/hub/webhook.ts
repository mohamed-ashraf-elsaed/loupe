import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
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

/** What deliver() reads from a response. A global fetch() Response satisfies it. */
export interface PostResponse {
  status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** Seams so tests can drive retries without real waits or a real network. */
export const transport = {
  fetch: (url: string, init: RequestInit): Promise<PostResponse> => guardedPost(url, init),
  sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
  /** The address check guardedPost applies; tests narrow it to reach a local receiver. */
  blocked: (ip: string): boolean => blockedIp(ip),
  /** The DNS lookup the guard checks; tests pin it so a name resolves the same on every machine. */
  resolve: dnsLookup as (
    hostname: string,
    options: { all: true },
    callback: (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void,
  ) => void,
};

// ---- outbound address guard ----
//
// Every URL Hub posts to is supplied by somebody outside Hub: a dashboard user
// types a webhook or inbound URL, and a source app sends a reply_url with each
// ticket. Without a guard, any of them can point Hub at its own loopback port,
// the VM's metadata server (169.254.169.254) or the private network. So every
// delivery resolves the host and refuses a private, loopback, link-local or
// reserved address. The check runs inside the socket's own DNS lookup, so the
// address that was checked is the address that is dialled: a host that answers
// public first and private second (DNS rebinding) is still refused.
//
// HUB_ALLOW_PRIVATE_URLS=1 turns the guard off, for local development against
// receivers on 127.0.0.1. Production never sets it.

const privateAllowed = () => process.env.HUB_ALLOW_PRIVATE_URLS === "1";

function v4Blocked(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number) as [number, number];
  return (
    a === 0 || // "this" network
    a === 10 || // private
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 0) || // IETF protocol assignments (192.0.0/24) and TEST-NET-1 (192.0.2/24)
    (a === 192 && b === 168) || // private
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast, reserved, broadcast
  );
}

/** True when `ip` is not a public unicast address. Anything unparseable is blocked. */
export function blockedIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return v4Blocked(ip);
  if (family !== 6) return true;
  const v6 = ip.toLowerCase();
  // An IPv4 address carried inside IPv6 (mapped ::ffff:a.b.c.d, or NAT64 64:ff9b::a.b.c.d).
  const tail = v6.match(/^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) return v4Blocked(tail[1]!);
  const hex = v6.match(/^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const n = (parseInt(hex[1]!, 16) << 16) | parseInt(hex[2]!, 16);
    return v4Blocked([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join("."));
  }
  return (
    v6 === "::" ||
    v6 === "::1" ||
    /^f[cd]/.test(v6) || // unique local fc00::/7
    /^fe[89ab]/.test(v6) || // link-local fe80::/10
    /^ff/.test(v6) // multicast
  );
}

class BlockedAddressError extends Error {
  constructor(host: string, ip: string) {
    super(`refused: ${host} resolves to a private address (${ip})`);
  }
}

/** dns.lookup for http(s).request: fails the connection when any answer is not public. */
function guardedLookup(
  hostname: string,
  options: object,
  callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
): void {
  transport.resolve(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, []);
    const bad = addresses.find((a) => transport.blocked(a.address));
    if (bad) return callback(new BlockedAddressError(hostname, bad.address), []);
    if ((options as { all?: boolean }).all) return callback(null, addresses);
    callback(null, addresses[0]!.address, addresses[0]!.family);
  });
}

/**
 * POST with node:http(s), refusing private destinations (see above). Redirects
 * are never followed, the same as fetch() with redirect: "manual".
 */
export function guardedPost(url: string, init: RequestInit): Promise<PostResponse> {
  if (privateAllowed()) return fetch(url, init);
  return new Promise((resolve, reject) => {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return reject(new Error(`invalid URL: ${url}`));
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") return reject(new Error(`refused: ${u.protocol} URL`));
    // An IP literal never reaches the lookup, so check it here.
    const host = u.hostname.replace(/^\[|\]$/g, "");
    if (isIP(host) && transport.blocked(host)) return reject(new BlockedAddressError(host, host));

    const send = u.protocol === "https:" ? httpsRequest : httpRequest;
    const req = send(
      u,
      {
        method: init.method ?? "POST",
        headers: init.headers as Record<string, string>,
        lookup: guardedLookup as never,
        signal: init.signal ?? undefined,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          resolve({
            status: res.statusCode ?? 0,
            arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
          });
        });
        res.on("error", reject);
      },
    );
    req.on("error", (e) => reject(init.signal?.aborted ? init.signal.reason : e));
    req.end(typeof init.body === "string" ? init.body : undefined);
  });
}

/**
 * POST `body` to a webhook or a destination project's inbound URL, signed with `secret`:
 *   X-Loupe-Hub-Timestamp: <unix seconds>
 *   X-Loupe-Hub-Signature: hex(HMAC-SHA256(timestamp + "." + body, webhook_secret))
 * Any 2xx is success. Anything else (non-2xx, network error, 10s timeout) is
 * retried after 1s and then 4s. Each attempt is signed with a fresh timestamp.
 */
export async function deliver(
  url: string,
  body: string,
  secret: string,
  deliveryId: string,
  extraHeaders: Record<string, string> = {},
): Promise<DeliveryResult> {
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
          ...extraHeaders,
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
