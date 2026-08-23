import type { ReactNode } from "react"
import { formatINR } from "@/lib/types"

/** ---------- Cards ---------- */

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(2,4,43,0.05)] ${className}`}>
      {children}
    </div>
  )
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[12.5px] text-ink-faint">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

/** ---------- Status badges ---------- */

const BADGE_STYLES: Record<string, string> = {
  // payment status
  CAPTURED: "bg-good-soft text-good",
  RECOVERED: "bg-good-soft text-good",
  FAILED: "bg-risk-soft text-risk",
  PENDING: "bg-warn-soft text-warn",
  // action status
  AWAITING_APPROVAL: "bg-violet-soft text-violet",
  EXECUTED: "bg-brand-soft text-brand-deep",
  EXECUTING: "bg-brand-soft text-brand-deep",
  REJECTED: "bg-[#f1f2f5] text-ink-soft",
  SKIPPED: "bg-[#f1f2f5] text-ink-soft",
  // policy decisions
  APPROVED: "bg-good-soft text-good",
  NEEDS_APPROVAL: "bg-violet-soft text-violet",
  // severity
  low: "bg-[#f1f2f5] text-ink-soft",
  medium: "bg-warn-soft text-warn",
  high: "bg-risk-soft text-risk",
  critical: "bg-risk text-white",
  // risk levels
  LOW: "bg-[#f1f2f5] text-ink-soft",
  MEDIUM: "bg-warn-soft text-warn",
  HIGH: "bg-risk-soft text-risk",
}

export function Badge({ value, className = "" }: { value: string; className?: string }) {
  const style = BADGE_STYLES[value] ?? "bg-[#f1f2f5] text-ink-soft"
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide whitespace-nowrap ${style} ${className}`}
    >
      {humanize(value)}
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

/** ---------- Metric display ---------- */

export function Money({ paise, className = "" }: { paise: number; className?: string }) {
  return <span className={className}>{formatINR(paise)}</span>
}

export function ConfidenceMeter({ value, label = "Confidence" }: { value: number; label?: string }) {
  const pct = Math.round(value * 100)
  const tone = pct >= 75 ? "bg-good" : pct >= 50 ? "bg-warn" : "bg-risk"
  return (
    <div className="min-w-[120px]">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium tracking-wide text-ink-faint uppercase">{label}</span>
        <span className="font-mono text-[12.5px] font-semibold text-ink">{(value).toFixed(2)}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#eef0f4]">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/** ---------- Empty / error states ---------- */

export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      {icon && <div className="text-ink-faint/60">{icon}</div>}
      <p className="text-[14px] font-medium text-ink-soft">{title}</p>
      {hint && <p className="max-w-sm text-[12.5px] text-ink-faint">{hint}</p>}
    </div>
  )
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-[12.5px] text-ink-faint">{label}</span>
      <span className="text-[13px] font-medium text-ink text-right">{children}</span>
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
