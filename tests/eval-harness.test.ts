import { describe, it, expect } from "vitest"
import { generateWorld } from "@/lib/eval/world"
import { runEvaluation, runRecoverAIStrategy, STRATEGY_ORDER } from "@/lib/eval/harness"
import { MockProvider } from "@/lib/ai/mock"

const SEED = "recoverai-eval-world-v1"

describe("evaluation world — fixed seed, identical population", () => {
  it("generates the same world from the same seed", () => {
    expect(generateWorld(200, SEED)).toEqual(generateWorld(200, SEED))
  })

  it("generates a different world from a different seed", () => {
    expect(generateWorld(200, SEED)).not.toEqual(generateWorld(200, "other-seed"))
  })

  it("covers failure categories, risk profiles and amount tiers", () => {
    const world = generateWorld(500, SEED)
    expect(world.length).toBe(500)
    expect(new Set(world.map((p) => p.category)).size).toBeGreaterThanOrEqual(8)
    expect(world.some((p) => p.riskScore > 0.8)).toBe(true)
    expect(world.some((p) => p.amount <= 4000)).toBe(true) // micro tier present
    expect(world.some((p) => p.amount >= 5_000_000)).toBe(true) // approval-gated tier present
  })
})

describe("counterfactual harness — same world, four strategies, honest baselines", () => {
  it("replays the exact same world for every strategy (identical at-risk totals)", async () => {
    const world = generateWorld(300, SEED)
    const run = await runEvaluation({ world, seed: SEED })

    expect(run.strategies).toHaveLength(4)
    expect(run.strategies.map((s) => s.key)).toEqual(STRATEGY_ORDER)
    for (const s of run.strategies) {
      expect(s.totalAtRiskPaise).toBe(run.baseline.totalAtRiskPaise)
    }
  })

  it("is reproducible: identical metrics on re-run", async () => {
    const world = generateWorld(300, SEED)
    const a = await runEvaluation({ world, seed: SEED })
    const b = await runEvaluation({ world, seed: SEED })
    for (let i = 0; i < 4; i++) {
      expect(a.strategies[i].grossRecoveredPaise).toBe(b.strategies[i].grossRecoveredPaise)
      expect(a.strategies[i].netRecoveredPaise).toBe(b.strategies[i].netRecoveredPaise)
      expect(a.strategies[i].attempts).toBe(b.strategies[i].attempts)
      expect(a.strategies[i].policyRefusals).toBe(b.strategies[i].policyRefusals)
    }
  })

  it("do-nothing recovers nothing — the honest zero baseline", async () => {
    const world = generateWorld(300, SEED)
    const run = await runEvaluation({ world, seed: SEED })
    const base = run.strategies[0]
    expect(base.key).toBe("DO_NOTHING")
    expect(base.grossRecoveredPaise).toBe(0)
    expect(base.attempts).toBe(0)
    expect(base.contacts).toBe(0)
  })

  it("blind retry attempts charges even where they are structurally futile, recording violations", async () => {
    const world = generateWorld(400, SEED)
    const run = await runEvaluation({ world, seed: SEED })
    const blind = run.strategies.find((s) => s.key === "BLIND_RETRY")!
    expect(blind.attempts).toBeGreaterThan(0)
    // The world contains expired cards / repeated failures / fraud flags;
    // blind retry hits them without looking, which the policy would forbid.
    expect(blind.violations).toBeGreaterThan(0)
    expect(blind.policyRefusals).toBe(0) // naive strategy has no policy to refuse
  })

  it("generic dunning contacts customers blindly, including fraud-flagged ones", async () => {
    const world = generateWorld(400, SEED)
    const run = await runEvaluation({ world, seed: SEED })
    const dunning = run.strategies.find((s) => s.key === "GENERIC_DUNNING")!
    expect(dunning.contacts).toBeGreaterThan(0)
    expect(dunning.violations).toBeGreaterThan(0) // outreach to fraud-flagged customers
  })

  it("RecoverAI refuses unsafe/uneconomic/futile actions and reports them", async () => {
    const world = generateWorld(500, SEED)
    const run = await runEvaluation({ world, seed: SEED })
    const ai = run.strategies.find((s) => s.key === "RECOVERAI")!
    expect(ai.policyRefusals).toBeGreaterThan(0)
    expect(ai.violations).toBe(0) // sanctioned actions never violate policy
    const reasons = new Set(ai.refusalBreakdown.map((b) => b.reason))
    // High-risk customers must never be contacted by an automated flow.
    expect(reasons.has("customer-contact-ceiling")).toBe(true)
    // High-value actions wait on merchant approval inside the eval window.
    expect(reasons.has("gated")).toBe(true)
  })

  it("economic refusals occur for micro-payments with expensive engagement", async () => {
    const world = generateWorld(500, SEED)
    const run = await runEvaluation({ world, seed: SEED })
    const ai = run.strategies.find((s) => s.key === "RECOVERAI")!
    const economic = ai.refusalBreakdown.find((b) => b.reason === "economic")
    expect(ai.economicRefusals).toBeGreaterThan(0)
    expect(economic && economic.count).toBeGreaterThan(0)
  })

  it("every recovery is attributed per failure category (where recovery came from)", async () => {
    const world = generateWorld(500, SEED)
    const run = await runEvaluation({ world, seed: SEED })
    for (const s of run.strategies) {
      const fromCategory = s.byCategory.reduce((sum, c) => sum + c.recoveredPaise, 0)
      expect(fromCategory).toBe(s.grossRecoveredPaise)
      const atRisk = s.byCategory.reduce((sum, c) => sum + c.atRiskPaise, 0)
      expect(atRisk).toBe(s.totalAtRiskPaise)
    }
  })

  it("runEvaluation is fully offline: deterministic mock provider, no network", async () => {
    const world = generateWorld(120, SEED)
    const run = await runEvaluation({ world, seed: SEED })
    expect(run.meta.reproducible).toBe(true)
    expect(run.meta.provider.active).toBe("mock")
    expect(run.meta.diagnosisFallbacks).toBe(0)
    expect(run.methodology.length).toBeGreaterThan(4)
  })
})

describe("RecoverAI strategy — deterministic diagnosis loop", () => {
  it("honors policy verdicts: gated high-value actions are not executed in the eval window", async () => {
    const world = generateWorld(500, SEED)
    const { metrics } = await runRecoverAIStrategy(world, new MockProvider(), world.reduce((s, p) => s + p.amount, 0))
    // Approval-gated amounts stay at risk — no merchant approval inside the window.
    expect(metrics.approvalGatedCount).toBeGreaterThan(0)
    const gated = metrics.refusalBreakdown.find((b) => b.reason === "gated")
    expect(gated && gated.count).toBeGreaterThan(0)
  })
})