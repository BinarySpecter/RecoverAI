/**
 * Deterministic seed — creates a realistic merchant dataset and runs the
 * ACTUAL recovery pipeline (mock AI → policy → simulation → audit) for every
 * failed payment, then backdates timestamps to build a 7-day history.
 *
 * Re-running produces identical data (fixed ids + deterministic providers).
 */
process.env.AI_PROVIDER = "mock" // seed must stay deterministic & offline

import { PrismaClient } from "@prisma/client"
import { ingestFailure } from "@/lib/engine/ingestion"
import { runRecoveryPipeline } from "@/lib/engine/recovery-engine"
import type { FailureCategory, PaymentMethod } from "@/lib/types"

const db = new PrismaClient()

const P = (rupees: number) => Math.round(rupees * 100) // rupees → paise

interface CustomerSpec {
  key: string
  name: string
  email: string
  phone: string
  success: number
  failed: number
  ltv: number // rupees
  aov: number // rupees
  sub?: string
  risk?: number
}

const CUSTOMERS: CustomerSpec[] = [
  { key: "rahul", name: "Rahul Sharma", email: "rahul.sharma@gmail.com", phone: "+91-98200-11223", success: 8, failed: 1, ltv: 82400, aov: 8200, sub: "Pro Monthly", risk: 0.05 },
  { key: "priya", name: "Priya Patel", email: "priya.patel@outlook.com", phone: "+91-99870-33445", success: 15, failed: 0, ltv: 342000, aov: 21800, sub: "Enterprise", risk: 0.02 },
  { key: "arjun", name: "Arjun Mehta", email: "arjun.mehta@gmail.com", phone: "+91-98111-55667", success: 5, failed: 2, ltv: 41500, aov: 6900, risk: 0.12 },
  { key: "sneha", name: "Sneha Reddy", email: "sneha.reddy@yahoo.com", phone: "+91-97000-77889", success: 1, failed: 0, ltv: 4999, aov: 4999, risk: 0.15 },
  { key: "vikram", name: "Vikram Singh", email: "vikram.singh@gmail.com", phone: "+91-99100-88990", success: 3, failed: 4, ltv: 22300, aov: 5100, risk: 0.3 },
  { key: "ananya", name: "Ananya Iyer", email: "ananya.iyer@gmail.com", phone: "+91-98450-99001", success: 12, failed: 1, ltv: 118000, aov: 9100, sub: "Growth", risk: 0.04 },
  { key: "karthik", name: "Karthik Nair", email: "karthik.nair@gmail.com", phone: "+91-97460-10112", success: 6, failed: 1, ltv: 28800, aov: 4100, risk: 0.1 },
  { key: "meera", name: "Meera Joshi", email: "meera.joshi@gmail.com", phone: "+91-98330-12123", success: 4, failed: 1, ltv: 35600, aov: 7100, risk: 0.08 },
  { key: "rohan", name: "Rohan Gupta", email: "rohan.gupta@gmail.com", phone: "+91-96500-13134", success: 7, failed: 5, ltv: 51200, aov: 6400, risk: 0.72 },
  { key: "divya", name: "Divya Krishnan", email: "divya.krishnan@gmail.com", phone: "+91-98840-14145", success: 9, failed: 0, ltv: 156000, aov: 15200, sub: "Pro Annual", risk: 0.03 },
  { key: "sameer", name: "Sameer Khan", email: "sameer.khan@gmail.com", phone: "+91-97680-15146", success: 2, failed: 1, ltv: 9200, aov: 3000, risk: 0.18 },
  { key: "lakshmi", name: "Lakshmi Menon", email: "lakshmi.menon@gmail.com", phone: "+91-98950-16147", success: 7, failed: 1, ltv: 66400, aov: 8300, risk: 0.06 },
  { key: "aditya", name: "Aditya Rao", email: "aditya.rao@gmail.com", phone: "+91-96180-17148", success: 4, failed: 2, ltv: 30100, aov: 6000, risk: 0.14 },
  { key: "nisha", name: "Nisha Agarwal", email: "nisha.agarwal@gmail.com", phone: "+91-98730-18149", success: 5, failed: 1, ltv: 47700, aov: 7900, risk: 0.09 },
  { key: "farhan", name: "Farhan Ali", email: "farhan.ali@gmail.com", phone: "+91-97020-19150", success: 2, failed: 0, ltv: 7800, aov: 3900, risk: 0.22 },
  { key: "kavitha", name: "Kavitha Suresh", email: "kavitha.suresh@gmail.com", phone: "+91-98400-20151", success: 8, failed: 1, ltv: 71200, aov: 8900, sub: "Pro Monthly", risk: 0.05 },
  { key: "nikhil", name: "Nikhil Verma", email: "nikhil.verma@gmail.com", phone: "+91-99870-21152", success: 3, failed: 0, ltv: 68500, aov: 22800, risk: 0.11 },
  { key: "pooja", name: "Pooja Desai", email: "pooja.desai@gmail.com", phone: "+91-98220-22153", success: 6, failed: 1, ltv: 38900, aov: 5500, risk: 0.07 },
  { key: "mohit", name: "Mohit Bhandari", email: "mohit.b@gmail.com", phone: "+91-96370-23154", success: 4, failed: 6, ltv: 18900, aov: 4700, risk: 0.85 },
]

