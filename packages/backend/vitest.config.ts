import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@clawsquad/shared": path.resolve(__dirname, "../shared/src/index.ts"),
    },
  },
});
