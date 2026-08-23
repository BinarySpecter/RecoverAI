import { db } from "@/lib/db"

/** Shared fixtures: one merchant + a stable customer per suite. */
export async function seedFixtures() {
  await cleanAll()
  const merchant = await db.merchant.create({
    data: { name: "Test Merchant", email: "test@merchant.example" },
  })
  const customer = await db.customer.create({
    data: {
      merchantId: merchant.id,
      name: "Test Customer",
      email: "customer@test.example",
      successfulPayments: 8,
      failedPayments: 1,
      lifetimeValue: 800000,
      avgOrderValue: 80000,
      riskScore: 0.05,
    },
  })
  const riskyCustomer = await db.customer.create({
    data: {
      merchantId: merchant.id,
      name: "Risky Customer",
      email: "risky@test.example",
      successfulPayments: 2,
      failedPayments: 6,
      lifetimeValue: 90000,
      avgOrderValue: 30000,
      riskScore: 0.85,
    },
  })
  return { merchant, customer, riskyCustomer }
}

export async function cleanAll() {
  await db.auditLog.deleteMany()
  await db.recoveryAction.deleteMany()
  await db.aIAnalysis.deleteMany()
  await db.failureEvent.deleteMany()
  await db.paymentAttempt.deleteMany()
  await db.payment.deleteMany()
  await db.customer.deleteMany()
  await db.merchant.deleteMany()
}
