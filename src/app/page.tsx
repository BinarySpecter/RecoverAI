import Link from "next/link"
import { ArrowRight, FlaskConical, ShieldCheck } from "lucide-react"
import { Shell } from "@/components/shell"
import { Section, StatusText, Badge, timestamp, humanize } from "@/components/ui"
import { TrendChart, CategoryBars } from "@/components/charts"
import { getDashboardMetrics, getScopedMetrics } from "@/lib/analytics"
import { getMerchant, db } from "@/lib/db"
import { formatINR } from "@/lib/types"
import { runDefaultEvaluation, resolveEvalProvider } from "@/lib/eval/harness"
import { ACTION_CATALOG, MAX_ACTIONS_PER_PAYMENT } from "@/lib/engine/actions"
import { CUSTOMER_CONTACT_RISK_CEILING } from "@/lib/engine/policy-engine"

export const dynamic = "force-dynamic"

export default async function OverviewPage() {
  const merchant = await getMerchant()
  const metrics = await getDashboardMetrics(merchant.id)
  const { recovered30Amount, recovered30Count, failed30, failed7, stoppedByPolicy } = await getScopedMetrics(merchant.id)

  const [approvals, recentLogs, queue, evaluation, providerInfo] = await Promise.all([
    db.recoveryAction.findMany({
      where: { status: "AWAITING_APPROVAL" },
      include: { payment: { include: { customer: true, failure: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.auditLog.findMany({ where: { merchantId: merchant.id }, orderBy: { createdAt: "desc" }, take: 10 }),
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
    runDefaultEvaluation(500),
    resolveEvalProvider(),
  ])

  const openQueue = queue.filter((p) => {
    const last = p.actions[0]
    if (!last) return true
    return !(last.status === "REJECTED" || last.status === "SKIPPED" || last.actionType === "DO_NOTHING")
  })

  const rate30 = failed30 > 0 ? recovered30Count / failed30 : 0
  const cooldowns = Object.values(ACTION_CATALOG).map((a) => a.cooldownHours)

  // Incremental recovery: measured offline, not claimed live.
  const recoverai = evaluation.strategies.find((s) => s.key === "RECOVERAI")!
  const incremental = recoverai.grossRecoveredPaise
  const pendingApprovalAmount = approvals.reduce((s, a) => s + a.payment.amount, 0)

  const recentDecisions = await db.recoveryAction.findMany({
    where: { payment: { merchantId: merchant.id } },
    include: { payment: { include: { customer: { select: { name: true } }, failure: true } } },
    orderBy: { createdAt: "desc" },
    take: 6,
  })

  return (
    <Shell active="/" title="Revenue recovery overview" subtitle="TechNova Commerce · how much is at risk, how much came back, how much is incremental">
      {/* ================= HERO — the financial state of the operation ================= */}
      <section className="animate-fade-up">
        <div>
          <p className="label-caps text-ink-faint">Revenue recovery overview</p>
          <p className="mt-2 max-w-xl text-[17px] font-medium leading-snug tracking-[-0.01em] text-ink">
            {formatINR(metrics.revenueAtRisk, { compact: true })} of revenue is currently at risk.{" "}
            {formatINR(recovered30Amount, { compact: true })} came back in the last 30 days.
          </p>
        </div>

        {/* The three headline numbers — typography, not boxes */}
        <dl className="mt-7 grid grid-cols-1 gap-y-6 border-y border-line py-6 sm:grid-cols-3 sm:divide-x sm:divide-line sm:gap-y-0">
          <div className="sm:pr-8">
            <dt className="label-caps text-ink-faint">At risk</dt>
            <dd className="display-money mt-1.5 text-[38px] leading-none text-risk" title={formatINR(metrics.revenueAtRisk)}>
              {formatINR(metrics.revenueAtRisk, { compact: true })}
            </dd>
            <p className="tnum mt-2 text-[11.5px] text-ink-faint">
              {metrics.openOpportunities} open {metrics.openOpportunities === 1 ? "opportunity" : "opportunities"} · not yet closed
            </p>
          </div>

          <div className="sm:px-8">
            <dt className="label-caps text-ink-faint">Recovered</dt>
            <dd className="display-money mt-1.5 text-[38px] leading-none text-ink" title={formatINR(recovered30Amount)}>
              {formatINR(recovered30Amount, { compact: true })}
            </dd>
            <p className="tnum mt-2 text-[11.5px] text-ink-faint">
              last 30 days · {recovered30Count} {recovered30Count === 1 ? "payment" : "payments"} ·{" "}
              {(rate30 * 100).toFixed(0)}% rate
            </p>
          </div>

          <div className="sm:pl-8">
            <dt className="label-caps text-good">Incremental recovery</dt>
            <dd className="display-money mt-1.5 text-[46px] leading-none text-good" title={formatINR(incremental)}>
              +{formatINR(incremental, { compact: true })}
            </dd>
            <p className="mt-2 text-[11.5px] leading-relaxed text-ink-faint">
              vs a do-nothing baseline — measured in the{" "}
              <Link href="/lab" className="font-semibold text-brand-deep hover:underline">
                Recovery Lab
              </Link>
              , offline evaluation (mock provider, seeded world of 500).
            </p>
          </div>
        </dl>

        {/* Compact operational strip */}
        <div className="mt-0 grid grid-cols-2 gap-x-8 gap-y-5 py-5 md:grid-cols-4">
          <Link href="/opportunities" className="group">
            <p className="display-money text-[22px] leading-none text-ink group-hover:text-brand-deep">
              <span className="tnum">{openQueue.length}</span>
              <span className="ml-2 align-middle text-[11px] font-medium tracking-normal text-ink-faint">
                active opportunities
              </span>
            </p>
            <p className="tnum mt-1.5 text-[10.5px] text-ink-faint">{formatINR(metrics.revenueAtRisk, { compact: true })} still in play</p>
          </Link>
          <Link href="/approvals" className="group">
            <p className="display-money text-[22px] leading-none text-ink group-hover:text-brand-deep">
              <span className="tnum">{approvals.length}</span>
              <span className="ml-2 align-middle text-[11px] font-medium tracking-normal text-ink-faint">
                awaiting approval
              </span>
            </p>
            <p className="tnum mt-1.5 text-[10.5px] text-ink-faint">
              {approvals.length > 0 ? `${formatINR(pendingApprovalAmount, { compact: true })} gated by policy` : "nothing waiting"}
            </p>
          </Link>
          <div>
            <p className="display-money text-[22px] leading-none text-ink">
              <span className="tnum">{formatINR(recovered30Amount, { compact: true })}</span>
              <span className="ml-2 align-middle text-[11px] font-medium tracking-normal text-ink-faint">
                recovered, 30 days
              </span>
            </p>
            <p className="tnum mt-1.5 text-[10.5px] text-ink-faint">{recovered30Count} payments saved</p>
          </div>
          <Link href="/safety" className="group">
            <p className="display-money text-[22px] leading-none text-ink group-hover:text-brand-deep">
              <span className="tnum">{stoppedByPolicy}</span>
              <span className="ml-2 align-middle text-[11px] font-medium tracking-normal text-ink-faint">
                refused by policy
              </span>
            </p>
            <p className="mt-1.5 text-[10.5px] text-ink-faint">why the AI did not act — see the safety model</p>
          </Link>
        </div>
      </section>

      {/* ================= RECOVERY PERFORMANCE ================= */}
      <section className="mt-4">
        <Section
          title="Recovery performance by failure type"
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
        </Section>
      </section>

      {/* ================= RECENT RECOVERY DECISIONS ================= */}
      <section className="mt-9">
        <Section
          title="Recent recovery decisions"
          hint="what happened · how much · who decided"
          action={
            <Link href="/opportunities" className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-deep hover:underline">
              Recovery queue <ArrowRight size={12} strokeWidth={2.2} aria-hidden />
            </Link>
          }
        >
          <ul className="divide-y divide-line border-b border-line">
            {recentDecisions.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-5 gap-y-1 py-3">
                <span className="w-[100px] shrink-0 font-mono text-[10.5px] text-ink-faint">{timestamp(a.createdAt)}</span>
                <span className="w-[86px] shrink-0">
                  <StatusText value={a.outcome ?? a.status} />
                </span>
                <Link
                  href={`/payments/${a.paymentId}`}
                  className="display-money shrink-0 text-[15px] text-ink hover:text-brand-deep"
                >
                  {formatINR(a.payment.amount)}
                </Link>
                <span className="min-w-0 flex-1 truncate text-[12px] text-ink-soft">
                  {a.payment.customer.name} ·{" "}
                  {a.payment.failure ? humanize(a.payment.failure.category) : "—"}
                  <span className="ml-2 text-ink-faint">{humanize(a.actionType)}</span>
                </span>
                {a.policyDecision === "NEEDS_APPROVAL" && <Badge value="NEEDS_APPROVAL" />}
                {a.outcome === "RECOVERED" && <Badge value="RECOVERED" />}
              </li>
            ))}
          </ul>
        </Section>
      </section>

      {/* ================= EVALUATION CALL-OUT ================= */}
      <section className="mt-9 grid gap-x-12 gap-y-9 lg:grid-cols-2">
        <Section
          title="Does the AI actually add value?"
          hint="measured, not claimed"
          action={<FlaskConical size={13} className="text-ink-faint" aria-hidden />}
        >
          <div className="border-b border-line">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 py-4">
              <p className="text-[12.5px] leading-relaxed text-ink-soft">
                The Recovery Lab replays {evaluation.meta.worldSize} seeded failures through four strategies — do
                nothing, blind retry, generic dunning, RecoverAI — and compares what each recovers.
              </p>
              <Link href="/lab" className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-deep hover:underline">
                Open the Lab <ArrowRight size={12} strokeWidth={2.2} aria-hidden />
              </Link>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-8 gap-y-1.5 border-t border-line py-3.5">
              {[
                ["Do nothing", "₹0", "text-ink-faint"],
                ["Blind retry", formatINR(evaluation.strategies.find((s) => s.key === "BLIND_RETRY")!.grossRecoveredPaise, { compact: true }), "text-ink-faint"],
                ["Generic dunning", formatINR(evaluation.strategies.find((s) => s.key === "GENERIC_DUNNING")!.grossRecoveredPaise, { compact: true }), "text-ink-faint"],
                ["RecoverAI", `+${formatINR(incremental, { compact: true })}`, "text-good"],
              ].map(([label, value, tone]) => (
                <span key={label as string} className="flex items-baseline gap-2">
                  <span className="text-[11px] text-ink-faint">{label}</span>
                  <span className={`display-money text-[16px] ${tone}`}>{value}</span>
                </span>
              ))}
            </div>
          </div>
        </Section>

        <Section
          title="Guardrails in force"
          hint="the AI cannot improvise with money"
          action={<ShieldCheck size={13} className="text-brand-deep" aria-hidden />}
        >
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
              {stoppedByPolicy === 1 ? "action has been" : "actions have been"} stopped by policy — including the
              economic stopping rule — on this account. Engine: {providerInfo.active} ({providerInfo.model}).
            </span>
          </p>
        </Section>
      </section>

      {/* ================= ACTIVITY PREVIEW ================= */}
      <section className="mt-9">
        <Section
          title="Recovery activity"
          hint="every decision, attributed"
          action={
            <Link href="/activity" className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-deep hover:underline">
              Full audit <ArrowRight size={12} strokeWidth={2.2} aria-hidden />
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
        </Section>
      </section>
    </Shell>
  )
}