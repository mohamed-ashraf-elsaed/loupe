// Local dev helper: create an org + project without the Google sign-in UI.
//   node seed.ts [ownerEmail] [webhookUrl] [allowedDomain]
// Prints the Project ID and both secrets. Uses the same DB as the server
// (DATABASE_URL, else PGlite at HUB_PG_DIR / ./data/pg).
import { migrate } from "./db.ts";
import { createOrg, createProject } from "./store.ts";

const [owner = "owner@example.com", webhook = "http://127.0.0.1:8791/webhook", domain = "example.com"] = process.argv.slice(2);

await migrate();
const org = await createOrg("Demo Org", owner, domain);
const p = await createProject(org.id, "Demo Project", webhook);
console.log(`organization   ${org.id}  (owner ${owner}, allowed domain @${domain})`);
console.log(`project        ${p.id}  → ${webhook}`);
console.log(`\nLOUPE_PROJECT_ID=${p.id}\nLOUPE_PROJECT_SECRET=${p.secret}\nWEBHOOK_SECRET=${p.webhook_secret}`);
process.exit(0);
