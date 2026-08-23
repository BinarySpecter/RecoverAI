import Link from "next/link"
import { Target } from "lucide-react"
import { Shell } from "@/components/shell"
import { Card, CardHeader, Badge, EmptyState, timeAgo } from "@/components/ui"
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
      subtitle={`${open.length} failed payments with an open recovery path`}
    >
      <Card>
        <CardHeader
          title="Open opportunities"
          subtitle="AI diagnosis, recommended action, and policy verdict per payment"
        />
        {open.length === 0 ? (
          <EmptyState
            icon={<Target size={26} strokeWidth={1.6} />}
            title="Nothing to recover"
            hint="Every failed payment has been recovered, closed, or is awaiting approval. Simulate a new failure to see the pipeline run."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-[13px]">
              <thead>
                <tr className="border-y border-line/70 text-left text-[10px] uppercase tracking-[0.12em] text-ink-faint">
                  <th className="px-5 py-2.5 font-semibold">Customer</th>
                  <th className="px-4 py-2.5 font-semibold">Amount</th>
                  <th className="px-4 py-2.5 font-semibold">Failure</th>
                  <th className="px-4 py-2.5 font-semibold">AI diagnosis</th>
                  <th className="px-4 py-2.5 font-semibold">Recommended</th>
                  <th className="px-4 py-2.5 font-semibold">Confidence</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {open.map((p) => {
                  const analysis = p.analyses[0]
                  const action = p.actions[0]
                  return (
                    <tr key={p.id} className="align-top transition-colors hover:bg-surface-sunken">
                      <td className="px-5 py-3">
                        <Link href={`/payments/${p.id}`} className="font-medium text-ink hover:text-brand-deep">
                          {p.customer.name}
                        </Link>
                        <span className="block text-[11.5px] text-ink-faint">
                          {p.method} · {timeAgo(p.createdAt)}
                          {p.customer.subscriptionActive && <span className="ml-1 text-violet">· sub</span>}
                        </span>
                      </td>
                      <td className="tnum px-4 py-3 font-semibold whitespace-nowrap text-ink">{formatINR(p.amount)}</td>
                      <td className="px-4 py-3">
                        <Badge value={p.failure?.category ?? "UNKNOWN"} />
                        {p.retryCount > 0 && (
                          <span className="block mt-1 text-[11px] text-ink-faint">{p.retryCount} retr{p.retryCount === 1 ? "y" : "ies"}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-[220px]">
                        {analysis ? (
                          <>
                            <p className="text-[12px] text-ink-soft leading-snug line-clamp-2">{analysis.rootCause}</p>
                            <span className="mt-1 inline-block text-[10.5px] text-ink-faint font-mono">
                              {analysis.provider}{analysis.usedFallback ? " (fallback)" : ""} · {analysis.latencyMs}ms
                            </span>
                          </>
                        ) : (
                          <span className="text-ink-faint text-[12px]">Not analyzed yet</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {analysis ? (
                          <span className="font-medium text-ink text-[12.5px]">
                            {analysis.recommendedAction.replace(/_/g, " ").toLowerCase()}
                          </span>
                        ) : (
                          <span className="text-ink-faint text-[12px]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {analysis ? (
                          <span className={`tnum font-mono text-[12.5px] font-semibold ${analysis.confidence >= 0.75 ? "text-good" : analysis.confidence >= 0.5 ? "text-warn" : "text-risk"}`}>
                            {analysis.confidence.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-ink-faint text-[12px]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {action?.status === "AWAITING_APPROVAL" ? (
                          <Badge value="AWAITING_APPROVAL" />
                        ) : action ? (
                          <Badge value={action.status} />
                        ) : (
                          <Badge value="PENDING" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {action?.status === "AWAITING_APPROVAL" ? (
                          <ApproveRejectButtons actionId={action.id} />
                        ) : (
                          <RunRecoveryButton paymentId={p.id} label={analysis ? "Re-run recovery" : "Run AI recovery"} />
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
