import Link from "next/link"
import { ScrollText, CircleCheck, CircleX, MinusCircle } from "lucide-react"
import { Shell } from "@/components/shell"
import { Card, CardHeader, EmptyState, timestamp } from "@/components/ui"
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
          title="Audit log"
          subtitle={`${logs.length} entries${activeLevel !== "all" ? ` · ${activeLevel} level` : ""}`}
          action={
            <div className="flex gap-1 rounded-lg border border-line p-0.5">
              {LEVELS.map((l) => (
                <Link
                  key={l}
                  href={l === "all" ? "/activity" : `/activity?level=${l}`}
                  className={`rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                    activeLevel === l ? "bg-ink text-white" : "text-ink-soft hover:bg-[#f1f2f5]"
                  }`}
                >
                  {l}
                </Link>
              ))}
            </div>
          }
        />
        {logs.length === 0 ? (
          <EmptyState icon={<ScrollText size={26} strokeWidth={1.6} />} title="No audit entries" />
        ) : (
          <ol className="px-5 pb-5">
            {logs.map((log, i) => (
              <li key={log.id} className="relative flex gap-3.5 pb-4 last:pb-0">
                {i < logs.length - 1 && <span className="absolute left-[7px] top-4 bottom-0 w-px bg-line" aria-hidden />}
                <span className="relative z-10 mt-0.5 shrink-0">
                  {log.level === "error" ? (
                    <CircleX size={15} className="text-risk" />
                  ) : log.level === "warn" ? (
                    <MinusCircle size={15} className="text-warn" />
                  ) : (
                    <CircleCheck size={15} className="text-brand" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] leading-snug text-ink-soft">
                    {log.paymentId ? (
                      <Link href={`/payments/${log.paymentId}`} className="hover:text-brand-deep">
                        {log.message}
                      </Link>
                    ) : (
                      log.message
                    )}
                  </p>
                  <p className="mt-0.5 font-mono text-[10.5px] text-ink-faint">
                    {timestamp(log.createdAt)} · {log.actor} · {log.event}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </Shell>
  )
}
