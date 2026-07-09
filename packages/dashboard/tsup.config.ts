import { defineConfig } from "tsup";

export default defineConfig({
  entry: { app: "app.ts" },
  format: ["esm"],
  platform: "browser",
  target: "es2020",
  outDir: "dist",
  sourcemap: true,
  clean: true,
  dts: false,
});
