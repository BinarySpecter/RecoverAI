import type { AIProvider } from "@/lib/ai/provider"
import type { AIAnalysisResult, FailureCategory, FailureContext } from "@/lib/types"
import type { EvalPayment } from "@/lib/eval/world"
import { evaluatePolicy, type PolicyVerdict } from "@/lib/engine/policy-engine"
import { actionCostPaise } from "@/lib/engine/actions"
import { MockProvider } from "@/lib/ai/mock"
import {
  attemptPenalty,
  engageGroundTruth,
  qualityAdjusted,
  retryGroundTruth,
  worldDraw,
} from "@/lib/eval/outcomes"
import { hashSeed } from "@/lib/gateway/payment-gateway"

/**
 * COUNTERFACTUAL EVALUATION HARNESS — the Recovery Lab engine.
 *
 * Four strategies replay one fixed, seeded world of failed payments and the
 * evaluation measures what each would have recovered:
 *
 *   A. DO_NOTHING       — the baseline: zero intervention.
 *   B. BLIND_RETRY      — charge the card again, up to 3 times, no context,
 *                         no policy. Retries expired cards and fraud flags.
 *   C. GENERIC_DUNNING  — the standard 2-touch reminder/link sequence,
 *                         sent to everyone including fraud-flagged customers.
 *   D. RECOVERAI        — the real product: AI diagnosis → deterministic
 *                         policy (compatibility, fraud ceiling, effort caps,
 *                         economic stopping, approval gating) → execution.
 *
 * Decision-making (AI estimates + policy) and outcome generation (ground
 * truth model in outcomes.ts) use INDEPENDENT probability constants, so the
 * evaluation is not circular. Random draws are keyed to (payment, rail,
 * ordinal) — every strategy replays the same world.
 *
 * The harness is in-memory only: it writes nothing to the database. Live
 * dashboards, by contrast, reflect the DEMO SIMULATION, which runs the real
 * pipeline end-to-end. The two are deliberately separate.
 */

export type StrategyKey = "DO_NOTHING" | "BLIND_RETRY" | "GENERIC_DUNNING" | "RECOVERAI"

export const STRATEGY_ORDER: StrategyKey[] = ["DO_NOTHING", "BLIND_RETRY", "GENERIC_DUNNING", "RECOVERAI"]

export interface CategoryRecovery {
  category: FailureCategory
  count: number
  atRiskPaise: number
  recoveredPaise: number
}

export interface RefusalBucket {
  reason: string
  count: number
  amountPaise: number
}

export interface StrategyMetrics {
  key: StrategyKey
  label: string
  note: string
  totalAtRiskPaise: number
  grossRecoveredPaise: number
  recoveredCount: number
  /** amount-weighted recovery rate, 0..1 */
  recoveryRate: number
  /** per-payment recovery rate, 0..1 */
  countRecoveryRate: number
  /** gross minus the DO_NOTHING baseline gross (baseline is zero by construction). */
  incrementalPaise: number
  attempts: number
  contacts: number
  policyRefusals: number
  economicRefusals: number
  violations: number
  actionCostPaise: number
  netRecoveredPaise: number
  escalatedCount: number
  approvalGatedCount: number
  byCategory: CategoryRecovery[]
  refusalBreakdown: RefusalBucket[]
}

export interface EvaluationRun {
  meta: {
    seed: string
    worldSize: number
    completedAt: string
    elapsedMs: number
    reproducible: boolean
    provider: { requested: string; active: string; model: string; configured: boolean }
    diagnosisFallbacks: number
    llmPass: boolean
  }
  baseline: { totalAtRiskPaise: number; payments: number }
  strategies: StrategyMetrics[]
  llmAblation: LlmAblation | null
  methodology: string[]
}

export interface LlmAblation {
  provider: string
  model: string
  calls: number
  elapsedMs: number
  stochastic: boolean
  diagnosisFallbacks: number
  metrics: StrategyMetrics
  marginalVsMock: {
    grossRecoveredDeltaPaise: number
    netRecoveredDeltaPaise: number
    recoveryRateDelta: number
  }
}

