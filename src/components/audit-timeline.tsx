import { CircleCheck, CircleX, MinusCircle, Zap, Brain, Scale, User, Server, ArrowRight } from "lucide-react"
import { ActorChip, timestamp } from "@/components/ui"

/**
 * Audit timeline — the authoritative, append-only record.
 * Every entry answers WHAT / WHO / WHEN at a glance; the connecting spine
 * makes the gateway → AI → policy → action → outcome progression legible.
 * Raw provider payloads stay hidden behind an expander by default.
 */

export interface AuditEntry {
  id: string
  level: string
  actor: string
  event: string
  message: string
  createdAt: Date | string
  paymentId?: string | null
  data?: string | null
}

function stageOf(event: string, actor: string): { icon: typeof Zap; tone: string; label: string } {
  if (actor === "GATEWAY") return { icon: Server, tone: "text-risk", label: "Gateway" }
  if (actor.startsWith("AI:")) return { icon: Brain, tone: "text-violet", label: "AI" }
  if (actor === "POLICY") return { icon: Scale, tone: "text-brand-deep", label: "Policy" }
  if (actor === "MERCHANT") return { icon: User, tone: "text-warn", label: "Merchant" }
  if (event.startsWith("recovery.")) return { icon: Zap, tone: "text-good", label: "Recovery" }
  return { icon: Server, tone: "text-ink-faint", label: "System" }
}

export function AuditTimeline({
  entries,
  dense = false,
  renderMessage,
}: {
  entries: AuditEntry[]
  dense?: boolean
  renderMessage?: (entry: AuditEntry) => React.ReactNode
}) {
  return (
    <ol className={`relative px-4 ${dense ? "pb-2" : "pb-4"}`} aria-label="Audit trail">
      {entries.map((log, i) => {
        const stage = stageOf(log.event, log.actor)
        const isError = log.level === "error"
        const isWarn = log.level === "warn"
        const Icon = isError ? CircleX : isWarn ? MinusCircle : stage.icon
        const iconTone = isError ? "text-risk" : isWarn ? "text-warn" : stage.tone
        const hasPayload = Boolean(log.data && log.data !== "null")
        return (
          <li key={log.id} className={`relative flex gap-3 ${dense ? "pb-2.5 last:pb-0" : "pb-4 last:pb-0"}`}>
            {i < entries.length - 1 && (
              <span className="absolute left-[9px] top-6 bottom-0 w-px bg-line" aria-hidden />
            )}
            <span
              className={`relative z-10 mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full border bg-surface ${
                isError ? "border-risk/30" : isWarn ? "border-warn/30" : "border-line"
              }`}
            >
              <Icon size={11} strokeWidth={2.4} className={iconTone} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <ActorChip actor={log.actor} />
                <span className="tnum font-mono text-[10.5px] text-ink-faint">{timestamp(log.createdAt)}</span>
                <span className="font-mono text-[10px] text-ink-faint/80">{log.event}</span>
              </div>
              <p className={`mt-0.5 text-[12.5px] leading-snug text-ink-soft ${dense ? "line-clamp-2" : ""}`}>
                {renderMessage ? renderMessage(log) : log.message}
              </p>
              {hasPayload && (
                <details className="group mt-1.5">
                  <summary className="inline-flex cursor-pointer select-none items-center gap-1 rounded-[4px] px-1 -ml-1 py-px text-[10px] font-medium text-ink-faint transition-colors hover:bg-surface-sunken hover:text-ink-soft">
                    payload
                    <span className="text-ink-faint/70 transition-transform group-open:rotate-90" aria-hidden>
                      ›
                    </span>
                  </summary>
                  <pre className="tnum mt-1.5 max-h-40 overflow-auto rounded-[6px] border border-line bg-surface-sunken px-3 py-2 font-mono text-[10.5px] leading-relaxed text-ink-soft">
                    {JSON.stringify(JSON.parse(log.data!), null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** The canonical pipeline stages, in order — used by audit headers and the simulator. */
export const PIPELINE_STAGES = [
  { key: "gateway", label: "Gateway failure", icon: Server },
  { key: "ai", label: "AI diagnosis", icon: Brain },
  { key: "policy", label: "Policy check", icon: Scale },
  { key: "action", label: "Recovery action", icon: Zap },
  { key: "outcome", label: "Outcome", icon: CircleCheck },
] as const

export function PipelineStageStrip() {
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-4 pt-1 pb-2">
      {PIPELINE_STAGES.map((s, i) => (
        <span key={s.key} className="flex items-center gap-1.5">
          {i > 0 && <ArrowRight size={10} className="text-ink-faint/70" aria-hidden />}
          <span className="inline-flex items-center gap-1 rounded-[5px] border border-line bg-surface-sunken px-1.5 py-0.5 text-[10px] font-medium text-ink-soft">
            <s.icon size={10} strokeWidth={2.2} aria-hidden />
            {s.label}
          </span>
        </span>
      ))}
    </div>
  )
}