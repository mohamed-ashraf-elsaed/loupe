import { migrate } from "./db.ts";
import { upsertProject } from "./store.ts";
import { signUser } from "./auth.ts";

// Seed a demo project. In production, projects + secrets are created via the
// dashboard/admin flow — never hardcoded.
const projectKey = "pk_demo_acme";
const secret = process.env.LOUPE_DEMO_SECRET || "sk_demo_acme_0f3b9c";
const demoUser = "u_92";

await migrate();
await upsertProject({ project_key: projectKey, name: "Acme Analytics (demo)", secret, allowed_origins: ["*"] });

console.log("Seeded project:", projectKey);
console.log("  admin key   (dashboard ?key= / X-Loupe-Admin):", secret);
console.log(`  demo HMAC    (host-app-injected for ${demoUser}):`, signUser(demoUser, secret));
