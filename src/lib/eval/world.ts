import { hashSeed, seededRandom } from "@/lib/gateway/payment-gateway"
import type { FailureCategory, PaymentMethod } from "@/lib/types"

/**
 * EVALUATION WORLD — one deterministic population of failed payments.
 *
 * Every strategy in the Recovery Lab replays THIS exact population: fixed
 * seed, fixed ids, fixed amounts, fixed customer signals. Re-running produces
 * identical worlds, so differences between strategies are attributable to the
 * strategy, not to the draw of the world.
 *
 * This is deliberately separate from the interactive DEMO SIMULATOR (which
 * writes real rows into the demo database). Evaluation never touches the
 * database and makes no claims about causality.
 */

export const DEFAULT_EVAL_SEED = "recoverai-eval-world-v1"
export const EVAL_NOW = new Date("2026-01-15T12:00:00Z")

export interface EvalPayment {
  id: string
  amount: number // paise
  method: PaymentMethod
  category: FailureCategory
  riskScore: number // 0..1 fraud/chargeback signal
  successRate: number // historical payment success rate 0..1
  retryCount: number // prior failed attempts before this evaluation
  lifetimeValue: number // paise
  avgOrderValue: number // paise
  subscriptionActive: boolean
}

// Amount tiers (rupees). Micro tier deliberately includes very low-value
// failures so the economic stopping rule has real work to do; high tiers
// exercise the merchant-approval gate.
const TIERS: { weight: number; min: number; max: number }[] = [
  { weight: 6, min: 10, max: 40 }, // micro — add-ons, coins, seat upgrades
  { weight: 74, min: 1000, max: 30000 }, // standard commerce
  { weight: 15, min: 60000, max: 150000 }, // high value → approval gate
  { weight: 5, min: 200000, max: 500000 }, // premium → approval gate
]

const CATEGORY_WEIGHTS: [FailureCategory, number][] = [
  ["TEMPORARY_DECLINE", 24],
  ["INSUFFICIENT_FUNDS", 19],
  ["NETWORK_FAILURE", 14],
  ["AUTHENTICATION_FAILURE", 10],
  ["EXPIRED_CARD", 8],
  ["ABANDONED_CHECKOUT", 8],
  ["REPEATED_FAILURES", 6],
  ["HIGH_VALUE_FAILURE", 5],
  ["SUBSCRIPTION_RENEWAL_FAILURE", 4],
  ["FRAUD_RISK", 2],
]

const METHODS: PaymentMethod[] = ["CARD", "UPI", "NETBANKING", "WALLET"]

function pickWeighted<T>(rand: () => number, entries: [T, number][]): T {
  const total = entries.reduce((s, [, w]) => s + w, 0)
  let roll = rand() * total
  for (const [value, w] of entries) {
    roll -= w
    if (roll <= 0) return value
  }
  return entries[entries.length - 1][0]
}

export function generateWorld(n: number, seed: string = DEFAULT_EVAL_SEED): EvalPayment[] {
  const rand = seededRandom(hashSeed(`${seed}:world`))
  const world: EvalPayment[] = []
  for (let i = 0; i < n; i++) {
    const tier = pickWeighted(rand, TIERS.map((t) => [t, t.weight] as [typeof t, number]))
    const amount = Math.round((tier.min + rand() * (tier.max - tier.min)) / 5) * 5

    const riskRoll = rand()
    const riskScore =
      riskRoll < 0.85 ? 0.02 + rand() * 0.33 : riskRoll < 0.95 ? 0.4 + rand() * 0.2 : 0.65 + rand() * 0.3

    const successRate = Math.max(0.4, Math.min(0.97, 0.92 - riskScore * 0.5 + (rand() - 0.5) * 0.12))

    const retryRoll = rand()
    const retryCount = retryRoll < 0.55 ? 0 : retryRoll < 0.85 ? 1 : retryRoll < 0.97 ? 2 : 3

    const method = METHODS[Math.floor(rand() * METHODS.length)]
    const category = pickWeighted(rand, CATEGORY_WEIGHTS)

    world.push({
      id: `ev-${String(i + 1).padStart(4, "0")}`,
      amount: Math.round(amount * 100),
      method,
      category,
      riskScore: Number(riskScore.toFixed(3)),
      successRate: Number(successRate.toFixed(3)),
      retryCount,
      lifetimeValue: Math.round((amount * (3 + rand() * 18)) * 100), // 3×–21× this order
      avgOrderValue: Math.round(amount * 100),
      subscriptionActive: rand() < 0.22,
    })
  }
  return world
}