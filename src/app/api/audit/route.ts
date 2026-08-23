import { NextRequest } from "next/server"
import { db, getMerchant } from "@/lib/db"
import { ok, handleRouteError } from "@/lib/api-utils"

export const dynamic = "force-dynamic"

/** GET /api/audit?take=100&paymentId=... — chronological audit trail. */
export async function GET(req: NextRequest) {
  try {
    const merchant = await getMerchant()
    const take = Math.min(Number(req.nextUrl.searchParams.get("take") ?? 100), 500)
    const paymentId = req.nextUrl.searchParams.get("paymentId") ?? undefined
    const level = req.nextUrl.searchParams.get("level") ?? undefined

    const logs = await db.auditLog.findMany({
      where: {
        merchantId: merchant.id,
        ...(paymentId ? { paymentId } : {}),
        ...(level ? { level } : {}),
      },
      orderBy: { createdAt: "desc" },
      take,
    })
    return ok(logs)
  } catch (err) {
    return handleRouteError(err)
  }
}
