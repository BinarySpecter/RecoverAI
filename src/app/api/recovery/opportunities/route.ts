import { db, getMerchant } from "@/lib/db"
import { ok, handleRouteError } from "@/lib/api-utils"

export const dynamic = "force-dynamic"

/**
 * GET /api/recovery/opportunities — failed payments that still have an open
 * recovery path, joined with their latest AI analysis + action state.
 */
export async function GET() {
  try {
    const merchant = await getMerchant()
    const failed = await db.payment.findMany({
      where: { merchantId: merchant.id, status: "FAILED" },
      include: {
        customer: true,
        failure: true,
        analyses: { orderBy: { createdAt: "desc" }, take: 1 },
        actions: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    })

    // Open = last action isn't a terminal close (rejected / do-nothing / skipped)
    const opportunities = failed
      .filter((p) => {
        const last = p.actions[0]
        if (!last) return true
        return !(last.status === "REJECTED" || last.status === "SKIPPED" || last.actionType === "DO_NOTHING")
      })
      .map((p) => ({
        paymentId: p.id,
        orderId: p.orderId,
        amount: p.amount,
        createdAt: p.createdAt,
        method: p.method,
        description: p.description,
        retryCount: p.retryCount,
        customer: {
          name: p.customer.name,
          email: p.customer.email,
          subscriptionActive: p.customer.subscriptionActive,
          riskScore: p.customer.riskScore,
          lifetimeValue: p.customer.lifetimeValue,
        },
        failure: p.failure,
        analysis: p.analyses[0] ?? null,
        action: p.actions[0] ?? null,
      }))

    return ok(opportunities)
  } catch (err) {
    return handleRouteError(err)
  }
}
