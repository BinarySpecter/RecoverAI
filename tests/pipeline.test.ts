import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { db } from "@/lib/db"
import { seedFixtures, cleanAll } from "./helpers"
import { ingestFailure } from "@/lib/engine/ingestion"
import { runRecoveryPipeline, approveAndExecute, rejectAction } from "@/lib/engine/recovery-engine"
import { SimulateFailureSchema, GatewayEventSchema } from "@/lib/types"

let merchantId: string
let customerId: string
let riskyCustomerId: string

beforeAll(async () => {
  const fixtures = await seedFixtures()
  merchantId = fixtures.merchant.id
  customerId = fixtures.customer.id
  riskyCustomerId = fixtures.riskyCustomer.id; void riskyCustomerId
})

afterAll(async () => {
  await cleanAll()
  await db.$disconnect()
})

describe("failure ingestion — the single funnel", () => {
  it("creates payment + attempt + failure event + audit entry", async () => {
    const payment = await ingestFailure({
      merchantId,
      customerId,
      amount: 499900,
      method: "CARD",
      failureCategory: "TEMPORARY_DECLINE",
      source: "SIMULATION",
    })
    expect(payment.status).toBe("FAILED")
    expect(payment.attempts).toHaveLength(1)
    expect(payment.attempts[0].gatewayCode).toBe("card_declined")
    expect(payment.failure?.category).toBe("TEMPORARY_DECLINE")

    const audit = await db.auditLog.findFirst({ where: { paymentId: payment.id, event: "payment.failed" } })
    expect(audit).not.toBeNull()
    expect(audit?.actor).toBe("GATEWAY")

    const customer = await db.customer.findUniqueOrThrow({ where: { id: customerId } })
    expect(customer.failedPayments).toBe(2) // fixture 1 + this failure
  })

  it("throws on unknown customer email instead of guessing", async () => {
    await expect(
      ingestFailure({ merchantId, customerEmail: "nobody@nowhere.example", amount: 100000, method: "UPI", failureCategory: "NETWORK_FAILURE" }),
    ).rejects.toThrow(/No customer with email/)
  })

  it("normalizes raw gateway codes into failure categories", async () => {
    const payment = await ingestFailure({
      merchantId,
      customerId,
      amount: 100000,
      method: "CARD",
      gatewayCode: "card_expired",
      source: "SIMULATION",
    })
    expect(payment.failure?.category).toBe("EXPIRED_CARD")
  })
})

