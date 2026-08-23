import { formatINR } from "@/lib/types"

/** Hand-rolled charts — no library, display-grade numerals, quiet grid treatment. */

export interface TrendPoint {
  date: string
  failed: number
  recovered: number
  recoveredAmount: number
}

/** 7-day failures-vs-recoveries: shared baseline, dotted grid, hover detail. */
export function TrendChart({ data }: { data: TrendPoint[] }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.failed, d.recovered)))
  const head = Math.max(2, Math.ceil(max / 2) * 2)
  const gridLines = [head, Math.round(head / 2)]

  return (
    <figure>
      <div className="flex gap-3">
        {/* y ticks */}
        <div className="flex h-[168px] flex-col justify-between">
          {gridLines.map((g) => (
            <span key={g} className="tnum relative -top-[6px] font-mono text-[9.5px] leading-none text-ink-faint/70">
              {g}
            </span>
          ))}
          <span className="tnum font-mono text-[9.5px] leading-none text-ink-faint/70">0</span>
        </div>

        <div className="relative flex-1">
          <div className="absolute inset-x-0 top-0 h-[168px]" aria-hidden>
            {gridLines.map((g) => (
              <div
                key={g}
                className="absolute left-0 right-0 border-t border-dotted border-line-strong/60"
                style={{ bottom: `${(g / head) * 168}px` }}
              />
            ))}
          </div>

          <div className="relative flex h-[168px] items-end gap-2.5 sm:gap-4">
            {data.map((d, i) => (
              <div key={d.date} className="group relative flex h-full flex-1 flex-col justify-end">
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-max -translate-x-1/2 group-hover:block">
                  <div className="rounded-lg border border-navy-line bg-navy px-3 py-2 text-[10.5px] leading-relaxed text-white shadow-lg">
                    <div className="tnum font-mono text-[11px] font-semibold">
                      {i === data.length - 1
                        ? "Today"
                        : new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </div>
                    <div className="text-[#ffb3c6]">{d.failed} failed</div>
                    <div className="text-[#9fe3c2]">{d.recovered} recovered</div>
                    {d.recoveredAmount > 0 && (
                      <div className="tnum font-semibold">{formatINR(d.recoveredAmount, { compact: true })} saved</div>
                    )}
                  </div>
                </div>
                <div className="flex h-full items-end justify-center gap-[4px]">
                  <div className="flex w-full max-w-[24px] flex-col items-center">
                    {d.failed > 0 && (
                      <span className="tnum mb-1 font-mono text-[9.5px] font-semibold leading-none text-risk/80">
                        {d.failed}
                      </span>
                    )}
                    <div
                      className="w-[58%] rounded-t-[2px] bg-risk/70 transition-colors group-hover:bg-risk"
                      style={{ height: `${(d.failed / head) * 132}px`, minHeight: d.failed > 0 ? 3 : 0 }}
                      role="img"
                      aria-label={`${d.failed} failed on ${d.date}`}
                    />
                  </div>
                  <div className="flex w-full max-w-[24px] flex-col items-center">
                    {d.recovered > 0 && (
                      <span className="tnum mb-1 font-mono text-[9.5px] font-semibold leading-none text-good/80">
                        {d.recovered}
                      </span>
                    )}
                    <div
                      className="w-[58%] rounded-t-[2px] bg-good/70 transition-colors group-hover:bg-good"
                      style={{ height: `${(d.recovered / head) * 132}px`, minHeight: d.recovered > 0 ? 3 : 0 }}
                      role="img"
                      aria-label={`${d.recovered} recovered on ${d.date}`}
                    />
                  </div>
                </div>
                <div className="mt-1.5 h-px w-full bg-line-strong/80" aria-hidden />
              </div>
            ))}
          </div>

          <div className="mt-2 flex gap-2.5 sm:gap-4">
            {data.map((d, i) => (
              <span key={d.date} className="tnum flex-1 text-center font-mono text-[9.5px] leading-none text-ink-faint">
                {i === data.length - 1
                  ? "Today"
                  : new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              </span>
            ))}
          </div>
        </div>
      </div>
    </figure>
  )
}

export interface CategoryDatum {
  category: string
  count: number
  atRisk: number
  recovered: number
}

/** Failure categories: quiet stacked bars with aligned rupee values. */
export function CategoryBars({ data }: { data: CategoryDatum[] }) {
  const max = Math.max(1, ...data.map((d) => d.atRisk + d.recovered))
  return (
    <ul className="space-y-3.5">
      {data.map((d) => (
        <li key={d.category}>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="truncate text-[12px] font-medium text-ink">
              {humanizeCategory(d.category)}
              <span className="ml-1.5 tnum text-[10px] font-normal text-ink-faint">×{d.count}</span>
            </span>
            <span className="tnum shrink-0 font-mono text-[11px] text-ink-soft">
              {formatINR(d.atRisk + d.recovered, { compact: true })}
            </span>
          </div>
          <div
            className="flex h-[7px] w-full overflow-hidden rounded-full bg-track"
            role="img"
            aria-label={`${humanizeCategory(d.category)}: ${formatINR(d.recovered)} recovered, ${formatINR(d.atRisk)} at risk`}
          >
            <div className="h-full bg-good/70" style={{ width: `${(d.recovered / max) * 100}%` }} title={`Recovered ${formatINR(d.recovered)}`} />
            <div className="h-full bg-risk/70" style={{ width: `${(d.atRisk / max) * 100}%` }} title={`At risk ${formatINR(d.atRisk)}`} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function humanizeCategory(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}
