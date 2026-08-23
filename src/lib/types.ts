import { z } from "zod"

// ---------------------------------------------------------------------------
// Domain enums (validated strings — see schema.prisma note on SQLite)
// ---------------------------------------------------------------------------

export const FAILURE_CATEGORIES = [
  "TEMPORARY_DECLINE",
  "INSUFFICIENT_FUNDS",
  "EXPIRED_CARD",
  "NETWORK_FAILURE",
  "AUTHENTICATION_FAILURE",
  "ABANDONED_CHECKOUT",
  "REPEATED_FAILURES",
  "HIGH_VALUE_FAILURE",
  "SUBSCRIPTION_RENEWAL_FAILURE",
  "FRAUD_RISK",
] as const
export type FailureCategory = (typeof FAILURE_CATEGORIES)[number]

export const ACTION_TYPES = [
  "RETRY_PAYMENT",
  "REQUEST_CUSTOMER_RETRY",
  "SEND_PAYMENT_LINK",
  "SEND_REMINDER",
  "OFFER_ALTERNATE_METHOD",
  "ESCALATE_TO_MERCHANT",
  "DELAY_AND_RETRY",
  "DO_NOTHING",
] as const
export type ActionType = (typeof ACTION_TYPES)[number]

export const SEVERITIES = ["low", "medium", "high", "critical"] as const
export type Severity = (typeof SEVERITIES)[number]

export const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const
export type RiskLevel = (typeof RISK_LEVELS)[number]

export const PAYMENT_STATUSES = ["PENDING", "CAPTURED", "FAILED", "RECOVERED"] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

export const PAYMENT_METHODS = ["CARD", "UPI", "NETBANKING", "WALLET"] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const POLICY_DECISIONS = ["APPROVED", "REJECTED", "NEEDS_APPROVAL"] as const
export type PolicyDecision = (typeof POLICY_DECISIONS)[number]

export const ACTION_STATUSES = [
  "PENDING",
  "AWAITING_APPROVAL",
  "EXECUTED",
  "RECOVERED",
  "FAILED",
  "REJECTED",
  "SKIPPED",
] as const
export type ActionStatus = (typeof ACTION_STATUSES)[number]

// ---------------------------------------------------------------------------
// AI structured output — the contract every provider must satisfy
// ---------------------------------------------------------------------------

export const AIAnalysisResultSchema = z.object({
  failureCategory: z.enum(FAILURE_CATEGORIES),
  rootCause: z.string().min(1).max(600),
  confidence: z.number().min(0).max(1),
  severity: z.enum(SEVERITIES),
  recommendedAction: z.enum(ACTION_TYPES),
  reasoning: z.string().min(1).max(1200),
  customerContext: z.string().max(600),
  estimatedRecoveryProbability: z.number().min(0).max(1),
})
export type AIAnalysisResult = z.infer<typeof AIAnalysisResultSchema>

// Context handed to providers. Everything a diagnosis needs, nothing it doesn't.
export interface FailureContext {
  payment: {
    id: string
    orderId: string
    amount: number // paise
    currency: string
    method: string
    description?: string | null
    retryCount: number
    createdAt: string
  }
  customer: {
    name: string
    email: string
    successfulPayments: number
    failedPayments: number
    lifetimeValue: number // paise
    avgOrderValue: number // paise
    subscriptionActive: boolean
    subscriptionPlan?: string | null
    riskScore: number
  }
  failure: {
    category: FailureCategory
    rawCode?: string | null
    rawMessage?: string | null
    attemptNo: number
    latencyMs?: number | null
  }
  merchant: {
    name: string
  }
  // Aggregate patterns from this merchant's history of this failure kind
  historyPattern: {
    timesSeen: number
    timesRecovered: number
    bestAction?: ActionType | null
  }
}

export interface AIProviderResult {
  analysis: AIAnalysisResult
  provider: string
  model?: string
  latencyMs: number
  usedFallback: boolean
  rawOutput?: string
}

export interface AIProvider {
  readonly name: string
  readonly model: string
  analyzePaymentFailure(ctx: FailureContext): Promise<AIAnalysisResult>
}

// ---------------------------------------------------------------------------
// API payloads
// ---------------------------------------------------------------------------

export const SimulateFailureSchema = z.object({
  amount: z.number().int().min(10000, "Minimum ₹100").max(100000000, "Maximum ₹10,00,000").optional(),
  customerEmail: z.string().email().optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  failureCategory: z.enum(FAILURE_CATEGORIES).optional(),
  description: z.string().max(200).optional(),
})
export type SimulateFailureInput = z.infer<typeof SimulateFailureSchema>

export const GatewayEventSchema = z.object({
  event: z.string(),
  payload: z.object({
    orderId: z.string(),
    status: z.string(),
    gatewayCode: z.string().optional(),
    gatewayMessage: z.string().optional(),
    latencyMs: z.number().int().optional(),
  }),
})

// ---------------------------------------------------------------------------
// Money helpers — everything is stored in paise
// ---------------------------------------------------------------------------

export function rupees(paise: number): number {
  return paise / 100
}

export function formatINR(paise: number, options?: { compact?: boolean }): string {
  const value = paise / 100
  if (options?.compact && value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`
  if (options?.compact && value >= 100000) return `₹${(value / 100000).toFixed(2)} L`
  if (options?.compact && value >= 1000) return `₹${(value / 1000).toFixed(1)}K`
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value)
}