export function customerQuality(p: EvalPayment): number {
  const subBoost = p.subscriptionActive ? 0.1 : 0
  return Math.max(0, Math.min(1, p.successRate * 0.85 + subBoost - p.riskScore * 0.2))
}

function historyPatternFor(category: FailureCategory): FailureContext["historyPattern"] {
  const timesSeen = 12 + (hashSeed(category) % 28)
  const timesRecovered = timesSeen >= 15 ? Math.max(1, Math.round(timesSeen * 0.4)) : 1
  return { timesSeen, timesRecovered, bestAction: null }
}

export function worldToContext(p: EvalPayment): FailureContext {
  return {
    payment: {
      id: p.id,
      orderId: `order_${p.id.replace(/[^a-z0-9]/gi, "").slice(-10)}`,
      amount: p.amount,
      currency: "INR",
      method: p.method,
      description: "Evaluation world payment",
      retryCount: p.retryCount,
      createdAt: "2026-01-15T10:00:00.000Z",
    },
    customer: {
      name: `Customer ${p.id}`,
      email: `${p.id}@eval.recoverai`,
      successfulPayments: Math.round(p.successRate * 12),
      failedPayments: Math.round((1 - p.successRate) * 12),
      lifetimeValue: p.lifetimeValue,
      avgOrderValue: p.avgOrderValue,
      subscriptionActive: p.subscriptionActive,
      subscriptionPlan: p.subscriptionActive ? "Eval Plan" : null,
      riskScore: p.riskScore,
    },
    failure: {
      category: p.category,
      rawCode: null,
      rawMessage: null,
      attemptNo: p.retryCount + 1,
      latencyMs: null,
    },
    merchant: { name: "Evaluation Merchant" },
    historyPattern: historyPatternFor(p.category),
  }
}

function categoryBuckets(world: EvalPayment[]): Map<FailureCategory, CategoryRecovery> {
  const map = new Map<FailureCategory, CategoryRecovery>()
  for (const p of world) {
    const e = map.get(p.category) ?? { category: p.category, count: 0, atRiskPaise: 0, recoveredPaise: 0 }
    e.count++
    e.atRiskPaise += p.amount
    map.set(p.category, e)
  }
  return map
}

function finishMetrics(
  key: StrategyKey,
  label: string,
  note: string,
  world: EvalPayment[],
  gross: number,
  recoveredCount: number,
  attempts: number,
  contacts: number,
  refusals: number,
  economicRefusals: number,
  violations: number,
  cost: number,
  escalated: number,
  gated: number,
  buckets: CategoryRecovery[],
  refusalBreakdown: RefusalBucket[],
  totalAtRisk: number,
): StrategyMetrics {
  return {
    key,
    label,
    note,
    totalAtRiskPaise: totalAtRisk,
    grossRecoveredPaise: gross,
    recoveredCount,
    recoveryRate: totalAtRisk > 0 ? gross / totalAtRisk : 0,
    countRecoveryRate: world.length > 0 ? recoveredCount / world.length : 0,
    // The DO_NOTHING baseline gross is zero by construction, so gross IS the
    // incremental recovery vs baseline for every strategy.
    incrementalPaise: gross,
    attempts,
    contacts,
    policyRefusals: refusals,
    economicRefusals,
    violations,
    actionCostPaise: cost,
    netRecoveredPaise: gross - cost,
    escalatedCount: escalated,
    approvalGatedCount: gated,
    byCategory: buckets,
    refusalBreakdown,
  }
}

// ---------------------------------------------------------------------------
// Strategy A — do nothing
// ---------------------------------------------------------------------------

function runDoNothing(world: EvalPayment[], totalAtRisk: number): StrategyMetrics {
  const buckets = [...categoryBuckets(world).values()]
  return finishMetrics(
    "DO_NOTHING",
    "Do nothing",
    "Zero intervention — the counterfactual baseline. Every failed payment stays failed.",
    world,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    buckets.map((b) => ({ ...b, recoveredPaise: 0 })),
    [],
    totalAtRisk,
  )
}

// ---------------------------------------------------------------------------
// Strategy B — blind retry
// ---------------------------------------------------------------------------

const BLIND_RETRY_MAX = 3
const BANNED_FOR_RETRY = new Set<FailureCategory>(["EXPIRED_CARD", "REPEATED_FAILURES", "FRAUD_RISK"])

