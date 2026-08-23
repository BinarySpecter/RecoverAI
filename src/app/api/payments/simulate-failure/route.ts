import { NextRequest } from "next/server"
import { db, getMerchant } from "@/lib/db"
import { SimulateFailureSchema, PAYMENT_METHODS, type FailureCategory } from "@/lib/types"
import { failureCodesForMethod, normalizeGatewayCode, gatewayMessageFor, hashSeed, seededRandom } from "@/lib/gateway/payment-gateway"
import { ingestFailure } from "@/lib/engine/ingestion"
import { runRecoveryPipeline } from "@/lib/engine/recovery-engine"
import { ok, fail, handleRouteError } from "@/lib/api-utils"
import type { z } from "zod"

export const dynamic = "force-dynamic"

/**
 * POST /api/payments/simulate-failure — demo mode.
 * Creates a failed payment (random or specified) and runs the complete
 * recovery pipeline so the dashboard reflects it immediately.
 */
export async function POST(req: NextRequest) {
  try {
    const merchant = await getMerchant()
    const body = (await req.json().catch(() => ({}))) as z.infer<typeof SimulateFailureSchema>
    const input = SimulateFailureSchema.parse(body)

    // Pick a customer: specified email, or a deterministic-ish random one.
    let customerId = input.customerEmail
    if (!customerId) {
      const customers = await db.customer.findMany({ where: { merchantId: merchant.id } })
      if (customers.length === 0) return fail("No customers to simulate for", 400)
      const pick = customers[Math.floor(Math.random() * customers.length)]
      customerId = pick.email
    }

    // Pick failure details: specified, or realistic random for the method.
    const method = input.method ?? PAYMENT_METHODS[Math.floor(Math.random() * PAYMENT_METHODS.length)]
    let category: FailureCategory | undefined = input.failureCategory
    let gatewayCode: string | undefined
    if (!category) {
      const codes = failureCodesForMethod(method)
      gatewayCode = codes[Math.floor(Math.random() * codes.length)]
      category = normalizeGatewayCode(gatewayCode)
    }

    // Amount: specified, or a realistic random between ₹999 and ₹29,999
    // (occasionally high-value to exercise approval gates).
    const seedRand = seededRandom(hashSeed(`${Date.now()}:${Math.random()}`))
    const amount =
      input.amount ?? (seedRand() < 0.15
        ? Math.round((60000 + seedRand() * 60000) / 100) * 100 // ₹60k–₹1.2L high-value
        : Math.round((999 + seedRand() * 29000) / 100) * 100)

    const payment = await ingestFailure({
      merchantId: merchant.id,
      customerEmail: customerId,
      amount,
      method,
      failureCategory: category,
      gatewayCode,
      gatewayMessage: gatewayCode ? gatewayMessageFor(gatewayCode) : undefined,
      description: input.description ?? "Simulated order payment",
      source: "SIMULATION",
    })

    const pipeline = await runRecoveryPipeline(payment.id)

    const full = await db.payment.findUniqueOrThrow({
      where: { id: payment.id },
      include: { customer: true, failure: true },
    })

    return ok({ payment: full, pipeline })
  } catch (err) {
    return handleRouteError(err)
  }
}
