import Link from "next/link"
import { ScrollText } from "lucide-react"
import { Shell } from "@/components/shell"
import { Card, CardHeader, EmptyState, Eyebrow } from "@/components/ui"
import { AuditTimeline, PipelineStageStrip } from "@/components/audit-timeline"
import { db, getMerchant } from "@/lib/db"

export const dynamic = "force-dynamic"

const LEVELS = ["all", "info", "warn", "error"] as const

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string }>
}) {
  const { level } = await searchParams
  const activeLevel = LEVELS.includes((level ?? "all") as (typeof LEVELS)[number]) ? (level ?? "all") : "all"

  const merchant = await getMerchant()
  const logs = await db.auditLog.findMany({
    where: {
      merchantId: merchant.id,
      ...(activeLevel !== "all" ? { level: activeLevel } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  })

  return (
    <Shell
      active="/activity"
      title="Activity & Audit"
      subtitle="Append-only trail of every pipeline decision — AI, policy, gateway, merchant"
    >
      <Card>
        <CardHeader
          eyebrow="Immutable record"
          title="Audit log"
          subtitle={`${logs.length} ${logs.length === 1 ? "entry" : "entries"}${activeLevel !== "all" ? ` · ${activeLevel} level` : ""}`}
          action={
            <nav className="flex gap-0.5 rounded-lg border border-line p-0.5" aria-label="Filter by level">
              {LEVELS.map((l) => (
                <Link
                  key={l}
                  href={l === "all" ? "/activity" : `/activity?level=${l}`}
                  aria-current={activeLevel === l ? "true" : undefined}
                  className={`rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                    activeLevel === l ? "bg-ink text-white" : "text-ink-soft hover:bg-surface-sunken"
                  }`}
                >
                  {l}
                </Link>
              ))}
            </nav>
          }
        />
        <PipelineStageStrip />
        {logs.length === 0 ? (
          <div className="border-t border-line/70">
            <EmptyState icon={<ScrollText size={26} strokeWidth={1.6} />} title="No audit entries" />
          </div>
        ) : (
          <div className="max-h-[calc(100vh-260px)] overflow-y-auto border-t border-line/70 pt-3">
            <AuditTimeline
              entries={logs}
              dense
              renderMessage={(log) =>
                log.paymentId ? (
                  <Link href={`/payments/${log.paymentId}`} className="hover:text-brand-deep">
                    {log.message}
                  </Link>
                ) : (
                  log.message
                )
              }
            />
          </div>
        )}
        {logs.length > 0 && (
          <p className="border-t border-line/70 px-5 py-2.5">
            <Eyebrow>WHAT happened · WHO caused it · WHEN · WHY — every entry attributable</Eyebrow>
          </p>
        )}
      </Card>
    </Shell>
  )
}
