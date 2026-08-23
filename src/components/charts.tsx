import { formatINR } from "@/lib/types"

/** Hand-rolled SVG charts — no chart library, full visual control. */

export interface TrendPoint {
  date: string
  failed: number
  recovered: number
  recoveredAmount: number
}

/** 7-day dual bar chart: failures vs recoveries. */
export function TrendChart({ data }: { data: TrendPoint[] }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.failed, d.recovered)))
  const days = data.map((d) => ({
    ...d,
    label: new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
  }))
  return (
    <div>
      <div className="flex items-end gap-3 sm:gap-5 px-5 h-[148px]">
        {days.map((d) => (
          <div key={d.date} className="group relative flex-1 flex h-full flex-col justify-end items-center gap-1.5">
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full hidden group-hover:block z-10 w-max rounded-lg bg-ink px-2.5 py-1.5 text-[11px] text-white shadow-lg">
              <div className="font-semibold">{d.label}</div>
              <div className="text-white/70">{d.failed} failed · {d.recovered} recovered</div>
              {d.recoveredAmount > 0 && <div className="text-good-soft">{formatINR(d.recoveredAmount, { compact: true })} recovered</div>}
            </div>
            <div className="flex w-full items-end justify-center gap-1 h-full">
              <div
                className="w-[38%] max-w-6 rounded-t-[3px] bg-risk/85 transition-all group-hover:bg-risk"
                style={{ height: `${(d.failed / max) * 100}%` }}
                title={`${d.failed} failed`}
              />
              <div
                className="w-[38%] max-w-6 rounded-t-[3px] bg-good/85 transition-all group-hover:bg-good"
                style={{ height: `${(d.recovered / max) * 100}%` }}
                title={`${d.recovered} recovered`}
              />
            </div>
            <span className="text-[10px] text-ink-faint whitespace-nowrap">
              {new Date(d.date).toLocaleDateString("en-IN", { day: "numeric" })}{" "}
              {new Date(d.date).toLocaleDateString("en-IN", { month: "short" })}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 px-5 pt-3 pb-1 border-t border-line/60 mt-2">
        <span className="flex items-center gap-1.5 text-[11px] text-ink-faint">
          <span className="h-2 w-2 rounded-[2px] bg-risk/85" /> Failed
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-ink-faint">
          <span className="h-2 w-2 rounded-[2px] bg-good/85" /> Recovered by AI
        </span>
      </div>
    </div>
  )
}

export interface CategoryDatum {
  category: string
  count: number
  atRisk: number
  recovered: number
}

/** Horizontal failure-category bars: recovered (green) stacked on still-at-risk (red). */
export function CategoryBars({ data }: { data: CategoryDatum[] }) {
  const max = Math.max(1, ...data.map((d) => d.atRisk + d.recovered))
  return (
    <div className="px-5 pb-4 space-y-3">
      {data.map((d) => {
        const total = d.atRisk + d.recovered
        const riskPct = (d.atRisk / max) * 100
        const goodPct = (d.recovered / max) * 100
        return (
          <div key={d.category}>
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <span className="text-[12.5px] font-medium text-ink">
                {humanizeCategory(d.category)}
                <span className="ml-1.5 text-ink-faint font-normal">×{d.count}</span>
              </span>
              <span className="text-[11.5px] text-ink-faint font-mono">
                {formatINR(total, { compact: true })}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-[#eef0f4] overflow-hidden flex">
              <div className="h-full bg-good/80 rounded-l-full" style={{ width: `${goodPct}%` }} title={`Recovered ${formatINR(d.recovered)}`} />
              <div className="h-full bg-risk/80" style={{ width: `${riskPct}%` }} title={`At risk ${formatINR(d.atRisk)}`} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function humanizeCategory(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}