interface ScenarioSpec {
  id: string
  customer: string
  category: FailureCategory
  amount: number // rupees
  method: PaymentMethod
  daysAgo: number
  hour: number
  retryCount?: number
  description?: string
}

const SCENARIOS: ScenarioSpec[] = [
  { id: "seedpay001", customer: "rahul", category: "TEMPORARY_DECLINE", amount: 12499, method: "CARD", daysAgo: 0, hour: 1, description: "Order #ORD-7841 · Wireless headphones" },
  { id: "seedpay002", customer: "priya", category: "HIGH_VALUE_FAILURE", amount: 124999, method: "CARD", daysAgo: 2, hour: 11, description: "Order #ORD-7812 · Bulk license renewal" },
  { id: "seedpay003", customer: "arjun", category: "INSUFFICIENT_FUNDS", amount: 3499, method: "UPI", daysAgo: 1, hour: 14, description: "Order #ORD-7826 · Desk lamp" },
  { id: "seedpay004", customer: "sneha", category: "EXPIRED_CARD", amount: 2999, method: "CARD", daysAgo: 3, hour: 9, description: "Order #ORD-7803 · Skincare set" },
  { id: "seedpay005", customer: "vikram", category: "REPEATED_FAILURES", amount: 7999, method: "NETBANKING", daysAgo: 2, hour: 16, retryCount: 3, description: "Order #ORD-7815 · Fitness band" },
  { id: "seedpay006", customer: "ananya", category: "SUBSCRIPTION_RENEWAL_FAILURE", amount: 4999, method: "CARD", daysAgo: 1, hour: 8, description: "Growth plan renewal" },
  { id: "seedpay007", customer: "karthik", category: "NETWORK_FAILURE", amount: 1999, method: "UPI", daysAgo: 0, hour: 3, description: "Order #ORD-7844 · Phone case" },
  { id: "seedpay008", customer: "rohan", category: "FRAUD_RISK", amount: 49999, method: "CARD", daysAgo: 4, hour: 22, description: "Order #ORD-7796 · Gift cards ×10" },
  { id: "seedpay009", customer: "meera", category: "AUTHENTICATION_FAILURE", amount: 5999, method: "CARD", daysAgo: 5, hour: 13, description: "Order #ORD-7781 · Kurti set" },
  { id: "seedpay010", customer: "divya", category: "ABANDONED_CHECKOUT", amount: 18999, method: "NETBANKING", daysAgo: 6, hour: 19, description: "Order #ORD-7768 · Air purifier" },
  { id: "seedpay011", customer: "sameer", category: "INSUFFICIENT_FUNDS", amount: 1499, method: "WALLET", daysAgo: 2, hour: 20, description: "Order #ORD-7819 · Combo offer" },
  { id: "seedpay012", customer: "lakshmi", category: "TEMPORARY_DECLINE", amount: 9499, method: "CARD", daysAgo: 4, hour: 10, description: "Order #ORD-7793 · Blender" },
  { id: "seedpay013", customer: "aditya", category: "NETWORK_FAILURE", amount: 14999, method: "NETBANKING", daysAgo: 5, hour: 15, description: "Order #ORD-7778 · Monitor" },
  { id: "seedpay014", customer: "nisha", category: "HIGH_VALUE_FAILURE", amount: 74999, method: "CARD", daysAgo: 3, hour: 12, description: "Order #ORD-7807 · Laptop" },
  { id: "seedpay015", customer: "farhan", category: "AUTHENTICATION_FAILURE", amount: 2499, method: "UPI", daysAgo: 6, hour: 17, description: "Order #ORD-7771 · Sneakers" },
  { id: "seedpay016", customer: "kavitha", category: "SUBSCRIPTION_RENEWAL_FAILURE", amount: 2999, method: "CARD", daysAgo: 2, hour: 7, description: "Pro Monthly renewal" },
  { id: "seedpay017", customer: "nikhil", category: "TEMPORARY_DECLINE", amount: 59999, method: "CARD", daysAgo: 1, hour: 18, description: "Order #ORD-7833 · Camera lens" },
  { id: "seedpay018", customer: "pooja", category: "ABANDONED_CHECKOUT", amount: 3499, method: "WALLET", daysAgo: 6, hour: 21, description: "Order #ORD-7774 · Earrings" },
  { id: "seedpay019", customer: "mohit", category: "FRAUD_RISK", amount: 24999, method: "CARD", daysAgo: 1, hour: 23, description: "Order #ORD-7836 · Multiple gift cards" },
]

