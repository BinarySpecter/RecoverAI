import { NextRequest } from "next/server"
import { db, getMerchant } from "@/lib/db"
import { ok, handleRouteError } from "@/lib/api-utils"

export const dynamic = "force-dynamic"

/** GET /api/payments?status=FAILED&take=50 — list payments (failed first by default). */
export async function GET(req: NextRequest) {
  try {
    const merchant = await getMerchant()
    const status = req.nextUrl.searchParams.get("status")
    const take = Math.min(Number(req.nextUrl.searchParams.get("take") ?? 50), 100)

    const payments = await db.payment.findMany({
      where: {
        merchantId: merchant.id,
        ...(status ? { status } : {}),
      },
      include: {
        customer: { select: { name: true, email: true, subscriptionActive: true } },
        failure: true,
        analyses: { orderBy: { createdAt: "desc" }, take: 1 },
        actions: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      take,
    })

    return ok(
      payments.map((p) => ({
        id: p.id,
        orderId: p.orderId,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        method: p.method,
        description: p.description,
        retryCount: p.retryCount,
        createdAt: p.createdAt,
        recoveredAt: p.recoveredAt,
        customer: p.customer,
        failure: p.failure,
        latestAnalysis: p.analyses[0] ?? null,
        latestAction: p.actions[0] ?? null,
      })),
    )
  } catch (err) {
    return handleRouteError(err)
  }
}
