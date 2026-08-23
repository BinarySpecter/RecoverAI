import { db } from "@/lib/db"

/**
 * Dashboard analytics — every number on the dashboard is computed here from
 * database state. Nothing is hard-coded.
 */

export interface DashboardMetrics {
  revenueAtRisk: number // paise: FAILED payments not closed by policy
  revenueRecovered: number // paise: RECOVERED payments
  recoveryRate: number // 0..1
  failedPayments: number
  recoveredPayments: number
  pendingApprovals: number
  openOpportunities: number
  avgConfidence: number | null
  byCategory: { category: string; count: number; atRisk: number; recovered: number }[]
  trend: { date: string; failed: number; recovered: number; recoveredAmount: number }[]
  topAtRiskCustomers: { name: string; email: string; amount: number; failures: number; subscription: boolean }[]
  recentActivityCount: number
}

export async function getDashboardMetrics(merchantId: string): Promise<DashboardMetrics> {
  const [failed, recovered, pending, analyses] = await Promise.all([
    db.payment.findMany({
      where: { merchantId, status: "FAILED" },
      include: { failure: true, actions: true, customer: true },
    }),
    db.payment.findMany({
      where: { merchantId, status: "RECOVERED" },
      select: { amount: true, recoveredAt: true, createdAt: true },
    }),
    db.recoveryAction.count({ where: { status: "AWAITING_APPROVAL", payment: { merchantId } } }),
    db.aIAnalysis.findMany({
      where: { payment: { merchantId } },
      select: { confidence: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ])

  const revenueRecovered = recovered.reduce((s, p) => s + p.amount, 0)

  // "At risk" = failed payments whose recovery isn't structurally closed
  // (a final REJECTED/DO_NOTHING action with nothing pending afterwards).
  const openFailures = failed.filter((p) => {
    const actions = p.actions ?? []
    if (actions.length === 0) return true
    const last = [...actions].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
    return !(last.status === "REJECTED" || last.actionType === "DO_NOTHING" || last.status === "SKIPPED")
  })
  const revenueAtRisk = openFailures.reduce((s, p) => s + p.amount, 0)

  const recoveryRate =
    recovered.length + failed.length > 0 ? recovered.length / (recovered.length + failed.length) : 0

  // Category breakdown
  const categoryMap = new Map<string, { count: number; atRisk: number; recovered: number }>()
  for (const p of failed) {
    const cat = p.failure?.category ?? "UNKNOWN"
    const entry = categoryMap.get(cat) ?? { count: 0, atRisk: 0, recovered: 0 }
    entry.count++
    entry.atRisk += p.amount
    categoryMap.set(cat, entry)
  }
  for (const p of recovered) {
    // recovered payments keep their original failure category via FailureEvent
  }
  const recoveredWithCategory = await db.payment.findMany({
    where: { merchantId, status: "RECOVERED" },
    include: { failure: true },
  })
  for (const p of recoveredWithCategory) {
    const cat = p.failure?.category ?? "UNKNOWN"
    const entry = categoryMap.get(cat) ?? { count: 0, atRisk: 0, recovered: 0 }
    entry.recovered += p.amount
    categoryMap.set(cat, entry)
  }

  // 7-day trend (by day of failure; recovered = recovered that day)
  const trend: DashboardMetrics["trend"] = []
  const today = new Date()
  for (let i = 6; i >= 0; i--) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)
    const next = new Date(day.getTime() + 86_400_000)
    const dayFailed = failed.filter((p) => p.createdAt >= day && p.createdAt < next).length
    const dayRecoveredList = recovered.filter((p) => p.recoveredAt && p.recoveredAt >= day && p.recoveredAt < next)
    trend.push({
      date: day.toISOString().slice(0, 10),
      failed: dayFailed,
      recovered: dayRecoveredList.length,
      recoveredAmount: dayRecoveredList.reduce((s, p) => s + p.amount, 0),
    })
  }

  // Top at-risk customers
  const byCustomer = new Map<string, { name: string; email: string; amount: number; failures: number; subscription: boolean }>()
  for (const p of openFailures) {
    const key = p.customer.email
    const entry =
      byCustomer.get(key) ??
      { name: p.customer.name, email: p.customer.email, amount: 0, failures: 0, subscription: p.customer.subscriptionActive }
    entry.amount += p.amount
    entry.failures++
    byCustomer.set(key, entry)
  }
  const topAtRiskCustomers = [...byCustomer.values()].sort((a, b) => b.amount - a.amount).slice(0, 5)

  const avgConfidence =
    analyses.length > 0 ? analyses.reduce((s, a) => s + a.confidence, 0) / analyses.length : null

  return {
    revenueAtRisk,
    revenueRecovered,
    recoveryRate,
    failedPayments: failed.length,
    recoveredPayments: recovered.length,
    pendingApprovals: pending,
    openOpportunities: openFailures.length,
    avgConfidence,
    byCategory: [...categoryMap.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.atRisk - a.atRisk),
    trend,
    topAtRiskCustomers,
    recentActivityCount: await db.auditLog.count({ where: { merchantId } }),
  }
}