// Successful payments spread across the week (history/trend realism).
const CAPTURED: { customer: string; amount: number; method: PaymentMethod; daysAgo: number; hour: number }[] = [
  { customer: "priya", amount: 21400, method: "CARD", daysAgo: 6, hour: 11 },
  { customer: "rahul", amount: 8200, method: "UPI", daysAgo: 6, hour: 13 },
  { customer: "divya", amount: 15200, method: "CARD", daysAgo: 5, hour: 10 },
  { customer: "ananya", amount: 9100, method: "CARD", daysAgo: 5, hour: 16 },
  { customer: "karthik", amount: 4100, method: "UPI", daysAgo: 4, hour: 12 },
  { customer: "lakshmi", amount: 8300, method: "NETBANKING", daysAgo: 4, hour: 15 },
  { customer: "meera", amount: 7100, method: "CARD", daysAgo: 3, hour: 11 },
  { customer: "nikhil", amount: 22800, method: "CARD", daysAgo: 3, hour: 18 },
  { customer: "kavitha", amount: 8900, method: "UPI", daysAgo: 2, hour: 9 },
  { customer: "pooja", amount: 5500, method: "WALLET", daysAgo: 2, hour: 14 },
  { customer: "aditya", amount: 6000, method: "NETBANKING", daysAgo: 1, hour: 10 },
  { customer: "arjun", amount: 6900, method: "CARD", daysAgo: 1, hour: 17 },
  { customer: "sneha", amount: 4999, method: "UPI", daysAgo: 0, hour: 8 },
  { customer: "nisha", amount: 7900, method: "CARD", daysAgo: 0, hour: 12 },
]

function daysAgoAt(daysAgo: number, hour: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(hour, (daysAgo * 13 + hour * 7) % 60, ((daysAgo * 29 + hour * 17) % 60), 0)
  return d
}

