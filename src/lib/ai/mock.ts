import type { AIProvider, FailureContext, AIAnalysisResult } from "@/lib/ai/provider"
import type { FailureCategory, Severity } from "@/lib/types"
import { hashSeed, seededRandom } from "@/lib/gateway/payment-gateway"

/**
 * MockProvider — a deterministic rules-based diagnosis engine.
 *
 * Doubles as the universal fallback when a real provider is missing a key,
 * times out, returns malformed JSON, or is rate-limited. It encodes the same
 * domain knowledge the prompt gives real LLM providers, so the product
 * workflow is fully functional with zero external dependencies.
 */

interface Diagnosis {
  rootCause: string
  action: AIAnalysisResult["recommendedAction"]
  reasoning: string
  baseConfidence: number
  baseRecovery: number
  severity: Severity
}

const DIAGNOSES: Record<FailureCategory, Diagnosis> = {
  TEMPORARY_DECLINE: {
    rootCause: "Issuing bank returned a soft decline — temporary hold or insufficient available credit is the most likely cause.",
    action: "DELAY_AND_RETRY",
    reasoning:
      "Soft declines from the issuer usually clear within minutes. The customer's payment history is strong, so an automatic delayed retry is the lowest-friction path with high success odds. No customer effort is required.",
    baseConfidence: 0.86,
    baseRecovery: 0.68,
    severity: "medium",
  },
  INSUFFICIENT_FUNDS: {
    rootCause: "Customer likely lacks available funds or credit at the moment of the charge.",
    action: "SEND_REMINDER",
    reasoning:
      "Insufficient-funds declines are time-sensitive, not permanent: salaries and credit cycles restore balance. A polite retry reminder timed a few hours out converts well without implying payment pressure. Retrying the identical charge immediately would likely bounce again.",
    baseConfidence: 0.82,
    baseRecovery: 0.52,
    severity: "medium",
  },
  EXPIRED_CARD: {
    rootCause: "The saved card has expired — the issuer rejects any charge on it.",
    action: "OFFER_ALTERNATE_METHOD",
    reasoning:
      "This failure is deterministic: every retry on the expired card will fail. The correct recovery path is switching rails — offering UPI, a fresh card, or netbanking — which only the customer can complete.",
    baseConfidence: 0.95,
    baseRecovery: 0.47,
    severity: "medium",
  },
  NETWORK_FAILURE: {
    rootCause: "Transient network/infrastructure error between gateway and issuer — the charge may not have even reached the bank.",
    action: "RETRY_PAYMENT",
    reasoning:
      "Network failures are the classic transient case: an immediate retry on the same method has a high probability of succeeding because nothing is wrong with the customer or instrument. Waiting would only add unnecessary delay.",
    baseConfidence: 0.9,
    baseRecovery: 0.78,
    severity: "low",
  },
  AUTHENTICATION_FAILURE: {
    rootCause: "Mandatory 3DS/OTP authentication was not completed or failed during checkout.",
    action: "REQUEST_CUSTOMER_RETRY",
    reasoning:
      "Regulatory 2FA requires the customer to re-authenticate — no system-side retry can succeed without them. A contextual message asking the customer to retry, with the amount and order ready, is the highest-probability action.",
    baseConfidence: 0.88,
    baseRecovery: 0.58,
    severity: "medium",
  },
  ABANDONED_CHECKOUT: {
    rootCause: "Customer dropped off before completing payment — friction, distraction, or second thoughts.",
    action: "SEND_PAYMENT_LINK",
    reasoning:
      "The customer showed clear purchase intent but lost the checkout context. A one-tap payment link restores the exact amount and order without making them rebuild the cart; this is the standard highest-conversion recovery for abandonment.",
    baseConfidence: 0.8,
    baseRecovery: 0.44,
    severity: "low",
  },
  REPEATED_FAILURES: {
    rootCause: "Multiple consecutive failures indicate the payment instrument itself is the problem, not a transient condition.",
    action: "OFFER_ALTERNATE_METHOD",
    reasoning:
      "With repeated failures on this method, further retries on the same rail are statistically futile and raise fraud flags at the issuer. Switching the customer to a different payment method is the only path with meaningful recovery probability.",
    baseConfidence: 0.87,
    baseRecovery: 0.41,
    severity: "high",
  },
  HIGH_VALUE_FAILURE: {
    rootCause: "High-value transaction was declined or flagged — likely exceeds issuer limits or triggered risk review.",
    action: "REQUEST_CUSTOMER_RETRY",
    reasoning:
      "High-value declines often resolve when the customer confirms with their bank or re-authenticates with full 2FA. An automated blind retry on an amount of this size risks a hard decline and customer frustration, so the customer should be asked to retry deliberately.",
    baseConfidence: 0.78,
    baseRecovery: 0.5,
    severity: "high",
  },
  SUBSCRIPTION_RENEWAL_FAILURE: {
    rootCause: "Scheduled subscription charge failed — commonly an expired/updated card or a balance issue on the saved instrument.",
    action: "SEND_REMINDER",
    reasoning:
      "A failed renewal puts an active subscription — recurring revenue — at risk, so recovery urgency is above a one-off order. Subscription customers respond strongly to reminders that let them update their instrument; retention economics justify a proactive touch.",
    baseConfidence: 0.85,
    baseRecovery: 0.62,
    severity: "high",
  },
  FRAUD_RISK: {
    rootCause: "Risk engine flagged this transaction for potential fraud — instrument, velocity, or identity signals are inconsistent.",
    action: "ESCALATE_TO_MERCHANT",
    reasoning:
      "Fraud signals must never trigger automated recovery: a 'successful' recovery of a fraudulent charge becomes a chargeback. This requires human review of the customer's history and the transaction context before any customer contact.",
    baseConfidence: 0.9,
    baseRecovery: 0.1,
    severity: "critical",
  },
}

