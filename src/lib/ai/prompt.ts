import { AIAnalysisResultSchema } from "@/lib/types"
import type { FailureContext, AIAnalysisResult } from "@/lib/types"

/**
 * Shared prompt construction + robust response parsing for real LLM providers.
 * The AI output is treated as untrusted input: JSON is extracted defensively
 * and validated with Zod before anything downstream sees it.
 */

export function buildDiagnosisPrompt(ctx: FailureContext): { system: string; user: string } {
  const amount = (ctx.payment.amount / 100).toLocaleString("en-IN")
  const ltv = (ctx.customer.lifetimeValue / 100).toLocaleString("en-IN")
  const aov = Math.round(ctx.customer.avgOrderValue / 100).toLocaleString("en-IN")

  const system = `You are a payments-reliability analyst for an Indian payment gateway. Diagnose why a payment failed and recommend ONE recovery action.

Rules:
- recommendedAction MUST be exactly one of: RETRY_PAYMENT, REQUEST_CUSTOMER_RETRY, SEND_PAYMENT_LINK, SEND_REMINDER, OFFER_ALTERNATE_METHOD, ESCALATE_TO_MERCHANT, DELAY_AND_RETRY, DO_NOTHING.
- failureCategory MUST be exactly one of: TEMPORARY_DECLINE, INSUFFICIENT_FUNDS, EXPIRED_CARD, NETWORK_FAILURE, AUTHENTICATION_FAILURE, ABANDONED_CHECKOUT, REPEATED_FAILURES, HIGH_VALUE_FAILURE, SUBSCRIPTION_RENEWAL_FAILURE, FRAUD_RISK.
- Never recommend contacting the customer when the failure looks fraudulent — escalate instead.
- Prefer the least intrusive action that has a realistic recovery probability; repeated failures should push you toward changing the payment method rather than retrying the same rail.
- confidence and estimatedRecoveryProbability are numbers between 0 and 1.
- Respond with a SINGLE JSON object, no markdown fences, no prose.

JSON shape:
{"failureCategory":"...","rootCause":"...","confidence":0.87,"severity":"low|medium|high|critical","recommendedAction":"...","reasoning":"...","customerContext":"...","estimatedRecoveryProbability":0.72}`

  const user = `Payment:
- Order: ${ctx.payment.orderId}
- Amount: ₹${amount} ${ctx.payment.currency}
- Method: ${ctx.payment.method}
- Retry attempts so far: ${ctx.payment.retryCount}
- Created: ${ctx.payment.createdAt}
${ctx.payment.description ? `- Description: ${ctx.payment.description}` : ""}

Failure:
- Normalized category: ${ctx.failure.category}
- Raw gateway code: ${ctx.failure.rawCode ?? "n/a"}
- Raw gateway message: ${ctx.failure.rawMessage ?? "n/a"}
- Attempt number: ${ctx.failure.attemptNo}
- Gateway latency: ${ctx.failure.latencyMs ?? "n/a"} ms

Customer:
- Name: ${ctx.customer.name}
- Successful payments: ${ctx.customer.successfulPayments}, failed: ${ctx.customer.failedPayments}
- Lifetime value: ₹${ltv}, average order ₹${aov}
- Subscription: ${ctx.customer.subscriptionActive ? `active (${ctx.customer.subscriptionPlan ?? "plan n/a"})` : "none"}
- Risk score: ${ctx.customer.riskScore.toFixed(2)}

Merchant history with this failure type:
- Seen ${ctx.historyPattern.timesSeen} times, recovered ${ctx.historyPattern.timesRecovered} times
${ctx.historyPattern.bestAction ? `- Historically best action: ${ctx.historyPattern.bestAction}` : ""}

Diagnose this failure and recommend the single best recovery action.`

  return { system, user }
}

/** Extract the first JSON object from an LLM response that may contain fences or chatter. */
export function extractJSON(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : text
  const start = candidate.indexOf("{")
  const end = candidate.lastIndexOf("}")
  if (start === -1 || end === -1 || end <= start) throw new Error("No JSON object in response")
  return JSON.parse(candidate.slice(start, end + 1))
}

/** Validate AI output against the schema — invalid fields throw (caller falls back). */
export function parseAnalysis(text: string): AIAnalysisResult {
  return AIAnalysisResultSchema.parse(extractJSON(text))
}
