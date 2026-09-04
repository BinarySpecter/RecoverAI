import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { db } from "@/lib/db"
import { seedFixtures, cleanAll } from "./helpers"
import { ingestFailure } from "@/lib/engine/ingestion"
import { runRecoveryPipeline } from "@/lib/engine/recovery-engine"
import { evaluatePolicy } from "@/lib/engine/policy-engine"
import { ACTION_COSTS_PAISE } from "@/lib/engine/actions"

let merchantId: string
let customerId: string

beforeAll(async () => {
  const fixtures = await seedFixtures()
  merchantId = fixtures.merchant.id
  customerId = fixtures.customer.id
})

afterAll(async () => {
  await cleanAll()
  await db.$disconnect()
})

const NOW = new Date("2026-01-15T12:00:00Z")

describe("economic stopping rule — the deterministic cost guardrail", () => {
  it("is a pure function of catalog efficacy and action cost (no LLM input)", () => {
    const v = evaluatePolicy({
      actionType: "SEND_PAYMENT_LINK",
      failureCategory: "ABANDONED_CHECKOUT",
      amount: 1000, // ₹10 micro-payment
      customerRiskScore: 0.1,
      history: [],
      now: NOW,
    })
    expect(v.decision).toBe("REJECTED")
    expect(v.reason).toMatch(/Economically refused/i)
    expect(v.economics?.refused).toBe(true)
    expect(v.economics?.actionCostPaise).toBe(ACTION_COSTS_PAISE.SEND_PAYMENT_LINK)
    // expected recovery value = amount × deterministic catalog efficacy
    expect(v.economics?.expectedRecoveryValuePaise).toBe(Math.round(1000 * 0.5))
    expect(v.sanctionedProbability).toBe(0)
  })

  it("still approves a cheap automatic retry on the same micro-payment", () => {
    const v = evaluatePolicy({
      actionType: "RETRY_PAYMENT",
      failureCategory: "NETWORK_FAILURE",
      amount: 1000, // ₹10 — retry costs ₹1.50, so it stays economical
      customerRiskScore: 0.1,
      history: [],
      now: NOW,
    })
    expect(v.decision).toBe("APPROVED")
    expect(v.economics?.refused).toBe(false)
    // Economics are attached to approved verdicts too, for the audit trail.
    expect(v.economics?.expectedRecoveryValuePaise).toBe(Math.round(1000 * 0.72))
  })

  it("never economically refuses escalation or do-nothing", () => {
    const esc = evaluatePolicy({
      actionType: "ESCALATE_TO_MERCHANT",
      failureCategory: "FRAUD_RISK",
      amount: 1000,
      customerRiskScore: 0.9,
      history: [],
      now: NOW,
    })
    expect(esc.economics).toBeUndefined()
    expect(esc.decision).toBe("APPROVED")

    const none = evaluatePolicy({
      actionType: "DO_NOTHING",
      failureCategory: "TEMPORARY_DECLINE",
      amount: 1000,
      customerRiskScore: 0.1,
      history: [],
      now: NOW,
    })
    expect(none.economics).toBeUndefined()
    expect(none.decision).toBe("APPROVED")
  })

  it("fails closed on the pipeline with audit persistence of the refusal economics", async () => {
    const payment = await ingestFailure({
      merchantId,
      customerId,
      amount: 1000, // ₹10
      method: "CARD",
      failureCategory: "ABANDONED_CHECKOUT", // mock recommends SEND_PAYMENT_LINK (₹15) — uneconomic here
      source: "SIMULATION",
    })
    const result = await runRecoveryPipeline(payment.id)

    expect(result.policyDecision).toBe("REJECTED")
    expect(result.status).toBe("REJECTED")
    expect(result.policyReason).toMatch(/Economically refused/i)

    // No action executed, no gateway attempt made.
    const attempts = await db.paymentAttempt.findMany({ where: { paymentId: payment.id } })
    expect(attempts).toHaveLength(1)

    // The refusal reason + economics are persisted in the audit trail.
    const log = await db.auditLog.findFirst({ where: { paymentId: payment.id, event: "policy.rejected" } })
    expect(log).not.toBeNull()
    const data = JSON.parse(log!.data ?? "{}")
    expect(data.economics.refused).toBe(true)
    expect(data.economics.expectedRecoveryValuePaise).toBe(500)
    expect(data.economics.actionCostPaise).toBe(1500)
    expect(log!.message).toMatch(/Economically refused/i)
  })

  it("economic verdicts differ from fraud-ceiling verdicts (distinct refusal classes)", async () => {
    const economic = evaluatePolicy({
      actionType: "SEND_PAYMENT_LINK",
      failureCategory: "ABANDONED_CHECKOUT",
      amount: 1000,
      customerRiskScore: 0.1,
      history: [],
      now: NOW,
    })
    const ceiling = evaluatePolicy({
      actionType: "SEND_PAYMENT_LINK",
      failureCategory: "ABANDONED_CHECKOUT",
      amount: 100000, // ₹1,000 — economic, but risk ceiling fires first
      customerRiskScore: 0.9,
      history: [],
      now: NOW,
    })
    expect(economic.economics?.refused).toBe(true)
    expect(ceiling.economics).toBeUndefined() // refused one guard earlier — ceiling precedes economics
    expect(ceiling.reason).toMatch(/ceiling|risk score/i)
  })
})