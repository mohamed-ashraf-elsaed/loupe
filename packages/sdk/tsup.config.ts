import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig({
  entry: { index: "src/index.ts" },
  // ESM for `npm i @loupekit/sdk`, IIFE (global `Loupe`) for the <script> snippet.
  format: ["esm", "iife"],
  globalName: "Loupe",
  platform: "browser",
  target: "es2020",
  // Baked in so a comment records which build produced it (`viewport.v`). Without it
  // there is no way to tell a stale bundle from a genuine bug on a reporter's device.
  define: { __LOUPE_VERSION__: JSON.stringify(version) },
  // Bundle deps (modern-screenshot) so the script tag is self-contained.
  noExternal: [/.*/],
  sourcemap: true,
  clean: true,
  dts: false,
  minify: false,
});
