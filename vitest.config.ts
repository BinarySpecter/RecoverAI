import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"


export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    fileParallelism: false, // shared SQLite test database
    env: {
      DATABASE_URL: "file:./test.db",
      AI_PROVIDER: "mock",
    },
    globalSetup: "./tests/global-setup.ts",
  },
})
