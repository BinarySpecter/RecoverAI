import Link from "next/link"
import { Target, ArrowRight } from "lucide-react"
import { Shell } from "@/components/shell"
import { StatusText, timeAgo, humanize } from "@/components/ui"
import { ApproveRejectButtons, RunRecoveryButton } from "@/components/action-buttons"
import { db, getMerchant } from "@/lib/db"
import { formatINR } from "@/lib/types"

export const dynamic = "force-dynamic"

export default async function OpportunitiesPage() {
  const merchant = await getMerchant()
  const failed = await db.payment.findMany({
    where: { merchantId: merchant.id, status: "FAILED" },
    include: {
      customer: true,
      failure: true,
      analyses: { orderBy: { createdAt: "desc" }, take: 1 },
      actions: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  })

  const open = failed.filter((p) => {
    const last = p.actions[0]
    if (!last) return true
    return !(last.status === "REJECTED" || last.status === "SKIPPED" || last.actionType === "DO_NOTHING")
  })

  const atRisk = open.reduce((s, p) => s + p.amount, 0)
  const awaiting = open.filter((p) => p.actions[0]?.status === "AWAITING_APPROVAL").length

  return (
    <Shell
      active="/opportunities"
      title="Recovery"
      subtitle={`${open.length} open ${open.length === 1 ? "opportunity" : "opportunities"} · ${formatINR(atRisk, { compact: true })} at risk · AI recommends, policy authorizes`}
    >
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 border-b border-line pb-5">
        <div>
          <p className="label-caps text-ink-faint">Open opportunities</p>
          <p className="tnum display-money mt-1 text-[28px] leading-none text-ink">{open.length}</p>
        </div>
        <div>
          <p className="label-caps text-ink-faint">Amount at risk</p>
          <p className="display-money mt-1 text-[28px] leading-none text-risk">{formatINR(atRisk, { compact: true })}</p>
        </div>
        <div>
          <p className="label-caps text-ink-faint">Held for approval</p>
          <p className="display-money mt-1 text-[28px] leading-none text-warn">{awaiting}</p>
        </div>
      </div>

      {open.length === 0 ? (
        <div className="flex flex-col items-center gap-2 border-b border-line py-16 text-center">
          <Target size={22} strokeWidth={1.5} className="text-ink-faint/50" aria-hidden />
          <p className="text-[13.5px] font-medium text-ink-soft">Nothing to recover</p>
          <p className="max-w-sm text-[12px] leading-relaxed text-ink-faint">
            Every failed payment has been recovered, closed, or is awaiting approval. Simulate a new failure to watch
            the pipeline run.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto pt-1">
          <table className="w-full min-w-[920px] text-[13px]">
            <thead>
              <tr className="border-b border-line text-left">
                <th scope="col" className="label-caps py-2.5 pr-5 font-semibold text-ink-faint">Customer</th>
                <th scope="col" className="label-caps py-2.5 pr-5 text-right font-semibold text-ink-faint">Amount</th>
                <th scope="col" className="label-caps py-2.5 pr-5 font-semibold text-violet/90">AI diagnosis</th>
                <th scope="col" className="label-caps py-2.5 pr-5 font-semibold text-brand-deep/90">Policy</th>
                <th scope="col" className="label-caps py-2.5 pr-5 font-semibold text-ink-faint">Status</th>
                <th scope="col" className="label-caps py-2.5 text-right font-semibold text-ink-faint">Next</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {open.map((p) => {
                const analysis = p.analyses[0]
                const action = p.actions[0]
                const awaitingAction = action?.status === "AWAITING_APPROVAL"
                return (
                  <tr key={p.id} className="group align-top transition-colors hover:bg-surface-sunken/60">
                    {/* WHO */}
                    <td className="py-3.5 pr-5">
                      <Link href={`/payments/${p.id}`} className="font-medium text-ink group-hover:text-brand-deep">
                        {p.customer.name}
                      </Link>
                      <span className="block text-[11px] text-ink-faint">
                        {p.method} · {timeAgo(p.createdAt)}
                        {p.customer.subscriptionActive && (
                          <span className="ml-1.5 font-medium text-violet">· subscription</span>
                        )}
                      </span>
                    </td>
                    {/* HOW MUCH */}
                    <td className="display-money py-3.5 pr-5 text-right text-[14.5px] whitespace-nowrap text-ink">
                      {formatINR(p.amount)}
                    </td>
                    {/* WHAT FAILED + WHAT AI THINKS */}
                    <td className="py-3.5 pr-5">
                      {analysis ? (
                        <>
                          <span className="text-[12.5px] font-semibold text-ink">
                            {humanize(analysis.failureCategory)}
                          </span>
                          <span className="mt-0.5 flex items-baseline gap-1.5 text-[11px] text-ink-faint">
                            <span
                              className={`tnum font-mono font-semibold ${
                                analysis.confidence >= 0.75 ? "text-good" : analysis.confidence >= 0.5 ? "text-warn" : "text-risk"
                              }`}
                            >
                              {Math.round(analysis.confidence * 100)}%
                            </span>
                            · {humanize(analysis.recommendedAction).toLowerCase()}
                          </span>
                        </>
                      ) : (
                        <span className="text-[12px] text-ink-faint">Not analyzed yet</span>
                      )}
                    </td>
                    {/* WHAT POLICY SAYS */}
                    <td className="py-3.5 pr-5">
                      {action ? (
                        <StatusText value={action.policyDecision} />
                      ) : (
                        <span className="text-[12px] text-ink-faint">—</span>
                      )}
                    </td>
                    {/* STATUS */}
                    <td className="py-3.5 pr-5">
                      {action ? <StatusText value={action.status} /> : <StatusText value="PENDING" />}
                    </td>
                    {/* NEXT */}
                    <td className="py-3.5 text-right">
                      {awaitingAction ? (
                        <ApproveRejectButtons actionId={action.id} compact />
                      ) : (
                        <div className="flex items-center justify-end gap-3">
                          <RunRecoveryButton paymentId={p.id} label={analysis ? "Recover" : "Analyze"} />
                          <Link
                            href={`/payments/${p.id}`}
                            className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-deep hover:underline"
                          >
                            Case <ArrowRight size={11} strokeWidth={2.2} aria-hidden />
                          </Link>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  )
}