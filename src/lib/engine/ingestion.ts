import { db, getMerchant } from "@/lib/db"
import { gatewayMessageFor, newOrderId, normalizeGatewayCode } from "@/lib/gateway/payment-gateway"
import type { FailureCategory, PaymentMethod } from "@/lib/types"

/**
 * Failure ingestion — normalize a gateway event into domain records.
 * This is the single funnel for failures, whether they arrive from the seed,
 * the demo simulator, or (in production) Razorpay webhooks.
 */

export interface IngestFailureInput {
  id?: string // explicit id lets the seed produce deterministic simulation outcomes
  merchantId?: string
  customerId?: string
  customerEmail?: string
  amount: number // paise
  method: PaymentMethod
  failureCategory?: FailureCategory
  gatewayCode?: string
  gatewayMessage?: string
  latencyMs?: number
  description?: string
  source?: "SEED" | "SIMULATION" | "WEBHOOK"
  retryCount?: number
  createdAt?: Date
}

export async function ingestFailure(input: IngestFailureInput) {
  const merchantId = input.merchantId ?? (await getMerchant()).id

  let customerId = input.customerId
  if (!customerId && input.customerEmail) {
    const customer = await db.customer.findUnique({
      where: { merchantId_email: { merchantId, email: input.customerEmail } },
    })
    if (!customer) throw new Error(`No customer with email ${input.customerEmail}`)
    customerId = customer.id
  }
  if (!customerId) {
    const customer = await db.customer.findFirst({ where: { merchantId }, orderBy: { createdAt: "asc" } })
    if (!customer) throw new Error("No customers exist — run the seed first")
    customerId = customer.id
  }

  const category: FailureCategory = input.failureCategory ?? normalizeGatewayCode(input.gatewayCode ?? "card_declined")
  const code = input.gatewayCode ?? categoryToDefaultCode(category)
  const message = input.gatewayMessage ?? gatewayMessageFor(code)
  const attemptNo = (input.retryCount ?? 0) + 1

  const payment = await db.payment.create({
    data: {
      ...(input.id ? { id: input.id } : {}),
      merchantId,
      customerId,
      orderId: input.id ? `order_${input.id.replace(/[^a-z0-9]/gi, "").slice(-10)}` : newOrderId(),
      amount: input.amount,
      status: "FAILED",
      method: input.method,
      description: input.description ?? "Order payment",
      source: input.source ?? "SIMULATION",
      retryCount: input.retryCount ?? 0,
      ...(input.createdAt ? { createdAt: input.createdAt, updatedAt: input.createdAt } : {}),
      attempts: {
        create: {
          attemptNo,
          status: "FAILED",
          gatewayCode: code,
          gatewayMessage: message,
          latencyMs: input.latencyMs ?? 900 + Math.floor(Math.random() * 2500),
          ...(input.createdAt ? { createdAt: input.createdAt } : {}),
        },
      },
      failure: {
        create: {
          category,
          rawCode: code,
          rawMessage: message,
          ...(input.createdAt ? { detectedAt: input.createdAt } : {}),
        },
      },
    },
    include: { customer: true, failure: true, attempts: true },
  })

  await db.customer.update({
    where: { id: customerId },
    data: { failedPayments: { increment: 1 } },
  })

  await audit(merchantId, {
    paymentId: payment.id,
    actor: "GATEWAY",
    event: "payment.failed",
    message: `Payment ${payment.orderId} of ₹${(payment.amount / 100).toLocaleString("en-IN")} failed: ${message} (${category})`,
    data: { category, rawCode: code, attemptNo, method: payment.method },
    createdAt: input.createdAt,
  })

  return payment
}

function categoryToDefaultCode(category: FailureCategory): string {
  const map: Record<FailureCategory, string> = {
    TEMPORARY_DECLINE: "card_declined",
    INSUFFICIENT_FUNDS: "insufficient_funds",
    EXPIRED_CARD: "card_expired",
    NETWORK_FAILURE: "gateway/network_error",
    AUTHENTICATION_FAILURE: "3ds_authentication_failed",
    ABANDONED_CHECKOUT: "abandoned",
    REPEATED_FAILURES: "consecutive_failures",
    HIGH_VALUE_FAILURE: "large_amount_flagged",
    SUBSCRIPTION_RENEWAL_FAILURE: "subscription_charge_failed",
    FRAUD_RISK: "risk_flagged",
  }
  return map[category]
}

export async function audit(
  merchantId: string,
  entry: {
    paymentId?: string | null
    level?: "info" | "warn" | "error"
    actor: string
    event: string
    message: string
    data?: unknown
    createdAt?: Date
  },
) {
  await db.auditLog.create({
    data: {
      merchantId,
      paymentId: entry.paymentId ?? null,
      level: entry.level ?? "info",
      actor: entry.actor,
      event: entry.event,
      message: entry.message,
      data: entry.data === undefined ? null : JSON.stringify(entry.data),
      ...(entry.createdAt ? { createdAt: entry.createdAt } : {}),
    },
  })
}
