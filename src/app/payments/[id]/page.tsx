import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { Shell } from "@/components/shell"
import { Section, Badge, humanize, providerLabel, timestamp } from "@/components/ui"
import { AuditTimeline } from "@/components/audit-timeline"
import { ApproveRejectButtons, RunRecoveryButton, ReanalyzeButton } from "@/components/action-buttons"
import { ACTION_CATALOG, actionCostPaise } from "@/lib/engine/actions"
import { db } from "@/lib/db"
import { formatINR } from "@/lib/types"

export const dynamic = "force-dynamic"

/** Case-file stage spine — one numbered step in the recovery narrative. */
function Stage({
  no,
  label,
  tone,
  children,
}: {
  no: string
  label: string
  tone: string
  children: React.ReactNode
}) {
  return (
    <li className="relative flex gap-4 pb-10 last:pb-0">
      <div className="flex flex-col items-center">
        <span
          className={`tnum z-10 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border font-mono text-[10px] font-semibold ${tone}`}
        >
          {no}
        </span>
        <span className="mt-1 w-px flex-1 bg-line" aria-hidden />
      </div>
      <div className="min-w-0 flex-1 pb-1">
        <p className="label-caps pt-1.5 text-ink-faint">{label}</p>
        <div className="mt-2.5">{children}</div>
      </div>
    </li>
  )
}

