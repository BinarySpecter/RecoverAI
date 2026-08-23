import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  Brain,
  ShieldCheck,
  History,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react"
import { Shell } from "@/components/shell"
import { Panel, Badge, ConfidenceMeter, timestamp, humanize, providerLabel } from "@/components/ui"
import { AuditTimeline } from "@/components/audit-timeline"
import { ApproveRejectButtons, RunRecoveryButton, ReanalyzeButton } from "@/components/action-buttons"
import { ACTION_CATALOG } from "@/lib/engine/actions"
import { db } from "@/lib/db"
import { formatINR } from "@/lib/types"

export const dynamic = "force-dynamic"

/** Horizontal decision timeline — the pipeline every payment travels, states from real data. */
function DecisionTimeline({
  hasAnalysis,
  policyDecision,
  executed,
  outcome,
}: {
  hasAnalysis: boolean
  policyDecision: string | null
  executed: boolean
  outcome: string | null
}) {
  const steps = [
    { key: "failure", label: "Failure", done: true, tone: "risk" as const, caption: null as string | null },
    { key: "ai", label: "AI diagnosis", done: hasAnalysis, tone: "violet" as const, caption: null },
    {
      key: "policy",
      label: "Policy",
      done: policyDecision !== null,
      tone: "brand" as const,
      caption:
        policyDecision === "NEEDS_APPROVAL"
          ? "gated"
          : policyDecision === "REJECTED"
            ? "rejected"
            : policyDecision === "APPROVED"
              ? "approved"
              : null,
    },
    { key: "recovery", label: "Recovery", done: executed, tone: "ink" as const, caption: null },
    {
      key: "outcome",
      label: "Outcome",
      done: outcome !== null && outcome !== "PENDING",
      tone: outcome === "RECOVERED" ? ("good" as const) : outcome === "FAILED" ? ("risk" as const) : ("warn" as const),
      caption:
        outcome === "RECOVERED"
          ? "recovered"
          : outcome === "FAILED"
            ? "not recovered"
            : outcome === "PENDING_REVIEW"
              ? "in review"
              : null,
    },
  ]
  const toneBg = { risk: "bg-risk", violet: "bg-violet", brand: "bg-brand", ink: "bg-primary", good: "bg-good", warn: "bg-warn" }
  const currentIdx = steps.findIndex((s) => !s.done)

  return (
    <ol className="flex flex-wrap items-center gap-y-3" aria-label="Recovery decision timeline">
      {steps.map((step, i) => {
        const isCurrent = i === currentIdx
        return (
          <li key={step.key} className="flex items-center">
            {i > 0 && (
              <span className={`mx-2.5 h-px w-6 sm:w-9 ${step.done ? "bg-line-strong" : "bg-line"}`} aria-hidden />
            )}
            <span className="flex items-center gap-2">
              <span
                className={`flex h-[22px] w-[22px] items-center justify-center rounded-full border ${
                  step.done
                    ? `border-transparent ${toneBg[step.tone]}`
                    : isCurrent
                      ? "border-brand bg-brand-soft"
                      : "border-line bg-surface"
                }`}
              >
                {step.done ? (
                  <CheckCircle2 size={12} strokeWidth={2.6} className="text-white" aria-hidden />
                ) : isCurrent ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-brand animate-pulse-soft" aria-hidden />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-line-strong" aria-hidden />
                )}
              </span>
              <span
                className={`text-[11.5px] font-semibold tracking-[0.02em] ${
                  step.done
                    ? step.tone === "risk"
                      ? "text-risk"
                      : step.tone === "violet"
                        ? "text-violet"
                        : step.tone === "brand"
                          ? "text-brand-deep"
                          : step.tone === "good"
                            ? "text-good"
                            : step.tone === "warn"
                              ? "text-warn"
                              : "text-ink"
                    : isCurrent
                      ? "text-brand-deep"
                      : "text-ink-faint"
                }`}
              >
                {step.label}
                {step.caption && <span className="ml-1 font-normal text-ink-faint">· {step.caption}</span>}
              </span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export default async function PaymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const payment = await db.payment.findUnique({
    where: { id },
    include: {
      customer: true,
      merchant: { select: { name: true } },
      failure: true,
      attempts: { orderBy: { attemptNo: "asc" } },
      analyses: { orderBy: { createdAt: "desc" } },
      actions: { orderBy: { createdAt: "desc" } },
    },
  })
  if (!payment) notFound()

  const audit = await db.auditLog.findMany({ where: { paymentId: id }, orderBy: { createdAt: "asc" } })
  const latestAnalysis = payment.analyses[0]
  const latestAction = payment.actions[0]
  const awaitingAction = payment.actions.find((a) => a.status === "AWAITING_APPROVAL")
  const isFailed = payment.status === "FAILED"
  const isClosed =
    Boolean(latestAction) &&
    (latestAction.status === "REJECTED" || latestAction.status === "SKIPPED" || latestAction.actionType === "DO_NOTHING")

  const heroTone =
    payment.status === "RECOVERED" ? "text-good" : payment.status === "FAILED" ? "text-risk" : "text-ink"

  const paymentFacts: [string, React.ReactNode][] = [
    ["Order", <span key="o" className="font-mono text-[11.5px]">{payment.orderId}</span>],
    ["Amount", formatINR(payment.amount)],
    ["Method", payment.method],
    ["Status", <Badge key="s" value={payment.status} />],
    ["Retries", String(payment.retryCount)],
    ["Source", payment.source],
    ["Created", timestamp(payment.createdAt)],
  ]
  if (payment.recoveredAt) paymentFacts.push(["Recovered", timestamp(payment.recoveredAt)])
  if (payment.failure) {
    paymentFacts.push(["Gateway code", <span key="g" className="font-mono text-[11.5px]">{payment.failure.rawCode ?? "—"}</span>])
    paymentFacts.push(["Gateway message", payment.failure.rawMessage ?? "—"])
  }

  const customerFacts: [string, React.ReactNode][] = [
    ["Name", payment.customer.name],
    ["Email", <span key="e" className="font-normal">{payment.customer.email}</span>],
    ["Successful payments", <span key="sp" className="tnum font-semibold text-good">{payment.customer.successfulPayments}</span>],
    ["Failed payments", <span key="fp" className="tnum font-semibold text-risk">{payment.customer.failedPayments}</span>],
    ["Lifetime value", formatINR(payment.customer.lifetimeValue)],
    ["Avg order", formatINR(payment.customer.avgOrderValue)],
    [
      "Subscription",
      payment.customer.subscriptionActive ? (
        <Badge key="sub" value="SUBSCRIPTION_ACTIVE" />
      ) : (
        <span key="sub" className="text-ink-faint">None</span>
      ),
    ],
    [
      "Risk score",
      <span
        key="r"
        className={`tnum font-mono font-semibold ${
          payment.customer.riskScore >= 0.7 ? "text-risk" : payment.customer.riskScore >= 0.4 ? "text-warn" : "text-good"
        }`}
      >
        {payment.customer.riskScore.toFixed(2)}
      </span>,
    ],
  ]

  return (
    <Shell
      active="/opportunities"
      title={payment.description ?? "Payment"}
      subtitle={`${payment.orderId} · ${payment.customer.name} · ${payment.method}`}
    >
      <Link
        href="/opportunities"
        className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-soft hover:text-brand-deep"
      >
        <ArrowLeft size={14} aria-hidden /> Work queue
      </Link>

      {/* ================= HERO: amount + decision timeline ================= */}
      <Panel className="px-7 py-6 lg:px-9">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
          <div>
            <p className="label-caps text-ink-faint">
              {payment.status === "RECOVERED" ? "Recovered" : payment.status === "FAILED" ? "At risk" : "Payment"}
            </p>
            <p className={`display-money mt-1.5 text-[38px] leading-none ${heroTone}`}>{formatINR(payment.amount)}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge value={payment.status} />
              {latestAnalysis && (
                <span className="rounded-full border border-violet/25 bg-violet-soft px-2 py-0.5 text-[11px] font-medium text-violet">
                  AI: {humanize(latestAnalysis.recommendedAction)}
                </span>
              )}
              {payment.failure && <Badge value={payment.failure.category} />}
              {latestAnalysis && <Badge value={latestAnalysis.severity} />}
            </div>
          </div>
          <div className="flex flex-col items-end gap-3">
            {awaitingAction && <ApproveRejectButtons actionId={awaitingAction.id} />}
            {isFailed && !awaitingAction && !isClosed && (
              <RunRecoveryButton paymentId={payment.id} label="Run recovery pipeline" />
            )}
            {latestAnalysis && isFailed && <ReanalyzeButton paymentId={payment.id} />}
          </div>
        </div>
        <div className="mt-6 border-t border-line pt-5">
          <DecisionTimeline
            hasAnalysis={Boolean(latestAnalysis)}
            policyDecision={latestAction?.policyDecision ?? null}
            executed={Boolean(latestAction?.executedAt)}
            outcome={latestAction?.outcome ?? null}
          />
        </div>
      </Panel>

      <div className="mt-8 grid gap-x-12 gap-y-8 lg:grid-cols-5">
        {/* ============ Left: the decision story (open sections, accent rules) ============ */}
        <div className="space-y-8 lg:col-span-3">
          {/* Layer 1 — AI */}
          <section>
            <header className="flex flex-wrap items-baseline justify-between gap-x-4 pb-3">
              <div className="flex items-baseline gap-3">
                <Brain size={14} className="self-center text-violet" strokeWidth={2.2} aria-hidden />
                <h2 className="text-[13.5px] font-semibold tracking-[-0.01em] text-ink">AI diagnosis</h2>
                <span className="label-caps text-violet/80">Layer 1 · advisory</span>
              </div>
              {latestAnalysis && (
                <span className="text-[11px] text-ink-faint">
                  {providerLabel(latestAnalysis.provider, latestAnalysis.usedFallback)}
                </span>
              )}
            </header>
            <div className="border-t-2 border-violet/30" aria-hidden />
            {!latestAnalysis ? (
              <p className="py-6 text-[12.5px] text-ink-faint">
                No AI analysis yet — run the recovery pipeline to generate a diagnosis.
              </p>
            ) : (
              <div className="space-y-5 pt-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="label-caps text-ink-faint">Likely failure category</p>
                    <p className="mt-1 text-[14px] font-semibold text-ink">{humanize(latestAnalysis.failureCategory)}</p>
                  </div>
                  <div>
                    <p className="label-caps text-ink-faint">Recommended action</p>
                    <p className="mt-1 text-[14px] font-semibold text-ink">{humanize(latestAnalysis.recommendedAction)}</p>
                  </div>
                </div>
                <div className="grid items-start gap-4 sm:grid-cols-2">
                  <ConfidenceMeter value={latestAnalysis.confidence} label="Confidence" tone="violet" />
                  <ConfidenceMeter value={latestAnalysis.estimatedRecoveryProbability} label="Est. recovery probability" />
                </div>
                <div>
                  <p className="label-caps text-ink-faint">Root cause</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink">{latestAnalysis.rootCause}</p>
                </div>
                <div>
                  <p className="label-caps text-ink-faint">Why this action — AI reasoning</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{latestAnalysis.reasoning}</p>
                </div>
                <div>
                  <p className="label-caps text-ink-faint">Customer context the AI weighed</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{latestAnalysis.customerContext}</p>
                </div>
              </div>
            )}
          </section>

          {/* Layer 2 — Policy */}
          <section>
            <header className="flex flex-wrap items-baseline justify-between gap-x-4 pb-3">
              <div className="flex items-baseline gap-3">
                <ShieldCheck size={14} className="self-center text-brand-deep" strokeWidth={2.2} aria-hidden />
                <h2 className="text-[13.5px] font-semibold tracking-[-0.01em] text-ink">Policy validation & actions</h2>
                <span className="label-caps text-brand-deep/80">Layer 2 · authorization</span>
              </div>
            </header>
            <div className="border-t-2 border-brand/30" aria-hidden />
            {payment.actions.length === 0 ? (
              <p className="py-6 text-[12.5px] text-ink-faint">
                No recovery actions yet — verdicts appear here once the pipeline runs.
              </p>
            ) : (
              <div className="divide-y divide-line">
                {payment.actions.map((a) => {
                  const def = ACTION_CATALOG[a.actionType as keyof typeof ACTION_CATALOG]
                  const gated = a.policyDecision === "NEEDS_APPROVAL"
                  const rejected = a.policyDecision === "REJECTED"
                  return (
                    <article key={a.id} className="py-4 first:pt-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13.5px] font-semibold text-ink">{humanize(a.actionType)}</span>
                        <Badge value={a.policyDecision} />
                        <Badge value={a.status} />
                        <span className="tnum ml-auto font-mono text-[10.5px] text-ink-faint">{timestamp(a.createdAt)}</span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="font-medium text-violet">
                          AI recommended {a.actionType.replace(/_/g, " ").toLowerCase()}
                        </span>
                        <span aria-hidden className="text-ink-faint/60">→</span>
                        <span
                          className={`inline-flex items-center gap-1 font-semibold ${
                            gated ? "text-warn" : rejected ? "text-risk" : "text-good"
                          }`}
                        >
                          {gated ? (
                            <AlertTriangle size={10} strokeWidth={2.6} aria-hidden />
                          ) : rejected ? (
                            <XCircle size={10} strokeWidth={2.6} aria-hidden />
                          ) : (
                            <CheckCircle2 size={10} strokeWidth={2.6} aria-hidden />
                          )}
                          policy {a.policyDecision === "APPROVED" ? "authorized" : gated ? "requires approval" : "rejected"}
                        </span>
                        {a.approvedBy && (
                          <>
                            <span aria-hidden className="text-ink-faint/60">→</span>
                            <span className="font-medium text-ink-soft">you approved ({a.approvedBy})</span>
                          </>
                        )}
                      </div>

                      {def && a.policyDecision === "APPROVED" && (
                        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1" aria-label="Policy checks">
                          {[
                            `compatible with ${humanize(payment.failure?.category ?? "failure")}`,
                            "cooldown satisfied",
                            `under ${def.approvalThreshold > 1e12 ? "no" : formatINR(def.approvalThreshold)} threshold`,
                            "below risk ceiling",
                          ].map((check) => (
                            <li key={check} className="flex items-center gap-1.5 text-[11.5px] text-ink-soft">
                              <CheckCircle2 size={11} strokeWidth={2.4} className="text-good" aria-hidden />
                              {check}
                            </li>
                          ))}
                        </ul>
                      )}

                      <p className="mt-2 text-[12px] leading-relaxed text-ink-soft">
                        <span className="font-semibold text-ink">Reason:</span> {a.policyReason}
                      </p>
                      {a.outcomeDetail && (
                        <p
                          className={`mt-1 text-[12.5px] font-medium leading-relaxed ${
                            a.outcome === "RECOVERED" ? "text-good" : a.outcome === "FAILED" ? "text-risk" : "text-ink-soft"
                          }`}
                        >
                          {a.outcomeDetail}
                        </p>
                      )}
                    </article>
                  )
                })}
              </div>
            )}
          </section>

          {/* Audit */}
          <section>
            <header className="flex items-baseline gap-3 pb-3">
              <History size={14} className="self-center text-ink-faint" strokeWidth={2.2} aria-hidden />
              <h2 className="text-[13.5px] font-semibold tracking-[-0.01em] text-ink">Audit trail</h2>
              <span className="label-caps text-ink-faint">immutable record</span>
            </header>
            <div className="border-t-2 border-line-strong/60" aria-hidden />
            <AuditTimeline entries={audit} />
          </section>
        </div>

        {/* ============ Right: the facts (definition lists, hairlines, no boxes) ============ */}
        <div className="space-y-8 lg:col-span-2">
          <section>
            <h3 className="label-caps pb-2.5 text-ink-faint">Payment</h3>
            <dl className="divide-y divide-line border-y border-line">
              {paymentFacts.map(([label, value]) => (
                <div key={String(label)} className="flex items-baseline justify-between gap-4 py-[7px]">
                  <dt className="text-[12px] text-ink-faint">{label}</dt>
                  <dd className="tnum text-right text-[12.5px] font-medium text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section>
            <h3 className="label-caps pb-2.5 text-ink-faint">Customer history · signals the AI weighed</h3>
            <dl className="divide-y divide-line border-y border-line">
              {customerFacts.map(([label, value]) => (
                <div key={String(label)} className="flex items-baseline justify-between gap-4 py-[7px]">
                  <dt className="text-[12px] text-ink-faint">{label}</dt>
                  <dd className="text-right text-[12.5px] font-medium text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section>
            <h3 className="label-caps pb-2.5 text-ink-faint">Gateway attempts</h3>
            <ol className="divide-y divide-line border-y border-line">
              {payment.attempts.map((att) => (
                <li key={att.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-[12.5px] font-medium text-ink">
                      <span className="tnum">#{att.attemptNo}</span>
                      <Badge value={att.status} />
                    </p>
                    <p className="tnum mt-0.5 truncate font-mono text-[10.5px] text-ink-faint">
                      {att.gatewayCode} · {att.latencyMs}ms
                    </p>
                  </div>
                  <span className="tnum shrink-0 font-mono text-[10px] text-ink-faint">{timestamp(att.createdAt)}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </Shell>
  )
}
