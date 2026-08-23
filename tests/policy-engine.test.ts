import { describe, it, expect } from "vitest"
import { evaluatePolicy, type PolicyRequest } from "@/lib/engine/policy-engine"

const now = new Date("2026-01-15T12:00:00Z")

function req(overrides: Partial<PolicyRequest> = {}): PolicyRequest {
  return {
    actionType: "RETRY_PAYMENT",
    failureCategory: "NETWORK_FAILURE",
    amount: 100000, // ₹1,000 — small
    customerRiskScore: 0.1,
    history: [],
    now,
    ...overrides,
  }
}

describe("policy engine — the authorization layer", () => {
  it("approves a compatible, low-risk retry", () => {
    const v = evaluatePolicy(req())
    expect(v.decision).toBe("APPROVED")
    expect(v.sanctionedProbability).toBeGreaterThan(0)
  })

  it("rejects retrying an expired card — structurally futile", () => {
    const v = evaluatePolicy(req({ failureCategory: "EXPIRED_CARD" }))
    expect(v.decision).toBe("REJECTED")
    expect(v.reason).toMatch(/EXPIRED_CARD|expired|not permitted/i)
  })

  it("rejects every customer-facing action on fraud signals", () => {
    const customerFacing = [
      "RETRY_PAYMENT",
      "DELAY_AND_RETRY",
      "REQUEST_CUSTOMER_RETRY",
      "SEND_PAYMENT_LINK",
      "SEND_REMINDER",
      "OFFER_ALTERNATE_METHOD",
    ] as const
    for (const actionType of customerFacing) {
      const v = evaluatePolicy(req({ actionType, failureCategory: "FRAUD_RISK" }))
      expect(v.decision, actionType).toBe("REJECTED")
    }
  })

  it("permits escalation for fraud — never blocks the safe path", () => {
    const v = evaluatePolicy(req({ actionType: "ESCALATE_TO_MERCHANT", failureCategory: "FRAUD_RISK" }))
    expect(v.decision).toBe("APPROVED")
  })

  it("requires approval above the action's amount threshold", () => {
    // RETRY_PAYMENT threshold is ₹50,000
    const v = evaluatePolicy(req({ amount: 5_000_000 }))
    expect(v.decision).toBe("NEEDS_APPROVAL")
    expect(v.reason).toMatch(/approval threshold/i)
  })

  it("does not require approval below the threshold", () => {
    const v = evaluatePolicy(req({ amount: 4_999_900 }))
    expect(v.decision).toBe("APPROVED")
  })

  it("enforces per-action cooldowns", () => {
    const v = evaluatePolicy(
      req({
        actionType: "SEND_REMINDER", // 24h cooldown
        history: [{ actionType: "SEND_REMINDER", status: "FAILED", executedAt: new Date("2026-01-15T06:00:00Z") }],
      }),
    )
    expect(v.decision).toBe("REJECTED")
    expect(v.reason).toMatch(/cooldown/i)
  })

  it("allows the same action again after its cooldown elapses", () => {
    const v = evaluatePolicy(
      req({
        actionType: "SEND_REMINDER",
        history: [{ actionType: "SEND_REMINDER", status: "FAILED", executedAt: new Date("2026-01-13T00:00:00Z") }],
      }),
    )
    expect(v.decision).toBe("APPROVED")
  })

  it("suppresses duplicate execution of an already-executed action", () => {
    const v = evaluatePolicy(
      req({
        history: [{ actionType: "RETRY_PAYMENT", status: "EXECUTED", executedAt: new Date("2026-01-10T00:00:00Z") }],
      }),
    )
    expect(v.decision).toBe("REJECTED")
    expect(v.reason).toMatch(/already executed/i)
  })

  it("caps total recovery actions per payment", () => {
    const history = Array.from({ length: 4 }, (_, i) => ({
      actionType: "SEND_REMINDER" as const,
      status: "FAILED",
      executedAt: new Date(Date.now() - (10 - i) * 86_400_000),
    }))
    const v = evaluatePolicy(req({ history }))
    expect(v.decision).toBe("REJECTED")
    expect(v.reason).toMatch(/cap/i)
  })

  it("blocks customer contact when the customer risk score exceeds the ceiling", () => {
    const v = evaluatePolicy(req({ actionType: "SEND_PAYMENT_LINK", customerRiskScore: 0.9 }))
    expect(v.decision).toBe("REJECTED")
    expect(v.reason).toMatch(/risk score/i)
  })
})