/** One case, read top to bottom — a case file, not a collection of cards. */
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
  const analysis = payment.analyses[0]
  const action = payment.actions[0]
  const awaitingAction = payment.actions.find((a) => a.status === "AWAITING_APPROVAL")
  const failed = payment.status === "FAILED"
  const closed =
    Boolean(action) &&
    (action.status === "REJECTED" || action.status === "SKIPPED" || action.actionType === "DO_NOTHING")

  const heroTone =
    payment.status === "RECOVERED" ? "text-good" : payment.status === "FAILED" ? "text-risk" : "text-ink"

  const def = action ? ACTION_CATALOG[action.actionType as keyof typeof ACTION_CATALOG] : null
  const economics =
    action && def
      ? {
          expected: Math.round(payment.amount * (action.estimatedRecoveryProbability || def.efficacy)),
          cost: actionCostPaise(action.actionType as keyof typeof ACTION_CATALOG),
        }
      : null

  const paymentFacts: [string, React.ReactNode][] = [
    ["Order", <span key="o" className="font-mono text-[11.5px]">{payment.orderId}</span>],
    ["Amount", formatINR(payment.amount)],
    ["Method", payment.method],
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
    ["Subscription", payment.customer.subscriptionActive ? payment.customer.subscriptionPlan ?? "Active" : "None"],
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
      title={payment.description ?? "Payment case file"}
      subtitle={`${payment.orderId} · ${payment.customer.name} · ${payment.method}`}
    >
      <Link
        href="/opportunities"
        className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-soft hover:text-brand-deep"
      >
        <ArrowLeft size={14} aria-hidden /> Recovery queue
      </Link>

      {/* ============ CASE HEADER ============ */}
      <section className="animate-fade-up border-b border-line pb-6">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
          <div>
            <p className="label-caps text-ink-faint">
              {payment.status === "RECOVERED" ? "Recovered case" : payment.status === "FAILED" ? "Payment recovery opportunity" : "Payment case"}
            </p>
            <p className={`display-money mt-1.5 text-[40px] leading-none ${heroTone}`}>{formatINR(payment.amount)}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge value={payment.status} />
              {payment.failure && <Badge value={payment.failure.category} />}
              {analysis && <Badge value={analysis.severity} />}
              <span className="tnum rounded-[5px] border border-line bg-surface-sunken px-1.5 py-0.5 font-mono text-[10.5px] text-ink-soft">
                {payment.method} · {payment.orderId}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-3">
            {awaitingAction && <ApproveRejectButtons actionId={awaitingAction.id} />}
            {failed && !awaitingAction && !closed && (
              <RunRecoveryButton paymentId={payment.id} label="Run recovery pipeline" />
            )}
            {analysis && failed && <ReanalyzeButton paymentId={payment.id} />}
          </div>
        </div>
      </section>

      <div className="mt-8 grid gap-x-14 gap-y-10 lg:grid-cols-[1.6fr_1fr]">
        {/* ============ THE NARRATIVE ============ */}
        <div className="min-w-0">
          {/* 01 — FAILURE */}
          <Stage
            no="01"
            label="Failure"
            tone="border-risk/30 bg-risk-soft text-risk"
          >
            <p className="text-[13.5px] font-semibold text-ink">
              {payment.failure ? humanize(payment.failure.category) : "Payment failed"}
            </p>
            {payment.failure?.rawMessage && (
              <p className="mt-0.5 text-[12.5px] text-ink-soft">{payment.failure.rawMessage}</p>
            )}
            <p className="mt-1.5 text-[11.5px] text-ink-faint">
              attempt #{payment.attempts.length} · {payment.failure?.rawCode ?? ""} ·{" "}
              {payment.attempts[0]?.latencyMs ? `${payment.attempts[0].latencyMs}ms` : ""} ·{" "}
              {timestamp(payment.createdAt)}
            </p>
          </Stage>

          {/* 02 — DIAGNOSIS */}
          <Stage no="02" label="Diagnosis" tone="border-violet/30 bg-violet-soft text-violet">
            {!analysis ? (
              <p className="text-[12.5px] text-ink-faint">
                No diagnosis yet — run the recovery pipeline to generate one.
              </p>
            ) : (
              <>
                <p className="text-[13.5px] font-semibold text-ink">{analysis.rootCause}</p>
                <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-ink-faint">
                  <span>
                    category:{" "}
                    <span className="font-semibold text-ink">{humanize(analysis.failureCategory)}</span>
                  </span>
                  <span>
                    severity: <span className="font-semibold text-ink">{analysis.severity}</span>
                  </span>
                  <span>
                    by{" "}
                    <span className="font-semibold text-violet">
                      {providerLabel(analysis.provider, analysis.usedFallback)}
                    </span>
                  </span>
                </p>
                <p className="mt-2 max-w-xl rounded-[6px] border-l-2 border-violet/40 bg-violet-soft/40 py-1.5 pl-3 text-[12px] leading-relaxed text-ink-soft">
                  {analysis.customerContext}
                </p>
              </>
            )}
          </Stage>

          {/* 03 — AI RECOMMENDATION */}
          <Stage no="03" label="AI recommendation" tone="border-violet/30 bg-violet-soft text-violet">
            {!analysis ? (
              <p className="text-[12.5px] text-ink-faint">Nothing recommended yet.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <p className="text-[15px] font-bold tracking-[-0.01em] text-ink">
                    {humanize(analysis.recommendedAction).toUpperCase()}
                  </p>
                  <span className="tnum rounded-[5px] bg-violet-soft px-1.5 py-0.5 font-mono text-[11px] font-semibold text-violet">
                    confidence {analysis.confidence.toFixed(2)}
                  </span>
                </div>
                <p className="mt-2 max-w-xl text-[12px] leading-relaxed text-ink-soft">{analysis.reasoning}</p>
              </>
            )}
          </Stage>

          {/* 04 — POLICY DECISION */}
          <Stage
            no="04"
            label="Policy decision"
            tone={
              action?.policyDecision === "REJECTED"
                ? "border-risk/30 bg-risk-soft text-risk"
                : action?.policyDecision === "NEEDS_APPROVAL"
                  ? "border-warn/30 bg-warn-soft text-warn"
                  : "border-brand/30 bg-brand-soft text-brand-deep"
            }
          >
            {!action ? (
              <p className="text-[12.5px] text-ink-faint">Policy has not evaluated this case yet.</p>
            ) : action.policyDecision === "REJECTED" ? (
              <div className="rounded-[8px] border border-risk/25 bg-risk-soft px-4 py-3">
                <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.08em] text-risk">
                  <span className="h-2 w-2 rounded-full bg-risk" aria-hidden />
                  Policy refused
                </p>
                <p className="mt-2 text-[12.5px] leading-relaxed text-ink">{action.policyReason}</p>
                <p className="mt-2 text-[11px] text-ink-faint">
                  The AI recommended {humanize(action.actionType).toLowerCase()}; the application refused it. This action
                  was never executed.
                </p>
              </div>
            ) : action.policyDecision === "NEEDS_APPROVAL" ? (
              <div className="rounded-[8px] border border-warn/30 bg-warn-soft px-4 py-3">
                <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.08em] text-warn">
                  <span className="h-2 w-2 rounded-full bg-warn" aria-hidden />
                  High value + risk — merchant approval required
                </p>
                <p className="mt-2 text-[12.5px] leading-relaxed text-ink">{action.policyReason}</p>
                <div className="mt-3">
                  <ApproveRejectButtons actionId={action.id} />
                </div>
              </div>
            ) : (
              <div className="rounded-[8px] border border-brand/20 bg-brand-soft/60 px-4 py-3">
                <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.08em] text-brand-deep">
                  <span className="h-2 w-2 rounded-full bg-brand" aria-hidden />
                  Allowed
                </p>
                <p className="mt-2 max-w-xl text-[12px] leading-relaxed text-ink-soft">
                  {action.policyReason}
                </p>
              </div>
            )}

            {/* Economics — expected value vs cost, for every decided action */}
            {economics && (
              <dl className="mt-3 grid max-w-md grid-cols-3 gap-px overflow-hidden rounded-[6px] border border-line bg-line">
                <div className="bg-surface px-3 py-2.5">
                  <dt className="label-caps text-ink-faint">Expected recovery</dt>
                  <dd className="display-money mt-1 text-[15px] text-ink">{formatINR(economics.expected)}</dd>
                </div>
                <div className="bg-surface px-3 py-2.5">
                  <dt className="label-caps text-ink-faint">Action cost</dt>
                  <dd className="display-money mt-1 text-[15px] text-ink-soft">{formatINR(economics.cost)}</dd>
                </div>
                <div className="bg-surface px-3 py-2.5">
                  <dt className="label-caps text-ink-faint">Expected net value</dt>
                  <dd
                    className={`display-money mt-1 text-[15px] ${
                      economics.expected - economics.cost > 0 ? "text-good" : "text-risk"
                    }`}
                  >
                    {economics.expected - economics.cost > 0 ? "+" : ""}
                    {formatINR(economics.expected - economics.cost)}
                  </dd>
                </div>
              </dl>
            )}
          </Stage>

          {/* 05 — EXECUTION */}
          <Stage no="05" label="Execution" tone="border-line-strong bg-surface-sunken text-ink-soft">
            {!action?.executedAt ? (
              <p className="text-[12.5px] text-ink-faint">
                {action?.status === "AWAITING_APPROVAL"
                  ? "Not executed — waiting for your approval."
                  : action?.policyDecision === "REJECTED"
                    ? "Not executed — refused by policy."
                    : "Nothing executed yet."}
              </p>
            ) : (
              <p className="text-[12.5px] leading-relaxed text-ink-soft">
                <span className="font-semibold text-ink">{humanize(action.actionType)}</span> executed at{" "}
                {timestamp(action.executedAt)}
                {action.approvedBy ? ` · approved by ${action.approvedBy}` : ""}
              </p>
            )}
          </Stage>

          {/* 06 — OUTCOME */}
          <Stage
            no="06"
            label="Outcome"
            tone={
              action?.outcome === "RECOVERED"
                ? "border-good/30 bg-good-soft text-good"
                : action?.outcome === "FAILED"
                  ? "border-risk/30 bg-risk-soft text-risk"
                  : "border-line-strong bg-surface-sunken text-ink-soft"
            }
          >
            {!action?.outcome || action.outcome === "PENDING" ? (
              <p className="text-[12.5px] text-ink-faint">
                {payment.status === "RECOVERED"
                  ? "Payment captured before any recovery action completed."
                  : action?.status === "AWAITING_APPROVAL"
                    ? "Awaiting your decision."
                    : "No outcome yet."}
              </p>
            ) : action.outcome === "RECOVERED" ? (
              <div className="rounded-[8px] border border-good/25 bg-good-soft px-4 py-3">
                <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.08em] text-good">
                  <span className="h-2 w-2 rounded-full bg-good" aria-hidden />
                  Recovered
                </p>
                <p className="display-money mt-1.5 text-[26px] leading-none text-good">
                  {formatINR(payment.amount)}
                </p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-ink-soft">{action.outcomeDetail}</p>
              </div>
            ) : action.outcome === "PENDING_REVIEW" ? (
              <p className="text-[12.5px] leading-relaxed text-ink-soft">{action.outcomeDetail}</p>
            ) : (
              <p className="text-[12.5px] leading-relaxed text-ink-soft">{action.outcomeDetail}</p>
            )}
          </Stage>
        </div>

        {/* ============ THE RECORD (tertiary) ============ */}
        <div className="min-w-0 space-y-8">
          <Section title="Payment record" hint="identifiers and gateway facts">
            <dl className="divide-y divide-line border-b border-line pt-1">
              {paymentFacts.map(([label, value]) => (
                <div key={String(label)} className="flex items-baseline justify-between gap-4 py-[7px]">
                  <dt className="text-[12px] text-ink-faint">{label}</dt>
                  <dd className="tnum text-right text-[12.5px] font-medium text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section title="Customer signals" hint="what the AI weighed">
            <dl className="divide-y divide-line border-b border-line pt-1">
              {customerFacts.map(([label, value]) => (
                <div key={String(label)} className="flex items-baseline justify-between gap-4 py-[7px]">
                  <dt className="text-[12px] text-ink-faint">{label}</dt>
                  <dd className="text-right text-[12.5px] font-medium text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section title="Gateway attempts" hint="raw charge record">
            <ol className="divide-y divide-line border-b border-line pt-1">
              {payment.attempts.length === 0 && (
                <li className="py-3 text-[12px] text-ink-faint">No gateway attempts recorded.</li>
              )}
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
          </Section>
        </div>
      </div>

      {/* ============ AUDIT TRAIL ============ */}
      <section className="mt-10">
        <Section title="Audit trail" hint="append-only · payloads expandable">
          <div className="pt-4">
            <AuditTimeline entries={audit} />
          </div>
        </Section>
      </section>
    </Shell>
  )
}