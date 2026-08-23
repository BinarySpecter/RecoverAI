import Link from "next/link"
import { ScrollText } from "lucide-react"
import { Shell } from "@/components/shell"
import { OpenSection } from "@/components/ui"
import { AuditTimeline } from "@/components/audit-timeline"
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
      <OpenSection
        title="Audit log"
        hint={`${logs.length} ${logs.length === 1 ? "entry" : "entries"}${activeLevel !== "all" ? ` · ${activeLevel} level` : ""} · what happened, who caused it, when, why`}
        action={
          <nav className="flex gap-0.5 rounded-lg border border-line p-0.5" aria-label="Filter by level">
            {LEVELS.map((l) => (
              <Link
                key={l}
                href={l === "all" ? "/activity" : `/activity?level=${l}`}
                aria-current={activeLevel === l ? "true" : undefined}
                className={`rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                  activeLevel === l ? "bg-primary text-white" : "text-ink-soft hover:bg-surface-sunken"
                }`}
              >
                {l}
              </Link>
            ))}
          </nav>
        }
      >
        {logs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 border-b border-line py-16 text-center">
            <ScrollText size={24} strokeWidth={1.5} className="text-ink-faint/50" aria-hidden />
            <p className="text-[13.5px] font-medium text-ink-soft">No audit entries</p>
          </div>
        ) : (
          <div className="border-b border-line">
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
      </OpenSection>
    </Shell>
  )
}
