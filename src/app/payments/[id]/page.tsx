import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  Brain,
  ShieldCheck,
  User,
  Receipt,
  History,
  CircleCheck,
  CircleX,
  MinusCircle,
} from "lucide-react"
import { Shell } from "@/components/shell"
import { Card, CardHeader, Badge, ConfidenceMeter, KeyValue, EmptyState, timestamp, humanize } from "@/components/ui"
import { ApproveRejectButtons, RunRecoveryButton, ReanalyzeButton } from "@/components/action-buttons"
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

  return (
    <Shell
      active="/opportunities"
      title={`${payment.description ?? "Payment"} · ${formatINR(payment.amount)}`}
      subtitle={`${payment.orderId} · ${payment.customer.name} · ${payment.method}`}
    >
      <Link href="/opportunities" className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-soft hover:text-brand-deep">
        <ArrowLeft size={14} /> All opportunities
      </Link>

      {/* Status strip */}
      <Card className="mb-5 p-5 animate-fade-up">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className={`text-[26px] font-bold tracking-tight ${payment.status === "RECOVERED" ? "text-good" : payment.status === "FAILED" ? "text-risk" : "text-ink"}`}>
              {formatINR(payment.amount)}
            </span>
            <Badge value={payment.status} />
            {payment.failure && <Badge value={payment.failure.category} />}
            {latestAnalysis && <Badge value={latestAnalysis.severity} />}
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {awaitingAction && <ApproveRejectButtons actionId={awaitingAction.id} />}
            {isFailed && !isClosedForRecovery(payment) && <RunRecoveryButton paymentId={payment.id} label="Run recovery pipeline" />}
            {latestAnalysis && isFailed && <ReanalyzeButton paymentId={payment.id} />}
          </div>
        </div>
      </Card>

      <div className="grid lg:grid-cols-5 gap-5">
        {/* Left column: AI + policy */}
        <div className="lg:col-span-3 space-y-5">
          {/* AI diagnosis */}
          <Card>
            <CardHeader
              title="AI diagnosis"
              subtitle={latestAnalysis ? `${latestAnalysis.provider}${latestAnalysis.usedFallback ? " → deterministic fallback" : ""} · ${latestAnalysis.model ?? ""} · ${latestAnalysis.latencyMs ?? "?"}ms` : "Not analyzed yet"}
              action={<Brain size={16} className="text-violet" />}
            />
            {!latestAnalysis ? (
              <EmptyState
                icon={<Brain size={26} strokeWidth={1.6} />}
                title="No AI analysis yet"
                hint="Run the recovery pipeline to generate a diagnosis."
              />
            ) : (
              <div className="px-5 pb-5 space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="rounded-lg bg-violet-soft/50 border border-violet/20 p-3.5">
                    <p className="text-[10.5px] font-semibold uppercase tracking-wide text-violet">Likely failure category</p>
                    <p className="mt-1 text-[13.5px] font-semibold text-ink">{humanize(latestAnalysis.failureCategory)}</p>
                  </div>
                  <div className="rounded-lg bg-violet-soft/50 border border-violet/20 p-3.5">
                    <p className="text-[10.5px] font-semibold uppercase tracking-wide text-violet">Recommended action</p>
                    <p className="mt-1 text-[13.5px] font-semibold text-ink">{humanize(latestAnalysis.recommendedAction)}</p>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4 items-start">
                  <ConfidenceMeter value={latestAnalysis.confidence} label="Confidence" />
                  <ConfidenceMeter value={latestAnalysis.estimatedRecoveryProbability} label="Est. recovery probability" />
                </div>

                <div>
                  <p className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">Root cause</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink">{latestAnalysis.rootCause}</p>
                </div>
                <div>
                  <p className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">Why this action — AI reasoning</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{latestAnalysis.reasoning}</p>
                </div>
                <div>
                  <p className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">Customer context the AI weighed</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{latestAnalysis.customerContext}</p>
                </div>
              </div>
            )}
          </Card>

          {/* Policy decisions / action history */}
          <Card>
            <CardHeader title="Policy validation & action history" subtitle="The AI recommends — these rules authorize" action={<ShieldCheck size={16} className="text-brand-deep" />} />
            {payment.actions.length === 0 ? (
              <EmptyState title="No recovery actions yet" hint="Actions appear here with their policy verdict and outcome." />
            ) : (
              <div className="divide-y divide-line/70">
                {payment.actions.map((a) => (
                  <div key={a.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-semibold text-ink">{humanize(a.actionType)}</span>
                      <Badge value={a.policyDecision} />
                      <Badge value={a.status} />
                      <Badge value={a.riskLevel} />
                      <span className="ml-auto text-[11px] text-ink-faint font-mono">{timestamp(a.createdAt)}</span>
                    </div>
                    <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">
                      <span className="font-semibold text-ink">Policy:</span> {a.policyReason}
                    </p>
                    {a.outcomeDetail && (
                      <p className={`mt-1.5 text-[12.5px] leading-relaxed ${a.outcome === "RECOVERED" ? "text-good" : a.outcome === "FAILED" ? "text-risk" : "text-ink-soft"}`}>
                        <span className="font-semibold">Outcome:</span> {a.outcomeDetail}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Audit timeline */}
          <Card>
            <CardHeader title="Audit trail" subtitle="Immutable, chronological — every pipeline step" action={<History size={16} className="text-ink-faint" />} />
            <ol className="relative px-5 pb-5">
              {audit.map((log, i) => (
                <li key={log.id} className="relative flex gap-3.5 pb-4 last:pb-0">
                  {i < audit.length - 1 && <span className="absolute left-[7px] top-4 bottom-0 w-px bg-line" aria-hidden />}
                  <span className="relative z-10 mt-0.5 shrink-0">
                    {log.level === "error" ? <CircleX size={15} className="text-risk" /> : log.level === "warn" ? <MinusCircle size={15} className="text-warn" /> : <CircleCheck size={15} className="text-brand" />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[12.5px] leading-snug text-ink-soft">{log.message}</p>
                    <p className="mt-0.5 font-mono text-[10.5px] text-ink-faint">
                      {timestamp(log.createdAt)} · {log.actor} · {log.event}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        {/* Right column: payment + customer */}
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardHeader title="Payment" subtitle="Gateway view" action={<Receipt size={16} className="text-ink-faint" />} />
            <div className="px-5 pb-5">
              <KeyValue label="Order ID">{payment.orderId}</KeyValue>
              <KeyValue label="Amount">{formatINR(payment.amount)}</KeyValue>
              <KeyValue label="Method">{payment.method}</KeyValue>
              <KeyValue label="Status"><Badge value={payment.status} /></KeyValue>
              <KeyValue label="Retries">{payment.retryCount}</KeyValue>
              <KeyValue label="Source">{payment.source}</KeyValue>
              <KeyValue label="Created">{timestamp(payment.createdAt)}</KeyValue>
              {payment.recoveredAt && <KeyValue label="Recovered">{timestamp(payment.recoveredAt)}</KeyValue>}
              {payment.failure && (
                <>
                  <KeyValue label="Gateway code">
                    <span className="font-mono text-[12px]">{payment.failure.rawCode ?? "—"}</span>
                  </KeyValue>
                  <KeyValue label="Gateway message">{payment.failure.rawMessage ?? "—"}</KeyValue>
                </>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Customer history" subtitle="Signals the AI weighed" action={<User size={16} className="text-ink-faint" />} />
            <div className="px-5 pb-5">
              <KeyValue label="Name">{payment.customer.name}</KeyValue>
              <KeyValue label="Email">{payment.customer.email}</KeyValue>
              <KeyValue label="Successful payments">
                <span className="text-good font-semibold">{payment.customer.successfulPayments}</span>
              </KeyValue>
              <KeyValue label="Failed payments">
                <span className="text-risk font-semibold">{payment.customer.failedPayments}</span>
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
                <span className={`font-mono font-semibold ${payment.customer.riskScore >= 0.7 ? "text-risk" : payment.customer.riskScore >= 0.4 ? "text-warn" : "text-good"}`}>
                  {payment.customer.riskScore.toFixed(2)}
                </span>
              </KeyValue>
            </div>
          </Card>

          <Card>
            <CardHeader title="Attempts" subtitle="Every charge attempt at the gateway" />
            <div className="px-5 pb-5 space-y-2.5">
              {payment.attempts.map((att) => (
                <div key={att.id} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3.5 py-2.5">
                  <div>
                    <p className="text-[12.5px] font-medium text-ink">
                      Attempt #{att.attemptNo} <Badge value={att.status} />
                    </p>
                    <p className="text-[11px] text-ink-faint font-mono mt-0.5">
                      {att.gatewayCode} · {att.latencyMs}ms
                    </p>
                  </div>
                  <span className="text-[10.5px] text-ink-faint font-mono whitespace-nowrap">{timestamp(att.createdAt)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </Shell>
  )
}

function isClosedForRecovery(payment: { actions: { status: string; actionType: string }[] }): boolean {
  const last = payment.actions[0]
  return Boolean(last && (last.status === "REJECTED" || last.status === "SKIPPED" || last.actionType === "DO_NOTHING"))
}
