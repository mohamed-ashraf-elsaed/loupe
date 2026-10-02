process.env.LOUPE_PG_DIR = "memory://";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, migrate } from "../db.ts";
import * as store from "../store.ts";
import {
  addRepoUrl, deleteWorkingBranch, getWorkingBranch, listRepoUrls, listWorkingBranches,
  removeRepoUrl, resolvePreview, upsertWorkingBranch,
} from "../branches.ts";

const project = { project_key: "pk_test", name: "Test", secret: "s3cr3t", allowed_origins: ["*"] };

beforeEach(async () => {
  await migrate();
  const d = await db();
  await d.query("DELETE FROM working_branches");
  await d.query("DELETE FROM repo_urls");
  await d.query("DELETE FROM projects");
  await store.upsertProject(project as any);
});

const base = { projectKey: "pk_test", repo: "acme/web", branch: "loupe/fixes" };

describe("working branches", () => {
  it("creates one and reads it back", async () => {
    const created = await upsertWorkingBranch({ ...base, baseBranch: "main", description: "Accumulating fixes" });
    expect(created).toMatchObject({ repo: "acme/web", branch: "loupe/fixes", baseBranch: "main", status: "open", fixCount: 0 });

    const read = await getWorkingBranch("pk_test", "acme/web", "loupe/fixes");
    expect(read!.id).toBe(created.id);
    expect(read!.description).toBe("Accumulating fixes");
  });

  it("counts fixes up rather than overwriting them", async () => {
    await upsertWorkingBranch({ ...base, addFix: true });
    await upsertWorkingBranch({ ...base, addFix: true });
    const third = await upsertWorkingBranch({ ...base, addFix: true });
    expect(third.fixCount).toBe(3);
    // A plain update (no fix) leaves the count alone.
    const plain = await upsertWorkingBranch({ ...base, headSha: "abc" });
    expect(plain.fixCount).toBe(3);
  });

  it("keeps fields it was not told about", async () => {
    await upsertWorkingBranch({ ...base, prNumber: 412, prUrl: "https://x/412", headSha: "sha1" });
    // A later update that only moves the head must not wipe the PR link.
    const updated = await upsertWorkingBranch({ ...base, headSha: "sha2" });
    expect(updated).toMatchObject({ prNumber: 412, prUrl: "https://x/412", headSha: "sha2" });
  });

  it("records a status change", async () => {
    await upsertWorkingBranch(base);
    expect((await upsertWorkingBranch({ ...base, status: "merged" })).status).toBe("merged");
  });

  it("lists by project, optionally scoped to a repo", async () => {
    await upsertWorkingBranch({ ...base });
    await upsertWorkingBranch({ ...base, branch: "loupe/other" });
    await upsertWorkingBranch({ ...base, repo: "acme/api" });
    expect((await listWorkingBranches("pk_test")).length).toBe(3);
    expect((await listWorkingBranches("pk_test", "acme/web")).length).toBe(2);
    expect((await listWorkingBranches("other")).length).toBe(0);
  });

  it("deletes one and reports whether it existed", async () => {
    await upsertWorkingBranch(base);
    expect(await deleteWorkingBranch("pk_test", "acme/web", "loupe/fixes")).toBe(true);
    expect(await deleteWorkingBranch("pk_test", "acme/web", "loupe/fixes")).toBe(false);
    expect(await getWorkingBranch("pk_test", "acme/web", "loupe/fixes")).toBeNull();
  });
});

describe("repo url patterns", () => {
  it("registers, replaces and lists", async () => {
    await addRepoUrl({ projectKey: "pk_test", repo: "acme/web", environment: "staging", pattern: "https://staging.acme.test/**" });
    // Same repo+environment is a replace, not a second row.
    await addRepoUrl({ projectKey: "pk_test", repo: "acme/web", environment: "staging", pattern: "https://staging2.acme.test/**" });
    await addRepoUrl({ projectKey: "pk_test", repo: "acme/web", environment: "production", pattern: "https://acme.test/**" });
    const all = await listRepoUrls("pk_test", "acme/web");
    expect(all.map((r) => r.pattern).sort()).toEqual(["https://acme.test/**", "https://staging2.acme.test/**"]);
  });

  it("removes one and scopes to the project", async () => {
    const made = await addRepoUrl({ projectKey: "pk_test", repo: "acme/web", environment: "staging", pattern: "https://s.test/**" });
    expect(await removeRepoUrl("other", made.id)).toBe(false);
    expect(await removeRepoUrl("pk_test", made.id)).toBe(true);
    expect(await listRepoUrls("pk_test")).toEqual([]);
  });
});

