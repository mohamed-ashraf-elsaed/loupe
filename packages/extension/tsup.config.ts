import { defineConfig } from "tsup";

export default defineConfig({
  // Bundle the SDK + capture glue into a single classic script injected via
  // chrome.scripting.executeScript. IIFE (not ESM) so it runs as a content script.
  entry: { content: "content.src.ts" },
  format: ["iife"],
  platform: "browser",
  target: "es2020",
  outDir: ".",
  outExtension: () => ({ js: ".js" }),
  sourcemap: false,
  clean: false, // never wipe manifest.json / background.js / popup.*
  dts: false,
});
