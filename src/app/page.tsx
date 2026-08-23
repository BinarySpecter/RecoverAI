import Link from "next/link"
import {
  TrendingDown,
  TrendingUp,
  RefreshCcw,
  CreditCard,
  Clock,
  ArrowRight,
  ShieldAlert,
} from "lucide-react"
import { Shell } from "@/components/shell"
import { Card, CardHeader, Badge, Money, timeAgo, EmptyState, timestamp } from "@/components/ui"
import { TrendChart, CategoryBars } from "@/components/charts"
import { ApproveRejectButtons } from "@/components/action-buttons"
import { getDashboardMetrics } from "@/lib/analytics"
import { getMerchant, db } from "@/lib/db"
import { formatINR } from "@/lib/types"

export const dynamic = "force-dynamic"

export default async function OverviewPage() {
  const merchant = await getMerchant()
  const metrics = await getDashboardMetrics(merchant.id)

  const [approvals, recentLogs] = await Promise.all([
    db.recoveryAction.findMany({
      where: { status: "AWAITING_APPROVAL" },
      include: { payment: { include: { customer: true, failure: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.auditLog.findMany({ where: { merchantId: merchant.id }, orderBy: { createdAt: "desc" }, take: 12 }),
  ])

  const kpis = [
    {
      label: "Revenue at Risk",
      value: formatINR(metrics.revenueAtRisk, { compact: true }),
      raw: formatINR(metrics.revenueAtRisk),
      sub: `${metrics.openOpportunities} open opportunities`,
      icon: TrendingDown,
      tone: "text-risk",
      bg: "bg-risk-soft",
    },
    {
      label: "Revenue Recovered",
      value: formatINR(metrics.revenueRecovered, { compact: true }),
      raw: formatINR(metrics.revenueRecovered),
      sub: `${metrics.recoveredPayments} payments saved`,
      icon: TrendingUp,
      tone: "text-good",
      bg: "bg-good-soft",
    },
    {
      label: "Recovery Rate",
      value: `${(metrics.recoveryRate * 100).toFixed(0)}%`,
      raw: `${metrics.recoveredPayments}/${metrics.recoveredPayments + metrics.failedPayments} failures`,
      sub: metrics.avgConfidence !== null ? `avg AI confidence ${metrics.avgConfidence.toFixed(2)}` : "no analyses yet",
      icon: RefreshCcw,
      tone: "text-brand-deep",
      bg: "bg-brand-soft",
    },
    {
      label: "Failed Payments",
      value: String(metrics.failedPayments),
      raw: `${metrics.byCategory.length} failure types`,
      sub: "last 7 days shown in trend",
      icon: CreditCard,
      tone: "text-ink",
      bg: "bg-[#f1f2f5]",
    },
    {
      label: "Pending Approvals",
      value: String(metrics.pendingApprovals),
      raw: "high-value gated actions",
      sub: metrics.pendingApprovals > 0 ? "awaiting your decision" : "nothing waiting",
      icon: Clock,
      tone: metrics.pendingApprovals > 0 ? "text-violet" : "text-ink-faint",
      bg: metrics.pendingApprovals > 0 ? "bg-violet-soft" : "bg-[#f1f2f5]",
    },
  ]

  return (
    <Shell active="/" title="Overview" subtitle="AI Revenue Recovery Command Center">
      {metrics.pendingApprovals > 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-violet/30 bg-violet-soft/60 px-4 py-3 animate-fade-up">
          <ShieldAlert size={17} className="mt-0.5 shrink-0 text-violet" />
          <div className="text-[13px] leading-relaxed text-ink">
            <span className="font-semibold">{metrics.pendingApprovals} recovery {metrics.pendingApprovals === 1 ? "action" : "actions"} need your approval.</span>{" "}
            <span className="text-ink-soft">The AI recommended them, the policy engine gated them — you authorize.</span>{" "}
            <Link href="#approvals" className="font-medium text-brand-deep underline underline-offset-2">Review →</Link>
          </div>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {kpis.map((k) => (
          <Card key={k.label} className="p-4 animate-fade-up">
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-medium tracking-wide text-ink-faint uppercase">{k.label}</span>
              <span className={`flex h-6 w-6 items-center justify-center rounded-md ${k.bg}`}>
                <k.icon size={13} className={k.tone} strokeWidth={2.3} />
              </span>
            </div>
            <p className="mt-2.5 text-[24px] font-bold tracking-tight text-ink leading-none" title={k.raw}>
              {k.value}
            </p>
            <p className="mt-1.5 text-[11.5px] text-ink-faint">{k.sub}</p>
          </Card>
        ))}
      </div>

      {/* Charts row */}
      <div className="mt-5 grid lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-3">
          <CardHeader title="Failures vs recoveries" subtitle="Last 7 days — every bar is a payment event" />
          <TrendChart data={metrics.trend} />
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Where revenue is lost" subtitle="Failure categories by amount" />
          {metrics.byCategory.length === 0 ? (
            <EmptyState title="No failures recorded" hint="Simulate a failed payment to see the engine work." />
          ) : (
            <CategoryBars data={metrics.byCategory} />
          )}
        </Card>
      </div>

      {/* Approvals + activity */}
      <div className="mt-5 grid lg:grid-cols-5 gap-4" id="approvals">
        <Card className="lg:col-span-3">
          <CardHeader
            title="Awaiting your approval"
            subtitle="High-value actions gated by the policy engine"
            action={<Badge value="NEEDS_APPROVAL" />}
          />
          {approvals.length === 0 ? (
            <EmptyState
              icon={<Clock size={26} strokeWidth={1.6} />}
              title="No approvals pending"
              hint="Actions above the amount threshold (e.g. ₹50,000+ retries) will pause here for your sign-off."
            />
          ) : (
            <div className="divide-y divide-line/70">
              {approvals.map((a) => (
                <div key={a.id} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/payments/${a.paymentId}`} className="text-[13.5px] font-semibold text-ink hover:text-brand-deep">
                          {a.payment.customer.name}
                        </Link>
                        <Money paise={a.payment.amount} className="text-[13.5px] font-bold text-ink" />
                        <Badge value={a.payment.failure?.category ?? "UNKNOWN"} />
                      </div>
                      <p className="mt-1 text-[12px] text-ink-faint leading-relaxed">
                        AI recommends <span className="font-medium text-ink-soft">{a.actionType.replace(/_/g, " ").toLowerCase()}</span> · {a.policyReason}
                      </p>
                    </div>
                    <ApproveRejectButtons actionId={a.id} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Recovery activity"
            subtitle="Every decision, traced"
            action={
              <Link href="/activity" className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-deep hover:underline">
                Full audit <ArrowRight size={12} />
              </Link>
            }
          />
          {recentLogs.length === 0 ? (
            <EmptyState title="No activity yet" />
          ) : (
            <ul className="px-5 pb-4 space-y-2.5">
              {recentLogs.map((log) => (
                <li key={log.id} className="flex gap-2.5 text-[12.5px] leading-snug">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand/60" />
                  <div className="min-w-0">
                    <p className="text-ink-soft">
                      <span className="font-mono text-[10.5px] text-ink-faint">{log.actor}</span>{" "}
                      {log.paymentId ? (
                        <Link href={`/payments/${log.paymentId}`} className="hover:text-brand-deep">{log.message}</Link>
                      ) : (
                        log.message
                      )}
                    </p>
                    <p className="text-[10.5px] text-ink-faint font-mono">{timestamp(log.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Top at-risk customers */}
      <Card className="mt-5">
        <CardHeader title="High-value customers needing attention" subtitle="Open exposure by customer" />
        {metrics.topAtRiskCustomers.length === 0 ? (
          <EmptyState title="No customers at risk" hint="Every failed payment has been recovered or closed." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-y border-line/70 text-left text-[11px] uppercase tracking-wide text-ink-faint">
                  <th className="px-5 py-2 font-medium">Customer</th>
                  <th className="px-5 py-2 font-medium">Open failures</th>
                  <th className="px-5 py-2 font-medium">Amount at risk</th>
                  <th className="px-5 py-2 font-medium">Subscription</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {metrics.topAtRiskCustomers.map((c) => (
                  <tr key={c.email} className="hover:bg-[#f8f9fb]">
                    <td className="px-5 py-2.5">
                      <span className="font-medium text-ink">{c.name}</span>
                      <span className="block text-[11.5px] text-ink-faint">{c.email}</span>
                    </td>
                    <td className="px-5 py-2.5 font-mono">{c.failures}</td>
                    <td className="px-5 py-2.5 font-semibold text-risk">{formatINR(c.amount)}</td>
                    <td className="px-5 py-2.5">
                      {c.subscription ? <Badge value="SUBSCRIPTION_ACTIVE" /> : <span className="text-ink-faint text-[12px]">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Shell>
  )
}
