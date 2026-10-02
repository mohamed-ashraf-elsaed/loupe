import { describe, expect, it } from "vitest";
import { decide, emptyConsent, isNavigableUrl, isPending, requestNavigation, withdraw } from "../src/consent.ts";

const req = (url: string, extra: Record<string, unknown> = {}) => ({ url, ...extra });

describe("navigation consent", () => {
  it("starts with nothing pending", () => {
    const s = emptyConsent();
    expect(isPending(s)).toBe(false);
    // Deciding with nothing asked is a no-op, never a navigation.
    expect(decide(s, true)).toEqual({ record: s, navigateTo: null });
  });

  it("refuses to queue anything that is not http(s)", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "not a url", ""]) {
      expect(isNavigableUrl(bad)).toBe(false);
      expect(isPending(requestNavigation(emptyConsent(), req(bad)))).toBe(false);
    }
    expect(isNavigableUrl("https://preview.example.com/pr/412")).toBe(true);
    expect(isNavigableUrl("http://localhost:3000/x")).toBe(true);
  });

  it("queues a request with who asked and why", () => {
    const s = requestNavigation(emptyConsent(), req("https://preview.example.com/pr/412", {
      reason: "The fix is live on the preview URL.",
      requester: "Claude Code",
    }));
    expect(isPending(s)).toBe(true);
    expect(s.request!.requester).toBe("Claude Code");
    expect(s.request!.reason).toContain("preview URL");
    expect(s.state).toBe("requested");
  });

  it("returns a URL ONLY on an explicit grant", () => {
    const pending = requestNavigation(emptyConsent(), req("https://preview.example.com/pr/412"));

    const denied = decide(pending, false);
    expect(denied.navigateTo).toBeNull();
    expect(denied.record.state).toBe("denied");
    expect(denied.record.request).toBeNull();

    const granted = decide(pending, true);
    expect(granted.navigateTo).toBe("https://preview.example.com/pr/412");
    expect(granted.record.state).toBe("granted");
  });

  it("keeps an audit trail of every decision", () => {
    let s = requestNavigation(emptyConsent(), req("https://a.test/x"));
    let out = decide(s, true, "2026-01-01T00:00:00.000Z");
    s = requestNavigation(out.record, req("https://b.test/y"));
    out = decide(s, false, "2026-01-01T00:05:00.000Z");
    expect(out.record.history).toEqual([
      { url: "https://a.test/x", decision: "granted", at: "2026-01-01T00:00:00.000Z" },
      { url: "https://b.test/y", decision: "denied", at: "2026-01-01T00:05:00.000Z" },
    ]);
  });

  it("a second request replaces the first rather than stacking prompts", () => {
    let s = requestNavigation(emptyConsent(), req("https://a.test/x"));
    s = requestNavigation(s, req("https://b.test/y"));
    expect(s.request!.url).toBe("https://b.test/y");
    expect(decide(s, true).navigateTo).toBe("https://b.test/y");
  });

  it("a decision cannot be replayed — the request is consumed", () => {
    const pending = requestNavigation(emptyConsent(), req("https://a.test/x"));
    const { record } = decide(pending, true);
    // Asking again with the already-decided record yields nothing.
    expect(decide(record, true).navigateTo).toBeNull();
  });

  it("withdraws a pending request without recording a decision", () => {
    const pending = requestNavigation(emptyConsent(), req("https://a.test/x"));
    const s = withdraw(pending);
    expect(isPending(s)).toBe(false);
    expect(s.history).toEqual([]);
    expect(decide(s, true).navigateTo).toBeNull();
    // Withdrawing nothing is a no-op.
    expect(withdraw(s)).toEqual(s);
  });
});
