import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import { verifySignature } from "../crypto.ts";
import { deliver, transport } from "../webhook.ts";

// A real local receiver whose replies each test scripts.
let server: Server;
let url: string;
let replies: number[] = [];
let received: { headers: IncomingHttpHeaders; body: string }[] = [];
const sleeps: number[] = [];
const realSleep = transport.sleep;
const realFetch = transport.fetch;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      received.push({ headers: req.headers, body });
      res.writeHead(replies.shift() ?? 200).end("x");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  url = `http://127.0.0.1:${(server.address() as any).port}/hook`;
  transport.sleep = async (ms) => void sleeps.push(ms);
});
afterAll(() => {
  transport.sleep = realSleep;
  return new Promise<void>((r) => server.close(() => r()));
});
afterEach(() => {
  replies = [];
  received = [];
  sleeps.length = 0;
  transport.fetch = realFetch;
});

describe("deliver", () => {
  it("signs the body with the webhook secret and succeeds on 2xx", async () => {
    const r = await deliver(url, '{"hello":1}', "whs_test", "dlv_1");
    expect(r).toEqual({ status: "ok", httpStatus: 200, attempts: 1, lastError: null });
    expect(received).toHaveLength(1);
    const { headers, body } = received[0]!;
    expect(body).toBe('{"hello":1}');
    expect(headers["content-type"]).toBe("application/json");
    expect(headers["x-loupe-hub-delivery"]).toBe("dlv_1");
    const check = verifySignature(String(headers["x-loupe-hub-timestamp"]), body, String(headers["x-loupe-hub-signature"]), "whs_test");
    expect(check).toEqual({ ok: true });
    expect(sleeps).toEqual([]);
  });

  it("retries non-2xx with 1s then 4s backoff and succeeds on the 3rd attempt", async () => {
    replies = [500, 503, 204];
    const r = await deliver(url, "{}", "s", "dlv_2");
    expect(r).toEqual({ status: "ok", httpStatus: 204, attempts: 3, lastError: null });
    expect(received).toHaveLength(3);
    expect(sleeps).toEqual([1000, 4000]);
  });

  it("gives up after 3 attempts and reports the last status", async () => {
    replies = [500, 500, 404];
    const r = await deliver(url, "{}", "s", "dlv_3");
    expect(r).toEqual({ status: "failed", httpStatus: 404, attempts: 3, lastError: "HTTP 404" });
    expect(received).toHaveLength(3);
  });

  it("treats redirects as failures (never follows them)", async () => {
    replies = [302, 302, 302];
    const r = await deliver(url, "{}", "s", "dlv_4");
    expect(r.status).toBe("failed");
    expect(r.lastError).toBe("HTTP 302");
  });

  it("reports network errors", async () => {
    const r = await deliver("http://127.0.0.1:1/nope", "{}", "s", "dlv_5");
    expect(r.status).toBe("failed");
    expect(r.httpStatus).toBeNull();
    expect(r.attempts).toBe(3);
    expect(r.lastError).toBeTruthy();
  });

  it("reports the 10s timeout and passes an abort signal", async () => {
    const seen: RequestInit[] = [];
    transport.fetch = async (_u, init) => {
      seen.push(init);
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    };
    const r = await deliver(url, "{}", "s", "dlv_6");
    expect(r).toEqual({ status: "failed", httpStatus: null, attempts: 3, lastError: "timeout after 10000ms" });
    expect(seen).toHaveLength(3);
    expect(seen[0]!.signal).toBeInstanceOf(AbortSignal);
  });

  it("recovers after a network error", async () => {
    let n = 0;
    transport.fetch = async (u, init) => {
      if (n++ === 0) throw new Error("ECONNRESET");
      return realFetch(u, init);
    };
    const r = await deliver(url, "{}", "s", "dlv_7");
    expect(r).toEqual({ status: "ok", httpStatus: 200, attempts: 2, lastError: null });
  });
});