function customerQuality(ctx: FailureContext): number {
  const total = ctx.customer.successfulPayments + ctx.customer.failedPayments
  const successRate = total > 0 ? ctx.customer.successfulPayments / total : 0.5
  const ltvBoost = Math.min(0.15, ctx.customer.lifetimeValue / 50_000_000) // up to +0.15 at ₹5L+ LTV
  const subBoost = ctx.customer.subscriptionActive ? 0.1 : 0
  const riskPenalty = ctx.customer.riskScore * 0.3
  return Math.max(0, Math.min(1, successRate * 0.6 + ltvBoost + subBoost - riskPenalty))
}

export class MockProvider implements AIProvider {
  readonly name = "mock"
  readonly model = "deterministic-rules-v1"

  async analyzePaymentFailure(ctx: FailureContext): Promise<AIAnalysisResult> {
    const d = DIAGNOSES[ctx.failure.category]
    const quality = customerQuality(ctx)

    // Deterministic jitter (±0.04) so repeated analyses of the same payment match,
    // but different payments with identical shapes don't show identical numbers.
    const jitter = (seededRandom(hashSeed(`${ctx.payment.id}:mock`))() - 0.5) * 0.08

    let confidence = Math.min(0.97, d.baseConfidence + jitter)
    let recovery = Math.max(0.03, Math.min(0.92, d.baseRecovery + quality * 0.2 - 0.08 * Math.max(0, ctx.failure.attemptNo - 1) + jitter))

    let action = d.action
    let reasoning = d.reasoning

    // Context-sensitive overrides — the "reasoning" part of the rules engine.
    if (ctx.failure.category === "TEMPORARY_DECLINE" && ctx.payment.retryCount >= 3) {
      action = "SEND_PAYMENT_LINK"
      reasoning =
        "Multiple soft-decline retries have already failed, so further automatic retries will erode goodwill. A payment link lets the customer retry when their available balance recovers, on any instrument they choose."
      recovery = Math.min(recovery, 0.38)
    }
    if (ctx.failure.category === "SUBSCRIPTION_RENEWAL_FAILURE" && ctx.payment.retryCount >= 2) {
      action = "OFFER_ALTERNATE_METHOD"
      reasoning =
        "Repeated renewal failures on the saved instrument strongly suggest the card was replaced or expired. Continuing to charge it risks involuntary churn; guiding the customer to an alternate method protects the subscription."
    }
    if (ctx.customer.riskScore >= 0.7 && ctx.failure.category !== "FRAUD_RISK") {
      confidence = Math.max(0.4, confidence - 0.15)
      reasoning += ` Note: customer risk score is elevated (${ctx.customer.riskScore.toFixed(2)}) — treat recovery contact carefully.`
    }

    const amountRupees = Math.round(ctx.payment.amount / 100)
    const ltvRupees = Math.round(ctx.customer.lifetimeValue / 100)
    const customerContext =
      `${ctx.customer.name}: ${ctx.customer.successfulPayments} successful / ${ctx.customer.failedPayments} failed payments historically, ` +
      `lifetime value ₹${ltvRupees.toLocaleString("en-IN")}, avg order ₹${Math.round(ctx.customer.avgOrderValue / 100).toLocaleString("en-IN")} ` +
      `(this order: ₹${amountRupees.toLocaleString("en-IN")}). ` +
      (ctx.customer.subscriptionActive ? `Active ${ctx.customer.subscriptionPlan ?? ""} subscription — retention-critical.` : "No active subscription.")

    // History pattern sharpens confidence when the merchant has seen this before.
    if (ctx.historyPattern.timesSeen >= 5 && ctx.historyPattern.timesRecovered > 0) {
      confidence = Math.min(0.97, confidence + 0.04)
    }

    return {
      failureCategory: ctx.failure.category,
      rootCause: d.rootCause,
      confidence: Number(confidence.toFixed(2)),
      severity: d.severity,
      recommendedAction: action,
      reasoning,
      customerContext,
      estimatedRecoveryProbability: Number(recovery.toFixed(2)),
    }
  }
}
