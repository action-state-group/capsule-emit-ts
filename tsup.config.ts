import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", "aac/index": "src/aac/index.ts" },
  format: ["esm"],
  dts: false,
  sourcemap: true,
  clean: true,
  target: "node24",
});
