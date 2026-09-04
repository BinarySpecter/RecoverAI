import { GatewayEventSchema } from "@/lib/types"
import { getMerchant } from "@/lib/db"
import { normalizeGatewayCode, gatewayMessageFor } from "@/lib/gateway/payment-gateway"
import { verifyRazorpaySignature } from "@/lib/gateway/webhook"
import { ingestFailure } from "@/lib/engine/ingestion"
import { runRecoveryPipeline } from "@/lib/engine/recovery-engine"
import { ok, fail, handleRouteError } from "@/lib/api-utils"

export const dynamic = "force-dynamic"

/**
 * POST /api/webhooks/razorpay — designated entry point for real Razorpay
 * webhook events (payment.failed etc).
 *
 * The X-Razorpay-Signature header is verified as HMAC-SHA256 over the raw
 * request body with RAZORPAY_WEBHOOK_SECRET before anything is parsed. If no
 * secret is configured (demo mode) verification is skipped so the endpoint
 * stays usable offline; set RAZORPAY_WEBHOOK_SECRET to enforce signatures.
 *
 * Duplicate deliveries are tolerated: re-processing an event whose payment is
 * already resolved is acknowledged as ignored rather than erroring out.
 */
export async function POST(req: Request) {
  try {
    const raw = await req.text()
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET

    if (secret) {
      const signature = req.headers.get("x-razorpay-signature")
      const check = verifyRazorpaySignature({ rawBody: raw, signature, secret })
      if (!check.valid) return fail(`Invalid webhook signature — ${check.reason}`, 401)
    }

    const rawJson = JSON.parse(raw) as { customerEmail?: string }
    const parsed = GatewayEventSchema.safeParse(rawJson)
    if (!parsed.success) return fail("Invalid webhook payload", 422)

    const evt = parsed.data
    if (!evt.event.includes("failed") && evt.payload.status !== "FAILED") {
      return ok({ ignored: true, reason: `Event ${evt.event} is not a failure event` })
    }

    const merchant = await getMerchant()
    // Look up the customer by the payment's stored email in a real integration;
    // demo webhooks accept an explicit customer email in the payload.
    const customerEmail = rawJson.customerEmail

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

    try {
      const pipeline = await runRecoveryPipeline(payment.id)
      return ok({ received: true, paymentId: payment.id, pipeline })
    } catch (err) {
      // Already-resolved payments (e.g. a duplicate late delivery) are
      // acknowledged, not failed — upstream expects 2xx for consumed events.
      if (err instanceof Error && /not FAILED|nothing to recover/i.test(err.message)) {
        return ok({ received: true, ignored: true, reason: err.message, paymentId: payment.id })
      }
      throw err
    }
  } catch (err) {
    return handleRouteError(err)
  }
}