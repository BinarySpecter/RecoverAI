import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  Brain,
  ShieldCheck,
  User,
  Receipt,
  History,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react"
import { Shell } from "@/components/shell"
import { Card, CardHeader, Badge, ConfidenceMeter, KeyValue, EmptyState, timestamp, humanize, Eyebrow } from "@/components/ui"
import { AuditTimeline, PipelineStageStrip } from "@/components/audit-timeline"
import { ApproveRejectButtons, RunRecoveryButton, ReanalyzeButton } from "@/components/action-buttons"
import { ACTION_CATALOG } from "@/lib/engine/actions"
import { db } from "@/lib/db"
import { formatINR } from "@/lib/types"

export const dynamic = "force-dynamic"

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
  const awaitingAction = payment.actions.find((a) => a.status === "AWAITING_APPROVAL")
  const isFailed = payment.status === "FAILED"
  const lastAction = payment.actions[0]
  const isClosed =
    Boolean(lastAction) &&
    (lastAction.status === "REJECTED" || lastAction.status === "SKIPPED" || lastAction.actionType === "DO_NOTHING")

  return (
    <Shell
      active="/opportunities"
      title={`${payment.description ?? "Payment"} · ${formatINR(payment.amount)}`}
      subtitle={`${payment.orderId} · ${payment.customer.name} · ${payment.method}`}
    >
      <Link
        href="/opportunities"
        className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-soft hover:text-brand-deep"
      >
        <ArrowLeft size={14} aria-hidden /> All opportunities
      </Link>

      {/* ---------- Status strip ---------- */}
      <Card className="mb-5 p-5 animate-fade-up">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className={`tnum text-[28px] font-bold leading-none tracking-[-0.02em] ${
                payment.status === "RECOVERED" ? "text-good" : payment.status === "FAILED" ? "text-risk" : "text-ink"
              }`}
            >
              {formatINR(payment.amount)}
            </span>
            <Badge value={payment.status} />
            {payment.failure && <Badge value={payment.failure.category} />}
            {latestAnalysis && <Badge value={latestAnalysis.severity} />}
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {awaitingAction && <ApproveRejectButtons actionId={awaitingAction.id} />}
            {isFailed && !awaitingAction && !isClosed && (
              <RunRecoveryButton paymentId={payment.id} label="Run recovery pipeline" />
            )}
            {latestAnalysis && isFailed && <ReanalyzeButton paymentId={payment.id} />}
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-5">
        {/* ================= Left: the decision story ================= */}
        <div className="space-y-5 lg:col-span-3">
          {/* ---------- Layer 1: AI diagnosis (advisory) ---------- */}
          <Card>
            <CardHeader
              eyebrow="Layer 1 · Advisory"
              title="AI diagnosis"
              subtitle={
                latestAnalysis
                  ? `${latestAnalysis.provider}${latestAnalysis.usedFallback ? " → deterministic fallback" : ""} · ${latestAnalysis.model ?? ""} · ${latestAnalysis.latencyMs ?? "?"}ms`
                  : "Not analyzed yet"
              }
              action={
                <span className="inline-flex items-center gap-1.5 rounded-md border border-violet/25 bg-violet-soft px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-violet">
                  <Brain size={11} strokeWidth={2.4} aria-hidden /> recommends
                </span>
              }
            />
            {!latestAnalysis ? (
              <EmptyState
                icon={<Brain size={26} strokeWidth={1.6} />}
                title="No AI analysis yet"
                hint="Run the recovery pipeline to generate a diagnosis."
              />
            ) : (
              <div className="space-y-4 px-5 pb-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-violet/20 bg-violet-soft/40 p-3">
                    <Eyebrow className="text-violet/80">Likely failure category</Eyebrow>
                    <p className="mt-1 text-[13.5px] font-semibold text-ink">{humanize(latestAnalysis.failureCategory)}</p>
                  </div>
                  <div className="rounded-lg border border-violet/20 bg-violet-soft/40 p-3">
                    <Eyebrow className="text-violet/80">Recommended action</Eyebrow>
                    <p className="mt-1 text-[13.5px] font-semibold text-ink">{humanize(latestAnalysis.recommendedAction)}</p>
                  </div>
                </div>

                <div className="grid items-start gap-4 sm:grid-cols-2">
                  <ConfidenceMeter value={latestAnalysis.confidence} label="Confidence" tone="violet" />
                  <ConfidenceMeter value={latestAnalysis.estimatedRecoveryProbability} label="Est. recovery probability" />
                </div>

                <div>
                  <Eyebrow>Root cause</Eyebrow>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink">{latestAnalysis.rootCause}</p>
                </div>
                <div>
                  <Eyebrow>Why this action — AI reasoning</Eyebrow>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{latestAnalysis.reasoning}</p>
                </div>
                <div>
                  <Eyebrow>Customer context the AI weighed</Eyebrow>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{latestAnalysis.customerContext}</p>
                </div>
              </div>
            )}
          </Card>

          {/* ---------- Layer 2: policy (authorization) ---------- */}
          <Card>
            <CardHeader
              eyebrow="Layer 2 · Authorization"
              title="Policy validation & action history"
              subtitle="The AI recommends — these deterministic rules decide"
              action={
                <span className="inline-flex items-center gap-1.5 rounded-md border border-brand/25 bg-brand-soft px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-brand-deep">
                  <ShieldCheck size={11} strokeWidth={2.4} aria-hidden /> authorizes
                </span>
              }
            />
            {payment.actions.length === 0 ? (
              <EmptyState title="No recovery actions yet" hint="Actions appear here with their policy verdict and outcome." />
            ) : (
              <div className="divide-y divide-line/70">
                {payment.actions.map((a) => {
                  const def = ACTION_CATALOG[a.actionType as keyof typeof ACTION_CATALOG]
                  const gated = a.policyDecision === "NEEDS_APPROVAL"
                  const rejected = a.policyDecision === "REJECTED"
                  return (
                    <div key={a.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13.5px] font-semibold text-ink">{humanize(a.actionType)}</span>
                        <Badge value={a.policyDecision} />
                        <Badge value={a.status} />
                        <Badge value={a.riskLevel} />
                        <span className="tnum ml-auto font-mono text-[10.5px] text-ink-faint">{timestamp(a.createdAt)}</span>
                      </div>

                      {/* the two-layer flow, per action */}
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-violet/25 bg-violet-soft px-2 py-0.5 font-medium text-violet">
                          <Brain size={10} strokeWidth={2.4} aria-hidden /> AI recommended {a.actionType.replace(/_/g, " ").toLowerCase()}
                        </span>
                        <span aria-hidden className="text-ink-faint/60">→</span>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-medium ${
                            gated
                              ? "border-warn/30 bg-warn-soft text-warn"
                              : rejected
                                ? "border-risk/25 bg-risk-soft text-risk"
                                : "border-good/25 bg-good-soft text-good"
                          }`}
                        >
                          {gated ? <AlertTriangle size={10} strokeWidth={2.4} aria-hidden /> : rejected ? <XCircle size={10} strokeWidth={2.4} aria-hidden /> : <ShieldCheck size={10} strokeWidth={2.4} aria-hidden />}
                          Policy: {a.policyDecision === "APPROVED" ? "authorized" : gated ? "approval required" : "rejected"}
                        </span>
                        {a.approvedBy && (
                          <>
                            <span aria-hidden className="text-ink-faint/60">→</span>
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-sunken px-2 py-0.5 font-medium text-ink-soft">
                              <User size={10} strokeWidth={2.4} aria-hidden /> approved by {a.approvedBy}
                            </span>
                          </>
                        )}
                      </div>

                      {/* eligibility checklist derived from the same facts the engine used */}
                      {def && a.policyDecision === "APPROVED" && (
                        <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1" aria-label="Policy checks">
                          {[
                            `compatible with ${humanize(payment.failure?.category ?? "failure")}`,
                            "cooldown window satisfied",
                            `under ${def.approvalThreshold > 1e12 ? "no" : formatINR(def.approvalThreshold)} approval threshold`,
                            "below customer-contact risk ceiling",
                          ].map((check) => (
                            <li key={check} className="flex items-center gap-1.5 text-[11.5px] text-ink-soft">
                              <CheckCircle2 size={11} strokeWidth={2.4} className="text-good" aria-hidden />
                              {check}
                            </li>
                          ))}
                        </ul>
                      )}

                      <p className="mt-2 text-[12px] leading-relaxed text-ink-soft">
                        <span className="font-semibold text-ink">Policy reason:</span> {a.policyReason}
                      </p>
                      {a.outcomeDetail && (
                        <p
                          className={`mt-1.5 text-[12.5px] leading-relaxed ${
                            a.outcome === "RECOVERED" ? "text-good" : a.outcome === "FAILED" ? "text-risk" : "text-ink-soft"
                          }`}
                        >
                          <span className="font-semibold">Outcome:</span> {a.outcomeDetail}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          {/* ---------- Audit trail ---------- */}
          <Card>
            <CardHeader
              eyebrow="Immutable record"
              title="Audit trail"
              subtitle="Append-only, chronological — every pipeline step, attributed"
              action={<History size={16} className="text-ink-faint" aria-hidden />}
            />
            <PipelineStageStrip />
            <div className="border-t border-line/70 pt-3">
              <AuditTimeline entries={audit} />
            </div>
          </Card>
        </div>

        {/* ================= Right: the facts ================= */}
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Payment" subtitle="Gateway view" action={<Receipt size={16} className="text-ink-faint" aria-hidden />} />
            <div className="px-5 pb-5">
              <KeyValue label="Order ID"><span className="font-mono text-[11.5px]">{payment.orderId}</span></KeyValue>
              <KeyValue label="Amount">{formatINR(payment.amount)}</KeyValue>
              <KeyValue label="Method">{payment.method}</KeyValue>
              <KeyValue label="Status"><Badge value={payment.status} /></KeyValue>
              <KeyValue label="Retries">{payment.retryCount}</KeyValue>
              <KeyValue label="Source">{payment.source}</KeyValue>
              <KeyValue label="Created">{timestamp(payment.createdAt)}</KeyValue>
              {payment.recoveredAt && <KeyValue label="Recovered">{timestamp(payment.recoveredAt)}</KeyValue>}
              {payment.failure && (
                <>
                  <KeyValue label="Gateway code"><span className="font-mono text-[11.5px]">{payment.failure.rawCode ?? "—"}</span></KeyValue>
                  <KeyValue label="Gateway message">{payment.failure.rawMessage ?? "—"}</KeyValue>
                </>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Customer history" subtitle="Signals the AI weighed" action={<User size={16} className="text-ink-faint" aria-hidden />} />
            <div className="px-5 pb-5">
              <KeyValue label="Name">{payment.customer.name}</KeyValue>
              <KeyValue label="Email"><span className="font-normal">{payment.customer.email}</span></KeyValue>
              <KeyValue label="Successful payments">
                <span className="font-semibold text-good tnum">{payment.customer.successfulPayments}</span>
              </KeyValue>
              <KeyValue label="Failed payments">
                <span className="font-semibold text-risk tnum">{payment.customer.failedPayments}</span>
              </KeyValue>
              <KeyValue label="Lifetime value">{formatINR(payment.customer.lifetimeValue)}</KeyValue>
              <KeyValue label="Avg order">{formatINR(payment.customer.avgOrderValue)}</KeyValue>
              <KeyValue label="Subscription">
                {payment.customer.subscriptionActive ? (
                  <Badge value="SUBSCRIPTION_ACTIVE" />
                ) : (
                  <span className="text-ink-faint">None</span>
                )}
              </KeyValue>
              <KeyValue label="Risk score">
                <span
                  className={`tnum font-mono font-semibold ${
                    payment.customer.riskScore >= 0.7 ? "text-risk" : payment.customer.riskScore >= 0.4 ? "text-warn" : "text-good"
                  }`}
                >
                  {payment.customer.riskScore.toFixed(2)}
                </span>
              </KeyValue>
            </div>
          </Card>

          <Card>
            <CardHeader title="Attempts" subtitle="Every charge attempt at the gateway" />
            <div className="space-y-2.5 px-5 pb-5">
              {payment.attempts.map((att) => (
                <div key={att.id} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-[12.5px] font-medium text-ink">
                      <span className="tnum">Attempt #{att.attemptNo}</span>
                      <Badge value={att.status} />
                    </p>
                    <p className="tnum mt-0.5 truncate font-mono text-[10.5px] text-ink-faint">
                      {att.gatewayCode} · {att.latencyMs}ms
                    </p>
                  </div>
                  <span className="tnum shrink-0 font-mono text-[10px] text-ink-faint">{timestamp(att.createdAt)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </Shell>
  )
}
