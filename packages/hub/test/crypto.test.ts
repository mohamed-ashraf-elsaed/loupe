import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { decodeSession, encodeSession, newId, newSecret, safeEqual, sign, verifySignature } from "../crypto.ts";

const NOW = 1_800_000_000;

describe("ids and secrets", () => {
  it("carry their prefix and are unique", () => {
    expect(newId("prj")).toMatch(/^prj_[0-9a-f]{24}$/);
    expect(newSecret("psk")).toMatch(/^psk_[\w-]{32}$/);
    expect(newSecret("whs")).not.toBe(newSecret("whs"));
  });
});

describe("sign / verifySignature", () => {
  it("is hex HMAC-SHA256 of timestamp.body", () => {
    const expected = createHmac("sha256", "s").update(`${NOW}.{"a":1}`).digest("hex");
    expect(sign(NOW, '{"a":1}', "s")).toBe(expected);
  });

  it("accepts a valid fresh signature (any hex case)", () => {
    const sig = sign(NOW, "body", "s");
    expect(verifySignature(String(NOW), "body", sig, "s", NOW)).toEqual({ ok: true });
    expect(verifySignature(String(NOW), "body", sig.toUpperCase(), "s", NOW)).toEqual({ ok: true });
    // Up to 5 minutes of skew either way.
    expect(verifySignature(String(NOW), "body", sig, "s", NOW + 300).ok).toBe(true);
    expect(verifySignature(String(NOW), "body", sig, "s", NOW - 300).ok).toBe(true);
  });

  it("rejects a wrong secret, a tampered body and a short signature", () => {
    const sig = sign(NOW, "body", "s");
    expect(verifySignature(String(NOW), "body", sig, "other", NOW)).toEqual({ ok: false, reason: "invalid signature" });
    expect(verifySignature(String(NOW), "body!", sig, "s", NOW)).toEqual({ ok: false, reason: "invalid signature" });
    expect(verifySignature(String(NOW), "body", sig.slice(0, 10), "s", NOW)).toEqual({ ok: false, reason: "invalid signature" });
  });

  it("rejects an expired or future timestamp", () => {
    const sig = sign(NOW, "body", "s");
    expect(verifySignature(String(NOW), "body", sig, "s", NOW + 301)).toEqual({ ok: false, reason: "timestamp out of range" });
    expect(verifySignature(String(NOW), "body", sig, "s", NOW - 301)).toEqual({ ok: false, reason: "timestamp out of range" });
  });

  it("rejects a non-numeric timestamp", () => {
    expect(verifySignature("12.5", "b", "x", "s", NOW)).toEqual({ ok: false, reason: "invalid timestamp" });
    expect(verifySignature("", "b", "x", "s", NOW)).toEqual({ ok: false, reason: "invalid timestamp" });
  });

  it("safeEqual compares length and content", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "ab")).toBe(false);
  });
});

describe("session cookie", () => {
  it("round-trips and rejects tampering, a wrong secret and expiry", () => {
    const token = encodeSession({ email: "a@x.com", name: "A", exp: NOW + 60 }, "k");
    expect(decodeSession(token, "k", NOW)).toEqual({ email: "a@x.com", name: "A", exp: NOW + 60 });
    expect(decodeSession(token, "other", NOW)).toBeNull();
    expect(decodeSession(token, "k", NOW + 61)).toBeNull();
    const [p, mac] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ email: "evil@x.com", exp: NOW + 60 })).toString("base64url");
    expect(decodeSession(`${forged}.${mac}`, "k", NOW)).toBeNull();
    expect(decodeSession(p!, "k", NOW)).toBeNull();
    expect(decodeSession("", "k", NOW)).toBeNull();
  });

  it("rejects a correctly signed but malformed payload", () => {
    const payload = Buffer.from("not json").toString("base64url");
    const mac = createHmac("sha256", "k").update(payload).digest("base64url");
    expect(decodeSession(`${payload}.${mac}`, "k", NOW)).toBeNull();
    const noEmail = Buffer.from(JSON.stringify({ exp: NOW + 60 })).toString("base64url");
    const mac2 = createHmac("sha256", "k").update(noEmail).digest("base64url");
    expect(decodeSession(`${noEmail}.${mac2}`, "k", NOW)).toBeNull();
  });
});
