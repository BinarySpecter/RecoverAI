import Link from "next/link"
import { ArrowRight, Brain, ShieldCheck } from "lucide-react"
import { Shell } from "@/components/shell"
import { Panel, OpenSection, StatusText, Badge, timestamp } from "@/components/ui"
import { TrendChart, CategoryBars } from "@/components/charts"
import { ApproveRejectButtons } from "@/components/action-buttons"
import { getDashboardMetrics, getScopedMetrics } from "@/lib/analytics"
import { getMerchant, db } from "@/lib/db"
import { formatINR } from "@/lib/types"
import { ACTION_CATALOG, MAX_ACTIONS_PER_PAYMENT } from "@/lib/engine/actions"
import { CUSTOMER_CONTACT_RISK_CEILING } from "@/lib/engine/policy-engine"

export const dynamic = "force-dynamic"

export default async function OverviewPage() {
  const merchant = await getMerchant()
  const metrics = await getDashboardMetrics(merchant.id)
  const { recovered30Amount, recovered30Count, failed30, failed7, stoppedByPolicy } = await getScopedMetrics(merchant.id)

  const [approvals, recentLogs, queue] = await Promise.all([
    db.recoveryAction.findMany({
      where: { status: "AWAITING_APPROVAL" },
      include: { payment: { include: { customer: true, failure: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.auditLog.findMany({ where: { merchantId: merchant.id }, orderBy: { createdAt: "desc" }, take: 9 }),
    db.payment.findMany({
      where: { merchantId: merchant.id, status: "FAILED" },
      include: {
        customer: { select: { name: true, subscriptionActive: true } },
        failure: true,
        analyses: { orderBy: { createdAt: "desc" }, take: 1 },
        actions: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
  ])

  const openQueue = queue.filter((p) => {
    const last = p.actions[0]
    if (!last) return true
    return !(last.status === "REJECTED" || last.status === "SKIPPED" || last.actionType === "DO_NOTHING")
  })

  const rate30 = failed30 > 0 ? recovered30Count / failed30 : 0
  const cooldowns = Object.values(ACTION_CATALOG).map((a) => a.cooldownHours)

  return (
    <Shell active="/" title="Overview" subtitle="TechNova Commerce · revenue recovery command center">
      {/* ================= HERO — the financial state of the operation ================= */}
      <Panel className="overflow-hidden">
        <div className="px-7 pt-7 pb-2 lg:px-9">
          <p className="label-caps text-brand-deep">Revenue recovery · command center</p>
          <h2 className="mt-2.5 max-w-2xl text-[25px] font-bold leading-[1.15] tracking-[-0.025em] text-ink">
            Revenue recovery, with AI inside the guardrails.
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
            AI diagnoses every failure. Application policy decides what runs. Every rupee is audited.
          </p>
        </div>

        {/* Display metrics — open layout, hairline dividers, no card boxes */}
        <dl className="mt-6 grid grid-cols-2 divide-x divide-line border-t border-line lg:grid-cols-4">
          <div className="px-7 py-5 lg:px-9">
            <dt className="label-caps text-ink-faint">At risk</dt>
            <dd className="display-money mt-2 text-[32px] leading-none text-risk" title={formatINR(metrics.revenueAtRisk)}>
              {formatINR(metrics.revenueAtRisk, { compact: true })}
            </dd>
            <p className="tnum mt-2 text-[11.5px] text-ink-faint">
              Currently open · {metrics.openOpportunities}{" "}
              {metrics.openOpportunities === 1 ? "opportunity" : "opportunities"}
            </p>
          </div>

          <div className="px-7 py-5 lg:px-9">
            <dt className="label-caps text-ink-faint">Recovered</dt>
            <dd className="display-money mt-2 text-[32px] leading-none text-good" title={formatINR(recovered30Amount)}>
              {formatINR(recovered30Amount, { compact: true })}
            </dd>
            <p className="tnum mt-2 text-[11.5px] text-ink-faint">
              Last 30 days · {recovered30Count} {recovered30Count === 1 ? "payment" : "payments"} saved
            </p>
          </div>

          <div className="px-7 py-5 lg:px-9">
            <dt className="label-caps text-ink-faint">Recovery rate</dt>
            <dd className="mt-2 flex items-baseline gap-2">
              <span className="display-money text-[32px] leading-none text-ink">{(rate30 * 100).toFixed(0)}%</span>
              <span className="tnum text-[11.5px] text-ink-faint">
                {recovered30Count}/{failed30}
              </span>
            </dd>
            <div
              className="mt-2.5 h-[3px] w-24 overflow-hidden rounded-full bg-track"
              role="meter"
              aria-valuenow={Math.round(rate30 * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Recovery rate, last 30 days"
            >
              <div className="h-full rounded-full bg-good" style={{ width: `${rate30 * 100}%` }} />
            </div>
            <p className="mt-1.5 text-[11.5px] text-ink-faint">Last 30 days</p>
          </div>

          <div className={`px-7 py-5 lg:px-9 ${approvals.length > 0 ? "bg-warn-soft/40" : ""}`}>
            <dt className="label-caps text-ink-faint">Needs your approval</dt>
            <dd className="display-money mt-2 text-[32px] leading-none text-warn">{approvals.length}</dd>
            {approvals.length > 0 ? (
              <a href="#action-required" className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-semibold text-warn hover:underline">
                Awaiting your decision <ArrowRight size={11} strokeWidth={2.4} aria-hidden />
              </a>
            ) : (
              <p className="mt-2 text-[11.5px] text-ink-faint">nothing waiting</p>
            )}
          </div>
        </dl>
      </Panel>

      {/* ================= RECOVERY PERFORMANCE ================= */}
      <div className="mt-8">
        <OpenSection
          title="Recovery performance"
          hint={`${failed7} failed payments · last 7 days`}
          action={
            <span className="flex items-center gap-4 text-[10.5px] font-medium text-ink-faint">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-[2px] bg-risk/75" aria-hidden /> failed
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-[2px] bg-good/75" aria-hidden /> recovered
              </span>
            </span>
          }
        >
          <div className="grid gap-8 pt-5 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <TrendChart data={metrics.trend} />
            </div>
            <div className="border-t border-line pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
              <p className="label-caps mb-4 text-ink-faint">Where revenue is lost</p>
              <CategoryBars data={metrics.byCategory.slice(0, 7)} />
            </div>
          </div>
        </OpenSection>
      </div>

      {/* ================= ACTION REQUIRED ================= */}
      <div id="action-required" className="mt-9 scroll-mt-20">
        <OpenSection
          title="Action required"
          hint={
            approvals.length > 0
              ? `${approvals.length} gated by policy — AI recommended, you authorize`
              : "approvals gated by policy appear here"
          }
          action={
            <Link href="/opportunities" className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-deep hover:underline">
              Open work queue <ArrowRight size={12} strokeWidth={2.4} aria-hidden />
            </Link>
          }
        >
          {approvals.length > 0 ? (
            <ul className="divide-y divide-line border-b border-line">
              {approvals.slice(0, 3).map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3.5">
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
                    <span className="display-money text-[17px] text-ink">{formatINR(a.payment.amount)}</span>
                    <Link href={`/payments/${a.paymentId}`} className="text-[13px] font-medium text-ink hover:text-brand-deep">
                      {a.payment.customer.name}
                    </Link>
                    <span className="text-[11.5px] text-ink-faint">
                      {a.payment.failure?.category.replace(/_/g, " ").toLowerCase()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="inline-flex items-center gap-1.5 font-medium text-violet">
                      <Brain size={11} strokeWidth={2.4} aria-hidden />
                      AI: {a.actionType.replace(/_/g, " ").toLowerCase()}
                    </span>
                    <ArrowRight size={10} className="text-ink-faint/60" aria-hidden />
                    <StatusText value="NEEDS_APPROVAL" />
                  </div>
                  <ApproveRejectButtons actionId={a.id} compact />
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line py-4">
              <p className="flex flex-wrap items-baseline gap-x-3">
                <span className="display-money text-[17px] text-ink">{formatINR(metrics.revenueAtRisk, { compact: true })}</span>
                <span className="text-[12.5px] text-ink-soft">
                  across {metrics.openOpportunities} open{" "}
                  {metrics.openOpportunities === 1 ? "opportunity" : "opportunities"} — working automatically
                </span>
              </p>
              <Link href="/opportunities" className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-deep hover:underline">
                Review queue <ArrowRight size={12} strokeWidth={2.4} aria-hidden />
              </Link>
            </div>
          )}
        </OpenSection>
      </div>

      {/* ================= WORK QUEUE PREVIEW ================= */}
      <div className="mt-9">
        <OpenSection title="Latest opportunities" hint="newest open failures and what the AI recommends">
          {openQueue.length === 0 ? (
            <p className="py-5 text-[12.5px] text-ink-faint">
              Nothing open right now — every failure has been recovered, closed, or is awaiting approval.
            </p>
          ) : (
            <ul className="divide-y divide-line border-b border-line">
              {openQueue.slice(0, 5).map((p) => {
                const analysis = p.analyses[0]
                const action = p.actions[0]
                return (
                  <li key={p.id} className="group flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5 py-3">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
                      <span className="display-money text-[15px] text-ink">{formatINR(p.amount)}</span>
                      <Link href={`/payments/${p.id}`} className="text-[13px] font-medium text-ink group-hover:text-brand-deep">
                        {p.customer.name}
                      </Link>
                      <span className="text-[11px] text-ink-faint">
                        {p.failure?.category.replace(/_/g, " ").toLowerCase()}
                        {p.customer.subscriptionActive && <span className="ml-1.5 font-medium text-violet">· subscription</span>}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px]">
                      {analysis ? (
                        <>
                          <span className="text-ink-faint">
                            <span
                              className={`tnum font-mono font-semibold ${
                                analysis.confidence >= 0.75 ? "text-good" : analysis.confidence >= 0.5 ? "text-warn" : "text-risk"
                              }`}
                            >
                              {Math.round(analysis.confidence * 100)}%
                            </span>{" "}
                            · {analysis.recommendedAction.replace(/_/g, " ").toLowerCase()}
                          </span>
                          {action && <StatusText value={action.status} />}
                        </>
                      ) : (
                        <StatusText value="PENDING" />
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </OpenSection>
      </div>

      {/* ================= GUARDRAILS + ACTIVITY (open, side by side) ================= */}
      <div className="mt-9 grid gap-x-12 gap-y-9 lg:grid-cols-2">
        <OpenSection title="Policy guardrails in force" hint="the AI cannot improvise with money">
          <dl className="divide-y divide-line border-b border-line">
            {[
              { label: "Max recovery actions", value: `${MAX_ACTIONS_PER_PAYMENT} per payment` },
              { label: "Auto-retry needs approval at", value: formatINR(ACTION_CATALOG.RETRY_PAYMENT.approvalThreshold) },
              { label: "Customer messaging at", value: formatINR(ACTION_CATALOG.SEND_PAYMENT_LINK.approvalThreshold) },
              { label: "Action cooldowns", value: `${Math.min(...cooldowns)}–${Math.max(...cooldowns)}h` },
              { label: "Customer-contact risk ceiling", value: CUSTOMER_CONTACT_RISK_CEILING.toFixed(2) },
            ].map((g) => (
              <div key={g.label} className="flex items-baseline justify-between gap-6 py-2.5">
                <dt className="text-[12px] text-ink-soft">{g.label}</dt>
                <dd className="display-money text-[14px] text-ink">{g.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 flex items-start gap-2 text-[11.5px] leading-relaxed text-ink-faint">
            <ShieldCheck size={13} className="mt-px shrink-0 text-brand-deep" aria-hidden />
            <span>
              <span className="tnum font-semibold text-ink">{stoppedByPolicy}</span>{" "}
              {stoppedByPolicy === 1 ? "action has been" : "actions have been"} stopped by policy on this account — every
              action is policy-checked before execution.
            </span>
          </p>
        </OpenSection>

        <OpenSection
          title="Recovery activity"
          hint="every decision, attributed"
          action={
            <Link href="/activity" className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-deep hover:underline">
              Full audit <ArrowRight size={12} strokeWidth={2.4} aria-hidden />
            </Link>
          }
        >
          <ul className="divide-y divide-line border-b border-line">
            {recentLogs.slice(0, 6).map((log) => (
              <li key={log.id} className="flex items-baseline gap-2.5 py-2.5">
                <span
                  className={`mt-[7px] h-1 w-1 shrink-0 rounded-full ${
                    log.actor.startsWith("AI:") ? "bg-violet" : log.actor === "POLICY" ? "bg-brand" : "bg-ink-faint/60"
                  }`}
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="truncate text-[12px] leading-snug text-ink-soft">
                    <span className="mr-1.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
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
                </div>
                <span className="tnum ml-auto shrink-0 font-mono text-[10.5px] text-ink-faint">
                  {timestamp(log.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </OpenSection>
      </div>

      {/* ================= EXPOSURE TABLE ================= */}
      <div className="mt-9">
        <OpenSection title="Customer exposure" hint="open failure amount by customer · currently open">
          {metrics.topAtRiskCustomers.length === 0 ? (
            <p className="py-5 text-[12.5px] text-ink-faint">
              No customers at risk — every failed payment has been recovered or closed.
            </p>
          ) : (
            <table className="w-full border-b border-line text-[13px]">
              <thead>
                <tr className="border-b border-line text-left">
                  <th scope="col" className="label-caps py-2 pr-4 font-semibold text-ink-faint">Customer</th>
                  <th scope="col" className="label-caps py-2 pr-4 text-right font-semibold text-ink-faint">Open</th>
                  <th scope="col" className="label-caps py-2 pr-4 text-right font-semibold text-ink-faint">At risk</th>
                  <th scope="col" className="label-caps py-2 text-right font-semibold text-ink-faint">Subscription</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {metrics.topAtRiskCustomers.map((c) => (
                  <tr key={c.email} className="transition-colors hover:bg-surface-sunken">
                    <td className="py-2.5 pr-4">
                      <span className="font-medium text-ink">{c.name}</span>
                      <span className="block text-[11px] text-ink-faint">{c.email}</span>
                    </td>
                    <td className="tnum py-2.5 pr-4 text-right font-mono text-ink-soft">{c.failures}</td>
                    <td className="display-money py-2.5 pr-4 text-right text-[14px] text-risk">{formatINR(c.amount)}</td>
                    <td className="py-2.5 text-right">
                      {c.subscription ? <Badge value="SUBSCRIPTION_ACTIVE" /> : <span className="text-[12px] text-ink-faint">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </OpenSection>
      </div>
    </Shell>
  )
}
