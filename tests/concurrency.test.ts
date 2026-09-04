import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { db } from "@/lib/db"
import { seedFixtures, cleanAll } from "./helpers"
import { ingestFailure } from "@/lib/engine/ingestion"
import { runRecoveryPipeline, approveAndExecute, rejectAction } from "@/lib/engine/recovery-engine"

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

describe("duplicate / concurrency protection — one recovery event, one action", () => {
  it("concurrent processing of the same failed payment creates exactly one action", async () => {
    const payment = await ingestFailure({
      merchantId,
      customerId,
      amount: 7_500_000, // ₹75,000 → policy gates it, keeping the action open
      method: "CARD",
      failureCategory: "TEMPORARY_DECLINE",
      source: "SIMULATION",
    })

    // Five simultaneous deliveries of the "same" event (webhook redelivery,
    // double clicks, retried HTTP requests — all the same shape).
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => runRecoveryPipeline(payment.id)),
    )

    const fulfilled = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof runRecoveryPipeline>>> => r.status === "fulfilled")
    expect(fulfilled.length).toBe(5) // no crashes — duplicates are acknowledged

    const suppressed = fulfilled.filter((r) => r.value.alreadyProcessing)
    expect(suppressed.length).toBe(4) // four recognized the open action
    expect(fulfilled.some((r) => !r.value.alreadyProcessing)).toBe(true)

    // Exactly ONE analysis and ONE action survived the race.
    const actions = await db.recoveryAction.findMany({ where: { paymentId: payment.id } })
    const analyses = await db.aIAnalysis.findMany({ where: { paymentId: payment.id } })
    expect(actions).toHaveLength(1)
    expect(analyses).toHaveLength(1)
    expect(actions[0].status).toBe("AWAITING_APPROVAL")

    // The over-processing was recorded, auditable evidence of the guard.
    const suppressions = await db.auditLog.findMany({ where: { paymentId: payment.id, event: "recovery.duplicate_suppressed" } })
    expect(suppressions.length).toBe(4)
  })

  it("concurrent approvals execute the gated action exactly once", async () => {
    const payment = await ingestFailure({
      merchantId,
      customerId,
      amount: 8_000_000, // ₹80,000 → gated
      method: "CARD",
      failureCategory: "TEMPORARY_DECLINE",
      source: "SIMULATION",
    })
    await runRecoveryPipeline(payment.id)
    const action = await db.recoveryAction.findFirstOrThrow({ where: { paymentId: payment.id } })

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => approveAndExecute(action.id, "merchant@example.com")),
    )
    const fulfilled = results.filter((r) => r.status === "fulfilled")
    const rejected = results.filter((r) => r.status === "rejected")

    expect(fulfilled.length).toBe(1) // exactly one approval executes
    expect(rejected.length).toBe(4)
    for (const r of rejected) {
      expect(String(r.reason)).toMatch(/already decided/i)
    }

    const executed = await db.recoveryAction.findUniqueOrThrow({ where: { id: action.id } })
    expect(["EXECUTED", "RECOVERED", "FAILED"]).toContain(executed.status)
    expect(executed.approvedBy).toBe("merchant@example.com")

    // No double-execution at the gateway: original failure attempt + one execution charge.
    const attempts = await db.paymentAttempt.findMany({ where: { paymentId: payment.id } })
    expect(attempts).toHaveLength(2)
  })

  it("concurrent rejection also decides exactly once", async () => {
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

    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => rejectAction(action.id, "Not this week")),
    )
    const rejected = results.filter((r) => r.status === "rejected")
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(1)
    expect(rejected.length).toBe(3)

    const decided = await db.recoveryAction.findUniqueOrThrow({ where: { id: action.id } })
    expect(decided.status).toBe("REJECTED")
  })
})