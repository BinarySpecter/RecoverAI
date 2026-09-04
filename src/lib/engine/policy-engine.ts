import { ACTION_CATALOG, MAX_ACTIONS_PER_PAYMENT, isCombinationBanned, actionCostPaise } from "@/lib/engine/actions"
import type { ActionType, FailureCategory, PolicyDecision, RiskLevel } from "@/lib/types"

/**
 * Deterministic policy engine — the authorization layer.
 *
 * The AI recommends an action; THIS code decides whether it may run. The
 * engine is a pure function of (request, history) so it is fully testable
 * and cannot be talked around by LLM output.
 */

/** Customer-contact is blocked outright at/above this risk score (fraud guard). */
export const CUSTOMER_CONTACT_RISK_CEILING = 0.8

export interface PolicyRequest {
  actionType: ActionType
  failureCategory: FailureCategory
  amount: number // paise
  customerRiskScore: number
  history: {
    // prior actions on this payment
    actionType: ActionType
    status: string // EXECUTED | RECOVERED | FAILED | REJECTED | SKIPPED | AWAITING_APPROVAL...
    executedAt: Date | null
  }[]
  now?: Date
}

export interface PolicyVerdict {
  decision: PolicyDecision
  reason: string
  riskLevel: RiskLevel
  /** Effective probability the policy expects for this action (AI estimate is advisory only). */
  sanctionedProbability: number
  /** The economic stopping rule's numbers, when computed for this request. */
  economics?: {
    expectedRecoveryValuePaise: number
    actionCostPaise: number
    /** Deterministic, LLM-independent probability used for the comparison. */
    expectedRecoveryProbability: number
    refused: boolean
  }
}

