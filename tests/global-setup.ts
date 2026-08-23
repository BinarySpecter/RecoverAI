import { execSync } from "node:child_process"
import { rm } from "node:fs/promises"
import { fileURLToPath } from "node:url"

/** Push the schema to a fresh throwaway test database before all suites. */
export default async function setup() {
  const dbPath = fileURLToPath(new URL("./test.db", import.meta.url))
  await rm(dbPath, { force: true })
  await rm(dbPath + "-journal", { force: true })
  execSync("npx prisma db push --skip-generate", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
  })
}
