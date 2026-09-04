import { db } from "@/lib/db"
import { analyzeWithFallback } from "@/lib/ai"
import { evaluatePolicy } from "@/lib/engine/policy-engine"
import { executeSimulatedAction } from "@/lib/engine/simulator"
import { audit } from "@/lib/engine/ingestion"
import { ACTION_CATALOG } from "@/lib/engine/actions"
import { withPaymentLock } from "@/lib/engine/lock"
import type { FailureContext, FailureCategory, ActionType } from "@/lib/types"

/**
 * Recovery engine — orchestrates the full pipeline:
 * failure → AI diagnosis → policy validation → action execution → audit.
 *
 * Every step is persisted; the engine returns the complete picture so the
 * dashboard can render the decision trail immediately.
 */

export interface PipelineResult {
  paymentId: string
  analysisId: string
  actionId: string
  actionType: ActionType
  policyDecision: string
  policyReason: string
  status: string
  outcome?: string
  outcomeDetail?: string
  /** True when a concurrent/duplicate run found an open action and created nothing new. */
  alreadyProcessing?: boolean
}

export async function buildFailureContext(paymentId: string): Promise<FailureContext> {
  const payment = await db.payment.findUniqueOrThrow({
    where: { id: paymentId },
    include: {
      customer: true,
      failure: true,
      attempts: { orderBy: { attemptNo: "desc" }, take: 1 },
      merchant: true,
    },
  })
  if (!payment.failure) throw new Error("Payment has no failure event")

  // Aggregate pattern: how has this merchant historically recovered this category?
  const categoryPayments = await db.payment.findMany({
    where: {
      merchantId: payment.merchantId,
      status: "RECOVERED",
      failure: { category: payment.failure.category },
    },
    include: { actions: { where: { status: "RECOVERED" } } },
    take: 50,
  })
  const actionCounts = new Map<string, number>()
  for (const p of categoryPayments) for (const a of p.actions) {
    actionCounts.set(a.actionType, (actionCounts.get(a.actionType) ?? 0) + 1)
  }
  let bestAction: ActionType | null = null
  let bestCount = 0
  for (const [type, count] of actionCounts) if (count > bestCount) { bestAction = type as ActionType; bestCount = count }
  const timesSeen = await db.payment.count({
    where: { merchantId: payment.merchantId, failure: { category: payment.failure.category } },
  })

  return {
    payment: {
      id: payment.id,
      orderId: payment.orderId,
      amount: payment.amount,
      currency: payment.currency,
      method: payment.method,
      description: payment.description,
      retryCount: payment.retryCount,
      createdAt: payment.createdAt.toISOString(),
    },
    customer: {
      name: payment.customer.name,
      email: payment.customer.email,
      successfulPayments: payment.customer.successfulPayments,
      failedPayments: payment.customer.failedPayments,
      lifetimeValue: payment.customer.lifetimeValue,
      avgOrderValue: payment.customer.avgOrderValue,
      subscriptionActive: payment.customer.subscriptionActive,
      subscriptionPlan: payment.customer.subscriptionPlan,
      riskScore: payment.customer.riskScore,
    },
    failure: {
      category: payment.failure.category as FailureCategory,
      rawCode: payment.failure.rawCode,
      rawMessage: payment.failure.rawMessage,
      attemptNo: payment.attempts[0]?.attemptNo ?? payment.retryCount + 1,
      latencyMs: payment.attempts[0]?.latencyMs,
    },
    merchant: { name: payment.merchant.name },
    historyPattern: {
      timesSeen,
      timesRecovered: categoryPayments.length,
      bestAction,
    },
  }
}

function customerQuality(ctx: FailureContext): number {
  const total = ctx.customer.successfulPayments + ctx.customer.failedPayments
  const successRate = total > 0 ? ctx.customer.successfulPayments / total : 0.5
  const subBoost = ctx.customer.subscriptionActive ? 0.1 : 0
  return Math.max(0, Math.min(1, successRate * 0.85 + subBoost - ctx.customer.riskScore * 0.2))
}