describe("recovery pipeline — end to end", () => {
  it("runs diagnosis → policy → execution and leaves a full audit trail", async () => {
    const payment = await ingestFailure({
      merchantId,
      customerId,
      amount: 299900,
      method: "UPI",
      gatewayCode: "timeout", // NETWORK_FAILURE → RETRY_PAYMENT
      source: "SIMULATION",
    })
    const result = await runRecoveryPipeline(payment.id)

    expect(result.actionType).toBe("RETRY_PAYMENT")
    expect(result.policyDecision).toBe("APPROVED")
    expect(["RECOVERED", "FAILED"]).toContain(result.status!)

    const analysis = await db.aIAnalysis.findFirstOrThrow({ where: { paymentId: payment.id } })
    expect(analysis.provider).toBe("mock")
    expect(analysis.failureCategory).toBe("NETWORK_FAILURE")

    const action = await db.recoveryAction.findFirstOrThrow({ where: { paymentId: payment.id } })
    expect(action.policyDecision).toBe("APPROVED")

    const events = (await db.auditLog.findMany({ where: { paymentId: payment.id }, orderBy: { createdAt: "asc" } })).map((l) => l.event)
    expect(events).toContain("payment.failed")
    expect(events).toContain("ai.analysis.completed")
    expect(events.join(" ")).toMatch(/policy\./)
    expect(events.join(" ")).toMatch(/recovery\./)

    // A second attempt recorded at the gateway
    const attempts = await db.paymentAttempt.findMany({ where: { paymentId: payment.id }, orderBy: { attemptNo: "asc" } })
    expect(attempts.length).toBeGreaterThanOrEqual(2)
  })

  it("recovers the payment state when the retry succeeds", async () => {
    // Deterministic: try a few fixed ids until one recovers, then assert state transitions.
    let recoveredPaymentId: string | null = null
    for (let i = 0; i < 8 && !recoveredPaymentId; i++) {
      const payment = await ingestFailure({
        id: `recovertest${i}`,
        merchantId,
        customerId,
        amount: 500000,
        method: "UPI",
        gatewayCode: "timeout",
        source: "SIMULATION",
      })
      const result = await runRecoveryPipeline(payment.id)
      if (result.status === "RECOVERED") recoveredPaymentId = payment.id
    }
    expect(recoveredPaymentId).not.toBeNull()
    const payment = await db.payment.findUniqueOrThrow({ where: { id: recoveredPaymentId! } })
    expect(payment.status).toBe("RECOVERED")
    expect(payment.recoveredAt).not.toBeNull()
    const customer = await db.customer.findUniqueOrThrow({ where: { id: customerId } })
    // successfulPayments incremented by the recovery
    expect(customer.successfulPayments).toBeGreaterThan(8)
  })

  it("gates high-value actions behind merchant approval", async () => {
    const payment = await ingestFailure({
      merchantId,
      customerId,
      amount: 7_500_000, // ₹75,000 ≥ ₹50,000 RETRY/DELAY threshold
      method: "CARD",
      failureCategory: "TEMPORARY_DECLINE",
      source: "SIMULATION",
    })
    const result = await runRecoveryPipeline(payment.id)
    expect(result.policyDecision).toBe("NEEDS_APPROVAL")
    expect(result.status).toBe("AWAITING_APPROVAL")

    const stored = await db.payment.findUniqueOrThrow({ where: { id: payment.id } })
    expect(stored.status).toBe("FAILED") // untouched until approved
  })

  it("executes after merchant approval and records who approved", async () => {
    const payment = await ingestFailure({
      merchantId,
      customerId,
      amount: 7_500_000,
      method: "CARD",
      failureCategory: "TEMPORARY_DECLINE",
      source: "SIMULATION",
    })
    await runRecoveryPipeline(payment.id)
    const action = await db.recoveryAction.findFirstOrThrow({ where: { paymentId: payment.id } })
    expect(action.status).toBe("AWAITING_APPROVAL")

    const result = await approveAndExecute(action.id, "merchant@example.com")
    expect(["RECOVERED", "FAILED"]).toContain(result.status!)
    const executed = await db.recoveryAction.findUniqueOrThrow({ where: { id: action.id } })
    expect(executed.approvedBy).toBe("merchant@example.com")
    expect(executed.executedAt).not.toBeNull()

    const approved = await db.auditLog.findFirst({ where: { paymentId: payment.id, event: "recovery.approved" } })
    expect(approved?.actor).toBe("MERCHANT")
  })

  it("rejecting a gated action closes it without execution", async () => {
    const payment = await ingestFailure({
      merchantId,
      customerId,
      amount: 9_000_000,
      method: "CARD",
      failureCategory: "TEMPORARY_DECLINE",
      source: "SIMULATION",
    })
    await runRecoveryPipeline(payment.id)
    const action = await db.recoveryAction.findFirstOrThrow({ where: { paymentId: payment.id } })
    await rejectAction(action.id, "Too risky this week")
    const rejected = await db.recoveryAction.findUniqueOrThrow({ where: { id: action.id } })
    expect(rejected.status).toBe("REJECTED")
  })

  it("escalates fraud to the merchant instead of contacting the customer", async () => {
    const payment = await ingestFailure({
      merchantId,
      customerId,
      amount: 600000,
      method: "CARD",
      failureCategory: "FRAUD_RISK",
      source: "SIMULATION",
    })
    const result = await runRecoveryPipeline(payment.id)
    expect(result.actionType).toBe("ESCALATE_TO_MERCHANT")
    expect(result.policyDecision).toBe("APPROVED")
    expect(result.outcome).toBe("PENDING_REVIEW")

    // No additional gateway attempt was made — no charging on fraud signals
    const attempts = await db.paymentAttempt.findMany({ where: { paymentId: payment.id } })
    expect(attempts).toHaveLength(1)
  })

  it("refuses to run the pipeline on a recovered payment; cooldown-guards a still-failed one", async () => {
    const payment = await ingestFailure({
      merchantId,
      customerId,
      amount: 100000,
      method: "UPI",
      gatewayCode: "timeout",
      source: "SIMULATION",
    })
    const first = await runRecoveryPipeline(payment.id)
    if (first.status === "RECOVERED") {
      // Payment left the FAILED state — further runs are refused outright.
      await expect(runRecoveryPipeline(payment.id)).rejects.toThrow(/not FAILED|nothing to recover/i)
    } else {
      // Still FAILED: pipeline runs, but policy suppresses an immediate duplicate retry.
      const second = await runRecoveryPipeline(payment.id)
      expect(second.policyDecision).toBe("REJECTED")
      expect(second.policyReason).toMatch(/cooldown|already executed/i)
    }
  })
})

describe("input validation", () => {
  it("rejects invalid simulate-failure payloads", () => {
    expect(SimulateFailureSchema.safeParse({ amount: -5 }).success).toBe(false)
    expect(SimulateFailureSchema.safeParse({ amount: 10 }).success).toBe(false) // below ₹100
    expect(SimulateFailureSchema.safeParse({ method: "CRYPTO" }).success).toBe(false)
    expect(SimulateFailureSchema.safeParse({ customerEmail: "not-an-email" }).success).toBe(false)
    expect(SimulateFailureSchema.safeParse({ failureCategory: "MAGIC" }).success).toBe(false)
    expect(SimulateFailureSchema.safeParse({}).success).toBe(true) // all optional
    expect(SimulateFailureSchema.safeParse({ amount: 250000, method: "UPI" }).success).toBe(true)
  })

  it("validates webhook event shapes", () => {
    const valid = {
      event: "payment.failed",
      payload: { orderId: "order_123", status: "FAILED", gatewayCode: "card_declined" },
    }
    expect(GatewayEventSchema.safeParse(valid).success).toBe(true)
    expect(GatewayEventSchema.safeParse({ event: "x" }).success).toBe(false)
    expect(GatewayEventSchema.safeParse({ event: "x", payload: { orderId: 1, status: "FAILED" } }).success).toBe(false)
  })
})
