import { describe, it, expect } from "vitest"
import { extractJSON, parseAnalysis, buildDiagnosisPrompt } from "@/lib/ai/prompt"
import { MockProvider } from "@/lib/ai/mock"
import type { FailureContext } from "@/lib/types"

const VALID = {
  failureCategory: "TEMPORARY_DECLINE",
  rootCause: "Soft decline from issuer.",
  confidence: 0.87,
  severity: "high",
  recommendedAction: "DELAY_AND_RETRY",
  reasoning: "Soft declines clear within minutes; the customer's history is strong.",
  customerContext: "8 successful payments, active subscription.",
  estimatedRecoveryProbability: 0.72,
}

function ctx(overrides: Partial<FailureContext["failure"]> = {}): FailureContext {
  return {
    payment: {
      id: "pay_test_1",
      orderId: "order_test_1",
      amount: 1249900,
      currency: "INR",
      method: "CARD",
      description: "Test order",
      retryCount: 1,
      createdAt: new Date().toISOString(),
    },
    customer: {
      name: "Rahul Sharma",
      email: "rahul@test.example",
      successfulPayments: 8,
      failedPayments: 1,
      lifetimeValue: 8240000,
      avgOrderValue: 820000,
      subscriptionActive: true,
      subscriptionPlan: "Pro Monthly",
      riskScore: 0.05,
    },
    failure: {
      category: "TEMPORARY_DECLINE",
      rawCode: "card_declined",
      rawMessage: "Card declined by issuing bank",
      attemptNo: 2,
      latencyMs: 1400,
      ...overrides,
    },
    merchant: { name: "Test Merchant" },
    historyPattern: { timesSeen: 3, timesRecovered: 1, bestAction: "DELAY_AND_RETRY" },
  }
}

describe("AI structured-output parsing (AI output is untrusted input)", () => {
  it("parses clean JSON", () => {
    expect(parseAnalysis(JSON.stringify(VALID))).toMatchObject({ confidence: 0.87 })
  })

  it("extracts JSON from markdown fences", () => {
    const fenced = "```json\n" + JSON.stringify(VALID) + "\n```"
    expect(parseAnalysis(fenced).recommendedAction).toBe("DELAY_AND_RETRY")
  })

  it("extracts JSON from surrounding chatter", () => {
    const chatty = `Here is my analysis:\n${JSON.stringify(VALID)}\nHope this helps!`
    expect(parseAnalysis(chatty).failureCategory).toBe("TEMPORARY_DECLINE")
  })

  it("rejects an invented action type", () => {
    const bad = { ...VALID, recommendedAction: "CALL_THE_CUSTOMER_PERSONALLY" }
    expect(() => parseAnalysis(JSON.stringify(bad))).toThrow()
  })

  it("rejects an invented failure category", () => {
    const bad = { ...VALID, failureCategory: "ALIEN_INTERFERENCE" }
    expect(() => parseAnalysis(JSON.stringify(bad))).toThrow()
  })

  it("rejects out-of-range confidence", () => {
    expect(() => parseAnalysis(JSON.stringify({ ...VALID, confidence: 1.5 }))).toThrow()
    expect(() => parseAnalysis(JSON.stringify({ ...VALID, confidence: -0.1 }))).toThrow()
  })

  it("rejects non-JSON garbage", () => {
    expect(() => parseAnalysis("I cannot answer that.")).toThrow()
    expect(() => extractJSON("no braces here")).toThrow()
  })
})

describe("MockProvider — deterministic diagnosis engine", () => {
  it("is deterministic: same context → identical analysis", async () => {
    const p = new MockProvider()
    const a = await p.analyzePaymentFailure(ctx())
    const b = await p.analyzePaymentFailure(ctx())
    expect(a).toEqual(b)
  })

  it("recommends method switching for expired cards, never a retry", async () => {
    const result = await new MockProvider().analyzePaymentFailure(ctx({ category: "EXPIRED_CARD" }))
    expect(result.recommendedAction).toBe("OFFER_ALTERNATE_METHOD")
  })

  it("escalates fraud instead of contacting the customer", async () => {
    const result = await new MockProvider().analyzePaymentFailure(ctx({ category: "FRAUD_RISK" }))
    expect(result.recommendedAction).toBe("ESCALATE_TO_MERCHANT")
  })

  it("switches to a payment link after repeated soft-decline retries", async () => {
    const repeated = {
      ...ctx(),
      payment: { ...ctx().payment, retryCount: 3 },
    }
    const result = await new MockProvider().analyzePaymentFailure(repeated)
    expect(result.recommendedAction).toBe("SEND_PAYMENT_LINK")
  })

  it("keeps all numeric outputs within [0,1]", async () => {
    for (const category of ["TEMPORARY_DECLINE", "FRAUD_RISK", "ABANDONED_CHECKOUT"] as const) {
      const r = await new MockProvider().analyzePaymentFailure(ctx({ category }))
      expect(r.confidence).toBeGreaterThanOrEqual(0)
      expect(r.confidence).toBeLessThanOrEqual(1)
      expect(r.estimatedRecoveryProbability).toBeGreaterThanOrEqual(0)
      expect(r.estimatedRecoveryProbability).toBeLessThanOrEqual(1)
    }
  })
})

describe("prompt construction", () => {
  it("embeds the bounded action and category vocabularies", () => {
    const { system, user } = buildDiagnosisPrompt(ctx())
    expect(system).toContain("RETRY_PAYMENT")
    expect(system).toContain("ESCALATE_TO_MERCHANT")
    expect(system).toContain("TEMPORARY_DECLINE")
    expect(user).toContain("₹12,499")
    expect(user).toContain("Rahul Sharma")
  })
})
