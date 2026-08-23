import { formatINR } from "@/lib/types"

/** Hand-rolled SVG-free charts — no library, full control, tabular number labels. */

export interface TrendPoint {
  date: string
  failed: number
  recovered: number
  recoveredAmount: number
}

/** 7-day failures-vs-recoveries chart with a common baseline and count labels. */
export function TrendChart({ data }: { data: TrendPoint[] }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.failed, d.recovered)))
  // Round the axis head up to a clean tick
  const head = Math.max(2, Math.ceil(max / 2) * 2)
  const gridLines = [head, Math.round(head / 2)]

  return (
    <div className="px-5 pb-4">
      <div className="flex gap-2">
        {/* y axis ticks */}
        <div className="flex h-[150px] flex-col justify-between p-0 text-right">
          {gridLines.map((g) => (
            <span key={g} className="tnum relative -top-[7px] font-mono text-[9.5px] leading-none text-ink-faint/80">
              {g}
            </span>
          ))}
          <span className="tnum relative -top-[1px] font-mono text-[9.5px] leading-none text-ink-faint/80">0</span>
        </div>

        <div className="relative flex-1">
          {/* gridlines */}
          <div className="absolute inset-0 h-[150px]" aria-hidden>
            {gridLines.map((g) => (
              <div
                key={g}
                className="absolute left-0 right-0 border-t border-dashed border-line"
                style={{ bottom: `${(g / head) * 150}px` }}
              />
            ))}
          </div>

          {/* bars */}
          <div className="relative flex h-[150px] items-end gap-2 sm:gap-3">
            {data.map((d) => (
              <div key={d.date} className="group relative flex h-full flex-1 flex-col justify-end">
                {/* hover card */}
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden w-max -translate-x-1/2 group-hover:block">
                  <div className="rounded-lg border border-line bg-ink px-2.5 py-1.5 text-[10.5px] leading-relaxed text-white shadow-lg">
                    <div className="tnum font-mono font-semibold">
                      {new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </div>
                    <div className="text-risk-soft">{d.failed} failed</div>
                    <div className="text-good-soft">{d.recovered} recovered</div>
                    {d.recoveredAmount > 0 && (
                      <div className="tnum font-semibold text-white">{formatINR(d.recoveredAmount, { compact: true })} saved</div>
                    )}
                  </div>
                </div>
                <div className="flex h-full items-end justify-center gap-[3px]">
                  <div className="relative flex w-full max-w-[26px] flex-col items-center">
                    {d.failed > 0 && (
                      <span className="tnum mb-0.5 font-mono text-[9.5px] font-semibold leading-none text-risk/90">
                        {d.failed}
                      </span>
                    )}
                    <div
                      className="w-[55%] rounded-t-[3px] bg-risk/80 transition-colors group-hover:bg-risk"
                      style={{ height: `${(d.failed / head) * 118}px`, minHeight: d.failed > 0 ? 3 : 0 }}
                      role="img"
                      aria-label={`${d.failed} failed on ${d.date}`}
                    />
                  </div>
                  <div className="relative flex w-full max-w-[26px] flex-col items-center">
                    {d.recovered > 0 && (
                      <span className="tnum mb-0.5 font-mono text-[9.5px] font-semibold leading-none text-good/90">
                        {d.recovered}
                      </span>
                    )}
                    <div
                      className="w-[55%] rounded-t-[3px] bg-good/80 transition-colors group-hover:bg-good"
                      style={{ height: `${(d.recovered / head) * 118}px`, minHeight: d.recovered > 0 ? 3 : 0 }}
                      role="img"
                      aria-label={`${d.recovered} recovered on ${d.date}`}
                    />
                  </div>
                </div>
                <div className="h-px w-full bg-line-strong" aria-hidden />
              </div>
            ))}
          </div>

          {/* x labels */}
          <div className="mt-1.5 flex gap-2 sm:gap-3">
            {data.map((d, i) => (
              <span
                key={d.date}
                className="tnum flex-1 text-center font-mono text-[9.5px] leading-none text-ink-faint"
              >
                {i === data.length - 1
                  ? "Today"
                  : new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-4 border-t border-line/70 pt-2.5">
        <span className="flex items-center gap-1.5 text-[10.5px] font-medium text-ink-faint">
          <span className="h-2 w-2 rounded-[2px] bg-risk/80" aria-hidden /> Failed payments
        </span>
        <span className="flex items-center gap-1.5 text-[10.5px] font-medium text-ink-faint">
          <span className="h-2 w-2 rounded-[2px] bg-good/80" aria-hidden /> Recovered by RecoverAI
        </span>
        <span className="ml-auto hidden sm:block text-[10.5px] text-ink-faint/80">counts per day · hover for ₹</span>
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

/** Failure categories: stacked recovered (green) vs still-at-risk (red), ₹ aligned. */
export function CategoryBars({ data }: { data: CategoryDatum[] }) {
  const max = Math.max(1, ...data.map((d) => d.atRisk + d.recovered))
  return (
    <div className="px-5 pb-5">
      <div className="mb-3 flex items-center gap-4">
        <span className="flex items-center gap-1.5 text-[10.5px] font-medium text-ink-faint">
          <span className="h-2 w-2 rounded-[2px] bg-good/80" aria-hidden /> Recovered
        </span>
        <span className="flex items-center gap-1.5 text-[10.5px] font-medium text-ink-faint">
          <span className="h-2 w-2 rounded-[2px] bg-risk/80" aria-hidden /> Still at risk
        </span>
      </div>
      <ul className="space-y-[11px]">
        {data.map((d) => (
          <li key={d.category}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="truncate text-[12px] font-medium text-ink">
                {humanizeCategory(d.category)}
                <span className="ml-1.5 tnum text-[10.5px] font-normal text-ink-faint">×{d.count}</span>
              </span>
              <span className="tnum shrink-0 font-mono text-[11px] text-ink-soft">
                {formatINR(d.atRisk + d.recovered, { compact: true })}
              </span>
            </div>
            <div className="flex h-[9px] w-full overflow-hidden rounded-full bg-[#eef0f4]" role="img" aria-label={`${humanizeCategory(d.category)}: ${formatINR(d.recovered)} recovered, ${formatINR(d.atRisk)} at risk`}>
              <div
                className="h-full bg-good/75"
                style={{ width: `${(d.recovered / max) * 100}%` }}
                title={`Recovered ${formatINR(d.recovered)}`}
              />
              <div
                className="h-full bg-risk/75"
                style={{ width: `${(d.atRisk / max) * 100}%` }}
                title={`At risk ${formatINR(d.atRisk)}`}
              />
            </div>
          </li>
        ))}
      </ul>
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
