import Link from "next/link"
import {
  TrendingDown,
  TrendingUp,
  RefreshCcw,
  CreditCard,
  Clock,
  ArrowRight,
  ShieldAlert,
  Brain,
  Scale,
  CheckCircle2,
} from "lucide-react"
import { Shell } from "@/components/shell"
import { Card, CardHeader, Badge, Money, EmptyState, timestamp, Eyebrow } from "@/components/ui"
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
    db.auditLog.findMany({ where: { merchantId: merchant.id }, orderBy: { createdAt: "desc" }, take: 10 }),
  ])

  const totalFailures = metrics.recoveredPayments + metrics.failedPayments

  return (
    <Shell active="/" title="Overview" subtitle="AI Revenue Recovery Command Center">
      {/* ---------- Action banner ---------- */}
      {metrics.pendingApprovals > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-warn/35 bg-warn-soft/70 px-4 py-3 animate-fade-up" role="alert">
          <ShieldAlert size={16} className="shrink-0 text-warn" aria-hidden />
          <div className="min-w-0 flex-1 text-[13px] leading-snug text-ink">
            <span className="font-semibold">
              {metrics.pendingApprovals} recovery {metrics.pendingApprovals === 1 ? "action needs" : "actions need"} your
              approval
            </span>{" "}
            <span className="text-ink-soft">— AI recommended, policy gated, you authorize.</span>
          </div>
          <a
            href="#approvals"
            className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-warn underline-offset-2 hover:underline"
          >
            Review <ArrowRight size={12} strokeWidth={2.4} aria-hidden />
          </a>
        </div>
      )}

      {/* ---------- KPI row ---------- */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {/* Primary: revenue at risk */}
        <Card className="relative col-span-2 overflow-hidden p-[18px] animate-fade-up md:col-span-1 xl:col-span-1">
          <span className="absolute inset-x-0 top-0 h-[3px] bg-risk/80" aria-hidden />
          <div className="flex items-center justify-between gap-2">
            <Eyebrow>Revenue at risk</Eyebrow>
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-risk-soft">
              <TrendingDown size={13} className="text-risk" strokeWidth={2.3} aria-hidden />
            </span>
          </div>
          <p className="tnum mt-3 text-[27px] font-bold leading-none tracking-[-0.02em] text-ink" title={formatINR(metrics.revenueAtRisk)}>
            {formatINR(metrics.revenueAtRisk, { compact: true })}
          </p>
          <p className="mt-2 text-[11.5px] leading-snug text-ink-faint">
            {metrics.openOpportunities} open {metrics.openOpportunities === 1 ? "opportunity" : "opportunities"}
          </p>
        </Card>

        {/* Primary: recovered */}
        <Card className="relative col-span-2 overflow-hidden p-[18px] animate-fade-up md:col-span-1 xl:col-span-1">
          <span className="absolute inset-x-0 top-0 h-[3px] bg-good/80" aria-hidden />
          <div className="flex items-center justify-between gap-2">
            <Eyebrow>Revenue recovered</Eyebrow>
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-good-soft">
              <TrendingUp size={13} className="text-good" strokeWidth={2.3} aria-hidden />
            </span>
          </div>
          <p className="tnum mt-3 text-[27px] font-bold leading-none tracking-[-0.02em] text-good" title={formatINR(metrics.revenueRecovered)}>
            {formatINR(metrics.revenueRecovered, { compact: true })}
          </p>
          <p className="mt-2 text-[11.5px] leading-snug text-ink-faint">
            {metrics.recoveredPayments} {metrics.recoveredPayments === 1 ? "payment" : "payments"} saved by RecoverAI
          </p>
        </Card>

        {/* Recovery performance with gauge */}
        <Card className="col-span-2 p-[18px] animate-fade-up md:col-span-1">
          <div className="flex items-center justify-between gap-2">
            <Eyebrow>Recovery rate</Eyebrow>
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-soft">
              <RefreshCcw size={13} className="text-brand-deep" strokeWidth={2.3} aria-hidden />
            </span>
          </div>
          <p className="tnum mt-3 text-[27px] font-bold leading-none tracking-[-0.02em] text-ink">
            {(metrics.recoveryRate * 100).toFixed(0)}%
          </p>
          <div
            className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[#eef0f4]"
            role="meter"
            aria-valuenow={Math.round(metrics.recoveryRate * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Recovery rate"
          >
            <div className="h-full rounded-full bg-good/85" style={{ width: `${metrics.recoveryRate * 100}%` }} />
          </div>
          <p className="tnum mt-2 text-[11.5px] leading-snug text-ink-faint">
            {metrics.recoveredPayments}/{totalFailures} failures recovered
            {metrics.avgConfidence !== null && <> · avg AI confidence {metrics.avgConfidence.toFixed(2)}</>}
          </p>
        </Card>

        {/* Approvals — action-required accent */}
        <Card className="col-span-1 p-[18px] animate-fade-up">
          <div className="flex items-center justify-between gap-2">
            <Eyebrow>Pending approvals</Eyebrow>
            <span className={`flex h-6 w-6 items-center justify-center rounded-md ${metrics.pendingApprovals > 0 ? "bg-warn-soft" : "bg-surface-sunken"}`}>
              <Clock size={13} className={metrics.pendingApprovals > 0 ? "text-warn" : "text-ink-faint"} strokeWidth={2.3} aria-hidden />
            </span>
          </div>
          <p className={`tnum mt-3 text-[27px] font-bold leading-none tracking-[-0.02em] ${metrics.pendingApprovals > 0 ? "text-warn" : "text-ink"}`}>
            {metrics.pendingApprovals}
          </p>
          {metrics.pendingApprovals > 0 ? (
            <a href="#approvals" className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-semibold text-warn hover:underline">
              Review now <ArrowRight size={11} strokeWidth={2.4} aria-hidden />
            </a>
          ) : (
            <p className="mt-2 text-[11.5px] text-ink-faint">nothing waiting</p>
          )}
        </Card>

        {/* Secondary: failures */}
        <Card className="col-span-1 p-[18px] animate-fade-up">
          <div className="flex items-center justify-between gap-2">
            <Eyebrow>Failed payments</Eyebrow>
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-sunken">
              <CreditCard size={13} className="text-ink-soft" strokeWidth={2.3} aria-hidden />
            </span>
          </div>
          <p className="tnum mt-3 text-[27px] font-bold leading-none tracking-[-0.02em] text-ink">{metrics.failedPayments}</p>
          <p className="mt-2 text-[11.5px] text-ink-faint">{metrics.byCategory.length} failure {metrics.byCategory.length === 1 ? "type" : "types"}</p>
        </Card>
      </div>

      {/* ---------- Charts ---------- */}
      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader
            title="Failures vs recoveries"
            subtitle="Last 7 days"
          />
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

      {/* ---------- Approvals + activity ---------- */}
      <div className="mt-4 grid gap-4 lg:grid-cols-5" id="approvals">
        <Card className="lg:col-span-3">
          <CardHeader
            eyebrow="Human-in-the-loop"
            title="Awaiting your approval"
            subtitle="High-value actions gated by the policy engine"
            action={approvals.length > 0 ? <Badge value="NEEDS_APPROVAL" /> : undefined}
          />
          {approvals.length === 0 ? (
            <EmptyState
              icon={<Clock size={26} strokeWidth={1.6} />}
              title="No approvals pending"
              hint="Actions above the amount threshold (e.g. ₹50,000+ retries) will pause here for your sign-off."
            />
          ) : (
            <ul className="divide-y divide-line/70">
              {approvals.map((a) => (
                <li key={a.id} className="px-5 py-4">
                  {/* headline: money first */}
                  <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    <Money paise={a.payment.amount} className="text-[20px] font-bold tracking-[-0.02em] text-ink" />
                    <Link
                      href={`/payments/${a.paymentId}`}
                      className="text-[13.5px] font-semibold text-ink hover:text-brand-deep"
                    >
                      {a.payment.customer.name}
                    </Link>
                    <Badge value={a.payment.failure?.category ?? "UNKNOWN"} />
                    {a.payment.customer.subscriptionActive && (
                      <span className="text-[11px] font-medium text-violet">subscription at risk</span>
                    )}
                  </div>

                  {/* the governed flow: AI → policy → you */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[11.5px]">
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-violet/25 bg-violet-soft px-2 py-1 font-medium text-violet">
                      <Brain size={11} strokeWidth={2.4} aria-hidden />
                      AI recommends {a.actionType.replace(/_/g, " ").toLowerCase()}
                    </span>
                    <ArrowRight size={11} className="text-ink-faint/70" aria-hidden />
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-warn/30 bg-warn-soft px-2 py-1 font-medium text-warn">
                      <Scale size={11} strokeWidth={2.4} aria-hidden />
                      Policy: approval required
                    </span>
                    <ArrowRight size={11} className="text-ink-faint/70" aria-hidden />
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-sunken px-2 py-1 font-medium text-ink-soft">
                      <CheckCircle2 size={11} strokeWidth={2.4} aria-hidden />
                      Your decision
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5">
                    <p className="max-w-md text-[11.5px] leading-snug text-ink-faint">{a.policyReason}</p>
                    <ApproveRejectButtons actionId={a.id} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Recovery activity"
            subtitle="Every decision, traced"
            action={
              <Link href="/activity" className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-deep hover:underline">
                Full audit <ArrowRight size={12} aria-hidden />
              </Link>
            }
          />
          {recentLogs.length === 0 ? (
            <EmptyState title="No activity yet" />
          ) : (
            <ul className="px-5 pb-4">
              {recentLogs.map((log) => (
                <li key={log.id} className="flex gap-2.5 pb-3 last:pb-0">
                  <span
                    className={`mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full ${
                      log.actor.startsWith("AI:") ? "bg-violet/70" : log.actor === "POLICY" ? "bg-brand/60" : "bg-ink-faint/50"
                    }`}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="text-[12px] leading-snug text-ink-soft">
                      <span className="mr-1 font-mono text-[10px] font-medium uppercase tracking-wide text-ink-faint">
                        {log.actor}
                      </span>
                      {log.paymentId ? (
                        <Link href={`/payments/${log.paymentId}`} className="hover:text-brand-deep">
                          {log.message}
                        </Link>
                      ) : (
                        log.message
                      )}
                    </p>
                    <p className="tnum mt-0.5 font-mono text-[10px] text-ink-faint">{timestamp(log.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ---------- At-risk customers ---------- */}
      <Card className="mt-4">
        <CardHeader eyebrow="Exposure" title="High-value customers needing attention" subtitle="Open failure amount by customer" />
        {metrics.topAtRiskCustomers.length === 0 ? (
          <EmptyState title="No customers at risk" hint="Every failed payment has been recovered or closed." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-y border-line/70 text-left text-[10px] uppercase tracking-[0.12em] text-ink-faint">
                  <th scope="col" className="px-5 py-2 font-semibold">Customer</th>
                  <th scope="col" className="px-5 py-2 font-semibold">Open failures</th>
                  <th scope="col" className="px-5 py-2 font-semibold">Amount at risk</th>
                  <th scope="col" className="px-5 py-2 font-semibold">Subscription</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {metrics.topAtRiskCustomers.map((c) => (
                  <tr key={c.email} className="transition-colors hover:bg-surface-sunken">
                    <td className="px-5 py-2.5">
                      <span className="font-medium text-ink">{c.name}</span>
                      <span className="block text-[11px] text-ink-faint">{c.email}</span>
                    </td>
                    <td className="tnum px-5 py-2.5 font-mono">{c.failures}</td>
                    <td className="px-5 py-2.5 font-semibold text-risk">
                      <Money paise={c.amount} />
                    </td>
                    <td className="px-5 py-2.5">
                      {c.subscription ? <Badge value="SUBSCRIPTION_ACTIVE" /> : <span className="text-[12px] text-ink-faint">—</span>}
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
