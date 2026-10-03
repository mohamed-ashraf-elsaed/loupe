import { defineConfig } from "tsup";

export default defineConfig({
  entry: { app: "app.ts" },
  format: ["esm"],
  platform: "browser",
  target: "es2020",
  outDir: "dist",
  sourcemap: true,
  clean: true,
  // Bundle workspace deps. Without this, `@loupekit/shared` stays a BARE import in the
  // emitted file and the browser refuses to resolve it — the page loads and then dies
  // with "Failed to resolve module specifier". The SDK has always done this; the
  // dashboard did not, so it only ever worked for whoever's dist happened to be current.
  noExternal: [/.*/],
  dts: false,
});
