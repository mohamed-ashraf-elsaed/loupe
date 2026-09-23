import { afterEach, describe, expect, it, vi } from "vitest";
import { OAuth2Client } from "google-auth-library";
import { googleVerifier } from "../google.ts";

function mockPayload(payload: Record<string, unknown> | undefined) {
  return vi.spyOn(OAuth2Client.prototype, "verifyIdToken").mockResolvedValue({ getPayload: () => payload } as any);
}
afterEach(() => vi.restoreAllMocks());

describe("googleVerifier", () => {
  it("checks the audience and returns the verified email", async () => {
    const spy = mockPayload({ email: "a@gmail.com", email_verified: true, name: "A" });
    await expect(googleVerifier("tok", "client-1")).resolves.toEqual({ email: "a@gmail.com", name: "A" });
    expect(spy).toHaveBeenCalledWith({ idToken: "tok", audience: "client-1" });
  });

  it("rejects unverified or missing emails", async () => {
    mockPayload({ email: "a@gmail.com", email_verified: false });
    await expect(googleVerifier("tok", "c")).rejects.toThrow("email not verified");
    vi.restoreAllMocks();
    mockPayload({ email_verified: true });
    await expect(googleVerifier("tok", "c")).rejects.toThrow("token has no email");
    vi.restoreAllMocks();
    mockPayload(undefined);
    await expect(googleVerifier("tok", "c")).rejects.toThrow("token has no email");
  });

  it("rejects a token Google's library refuses (bad signature / wrong aud)", async () => {
    await expect(googleVerifier("not-a-jwt", "c")).rejects.toThrow();
  });
});
