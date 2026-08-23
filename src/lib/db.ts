import { PrismaClient } from "@prisma/client"

// Singleton Prisma client — Next.js hot-reloads modules; without this every
// reload spawns a new connection pool.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db

/** Single demo merchant (multi-merchant ready — all queries already scope by merchantId). */
export async function getMerchant() {
  const merchant = await db.merchant.findFirst({ orderBy: { createdAt: "asc" } })
  if (!merchant) throw new Error("No merchant found — run `npm run db:seed` first")
  return merchant
}
