import Link from "next/link"
import { Target, ArrowRight } from "lucide-react"
import { Shell } from "@/components/shell"
import { Card, CardHeader, Badge, EmptyState, timeAgo, humanize } from "@/components/ui"
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

  return (
    <Shell
      active="/opportunities"
      title="Recovery Opportunities"
      subtitle={`${open.length} failed ${open.length === 1 ? "payment" : "payments"} with an open recovery path`}
    >
      <Card>
        <CardHeader
          eyebrow="Operator work queue"
          title="Open opportunities"
          subtitle="Who · how much · what failed · what the AI thinks · what policy says · what happens next"
        />
        {open.length === 0 ? (
          <EmptyState
            icon={<Target size={26} strokeWidth={1.6} />}
            title="Nothing to recover"
            hint="Every failed payment has been recovered, closed, or is awaiting approval. Simulate a new failure to see the pipeline run."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-[13px]">
              <thead>
                <tr className="border-y border-line/70 text-left text-[10px] uppercase tracking-[0.12em] text-ink-faint">
                  <th scope="col" className="px-5 py-2.5 font-semibold">Customer</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold text-right">Amount</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">AI diagnosis</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Policy</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {open.map((p) => {
                  const analysis = p.analyses[0]
                  const action = p.actions[0]
                  const awaiting = action?.status === "AWAITING_APPROVAL"
                  return (
                    <tr key={p.id} className="align-top transition-colors hover:bg-surface-sunken">
                      {/* WHO */}
                      <td className="px-5 py-3">
                        <Link href={`/payments/${p.id}`} className="font-medium text-ink hover:text-brand-deep">
                          {p.customer.name}
                        </Link>
                        <span className="block text-[11px] text-ink-faint">
                          {p.method} · {timeAgo(p.createdAt)}
                          {p.customer.subscriptionActive && <span className="ml-1 font-medium text-violet">· subscription</span>}
                        </span>
                      </td>
                      {/* HOW MUCH */}
                      <td className="tnum px-4 py-3 text-right font-bold whitespace-nowrap text-ink">{formatINR(p.amount)}</td>
                      {/* WHAT FAILED + WHAT AI THINKS (one scannable cell) */}
                      <td className="px-4 py-3">
                        {analysis ? (
                          <>
                            <span className="text-[12.5px] font-semibold text-ink">
                              {humanize(analysis.failureCategory)}
                            </span>
                            <span className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-[11px] text-ink-faint">
                              <span
                                className={`tnum font-mono font-semibold ${
                                  analysis.confidence >= 0.75 ? "text-good" : analysis.confidence >= 0.5 ? "text-warn" : "text-risk"
                                }`}
                              >
                                {Math.round(analysis.confidence * 100)}%
                              </span>
                              confidence · {humanize(analysis.recommendedAction).toLowerCase()}
                            </span>
                          </>
                        ) : (
                          <span className="text-[12px] text-ink-faint">Not analyzed yet</span>
                        )}
                      </td>
                      {/* WHAT POLICY SAYS */}
                      <td className="px-4 py-3">
                        {action ? (
                          <Badge value={action.policyDecision} />
                        ) : (
                          <span className="text-[12px] text-ink-faint">—</span>
                        )}
                      </td>
                      {/* STATUS */}
                      <td className="px-4 py-3">
                        {action ? <Badge value={action.status} /> : <Badge value="PENDING" />}
                      </td>
                      {/* WHAT HAPPENS NEXT */}
                      <td className="px-4 py-3 text-right">
                        {awaiting ? (
                          <ApproveRejectButtons actionId={action.id} />
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            <RunRecoveryButton paymentId={p.id} label={analysis ? "Recover" : "Analyze"} />
                            <Link
                              href={`/payments/${p.id}`}
                              className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:bg-surface-sunken"
                            >
                              Detail <ArrowRight size={11} strokeWidth={2.2} aria-hidden />
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
      </Card>
    </Shell>
  )
}
