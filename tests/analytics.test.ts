import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { db } from "@/lib/db"
import { seedFixtures, cleanAll } from "./helpers"
import { ingestFailure } from "@/lib/engine/ingestion"
import { runRecoveryPipeline, approveAndExecute, rejectAction } from "@/lib/engine/recovery-engine"
import { getDashboardMetrics } from "@/lib/analytics"

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

describe("analytics — dashboard numbers come from the database, not hard-coding", () => {
  it("computes at-risk, recovered, and rate from real state transitions", async () => {
    // 1 recovered (via forced retry), 1 gated (rejected), 1 untouched failure
    let recovered = false
    for (let i = 0; i < 10 && !recovered; i++) {
      const p = await ingestFailure({
        id: `analyticok${i}`,
        merchantId,
        customerId,
        amount: 100000, // ₹1,000
        method: "UPI",
        gatewayCode: "timeout",
        source: "SIMULATION",
      })
      const r = await runRecoveryPipeline(p.id)
      recovered = r.status === "RECOVERED"
    }
    expect(recovered).toBe(true)

    const gated = await ingestFailure({
      merchantId,
      customerId,
      amount: 8_000_000,
      method: "CARD",
      failureCategory: "TEMPORARY_DECLINE",
      source: "SIMULATION",
    })
    await runRecoveryPipeline(gated.id)
    const gatedAction = await db.recoveryAction.findFirstOrThrow({ where: { paymentId: gated.id } })
    await rejectAction(gatedAction.id, "closing it")

    const untouched = await ingestFailure({
      merchantId,
      customerId,
      amount: 250000,
      method: "CARD",
      failureCategory: "EXPIRED_CARD",
      source: "SIMULATION",
    })
    void untouched

    const metrics = await getDashboardMetrics(merchantId)

    expect(metrics.recoveredPayments).toBeGreaterThanOrEqual(1)
    // The rejected (closed) payment must NOT count as at-risk
    const closed = await db.payment.findUniqueOrThrow({ where: { id: gated.id } })
    expect(closed.status).toBe("FAILED")
    const atRiskIds = await db.payment.findMany({
      where: { merchantId, status: "FAILED" },
      include: { actions: { orderBy: { createdAt: "desc" }, take: 1 } },
    })
    const openIds = atRiskIds
      .filter((p) => {
        const last = p.actions[0]
        return !last || !(last.status === "REJECTED" || last.status === "SKIPPED" || last.actionType === "DO_NOTHING")
      })
      .map((p) => p.id)
    expect(metrics.openOpportunities).toBe(openIds.length)
    expect(metrics.revenueAtRisk).toBe(
      (await Promise.all(openIds.map((id) => db.payment.findUniqueOrThrow({ where: { id } })))).reduce((s, p) => s + p.amount, 0),
    )
    expect(metrics.recoveryRate).toBeGreaterThan(0)
    expect(metrics.recoveryRate).toBeLessThanOrEqual(1)
    expect(metrics.trend).toHaveLength(7)
    expect(metrics.trend[6].date).toBe(new Date().toISOString().slice(0, 10))
  })

  it("moves money from at-risk to recovered as approvals execute", async () => {
    const before = await getDashboardMetrics(merchantId)

    const gated = await ingestFailure({
      merchantId,
      customerId,
      amount: 6_500_000, // ₹65,000 → DELAY_AND_RETRY gated at ₹50k
      method: "CARD",
      failureCategory: "TEMPORARY_DECLINE",
      source: "SIMULATION",
    })
    const r = await runRecoveryPipeline(gated.id)
    if (r.policyDecision === "NEEDS_APPROVAL") {
      const action = await db.recoveryAction.findFirstOrThrow({ where: { paymentId: gated.id } })
      // Approve → executes; outcome is deterministic but either way it leaves AWAITING state
      await approveAndExecute(action.id)
      const after = await getDashboardMetrics(merchantId)
      const payment = await db.payment.findUniqueOrThrow({ where: { id: gated.id } })
      if (payment.status === "RECOVERED") {
        expect(after.revenueRecovered).toBe(before.revenueRecovered + 6_500_000)
        expect(after.recoveredPayments).toBe(before.recoveredPayments + 1)
      } else {
        expect(payment.status).toBe("FAILED")
      }
    } else {
      throw new Error("expected high-value action to be gated")
    }
  })
})
