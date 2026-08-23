import { db } from "@/lib/db"
import { audit } from "@/lib/engine/ingestion"
import { ACTION_CATALOG } from "@/lib/engine/actions"
import { hashSeed, seededRandom, simulateCharge } from "@/lib/gateway/payment-gateway"
import type { ActionType } from "@/lib/types"

/**
 * Deterministic outcome simulator. Executes a policy-sanctioned action
 * against the (simulated) gateway and records the result. Real integrations
 * replace the simulation branches with actual API calls; the audit trail and
 * state transitions stay identical.
 */

export interface ExecutionResult {
  outcome: "RECOVERED" | "FAILED" | "PENDING_REVIEW" | "SKIPPED"
  detail: string
}

export async function executeSimulatedAction(input: {
  actionId: string
  actionType: ActionType
  paymentId: string
  merchantId: string
  orderId: string
  amount: number
  retryCount: number
  estimatedProbability: number
  customerQuality: number
  approvedBy?: string | null
}): Promise<ExecutionResult> {
  const def = ACTION_CATALOG[input.actionType]
  const now = new Date()
  let result: ExecutionResult

  switch (input.actionType) {
    case "RETRY_PAYMENT":
    case "DELAY_AND_RETRY": {
      const lastAttempt = await db.paymentAttempt.findFirst({
        where: { paymentId: input.paymentId },
        orderBy: { attemptNo: "desc" },
      })
      const attemptNo = Math.max(lastAttempt?.attemptNo ?? 0, input.retryCount) + 1
      const charge = simulateCharge({
        paymentId: input.paymentId,
        attemptNo,
        baseProbability: def.efficacy,
        customerQuality: input.customerQuality,
      })
      await db.paymentAttempt.create({
        data: {
          paymentId: input.paymentId,
          attemptNo,
          status: charge.ok ? "CAPTURED" : "FAILED",
          gatewayCode: charge.gatewayCode,
          gatewayMessage: charge.gatewayMessage,
          latencyMs: charge.latencyMs,
        },
      })
      await db.payment.update({
        where: { id: input.paymentId },
        data: { retryCount: attemptNo },
      })
      result = charge.ok
        ? { outcome: "RECOVERED", detail: `Retry attempt #${attemptNo} captured (${charge.latencyMs}ms, ref ${charge.paymentRef}).` }
        : { outcome: "FAILED", detail: `Retry attempt #${attemptNo} failed: ${charge.gatewayMessage} (${charge.gatewayCode}).` }
      break
    }
    case "REQUEST_CUSTOMER_RETRY":
    case "SEND_PAYMENT_LINK":
    case "SEND_REMINDER":
    case "OFFER_ALTERNATE_METHOD": {
      // Customer-engagement simulation: does the customer respond and complete payment?
      // Seeded on payment+action (not the action row id) so reseeds replay identically.
      const rand = seededRandom(hashSeed(`${input.paymentId}:${input.actionType}:engage`))()
      const responded = rand < Math.min(0.9, Math.max(0.05, input.estimatedProbability))
      result = responded
        ? { outcome: "RECOVERED", detail: `Customer responded to "${def.label}" and completed the payment.` }
        : { outcome: "FAILED", detail: `Customer did not respond to "${def.label}" within the action window.` }
      break
    }
    case "ESCALATE_TO_MERCHANT": {
      result = { outcome: "PENDING_REVIEW", detail: "Case queued for merchant review — no automated customer contact was made." }
      break
    }
    case "DO_NOTHING": {
      result = { outcome: "SKIPPED", detail: "Opportunity closed without action — expected recovery value did not justify intervention." }
      break
    }
    default:
      result = { outcome: "FAILED", detail: "Unknown action type." }
  }

  // Persist action outcome.
  await db.recoveryAction.update({
    where: { id: input.actionId },
    data: {
      status: result.outcome === "RECOVERED" ? "RECOVERED" : result.outcome === "PENDING_REVIEW" ? "EXECUTED" : result.outcome === "SKIPPED" ? "SKIPPED" : result.outcome === "FAILED" ? "FAILED" : "EXECUTED",
      executedAt: now,
      completedAt: now,
      outcome: result.outcome,
      outcomeDetail: result.detail,
      ...(input.approvedBy ? { approvedBy: input.approvedBy } : {}),
    },
  })

  // Payment + customer state transitions on success.
  if (result.outcome === "RECOVERED") {
    const payment = await db.payment.update({
      where: { id: input.paymentId },
      data: { status: "RECOVERED", recoveredAt: now },
      select: { customerId: true },
    })
    await db.customer.update({
      where: { id: payment.customerId },
      data: { successfulPayments: { increment: 1 } },
    })
  }

  await audit(input.merchantId, {
    paymentId: input.paymentId,
    actor: "SYSTEM",
    event: `recovery.${result.outcome.toLowerCase()}`,
    message: `${def.label}: ${result.detail}`,
    data: { actionId: input.actionId, actionType: input.actionType, outcome: result.outcome },
  })

  return result
}
