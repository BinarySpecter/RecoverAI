import type { FailureCategory, PaymentMethod } from "@/lib/types"

/**
 * Payment gateway adapter — simulated Razorpay.
 *
 * In production this module would be implemented against the Razorpay SDK:
 *   - `charge()` → razorpay.payments.create / captures
 *   - `sendPaymentLink()` → razorpay.paymentLink.create
 *   - real webhook events would arrive at POST /api/webhooks/razorpay
 *     (signature-verified with RAZORPAY_WEBHOOK_SECRET) and be normalized
 *     through `normalizeGatewayCode()` exactly like simulated events.
 *
 * The simulation is deterministic: outcomes derive from a seeded hash of the
 * payment id + attempt number, so demos are reproducible.
 */

export interface ChargeResult {
  ok: boolean
  gatewayCode: string
  gatewayMessage: string
  latencyMs: number
  paymentRef: string
}

export interface GatewayFailureSignal {
  gatewayCode: string
  gatewayMessage: string
  category: FailureCategory
  latencyMs: number
}

// Raw Razorpay-style error codes mapped to normalized failure categories.
const CODE_MAP: Record<string, FailureCategory> = {
  card_declined: "TEMPORARY_DECLINE",
  transient_decline: "TEMPORARY_DECLINE",
  insufficient_funds: "INSUFFICIENT_FUNDS",
  card_expired: "EXPIRED_CARD",
  "gateway/network_error": "NETWORK_FAILURE",
  timeout: "NETWORK_FAILURE",
  authentication_required: "AUTHENTICATION_FAILURE",
  "3ds_authentication_failed": "AUTHENTICATION_FAILURE",
  abandoned: "ABANDONED_CHECKOUT",
  consecutive_failures: "REPEATED_FAILURES",
  large_amount_flagged: "HIGH_VALUE_FAILURE",
  subscription_charge_failed: "SUBSCRIPTION_RENEWAL_FAILURE",
  risk_flagged: "FRAUD_RISK",
  "bank_down": "TEMPORARY_DECLINE",
}

const MESSAGES: Record<string, string> = {
  card_declined: "Card declined by issuing bank",
  transient_decline: "Issuer returned a soft decline",
  insufficient_funds: "Customer has insufficient funds / credit limit",
  card_expired: "Card has expired",
  "gateway/network_error": "Network error between gateway and issuer",
  timeout: "Gateway timeout waiting for issuer response",
  authentication_required: "Additional authentication (3DS/OTP) was not completed",
  "3ds_authentication_failed": "3DS authentication failed",
  abandoned: "Customer dropped off before completing payment",
  consecutive_failures: "Multiple consecutive failures on this payment",
  large_amount_flagged: "High-value transaction flagged by risk system",
  subscription_charge_failed: "Scheduled subscription charge failed",
  risk_flagged: "Blocked by risk engine — potential fraud",
  "bank_down": "Issuing bank temporarily unavailable",
}

export function normalizeGatewayCode(code: string): FailureCategory {
  return CODE_MAP[code] ?? "TEMPORARY_DECLINE"
}

export function gatewayMessageFor(code: string): string {
  return MESSAGES[code] ?? "Payment failed at gateway"
}

/** Failure codes typically produced per payment method — used by the demo simulator. */
export function failureCodesForMethod(method: PaymentMethod): string[] {
  switch (method) {
    case "CARD":
      return ["card_declined", "insufficient_funds", "card_expired", "3ds_authentication_failed", "large_amount_flagged", "risk_flagged"]
    case "UPI":
      return ["insufficient_funds", "transient_decline", "timeout", "abandoned", "risk_flagged"]
    case "NETBANKING":
      return ["gateway/network_error", "insufficient_funds", "bank_down", "abandoned"]
    case "WALLET":
      return ["insufficient_funds", "authentication_required", "abandoned"]
  }
}

// --- deterministic pseudo-random -------------------------------------------

export function hashSeed(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function seededRandom(seed: number): () => number {
  let s = seed || 1
  return () => {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// --- simulated operations ----------------------------------------------------

/**
 * Simulate a retry charge. Recovery odds rise with customer quality and fall
 * with each prior failed attempt, mirroring real issuer behaviour.
 */
export function simulateCharge(input: {
  paymentId: string
  attemptNo: number
  baseProbability: number
  customerQuality: number // 0..1
}): ChargeResult {
  const rand = seededRandom(hashSeed(`${input.paymentId}:${input.attemptNo}:charge`))()
  const attemptPenalty = 0.12 * Math.max(0, input.attemptNo - 1)
  const probability = Math.max(0.02, Math.min(0.95, input.baseProbability + 0.2 * input.customerQuality - attemptPenalty))
  const ok = rand < probability
  const latency = 800 + Math.floor(seededRandom(hashSeed(`${input.paymentId}:${input.attemptNo}:lat`))() * 3200)
  return {
    ok,
    gatewayCode: ok ? "success" : pickFailureCode(`${input.paymentId}:${input.attemptNo}:fail`),
    gatewayMessage: ok ? "Payment captured" : "Retry attempt failed",
    latencyMs: latency,
    paymentRef: `pay_sim_${hashSeed(`${input.paymentId}:${input.attemptNo}`).toString(36)}`,
  }
}

function pickFailureCode(seedInput: string): string {
  const rand = seededRandom(hashSeed(seedInput))()
  const codes = ["card_declined", "insufficient_funds", "timeout", "transient_decline"]
  return codes[Math.floor(rand * codes.length)]
}

export function newOrderId(): string {
  return `order_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

export function newPaymentRef(): string {
  return `pay_sim_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}
