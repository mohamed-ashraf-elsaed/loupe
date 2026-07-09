process.env.LOUPE_PG_DIR = "memory://";
import { beforeEach, describe, expect, it } from "vitest";
import { db, migrate } from "../db.ts";
import { upsertProject } from "../store.ts";
import { authenticate, signUser, verifyUser } from "../auth.ts";

const req = (headers: Record<string, string>) => ({ headers } as any);

beforeEach(async () => {
  await migrate();
  const d = await db();
  await d.query("TRUNCATE comments, projects CASCADE");
  await upsertProject({ project_key: "pk", name: "n", secret: "sec", allowed_origins: [] });
});

describe("auth", () => {
  it("signs and verifies HMAC", () => {
    const h = signUser("u1", "sec");
    expect(verifyUser("u1", h, "sec")).toBe(true);
    expect(verifyUser("u1", "bad", "sec")).toBe(false);
    expect(verifyUser("u2", h, "sec")).toBe(false);
  });

  it("400 when no project key", async () => {
    const a = await authenticate(null, req({}));
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.status).toBe(400);
  });

  it("404 for an unknown project", async () => {
    const a = await authenticate("nope", req({}));
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.status).toBe(404);
  });

  it("authorizes admin with the secret", async () => {
    const a = await authenticate("pk", req({ "x-loupe-admin": "sec" }));
    expect(a.ok && a.mode === "admin").toBe(true);
  });

  it("authorizes a user with a valid HMAC", async () => {
    const a = await authenticate("pk", req({ "x-loupe-user": "u1", "x-loupe-hmac": signUser("u1", "sec") }));
    expect(a.ok && a.mode === "user").toBe(true);
    if (a.ok && a.mode === "user") expect(a.userId).toBe("u1");
  });

  it("401 on a bad HMAC", async () => {
    const a = await authenticate("pk", req({ "x-loupe-user": "u1", "x-loupe-hmac": "deadbeef" }));
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.status).toBe(401);
  });

  it("401 on a wrong admin key", async () => {
    const a = await authenticate("pk", req({ "x-loupe-admin": "wrong" }));
    expect(a.ok).toBe(false);
  });
});
