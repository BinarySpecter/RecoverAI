import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { analyzeWithFallback, resolveProvider } from "@/lib/ai"
import { MockProvider } from "@/lib/ai/mock"
import type { FailureContext } from "@/lib/types"

function ctx(): FailureContext {
  return {
    payment: {
      id: "pay_fb_1",
      orderId: "order_fb_1",
      amount: 99900,
      currency: "INR",
      method: "UPI",
      description: "Test",
      retryCount: 0,
      createdAt: new Date().toISOString(),
    },
    customer: {
      name: "Fallback Tester",
      email: "fb@test.example",
      successfulPayments: 3,
      failedPayments: 1,
      lifetimeValue: 300000,
      avgOrderValue: 75000,
      subscriptionActive: false,
      subscriptionPlan: null,
      riskScore: 0.1,
    },
    failure: { category: "NETWORK_FAILURE", rawCode: "timeout", rawMessage: "timeout", attemptNo: 1 },
    merchant: { name: "Test" },
    historyPattern: { timesSeen: 0, timesRecovered: 0, bestAction: null },
  }
}

describe("AI provider resilience — the demo must survive provider failure", () => {
  beforeEach(() => {
    process.env.AI_PROVIDER = "gemini"
    process.env.GEMINI_API_KEY = "test-key-forcing-provider"
  })
  afterEach(() => {
    delete process.env.GEMINI_API_KEY
    process.env.AI_PROVIDER = "mock"
    vi.unstubAllGlobals()
  })

  it("falls back to the deterministic engine when the provider throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network unreachable")),
    )
    const result = await analyzeWithFallback(ctx())
    expect(result.usedFallback).toBe(true)
    expect(result.provider).toBe("fallback")
    expect(result.analysis.failureCategory).toBe("NETWORK_FAILURE")
    expect(result.analysis.recommendedAction).toBe("RETRY_PAYMENT")
  })

  it("falls back when the provider returns malformed JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: "sorry, I cannot do JSON" }] } }] }),
      }),
    )
    const result = await analyzeWithFallback(ctx())
    expect(result.usedFallback).toBe(true)
  })

  it("falls back when the provider returns schema-invalid fields", async () => {
    const garbage = JSON.stringify({ failureCategory: "MAGIC", confidence: 42, recommendedAction: "SHOUT" })
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: garbage }] } }] }),
      }),
    )
    const result = await analyzeWithFallback(ctx())
    expect(result.usedFallback).toBe(true)
    expect(result.analysis.recommendedAction).toBe("RETRY_PAYMENT")
  })

  it("falls back on provider HTTP errors (rate limit / auth)", async () => {
    for (const status of [401, 429, 500]) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: false, status }),
      )
      const result = await analyzeWithFallback(ctx())
      expect(result.usedFallback, `status ${status}`).toBe(true)
    }
  })
})

describe("provider resolution", () => {
  it("uses mock when explicitly requested", () => {
    process.env.AI_PROVIDER = "mock"
    const { provider, configured } = resolveProvider("mock")
    expect(provider).toBeInstanceOf(MockProvider)
    expect(configured).toBe(true)
  })

  it("degrades to mock when a real provider has no API key", () => {
    delete process.env.GEMINI_API_KEY
    const { provider, configured } = resolveProvider("gemini")
    expect(provider).toBeInstanceOf(MockProvider)
    expect(configured).toBe(false)
  })
})
