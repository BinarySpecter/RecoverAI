import type { ReactNode } from "react"
import { formatINR } from "@/lib/types"

/** ---------- Cards ---------- */

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(2,4,43,0.05)] ${className}`}>
      {children}
    </section>
  )
}

export function CardHeader({
  title,
  subtitle,
  action,
  eyebrow,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  eyebrow?: string
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">{eyebrow}</p>
        )}
        <h2 className="text-[14.5px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[12px] leading-snug text-ink-faint">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

/** Micro-label for section eyebrows and table headers. */
export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint ${className}`}>
      {children}
    </span>
  )
}

/** ---------- Status badges — always carry a shape (dot), never color alone ---------- */

const BADGE_STYLES: Record<string, { cls: string; dot: string }> = {
  // payment status
  CAPTURED: { cls: "bg-good-soft text-good", dot: "bg-good" },
  RECOVERED: { cls: "bg-good-soft text-good", dot: "bg-good" },
  FAILED: { cls: "bg-risk-soft text-risk", dot: "bg-risk" },
  PENDING: { cls: "bg-warn-soft text-warn", dot: "bg-warn" },
  // action status
  AWAITING_APPROVAL: { cls: "bg-warn-soft text-warn", dot: "bg-warn" },
  EXECUTED: { cls: "bg-brand-soft text-brand-deep", dot: "bg-brand" },
  EXECUTING: { cls: "bg-brand-soft text-brand-deep", dot: "bg-brand" },
  REJECTED: { cls: "bg-surface-sunken text-ink-soft", dot: "bg-ink-faint" },
  SKIPPED: { cls: "bg-surface-sunken text-ink-soft", dot: "bg-ink-faint" },
  // policy decisions
  APPROVED: { cls: "bg-good-soft text-good", dot: "bg-good" },
  NEEDS_APPROVAL: { cls: "bg-warn-soft text-warn", dot: "bg-warn" },
  // severity
  low: { cls: "bg-surface-sunken text-ink-soft", dot: "bg-ink-faint" },
  medium: { cls: "bg-warn-soft text-warn", dot: "bg-warn" },
  high: { cls: "bg-risk-soft text-risk", dot: "bg-risk" },
  critical: { cls: "bg-risk text-white", dot: "bg-white" },
  // risk levels
  LOW: { cls: "bg-surface-sunken text-ink-soft", dot: "bg-ink-faint" },
  MEDIUM: { cls: "bg-warn-soft text-warn", dot: "bg-warn" },
  HIGH: { cls: "bg-risk-soft text-risk", dot: "bg-risk" },
  // misc
  SUBSCRIPTION_ACTIVE: { cls: "bg-brand-soft text-brand-deep", dot: "bg-brand" },
}

export function Badge({ value, className = "", children }: { value: string; className?: string; children?: ReactNode }) {
  const style = BADGE_STYLES[value] ?? { cls: "bg-surface-sunken text-ink-soft", dot: "bg-ink-faint" }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium tracking-[0.01em] whitespace-nowrap ${style.cls} ${className}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {children ?? humanize(value)}
    </span>
  )
}

export function humanize(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

/** ---------- Actor attribution — who/what caused an audit event ---------- */

/**
 * Customer-facing provider naming. Implementation detail (mock/deterministic-rules-v1)
 * stays in the audit trail; surfaces get product language. Honest: "offline-safe"
 * states exactly what the deterministic engine guarantees.
 */
export function providerLabel(provider: string, usedFallback: boolean): string {
  if (usedFallback || provider === "fallback") return "deterministic fallback · offline-safe"
  switch (provider) {
    case "mock":
      return "offline-safe engine"
    case "gemini":
      return "Gemini"
    case "deepseek":
      return "DeepSeek"
    default:
      return provider
  }
}

const ACTOR_STYLES: Record<string, string> = {
  GATEWAY: "bg-surface-sunken text-ink-soft border-line-strong",
  POLICY: "bg-brand-soft text-brand-deep border-brand/20",
  MERCHANT: "bg-warn-soft text-warn border-warn/20",
  SYSTEM: "bg-surface-sunken text-ink-soft border-line-strong",
}

export function actorStyle(actor: string): string {
  if (actor.startsWith("AI:")) return "bg-violet-soft text-violet border-violet/20"
  return ACTOR_STYLES[actor] ?? "bg-surface-sunken text-ink-soft border-line-strong"
}

export function ActorChip({ actor, className = "" }: { actor: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-px font-mono text-[10px] font-medium tracking-wide ${actorStyle(actor)} ${className}`}
    >
      {actor}
    </span>
  )
}

/** ---------- Metric display ---------- */

export function Money({ paise, className = "" }: { paise: number; className?: string }) {
  return <span className={`tnum ${className}`}>{formatINR(paise)}</span>
}

export function ConfidenceMeter({
  value,
  label = "Confidence",
  tone = "auto",
}: {
  value: number
  label?: string
  tone?: "auto" | "violet"
}) {
  const pct = Math.round(value * 100)
  const bar = tone === "violet" ? "bg-violet" : pct >= 75 ? "bg-good" : pct >= 50 ? "bg-warn" : "bg-risk"
  const text = tone === "violet" ? "text-violet" : pct >= 75 ? "text-good" : pct >= 50 ? "text-warn" : "text-risk"
  return (
    <div className="min-w-[128px]">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">{label}</span>
        <span className={`tnum text-[13px] font-semibold ${text}`}>{value.toFixed(2)}</span>
      </div>
      <div
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#eef0f4]"
        role="meter"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label} ${pct}%`}
      >
        <div className={`h-full rounded-full ${bar} transition-[width] duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/** ---------- Empty / error states ---------- */

export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon && <div className="text-ink-faint/60">{icon}</div>}
      <p className="text-[13.5px] font-medium text-ink-soft">{title}</p>
      {hint && <p className="max-w-sm text-[12px] leading-relaxed text-ink-faint">{hint}</p>}
    </div>
  )
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-[5px]">
      <span className="text-[12px] text-ink-faint">{label}</span>
      <span className="tnum text-[12.5px] font-medium text-ink text-right">{children}</span>
    </div>
  )
}

/** ---------- Relative time ---------- */

export function timeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })
}

export function timestamp(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  return d.toLocaleString("en-IN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "short",
  })
}