describe("preview lookup", () => {
  const probeNever = vi.fn(async () => false);
  const probeAlways = vi.fn(async () => true);

  it("says 'not ready' with an actionable reason when nothing is registered", async () => {
    const out = await resolvePreview("pk_test", "acme/web", "loupe/fixes", { probe: probeNever });
    expect(out.status).toBe("not_ready");
    expect(out.candidates).toEqual([]);
    expect(out.reason).toContain("add_repo_url");
  });

  it("treats a URL already reported on the branch as the answer", async () => {
    await upsertWorkingBranch({ ...base, previewUrl: "https://reported.test/" });
    const out = await resolvePreview("pk_test", "acme/web", "loupe/fixes", { probe: probeAlways });
    expect(out).toMatchObject({ status: "ready", url: "https://reported.test/" });
    // It is tried first, before any inferred candidate.
    expect(out.candidates[0]).toBe("https://reported.test/");
  });

  it("expands registered patterns with the branch and PR number", async () => {
    await addRepoUrl({ projectKey: "pk_test", repo: "acme/web", environment: "staging", pattern: "https://staging.acme.test/{branch}/**" });
    await upsertWorkingBranch({ ...base, prNumber: 412 });
    const out = await resolvePreview("pk_test", "acme/web", "loupe/fixes", { probe: probeNever });
    expect(out.candidates).toContain("https://staging.acme.test/loupe/fixes/**");
    // A pattern needing a PR it does not have is skipped, not half-filled.
    await addRepoUrl({ projectKey: "pk_test", repo: "acme/web", environment: "preview", pattern: "https://preview.test/pr-{pr}/" });
    const withPr = await resolvePreview("pk_test", "acme/web", "loupe/fixes", { probe: probeNever });
    expect(withPr.candidates).toContain("https://preview.test/pr-412/");
  });

  it("tries preview-shaped environments before production", async () => {
    await addRepoUrl({ projectKey: "pk_test", repo: "acme/web", environment: "production", pattern: "https://acme.test/**" });
    await addRepoUrl({ projectKey: "pk_test", repo: "acme/web", environment: "staging", pattern: "https://staging.acme.test/**" });
    const out = await resolvePreview("pk_test", "acme/web", "loupe/fixes", { probe: probeNever });
    expect(out.candidates.indexOf("https://staging.acme.test/**")).toBeLessThan(out.candidates.indexOf("https://acme.test/**"));
  });

  it("falls back to the GitHub Pages convention", async () => {
    await upsertWorkingBranch({ ...base, prNumber: 7 });
    const out = await resolvePreview("pk_test", "acme/web", "loupe/fixes", { probe: probeNever });
    expect(out.candidates).toContain("https://acme.github.io/web/pr-preview/pr-7/");
  });

  it("reports ready only for a URL that actually responded", async () => {
    await upsertWorkingBranch({ ...base, prNumber: 7 });
    const seen: string[] = [];
    const probe = async (u: string) => { seen.push(u); return u.includes("pr-preview"); };
    const out = await resolvePreview("pk_test", "acme/web", "loupe/fixes", { probe });
    expect(out.status).toBe("ready");
    expect(out.url).toContain("pr-preview/pr-7");
    // It stopped probing once one answered.
    expect(seen.at(-1)).toBe(out.url);
  });

  it("says 'not ready' and lists what it tried when nothing answers", async () => {
    await upsertWorkingBranch({ ...base, prNumber: 7 });
    const out = await resolvePreview("pk_test", "acme/web", "loupe/fixes", { probe: probeNever });
    expect(out.status).toBe("not_ready");
    expect(out.reason).toContain("not up yet");
    expect(out.reason).toContain("rather than guessing");
    for (const c of out.candidates) expect(out.reason).toContain(c);
  });

  it("takes the PR number from the working branch, or from the caller", async () => {
    await upsertWorkingBranch({ ...base, prNumber: 7 });
    const viaBranch = await resolvePreview("pk_test", "acme/web", "loupe/fixes", { probe: probeNever });
    expect(viaBranch.candidates.some((c) => c.includes("pr-7"))).toBe(true);
    const viaCaller = await resolvePreview("pk_test", "acme/web", "loupe/fixes", { probe: probeNever, pr: 99 });
    expect(viaCaller.candidates.some((c) => c.includes("pr-99"))).toBe(true);
  });

  it("does not duplicate a candidate that both a pattern and Pages would produce", async () => {
    await upsertWorkingBranch({ ...base, prNumber: 7 });
    await addRepoUrl({ projectKey: "pk_test", repo: "acme/web", environment: "preview", pattern: "https://acme.github.io/web/pr-preview/pr-{pr}/" });
    const out = await resolvePreview("pk_test", "acme/web", "loupe/fixes", { probe: probeNever });
    expect(out.candidates.filter((c) => c.includes("pr-preview/pr-7"))).toHaveLength(1);
  });
});