/** Run the complete pipeline for one failed payment. */
export async function runRecoveryPipeline(paymentId: string): Promise<PipelineResult> {
  // Serialize per payment: two webhook deliveries of the same event must not
  // both create actions. The lock guarantees exactly one pipeline in flight;
  // the guard below re-checks state after acquiring it.
  return withPaymentLock(paymentId, async () => {
    const payment = await db.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: { actions: true, failure: true, customer: true },
    })
    if (payment.status !== "FAILED") throw new Error(`Payment is ${payment.status}, not FAILED — nothing to recover`)
    if (!payment.failure) throw new Error("Payment has no failure event")

    // Open-action guard: a payment with an undecided action (PENDING or
    // AWAITING_APPROVAL) is already being processed — re-entering would stack
    // a second action on top of the first. Return the existing one untouched.
    const open = payment.actions.find((a) => a.status === "PENDING" || a.status === "AWAITING_APPROVAL")
    if (open) {
      await audit(payment.merchantId, {
        paymentId,
        actor: "SYSTEM",
        event: "recovery.duplicate_suppressed",
        message:
          "Duplicate recovery processing detected — existing open action returned untouched, no new action created.",
        data: { actionId: open.id, actionType: open.actionType, status: open.status },
      })
      return {
        paymentId,
        analysisId: open.analysisId ?? "",
        actionId: open.id,
        actionType: open.actionType as ActionType,
        policyDecision: open.policyDecision,
        policyReason: open.policyReason,
        status: open.status,
        alreadyProcessing: true,
      }
    }

    const ctx = await buildFailureContext(paymentId)

  // --- Layer 1: AI diagnosis ---
  const result = await analyzeWithFallback(ctx)
  const analysis = await db.aIAnalysis.create({
    data: {
      paymentId,
      provider: result.provider,
      model: result.model,
      failureCategory: result.analysis.failureCategory,
      rootCause: result.analysis.rootCause,
      confidence: result.analysis.confidence,
      severity: result.analysis.severity,
      recommendedAction: result.analysis.recommendedAction,
      reasoning: result.analysis.reasoning,
      customerContext: result.analysis.customerContext,
      estimatedRecoveryProbability: result.analysis.estimatedRecoveryProbability,
      latencyMs: result.latencyMs,
      usedFallback: result.usedFallback,
      rawOutput: result.rawOutput ?? JSON.stringify(result.analysis),
    },
  })
  await audit(payment.merchantId, {
    paymentId,
    level: result.usedFallback ? "warn" : "info",
    actor: `AI:${result.provider}`,
    event: "ai.analysis.completed",
    message: `AI diagnosed ${result.analysis.failureCategory} (confidence ${result.analysis.confidence.toFixed(2)}), recommended ${result.analysis.recommendedAction}${result.usedFallback ? " [deterministic fallback used]" : ""}`,
    data: {
      analysisId: analysis.id,
      provider: result.provider,
      model: result.model,
      latencyMs: result.latencyMs,
      usedFallback: result.usedFallback,
      confidence: result.analysis.confidence,
      recommendedAction: result.analysis.recommendedAction,
    },
  })

  // --- Layer 2: deterministic policy ---
  const verdict = evaluatePolicy({
    actionType: result.analysis.recommendedAction,
    failureCategory: payment.failure.category as FailureCategory,
    amount: payment.amount,
    customerRiskScore: payment.customer.riskScore,
    history: payment.actions.map((a) => ({
      actionType: a.actionType as ActionType,
      status: a.status,
      executedAt: a.executedAt,
    })),
  })

  const action = await db.recoveryAction.create({
    data: {
      paymentId,
      analysisId: analysis.id,
      actionType: result.analysis.recommendedAction,
      policyDecision: verdict.decision,
      policyReason: verdict.reason,
      status:
        verdict.decision === "APPROVED"
          ? "PENDING"
          : verdict.decision === "NEEDS_APPROVAL"
            ? "AWAITING_APPROVAL"
            : "REJECTED",
      riskLevel: verdict.riskLevel,
      estimatedRecoveryProbability: verdict.sanctionedProbability,
    },
  })
  await audit(payment.merchantId, {
    paymentId,
    actor: "POLICY",
    event: `policy.${verdict.decision.toLowerCase()}`,
    level: verdict.decision === "REJECTED" ? "warn" : "info",
    message: `Policy ${verdict.decision.toLowerCase()} ${result.analysis.recommendedAction}: ${verdict.reason}`,
    data: {
      actionId: action.id,
      decision: verdict.decision,
      riskLevel: verdict.riskLevel,
      // Economic stopping rule numbers — persisted so every refusal/approval
      // carries its expected-value-vs-cost economics in the audit trail.
      economics: verdict.economics ?? null,
    },
  })

  // --- Layer 3: execution (only when sanctioned) ---
  if (verdict.decision === "APPROVED") {
    const exec = await executeSimulatedAction({
      actionId: action.id,
      actionType: result.analysis.recommendedAction,
      paymentId,
      merchantId: payment.merchantId,
      orderId: payment.orderId,
      amount: payment.amount,
      retryCount: payment.retryCount,
      estimatedProbability: Math.max(result.analysis.estimatedRecoveryProbability, ACTION_CATALOG[result.analysis.recommendedAction].efficacy * 0.8),
      customerQuality: customerQuality(ctx),
    })
    return {
      paymentId,
      analysisId: analysis.id,
      actionId: action.id,
      actionType: result.analysis.recommendedAction,
      policyDecision: verdict.decision,
      policyReason: verdict.reason,
      status: exec.outcome,
      outcome: exec.outcome,
      outcomeDetail: exec.detail,
    }
  }

  return {
    paymentId,
    analysisId: analysis.id,
    actionId: action.id,
    actionType: result.analysis.recommendedAction,
    policyDecision: verdict.decision,
    policyReason: verdict.reason,
    status: verdict.decision === "NEEDS_APPROVAL" ? "AWAITING_APPROVAL" : "REJECTED",
  }
  })
}

