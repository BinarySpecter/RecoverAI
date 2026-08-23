import { GatewayEventSchema } from "@/lib/types"
import { db, getMerchant } from "@/lib/db"
import { normalizeGatewayCode, gatewayMessageFor } from "@/lib/gateway/payment-gateway"
import { ingestFailure } from "@/lib/engine/ingestion"
import { runRecoveryPipeline } from "@/lib/engine/recovery-engine"
import { ok, fail, handleRouteError } from "@/lib/api-utils"

export const dynamic = "force-dynamic"

/**
 * POST /api/webhooks/razorpay — designated entry point for real Razorpay
 * webhook events (payment.failed etc).
 *
 * Production: verify the X-Razorpay-Signature HMAC with RAZORPAY_WEBHOOK_SECRET
 * before processing, and map real Razorpay payloads onto GatewayEventSchema.
 * The pipeline downstream of this point is already production-shaped.
 */
export async function POST(req: Request) {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET
    if (secret) {
      const signature = req.headers.get("x-razorpay-signature")
      if (!signature) return fail("Missing webhook signature", 401)
      // HMAC verification would run here against the raw body.
    }

    const raw = await req.json().catch(() => null)
    const parsed = GatewayEventSchema.safeParse(raw)
    if (!parsed.success) return fail("Invalid webhook payload", 422)

    const evt = parsed.data
    if (!evt.event.includes("failed") && evt.payload.status !== "FAILED") {
      return ok({ ignored: true, reason: `Event ${evt.event} is not a failure event` })
    }

    const merchant = await getMerchant()
    // Look up the customer by the payment's stored email in a real integration;
    // demo webhooks accept an explicit customer email in the payload.
    const customerEmail = (raw as { customerEmail?: string })?.customerEmail

    const category = normalizeGatewayCode(evt.payload.gatewayCode ?? "card_declined")
    const payment = await ingestFailure({
      merchantId: merchant.id,
      customerEmail,
      amount: 499900, // real webhooks carry the amount; demo default ₹4,999
      method: "CARD",
      failureCategory: category,
      gatewayCode: evt.payload.gatewayCode,
      gatewayMessage: evt.payload.gatewayMessage ?? gatewayMessageFor(evt.payload.gatewayCode ?? "card_declined"),
      source: "WEBHOOK",
      description: "Webhook-driven payment",
    })

    const pipeline = await runRecoveryPipeline(payment.id)
    return ok({ received: true, paymentId: payment.id, pipeline })
  } catch (err) {
    return handleRouteError(err)
  }
}
