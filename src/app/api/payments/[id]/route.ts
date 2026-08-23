import { db } from "@/lib/db"
import { ok, fail, handleRouteError } from "@/lib/api-utils"

export const dynamic = "force-dynamic"

/** GET /api/payments/[id] — full detail for the payment page. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const payment = await db.payment.findUnique({
      where: { id },
      include: {
        customer: true,
        merchant: { select: { name: true } },
        failure: true,
        attempts: { orderBy: { attemptNo: "asc" } },
        analyses: { orderBy: { createdAt: "desc" } },
        actions: { orderBy: { createdAt: "desc" } },
      },
    })
    if (!payment) return fail("Payment not found", 404)

    const audit = await db.auditLog.findMany({
      where: { paymentId: id },
      orderBy: { createdAt: "asc" },
    })

    return ok({ payment, audit })
  } catch (err) {
    return handleRouteError(err)
  }
}