export function evaluatePolicy(req: PolicyRequest): PolicyVerdict {
  const def = ACTION_CATALOG[req.actionType]
  const now = req.now ?? new Date()
  const HISTORY_IGNORED = new Set(["REJECTED", "SKIPPED", "PENDING"])

  if (!def) {
    return reject("Unknown action type — not in the bounded action catalog.", "HIGH")
  }

  // 1. Hard physics: category/action compatibility.
  if (isCombinationBanned(req.failureCategory, req.actionType)) {
    return reject(
      `${req.actionType} is not permitted for ${req.failureCategory} failures — this combination is structurally futile or unsafe.`,
      def.riskLevel === "LOW" ? "MEDIUM" : def.riskLevel,
    )
  }

  // 2. Fraud guard: nothing customer-facing when risk score is severe.
  if (def.customerFacing && req.customerRiskScore >= CUSTOMER_CONTACT_RISK_CEILING) {
    return reject(
      `Customer risk score ${req.customerRiskScore.toFixed(2)} exceeds the 0.8 customer-contact ceiling — escalation required instead.`,
      "HIGH",
    )
  }

  // 3. Effort cap: don't hound one payment forever.
  const counted = req.history.filter((h) => !HISTORY_IGNORED.has(h.status))
  if (counted.length >= MAX_ACTIONS_PER_PAYMENT) {
    return reject(
      `Payment already consumed ${counted.length} recovery actions (cap ${MAX_ACTIONS_PER_PAYMENT}) — stop to protect customer experience.`,
      "LOW",
    )
  }

  // 4. Cooldown: identical action repeated too soon.
  const lastSame = counted
    .filter((h) => h.actionType === req.actionType && h.executedAt)
    .sort((a, b) => (b.executedAt as Date).getTime() - (a.executedAt as Date).getTime())[0]
  if (lastSame?.executedAt) {
    const elapsedHours = (now.getTime() - lastSame.executedAt.getTime()) / 3_600_000
    if (elapsedHours < def.cooldownHours) {
      return reject(
        `${req.actionType} cooldown is ${def.cooldownHours}h; only ${elapsedHours.toFixed(1)}h have elapsed since the last attempt.`,
        def.riskLevel,
      )
    }
  }

  // 5. Duplicate: identical action already succeeded/recovered the payment.
  if (req.history.some((h) => h.actionType === req.actionType && (h.status === "RECOVERED" || h.status === "EXECUTED"))) {
    if (def.type !== "ESCALATE_TO_MERCHANT") {
      return reject(
        `${req.actionType} was already executed on this payment — duplicates are suppressed.`,
        def.riskLevel,
      )
    }
  }

  // 6. Economic stopping rule: expected recovery value minus action cost.
  //    If expected value <= cost the action is refused outright — no LLM
  //    estimate is consulted, only the deterministic catalog probability and
  //    the fixed action cost. This is the "know when to stop" guardrail.
  if (def.type !== "ESCALATE_TO_MERCHANT" && def.type !== "DO_NOTHING") {
    const cost = actionCostPaise(req.actionType)
    const expectedRecoveryProbability = def.efficacy
    const expectedValuePaise = Math.round(req.amount * expectedRecoveryProbability)
    const economics = {
      expectedRecoveryValuePaise: expectedValuePaise,
      actionCostPaise: cost,
      expectedRecoveryProbability,
      refused: expectedValuePaise <= cost,
    }
    if (expectedValuePaise <= cost) {
      return {
        decision: "REJECTED" as const,
        reason:
          `Economically refused: expected recovery value ₹${Math.round(expectedValuePaise / 100).toLocaleString("en-IN")} ` +
          `(₹${Math.round(req.amount / 100).toLocaleString("en-IN")} × ${(expectedRecoveryProbability * 100).toFixed(0)}% base efficacy) ` +
          `does not exceed the ${def.label.toLowerCase()} action cost of ` +
          `₹${(cost / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })} — the stopping rule refuses uneconomic actions.`,
        riskLevel: def.riskLevel,
        sanctionedProbability: 0,
        economics,
      }
    }
    // Record the economics on approved/gated verdicts so the audit trail and
    // detail pages can show expected value vs cost for every action.
    if (req.amount >= def.approvalThreshold) {
      return {
        decision: "NEEDS_APPROVAL",
        reason: `Amount ₹${Math.round(req.amount / 100).toLocaleString("en-IN")} is at/above the ₹${Math.round(def.approvalThreshold / 100).toLocaleString("en-IN")} approval threshold for ${req.actionType} — merchant sign-off required before execution.`,
        riskLevel: "HIGH",
        sanctionedProbability: def.efficacy,
        economics,
      }
    }
    return {
      decision: "APPROVED",
      reason: `Action is eligible: compatible with ${req.failureCategory}, within cooldown window, under the approval threshold, economically justified (expected value ₹${Math.round(expectedValuePaise / 100).toLocaleString("en-IN")} > cost ₹${(cost / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}), and below the customer-contact risk ceiling.`,
      riskLevel: def.riskLevel,
      sanctionedProbability: def.efficacy,
      economics,
    }
  }

  // 6b. Escalation and do-nothing are never economically refused — escalation
  //     routes to a human without contacting the customer; do-nothing is the
  //     terminal close.
  // 7. Human-in-the-loop gate for high amounts.
  if (req.amount >= def.approvalThreshold) {
    return {
      decision: "NEEDS_APPROVAL",
      reason: `Amount ₹${Math.round(req.amount / 100).toLocaleString("en-IN")} is at/above the ₹${Math.round(def.approvalThreshold / 100).toLocaleString("en-IN")} approval threshold for ${req.actionType} — merchant sign-off required before execution.`,
      riskLevel: "HIGH",
      sanctionedProbability: def.efficacy,
    }
  }

  return {
    decision: "APPROVED",
    reason: `Action is eligible: compatible with ${req.failureCategory}, within cooldown window, under the approval threshold, and below the customer-contact risk ceiling.`,
    riskLevel: def.riskLevel,
    sanctionedProbability: def.efficacy,
  }
}

function reject(reason: string, riskLevel: RiskLevel): PolicyVerdict {
  return { decision: "REJECTED", reason, riskLevel, sanctionedProbability: 0 }
}
