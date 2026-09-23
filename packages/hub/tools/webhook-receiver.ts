// Tiny webhook receiver for testing Loupe Hub deliveries.
//   WEBHOOK_SECRET=whs_… node tools/webhook-receiver.ts   (PORT, default 8791)
// Verifies X-Loupe-Hub-Signature = hex(HMAC-SHA256(timestamp + "." + body, secret))
// and the timestamp freshness, then logs the payload. Replies 200 when valid, 401 otherwise.
import { createServer } from "node:http";
import { verifySignature } from "../crypto.ts";

const PORT = Number(process.env.PORT || 8791);
const SECRET = process.env.WEBHOOK_SECRET || "";
if (!SECRET) console.warn("[receiver] WEBHOOK_SECRET not set: every delivery will fail verification");

createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const ts = String(req.headers["x-loupe-hub-timestamp"] ?? "");
    const sig = String(req.headers["x-loupe-hub-signature"] ?? "");
    const check = verifySignature(ts, raw, sig, SECRET);
    const stamp = new Date().toISOString();
    if (!check.ok) {
      console.log(`[receiver] ${stamp} ${req.method} ${req.url} REJECTED: ${check.reason}`);
      res.writeHead(401).end(check.reason);
      return;
    }
    console.log(`[receiver] ${stamp} ${req.method} ${req.url} signature OK (delivery ${req.headers["x-loupe-hub-delivery"]})`);
    console.log(JSON.stringify(JSON.parse(raw), null, 2));
    res.writeHead(200, { "Content-Type": "application/json" }).end('{"ok":true}');
  });
}).listen(PORT, "127.0.0.1", () => console.log(`[receiver] listening on http://127.0.0.1:${PORT}`));
