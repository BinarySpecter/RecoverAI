import type { ActionType, FailureCategory, RiskLevel } from "@/lib/types"

/**
 * The bounded action catalog. The LLM may only recommend actions from this
 * set; each carries the constraints the policy engine enforces.
 */
export interface ActionDefinition {
  type: ActionType
  label: string
  description: string
  riskLevel: RiskLevel
  cooldownHours: number // minimum gap before the same action may repeat on one payment
  approvalThreshold: number // paise; at/above this amount the action needs merchant approval
  customerFacing: boolean // does it contact/charge the customer?
  efficacy: number // base recovery probability used by the outcome simulator
}

export const ACTION_CATALOG: Record<ActionType, ActionDefinition> = {
  RETRY_PAYMENT: {
    type: "RETRY_PAYMENT",
    label: "Retry payment now",
    description: "Automatically re-attempt the charge on the same instrument immediately.",
    riskLevel: "MEDIUM",
    cooldownHours: 1,
    approvalThreshold: 5_000_000, // ₹50,000
    customerFacing: true,
    efficacy: 0.72,
  },
  DELAY_AND_RETRY: {
    type: "DELAY_AND_RETRY",
    label: "Scheduled delayed retry",
    description: "Automatically re-attempt the charge after a short delay (issuer soft-declines often clear).",
    riskLevel: "MEDIUM",
    cooldownHours: 4,
    approvalThreshold: 5_000_000,
    customerFacing: true,
    efficacy: 0.66,
  },
  REQUEST_CUSTOMER_RETRY: {
    type: "REQUEST_CUSTOMER_RETRY",
    label: "Ask customer to retry",
    description: "Send a contextual message asking the customer to retry the payment themselves.",
    riskLevel: "LOW",
    cooldownHours: 12,
    approvalThreshold: 10_000_000, // ₹1,00,000
    customerFacing: true,
    efficacy: 0.55,
  },
  SEND_PAYMENT_LINK: {
    type: "SEND_PAYMENT_LINK",
    label: "Send payment link",
    description: "Email/SMS a one-tap payment link for the exact amount and order.",
    riskLevel: "LOW",
    cooldownHours: 24,
    approvalThreshold: 10_000_000,
    customerFacing: true,
    efficacy: 0.5,
  },
  SEND_REMINDER: {
    type: "SEND_REMINDER",
    label: "Send payment reminder",
    description: "Send a gentle reminder that the payment is pending.",
    riskLevel: "LOW",
    cooldownHours: 24,
    approvalThreshold: 10_000_000,
    customerFacing: true,
    efficacy: 0.45,
  },
  OFFER_ALTERNATE_METHOD: {
    type: "OFFER_ALTERNATE_METHOD",
    label: "Offer alternate payment method",
    description: "Guide the customer to complete payment via UPI, another card, or netbanking.",
    riskLevel: "LOW",
    cooldownHours: 24,
    approvalThreshold: 10_000_000,
    customerFacing: true,
    efficacy: 0.48,
  },
  ESCALATE_TO_MERCHANT: {
    type: "ESCALATE_TO_MERCHANT",
    label: "Escalate to merchant",
    description: "Queue the case for human merchant review — no automated customer contact.",
    riskLevel: "HIGH",
    cooldownHours: 1,
    approvalThreshold: Number.MAX_SAFE_INTEGER, // escalation itself never needs approval
    customerFacing: false,
    efficacy: 0.3,
  },
  DO_NOTHING: {
    type: "DO_NOTHING",
    label: "Take no action",
    description: "Close the opportunity — recovery cost/risk outweighs the expected value.",
    riskLevel: "LOW",
    cooldownHours: 0,
    approvalThreshold: Number.MAX_SAFE_INTEGER,
    customerFacing: false,
    efficacy: 0,
  },
}

/**
 * Hard category/action incompatibilities. These are physics, not judgement:
 * an expired card will fail every retry; a fraud flag must never trigger
 * automated customer contact or charging.
 */
const BANNED_COMBOS: Partial<Record<FailureCategory, ActionType[]>> = {
  EXPIRED_CARD: ["RETRY_PAYMENT", "DELAY_AND_RETRY"],
  REPEATED_FAILURES: ["RETRY_PAYMENT", "DELAY_AND_RETRY"],
  FRAUD_RISK: [
    "RETRY_PAYMENT",
    "DELAY_AND_RETRY",
    "REQUEST_CUSTOMER_RETRY",
    "SEND_PAYMENT_LINK",
    "SEND_REMINDER",
    "OFFER_ALTERNATE_METHOD",
  ],
}

export function isCombinationBanned(category: FailureCategory, action: ActionType): boolean {
  return (BANNED_COMBOS[category] ?? []).includes(action)
}

export const MAX_ACTIONS_PER_PAYMENT = 4

/**
 * Per-action operational cost (paise). Demo cost model used by the economic
 * stopping rule: automated charge retries are cheap; engineered customer
 * engagement (links, reminders, alternate-method guidance) costs real
 * outbound infrastructure and support time.
 */
export const ACTION_COSTS_PAISE: Record<ActionType, number> = {
  RETRY_PAYMENT: 150, // ₹1.50 per gateway charge attempt
  DELAY_AND_RETRY: 200, // ₹2.00 (scheduling + charge)
  REQUEST_CUSTOMER_RETRY: 50, // ₹0.50 transactional message
  SEND_PAYMENT_LINK: 1500, // ₹15.00 link generation + SMS/email
  SEND_REMINDER: 1000, // ₹10.00 reminder message
  OFFER_ALTERNATE_METHOD: 1200, // ₹12.00 guided flow + message
  ESCALATE_TO_MERCHANT: 200, // ₹2.00 queue + routing
  DO_NOTHING: 0,
}

export function actionCostPaise(actionType: ActionType): number {
  return ACTION_COSTS_PAISE[actionType] ?? 0
}