function runBlindRetry(world: EvalPayment[], totalAtRisk: number): StrategyMetrics {
  let gross = 0
  let recoveredCount = 0
  let attempts = 0
  let violations = 0
  let cost = 0
  const buckets = categoryBuckets(world)

  for (const p of world) {
    let recovered = false
    for (let ordinal = 1; ordinal <= BLIND_RETRY_MAX && !recovered; ordinal++) {
      attempts++
      cost += actionCostPaise("RETRY_PAYMENT")
      if (BANNED_FOR_RETRY.has(p.category)) violations++ // structurally futile / unsafe
      const pSuccess = qualityAdjusted(retryGroundTruth(p.category), customerQuality(p)) - attemptPenalty(ordinal)
      if (pSuccess <= 0) continue
      if (worldDraw(p.id, "charge", ordinal) < pSuccess) {
        recovered = true
        gross += p.amount
        recoveredCount++
        const b = buckets.get(p.category)!
        b.recoveredPaise += p.amount
      }
    }
  }

  return finishMetrics(
    "BLIND_RETRY",
    "Blind retry",
    "Auto-charge the card up to 3× — no diagnosis, no policy. Retries expired cards and fraud flags.",
    world,
    gross,
    recoveredCount,
    attempts,
    0,
    0,
    0,
    violations,
    cost,
    0,
    0,
    [...buckets.values()],
    [],
    totalAtRisk,
  )
}

// ---------------------------------------------------------------------------
// Strategy C — generic dunning
// ---------------------------------------------------------------------------

function runGenericDunning(world: EvalPayment[], totalAtRisk: number): StrategyMetrics {
  let gross = 0
  let recoveredCount = 0
  let contacts = 0
  let violations = 0
  let cost = 0
  const buckets = categoryBuckets(world)

  for (const p of world) {
    // Standard 2-touch sequence: reminder, then payment link.
    let recovered = false
    let touches = 0
    const quality = customerQuality(p)
    const reminderP = qualityAdjusted(engageGroundTruth(p.category), quality) - attemptPenalty(2)

    touches = 1
    if (reminderP > 0 && worldDraw(p.id, "engage", 1) < reminderP) {
      recovered = true
    } else {
      touches = 2
      const linkP = qualityAdjusted(engageGroundTruth(p.category), quality) - attemptPenalty(3)
      if (linkP > 0 && worldDraw(p.id, "engage", 2) < linkP) recovered = true
    }
    contacts += touches
    if (p.category === "FRAUD_RISK") violations += touches // dunning contacts fraud-flagged customers
    cost += touches === 1 ? actionCostPaise("SEND_REMINDER") : actionCostPaise("SEND_REMINDER") + actionCostPaise("SEND_PAYMENT_LINK")

    if (recovered) {
      gross += p.amount
      recoveredCount++
      const b = buckets.get(p.category)!
      b.recoveredPaise += p.amount
    }
  }

  return finishMetrics(
    "GENERIC_DUNNING",
    "Generic dunning",
    "Standard reminder + payment-link sequence sent to every failed payment — policy-blind outreach.",
    world,
    gross,
    recoveredCount,
    0,
    contacts,
    0,
    0,
    violations,
    cost,
    0,
    0,
    [...buckets.values()],
    [],
    totalAtRisk,
  )
}

// ---------------------------------------------------------------------------
// Strategy D — RecoverAI (the product): AI diagnosis → policy → execution
// ---------------------------------------------------------------------------

export interface RecoverAIResult {
  metrics: StrategyMetrics
  diagnosisFallbacks: number
}

function classifyRefusal(verdict: PolicyVerdict, actionType: string): { reason: string; economic: boolean } {
  const r = verdict.reason
  if (r.startsWith("Economically refused")) return { reason: "economic", economic: true }
  if (/risk score|ceiling/i.test(r)) return { reason: "customer-contact-ceiling", economic: false }
  if (/not permitted for/i.test(r)) return { reason: "banned-combination", economic: false }
  if (/duplicates|already executed|cooldown|cap/i.test(r)) return { reason: "policy-guard", economic: false }
  if (actionType === "ESCALATE_TO_MERCHANT") return { reason: "escalated", economic: false }
  return { reason: "other", economic: false }
}

