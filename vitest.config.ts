import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

// Load .env into process.env so integration tests can reach Postgres/Redis
// when run via `pnpm test`. Skips gracefully on CI where the file is absent.
loadEnv({ path: resolve(__dirname, ".env") });

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "scripts/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
});
