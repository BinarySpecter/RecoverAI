import Link from "next/link"
import { BadgeCheck } from "lucide-react"
import { Shell } from "@/components/shell"
import { StatusText, timeAgo, humanize } from "@/components/ui"
import { ApproveRejectButtons } from "@/components/action-buttons"
import { db, getMerchant } from "@/lib/db"
import { formatINR } from "@/lib/types"
import { ACTION_CATALOG, actionCostPaise } from "@/lib/engine/actions"

export const dynamic = "force-dynamic"

/** Operational approval queue — every case answers: what happened, how much,
 *  what the AI recommends, why, why approval is required, what happens next. */
export default async function ApprovalsPage() {
  const merchant = await getMerchant()
  const cases = await db.recoveryAction.findMany({
    where: { status: "AWAITING_APPROVAL", payment: { merchantId: merchant.id } },
    include: {
      payment: { include: { customer: true, failure: true } },
      analysis: true,
    },
    orderBy: { createdAt: "asc" },
  })

  const gatedAmount = cases.reduce((s, c) => s + c.payment.amount, 0)

  return (
    <Shell
      active="/approvals"
      title="Approvals"
      subtitle={`${cases.length} ${cases.length === 1 ? "case" : "cases"} · ${formatINR(gatedAmount, { compact: true })} gated by policy — AI recommends, you authorize`}
    >
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 border-b border-line pb-5">
        <div>
          <p className="label-caps text-ink-faint">Awaiting decision</p>
          <p className="display-money mt-1 text-[30px] leading-none text-warn">{cases.length}</p>
        </div>
        <div>
          <p className="label-caps text-ink-faint">Money gated</p>
          <p className="display-money mt-1 text-[30px] leading-none text-ink">{formatINR(gatedAmount, { compact: true })}</p>
        </div>
        <p className="max-w-md text-[11.5px] leading-relaxed text-ink-faint">
          Policy requires merchant sign-off for actions at or above their amount threshold. Nothing executes until you
          decide; every decision is recorded in the audit trail.
        </p>
      </div>

      {cases.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <BadgeCheck size={22} strokeWidth={1.5} className="text-ink-faint/50" aria-hidden />
          <p className="text-[13.5px] font-medium text-ink-soft">Nothing awaiting approval</p>
          <p className="max-w-sm text-[12px] leading-relaxed text-ink-faint">
            High-value failures that policy gates will appear here. Simulate a high-value failure to see the flow.
          </p>
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {cases.map((c) => {
            const def = ACTION_CATALOG[c.actionType as keyof typeof ACTION_CATALOG]
            const expectedValue = Math.round(c.payment.amount * (c.estimatedRecoveryProbability || def?.efficacy || 0))
            const cost = actionCostPaise(c.actionType as keyof typeof ACTION_CATALOG)
            const net = expectedValue - cost
            return (
              <li key={c.id} className="grid gap-x-10 gap-y-4 py-5 lg:grid-cols-[1.2fr_1fr_auto]">
                {/* What happened + how much */}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <Link
                      href={`/payments/${c.paymentId}`}
                      className="display-money text-[20px] text-ink hover:text-brand-deep"
                    >
                      {formatINR(c.payment.amount)}
                    </Link>
                    <span className="text-[12.5px] font-medium text-ink">{c.payment.customer.name}</span>
                    <span className="text-[11px] text-ink-faint">
                      {c.payment.orderId} · {c.payment.method} · {timeAgo(c.payment.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[12px] leading-snug text-ink-soft">
                    <span className="font-semibold text-risk">Failed</span> —{" "}
                    {c.payment.failure ? humanize(c.payment.failure.category) : "unknown"} ·{" "}
                    {c.payment.failure?.rawMessage ?? "gateway rejected the charge"}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-faint">
                    <span>
                      AI recommends <span className="font-semibold text-violet">{humanize(c.actionType)}</span> ·{" "}
                      {c.analysis ? `${Math.round(c.analysis.confidence * 100)}% confidence` : "diagnosis pending"}
                    </span>
                    <span>· policy: <StatusText value="NEEDS_APPROVAL" /></span>
                  </div>
                  {c.policyReason && (
                    <p className="mt-2 max-w-xl text-[11.5px] leading-relaxed text-ink-faint">Why: {c.policyReason}</p>
                  )}
                </div>

                {/* Economics — what happens if approved */}
                <div>
                  <p className="label-caps text-ink-faint">If approved</p>
                  <dl className="mt-1.5 max-w-[300px] divide-y divide-line border-y border-line">
                    <div className="flex items-baseline justify-between gap-4 py-[5px]">
                      <dt className="text-[11.5px] text-ink-faint">Expected recovery</dt>
                      <dd className="tnum text-[12px] font-semibold text-ink">{formatINR(expectedValue)}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-4 py-[5px]">
                      <dt className="text-[11.5px] text-ink-faint">Action cost</dt>
                      <dd className="tnum text-[12px] text-ink-soft">{formatINR(cost)}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-4 py-[5px]">
                      <dt className="text-[11.5px] text-ink-faint">Expected net value</dt>
                      <dd className={`tnum text-[12px] font-semibold ${net > 0 ? "text-good" : "text-risk"}`}>
                        {net > 0 ? "+" : ""}
                        {formatINR(net)}
                      </dd>
                    </div>
                  </dl>
                  {c.analysis && (
                    <p className="mt-2 max-w-[300px] text-[11px] leading-snug text-ink-faint">
                      {c.analysis.reasoning.split(". ").slice(0, 2).join(". ")}.
                    </p>
                  )}
                </div>

                {/* Decision */}
                <div className="flex flex-col items-start gap-2 lg:items-end">
                  <ApproveRejectButtons actionId={c.id} />
                  <span className="text-[10.5px] text-ink-faint">
                    approve → {humanize(c.actionType).toLowerCase()} executes immediately
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Shell>
  )
}