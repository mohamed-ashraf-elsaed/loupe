import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts" },
  // ESM for `npm i @loupekit/sdk`, IIFE (global `Loupe`) for the <script> snippet.
  format: ["esm", "iife"],
  globalName: "Loupe",
  platform: "browser",
  target: "es2020",
  // Bundle deps (modern-screenshot) so the script tag is self-contained.
  noExternal: [/.*/],
  sourcemap: true,
  clean: true,
  dts: false,
  minify: false,
});
