import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "aac/index": "src/aac/index.ts",
    "artifact/index": "src/artifact/index.ts",
    "artifact/sqlite": "src/artifact/sqlite.ts",
    "artifact/mysql": "src/artifact/mysql.ts",
  },
  format: ["esm"],
  dts: false,
  sourcemap: true,
  clean: true,
  target: "node24",
});