/** Shift a payment's pipeline records so the audit trail reads naturally after the failure time. */
async function backdatePipeline(paymentId: string, base: Date) {
  const at = (seconds: number) => new Date(base.getTime() + seconds * 1000)
  const analysis = await db.aIAnalysis.findFirst({ where: { paymentId }, orderBy: { createdAt: "asc" } })
  if (analysis) await db.aIAnalysis.update({ where: { id: analysis.id }, data: { createdAt: at(2) } })
  const action = await db.recoveryAction.findFirst({ where: { paymentId }, orderBy: { createdAt: "asc" } })
  if (action) {
    await db.recoveryAction.update({
      where: { id: action.id },
      data: { createdAt: at(4), executedAt: action.executedAt ? at(6) : null, completedAt: action.completedAt ? at(7) : null },
    })
  }
  const payment = await db.payment.findUnique({ where: { id: paymentId } })
  if (payment?.status === "RECOVERED") {
    await db.payment.update({ where: { id: paymentId }, data: { recoveredAt: at(8) } })
  }
  const logs = await db.auditLog.findMany({ where: { paymentId }, orderBy: { createdAt: "asc" } })
  for (const log of logs) {
    const offset = log.event === "payment.failed" ? 0
      : log.event === "ai.analysis.completed" ? 3
      : log.event.startsWith("policy.") ? 5
      : log.event === "recovery.approved" ? 6
      : 8
    await db.auditLog.update({ where: { id: log.id }, data: { createdAt: at(offset) } })
  }
}

async function main() {
  console.log("Resetting database…")
  // Wipe in FK-safe order (audit logs first; payments cascade the rest).
  await db.auditLog.deleteMany()
  await db.recoveryAction.deleteMany()
  await db.aIAnalysis.deleteMany()
  await db.failureEvent.deleteMany()
  await db.paymentAttempt.deleteMany()
  await db.payment.deleteMany()
  await db.customer.deleteMany()
  await db.merchant.deleteMany()

  const merchant = await db.merchant.create({
    data: { name: "TechNova Commerce", email: "owner@technova.example" },
  })
  console.log(`Merchant: ${merchant.name}`)

  const customerIds = new Map<string, string>()
  for (const c of CUSTOMERS) {
    const row = await db.customer.create({
      data: {
        merchantId: merchant.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        successfulPayments: c.success,
        failedPayments: c.failed,
        lifetimeValue: P(c.ltv),
        avgOrderValue: P(c.aov),
        subscriptionActive: Boolean(c.sub),
        subscriptionPlan: c.sub ?? null,
        riskScore: c.risk ?? 0.05,
      },
    })
    customerIds.set(c.key, row.id)
  }
  console.log(`Customers: ${CUSTOMERS.length}`)

  // Successful history
  for (let i = 0; i < CAPTURED.length; i++) {
    const c = CAPTURED[i]
    await db.payment.create({
      data: {
        id: `seedcap${String(i + 1).padStart(3, "0")}`,
        merchantId: merchant.id,
        customerId: customerIds.get(c.customer)!,
        orderId: `order_cap${String(i + 1).padStart(3, "0")}`,
        amount: P(c.amount),
        status: "CAPTURED",
        method: c.method,
        description: "Order payment",
        source: "SEED",
        createdAt: daysAgoAt(c.daysAgo, c.hour),
      },
    })
  }
  console.log(`Captured payments: ${CAPTURED.length}`)

  // Failure scenarios — ingested through the real funnel, then pipeline runs
  console.log(`Running recovery pipeline for ${SCENARIOS.length} failures…`)
  for (const s of SCENARIOS) {
    const when = daysAgoAt(s.daysAgo, s.hour)
    const payment = await ingestFailure({
      id: s.id,
      merchantId: merchant.id,
      customerId: customerIds.get(s.customer)!,
      amount: P(s.amount),
      method: s.method,
      failureCategory: s.category,
      description: s.description,
      source: "SEED",
      retryCount: s.retryCount ?? 0,
      createdAt: when,
    })
    try {
      await runRecoveryPipeline(payment.id)
      await backdatePipeline(payment.id, when)
    } catch (err) {
      console.error(`Pipeline error for ${s.id}:`, err instanceof Error ? err.message : err)
    }
  }

  const summary = await db.payment.groupBy({ by: ["status"], _count: true, _sum: { amount: true } })
  console.log("Seed complete:", summary.map((s) => `${s.status}=${s._count}`).join(" "))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