export async function runRecoverAIStrategy(
  world: EvalPayment[],
  provider: AIProvider,
  totalAtRisk: number,
): Promise<RecoverAIResult> {
  let gross = 0
  let recoveredCount = 0
  let attempts = 0
  let contacts = 0
  let refusals = 0
  let economicRefusals = 0
  const violations = 0
  let cost = 0
  let escalated = 0
  let gated = 0
  let fallbacks = 0
  const buckets = categoryBuckets(world)
  const refusalMap = new Map<string, RefusalBucket>()
  const mock = new MockProvider()

  for (const p of world) {
    const ctx = worldToContext(p)
    let analysis: AIAnalysisResult
    try {
      analysis = await provider.analyzePaymentFailure(ctx)
    } catch {
      fallbacks++
      analysis = await mock.analyzePaymentFailure(ctx)
    }

    const verdict = evaluatePolicy({
      actionType: analysis.recommendedAction,
      failureCategory: p.category,
      amount: p.amount,
      customerRiskScore: p.riskScore,
      history: [],
      now: new Date("2026-01-15T12:00:00Z"),
    })

    const trackRefusal = (reason: string, economic: boolean) => {
      refusals++
      if (economic) economicRefusals++
      const b = refusalMap.get(reason) ?? { reason, count: 0, amountPaise: 0 }
      b.count++
      b.amountPaise += p.amount
      refusalMap.set(reason, b)
    }

    if (verdict.decision === "NEEDS_APPROVAL") {
      gated++
      const b = refusalMap.get("gated") ?? { reason: "gated", count: 0, amountPaise: 0 }
      b.count++
      b.amountPaise += p.amount
      refusalMap.set("gated", b)
      continue
    }
    if (verdict.decision === "REJECTED") {
      const { reason, economic } = classifyRefusal(verdict, analysis.recommendedAction)
      trackRefusal(reason, economic)
      continue
    }

    // APPROVED — execute within the evaluation window.
    const type = analysis.recommendedAction
    cost += actionCostPaise(type)
    let recovered = false
    const quality = customerQuality(p)

    if (type === "RETRY_PAYMENT" || type === "DELAY_AND_RETRY") {
      attempts++
      const pSuccess =
        qualityAdjusted(retryGroundTruth(p.category), quality) - attemptPenalty(1 + p.retryCount)
      if (pSuccess > 0 && worldDraw(p.id, "charge", 1) < pSuccess) recovered = true
    } else if (type === "REQUEST_CUSTOMER_RETRY" || type === "SEND_PAYMENT_LINK" || type === "SEND_REMINDER" || type === "OFFER_ALTERNATE_METHOD") {
      contacts++
      const pSuccess = qualityAdjusted(engageGroundTruth(p.category), quality) - attemptPenalty(1 + p.retryCount)
      if (pSuccess > 0 && worldDraw(p.id, "engage", 1) < pSuccess) recovered = true
    } else if (type === "ESCALATE_TO_MERCHANT") {
      escalated++
      trackRefusal("escalated", false)
      continue
    } // DO_NOTHING → closed, no recovery, tracked below

    if (recovered) {
      gross += p.amount
      recoveredCount++
      const b = buckets.get(p.category)!
      b.recoveredPaise += p.amount
    }
  }

  const refusalBreakdown = [...refusalMap.values()].sort((a, b) => b.amountPaise - a.amountPaise)
  const metrics = finishMetrics(
    "RECOVERAI",
    "RecoverAI",
    "AI diagnosis → deterministic policy (physics, fraud ceiling, effort caps, economic stopping, approval gating) → sanctioned execution.",
    world,
    gross,
    recoveredCount,
    attempts,
    contacts,
    refusals,
    economicRefusals,
    violations,
    cost,
    escalated,
    gated,
    [...buckets.values()],
    refusalBreakdown,
    totalAtRisk,
  )
  return { metrics, diagnosisFallbacks: fallbacks }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function resolveEvalProvider(): Promise<{ requested: string; active: string; model: string; configured: boolean }> {
  const requested = process.env.AI_PROVIDER ?? "mock"
  const key = requested === "gemini" ? process.env.GEMINI_API_KEY : requested === "deepseek" ? process.env.DEEPSEEK_API_KEY : "mock"
  const configured = requested === "mock" ? true : Boolean(key)
  const active = configured ? requested : "mock"
  const model = active === "mock" ? "deterministic-rules-v1" : active === "gemini" ? "gemini-2.0-flash" : "deepseek-chat"
  return { requested, active, model, configured }
}

export async function runEvaluation(opts: {
  world: EvalPayment[]
  seed: string
  withLLM?: boolean
  provider?: AIProvider
}): Promise<EvaluationRun> {
  const started = Date.now()
  const world = opts.world
  const totalAtRisk = world.reduce((s, p) => s + p.amount, 0)

  const mock = new MockProvider()
  const doNothing = runDoNothing(world, totalAtRisk)
  const blindRetry = runBlindRetry(world, totalAtRisk)
  const dunning = runGenericDunning(world, totalAtRisk)
  const { metrics: recoverai, diagnosisFallbacks } = await runRecoverAIStrategy(world, mock, totalAtRisk)

  const providerInfo = await resolveEvalProvider()

  let llmAblation: LlmAblation | null = null
  if (opts.withLLM) {
    const requested = process.env.AI_PROVIDER ?? "mock"
    if (requested === "mock" || !providerInfo.configured) {
      throw new Error(
        `No LLM provider configured — set AI_PROVIDER=gemini|deepseek plus its API key to run the LLM pass (active: ${providerInfo.requested})`,
      )
    }
    const llmStarted = Date.now()
    // Designated real provider; the harness falls back per-payment exactly
    // like production's analyzeWithFallback if a call fails.
    const real = opts.provider ??
      (await import("@/lib/ai/index")).resolveProvider().provider
    const { metrics: llmMetrics, diagnosisFallbacks: llmFallbacks } = await runRecoverAIStrategy(world, real, totalAtRisk)
    llmAblation = {
      provider: real.name,
      model: real.model,
      calls: world.length,
      elapsedMs: Date.now() - llmStarted,
      stochastic: true,
      diagnosisFallbacks: llmFallbacks,
      metrics: llmMetrics,
      marginalVsMock: {
        grossRecoveredDeltaPaise: llmMetrics.grossRecoveredPaise - recoverai.grossRecoveredPaise,
        netRecoveredDeltaPaise: llmMetrics.netRecoveredPaise - recoverai.netRecoveredPaise,
        recoveryRateDelta: llmMetrics.recoveryRate - recoverai.recoveryRate,
      },
    }
  }

  return {
    meta: {
      seed: opts.seed,
      worldSize: world.length,
      completedAt: new Date().toISOString(),
      elapsedMs: Date.now() - started,
      reproducible: true,
      provider: { ...providerInfo },
      diagnosisFallbacks,
      llmPass: opts.withLLM === true,
    },
    baseline: { totalAtRiskPaise: totalAtRisk, payments: world.length },
    strategies: [doNothing, blindRetry, dunning, recoverai],
    llmAblation,
    methodology: [
      "Fixed seed world: every strategy replays the identical population of failed payments (same ids, amounts, customers, failure categories).",
      "Shared outcome draws: recovery randomness is keyed to (payment, intervention rail, attempt ordinal) — not to strategy — so differences between strategies are attributable to the strategy, not the world.",
      "Independent outcome model: decision-making uses AI estimates + catalog efficacies; outcome resolution uses the separate ground-truth model in lib/eval/outcomes.ts. The evaluation is therefore not circular.",
      "Merchant approval is NOT simulated inside the evaluation window — policy-gated (high-value) actions stay at risk, exactly as they would pending a human decision.",
      "No causal claims: this is an offline counterfactual comparison on synthetic data, not a measurement of production revenue.",
    ],
  }
}

/** Convenience: build the default world and run the canonical mock evaluation. */
export async function runDefaultEvaluation(worldSize = 500, seed = "recoverai-eval-world-v1") {
  const { generateWorld } = await import("@/lib/eval/world")
  return runEvaluation({ world: generateWorld(worldSize, seed), seed })
}