/** Merchant approves a gated action → execute it. */
export async function approveAndExecute(actionId: string, approvedBy = "merchant"): Promise<PipelineResult> {
  const action = await db.recoveryAction.findUniqueOrThrow({
    where: { id: actionId },
    include: { payment: { include: { customer: true, failure: true } }, analysis: true },
  })
  // Serialize per payment so two concurrent approvals cannot both execute the
  // same action (the status re-check below runs inside the lock).
  if (action.status !== "AWAITING_APPROVAL") throw new Error(`Action is ${action.status}, not AWAITING_APPROVAL`)
  if (!action.payment.failure) throw new Error("Payment has no failure event")

  return withPaymentLock(action.paymentId, async () => {
    const recheck = await db.recoveryAction.findUniqueOrThrow({ where: { id: actionId } })
    if (recheck.status !== "AWAITING_APPROVAL") {
      throw new Error(`Action is ${recheck.status}, not AWAITING_APPROVAL — it was already decided`)
    }

  await audit(action.payment.merchantId, {
    paymentId: action.paymentId,
    actor: "MERCHANT",
    event: "recovery.approved",
    message: `Merchant approved ${action.actionType} for ${action.payment.orderId}`,
    data: { actionId, approvedBy },
  })

  const ctx = await buildFailureContext(action.paymentId)
  const exec = await executeSimulatedAction({
    actionId,
    actionType: action.actionType as ActionType,
    paymentId: action.paymentId,
    merchantId: action.payment.merchantId,
    orderId: action.payment.orderId,
    amount: action.payment.amount,
    retryCount: action.payment.retryCount,
    estimatedProbability: action.estimatedRecoveryProbability,
    customerQuality: customerQuality(ctx),
    approvedBy,
  })

  return {
    paymentId: action.paymentId,
    analysisId: action.analysisId ?? "",
    actionId,
    actionType: action.actionType as ActionType,
    policyDecision: "APPROVED",
    policyReason: action.policyReason,
    status: exec.outcome,
    outcome: exec.outcome,
    outcomeDetail: exec.detail,
  }
  })
}

/** Merchant rejects a gated action. */
export async function rejectAction(actionId: string, reason?: string): Promise<void> {
  const action = await db.recoveryAction.findUniqueOrThrow({
    where: { id: actionId },
    include: { payment: true },
  })
  if (action.status !== "AWAITING_APPROVAL") throw new Error(`Action is ${action.status}, not AWAITING_APPROVAL`)

  return withPaymentLock(action.paymentId, async () => {
    const recheck = await db.recoveryAction.findUniqueOrThrow({ where: { id: actionId } })
    if (recheck.status !== "AWAITING_APPROVAL") {
      throw new Error(`Action is ${recheck.status}, not AWAITING_APPROVAL — it was already decided`)
    }
    await db.recoveryAction.update({
      where: { id: actionId },
      data: { status: "REJECTED", outcome: "FAILED", outcomeDetail: reason ?? "Rejected by merchant" },
    })
    await audit(action.payment.merchantId, {
      paymentId: action.paymentId,
      actor: "MERCHANT",
      event: "recovery.rejected",
      level: "warn",
      message: `Merchant rejected ${action.actionType} for ${action.payment.orderId}${reason ? `: ${reason}` : ""}`,
      data: { actionId, reason: reason ?? null },
    })
  })
}
