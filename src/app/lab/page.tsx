import { FlaskConical, ShieldCheck, Repeat2, EyeOff } from "lucide-react"
import { Shell } from "@/components/shell"
import { Section } from "@/components/ui"
import { humanizeCategory } from "@/components/charts"
import { formatINR } from "@/lib/types"
import { runEvaluation } from "@/lib/eval/harness"
import { generateWorld, DEFAULT_EVAL_SEED, EVAL_NOW } from "@/lib/eval/world"
import { LlmPass } from "@/components/lab/llm-pass"
import type { RefusalBucket, StrategyMetrics } from "@/lib/eval/harness"

export const dynamic = "force-dynamic"

const compact = (p: number) => formatINR(p, { compact: true })

const REFUSAL_LABELS: Record<string, string> = {
  economic: "Uneconomic actions refused",
  "customer-contact-ceiling": "Customer-contact ceiling hit",
  "banned-combination": "Hard declines blocked",
  gated: "High-value actions held for merchant approval",
  escalated: "High-risk cases escalated to humans",
  "policy-guard": "Policy guards (cooldown · duplicates · effort cap)",
  other: "Other policy refusals",
}

export default async function LabPage({ searchParams }: { searchParams: Promise<{ n?: string }> }) {
  const { n } = await searchParams
  const parsed = n ? parseInt(n, 10) : 500
  const worldSize = Number.isFinite(parsed) ? Math.max(100, Math.min(1000, parsed)) : 500

  const world = generateWorld(worldSize, DEFAULT_EVAL_SEED)
  const run = await runEvaluation({ world, seed: DEFAULT_EVAL_SEED })
  const providerInfo = run.meta.provider

  const recoverai = run.strategies.find((s) => s.key === "RECOVERAI")!
  const doNothing = run.strategies.find((s) => s.key === "DO_NOTHING")!
  const blind = run.strategies.find((s) => s.key === "BLIND_RETRY")!
  const dunning = run.strategies.find((s) => s.key === "GENERIC_DUNNING")!

  const renderStrategyRow = (s: StrategyMetrics, emphasized: boolean) => (
    <tr key={s.key} className={emphasized ? "bg-brand-soft/50" : "transition-colors hover:bg-surface-sunken/60"}>
      <td className="py-3 pr-4">
        <div className="flex items-center gap-2.5">
          <span className={`h-6 w-[3px] rounded-full ${emphasized ? "bg-brand" : "bg-line-strong"}`} aria-hidden />
          <div>
            <span className={`block text-[13px] font-semibold ${emphasized ? "text-ink" : "text-ink-soft"}`}>
              {s.label}
              {emphasized && (
                <span className="label-caps ml-2 rounded-[4px] bg-brand px-1.5 py-0.5 text-[8.5px] text-white">
                  the system
                </span>
              )}
            </span>
            <span className="block max-w-[300px] text-[10.5px] leading-snug text-ink-faint">{s.note}</span>
          </div>
        </div>
      </td>
      <td className="display-money py-3 pr-4 text-right text-[14px] whitespace-nowrap text-ink">{compact(s.grossRecoveredPaise)}</td>
      <td className="tnum py-3 pr-4 text-right font-mono text-[12.5px] text-ink-soft">{(s.recoveryRate * 100).toFixed(1)}%</td>
      <td className="display-money py-3 pr-4 text-right text-[14px] whitespace-nowrap text-good">
        {s.key === "DO_NOTHING" ? "—" : `+${compact(s.incrementalPaise)}`}
      </td>
      <td className="display-money py-3 pr-4 text-right text-[14px] whitespace-nowrap text-ink">{compact(s.netRecoveredPaise)}</td>
    </tr>
  )

  const byCategory = [...recoverai.byCategory].sort((a, b) => b.recoveredPaise - a.recoveredPaise)

  return (
    <Shell
      active="/lab"
      title="Recovery Lab"
      subtitle="Offline counterfactual evaluation — one seeded world, four strategies, honest baselines"
    >
      {/* ============ HEADLINE ============ */}
      <section className="animate-fade-up">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <FlaskConical size={15} className="text-brand" strokeWidth={2} aria-hidden />
          <p className="label-caps text-ink-faint">Offline evaluation · writes nothing to the database</p>
        </div>
        <p className="mt-2.5 max-w-2xl text-[17px] font-medium leading-snug tracking-[-0.01em] text-ink">
          {worldSize.toLocaleString("en-IN")} payment failures, the same seeded world, four strategies — what would each
          have recovered?
        </p>
        <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-ink-soft">
          Every strategy replays the identical population (fixed ids, amounts, customers, failure categories). Recovery
          randomness is shared per payment and attempt — so the differences below are attributable to the strategy, not
          the draw of the world. The outcome model is independent of the decision model; this is not circular.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[10.5px] text-ink-faint">
          <span className="flex items-center gap-1.5">
            <Repeat2 size={11} aria-hidden /> seed <span className="font-mono">{run.meta.seed}</span>
          </span>
          <span className="tnum">n = {worldSize}</span>
          <span>fixed clock @ {EVAL_NOW.toISOString().slice(0, 16)}Z</span>
          <span className="inline-flex items-center gap-1.5 rounded-[4px] bg-good-soft px-1.5 py-0.5 font-medium text-good">
            reproducible
          </span>
          <span>computed in {run.meta.elapsedMs}ms</span>
        </div>
      </section>

      {/* ============ RESULTS ============ */}
      <section className="mt-8">
        <Section title="Results — recovered revenue" hint="recovered ₹ · recovery rate · incremental vs do-nothing · net after action cost">
          <div className="overflow-x-auto pt-4">
            <table className="w-full min-w-[860px] border-collapse text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-left">
                  <th scope="col" className="label-caps py-2 pr-4 font-semibold text-ink-faint">Strategy</th>
                  <th scope="col" className="label-caps py-2 pr-4 text-right font-semibold text-ink-faint">Recovered</th>
                  <th scope="col" className="label-caps py-2 pr-4 text-right font-semibold text-ink-faint">Rate</th>
                  <th scope="col" className="label-caps py-2 pr-4 text-right font-semibold text-ink-faint">Incremental</th>
                  <th scope="col" className="label-caps py-2 text-right font-semibold text-ink-faint">Net recovery</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {renderStrategyRow(doNothing, false)}
                {renderStrategyRow(blind, false)}
                {renderStrategyRow(dunning, false)}
                {renderStrategyRow(recoverai, true)}
              </tbody>
            </table>
          </div>

          <div className="grid gap-8 pt-6 lg:grid-cols-2">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-[12px]">
                <thead>
                  <tr className="border-b border-line text-left">
                    <th scope="col" className="label-caps py-2 pr-4 font-semibold text-ink-faint">Tactics — what each strategy actually did</th>
                    <th scope="col" className="label-caps py-2 pr-4 text-right font-semibold text-ink-faint">Attempts</th>
                    <th scope="col" className="label-caps py-2 pr-4 text-right font-semibold text-ink-faint">Contacts</th>
                    <th scope="col" className="label-caps py-2 pr-4 text-right font-semibold text-ink-faint">Refused</th>
                    <th scope="col" className="label-caps py-2 pr-4 text-right font-semibold text-ink-faint">Violations</th>
                    <th scope="col" className="label-caps py-2 text-right font-semibold text-ink-faint">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {[doNothing, blind, dunning, recoverai].map((s) => (
                    <tr key={s.key} className="transition-colors hover:bg-surface-sunken/60">
                      <td className="py-2.5 pr-4 font-medium text-ink-soft">{s.label}</td>
                      <td className="tnum py-2.5 pr-4 text-right font-mono text-ink">{s.attempts}</td>
                      <td className="tnum py-2.5 pr-4 text-right font-mono text-ink">{s.contacts}</td>
                      <td className="tnum py-2.5 pr-4 text-right font-mono text-ink">{s.policyRefusals}</td>
                      <td className={`tnum py-2.5 pr-4 text-right font-mono ${s.violations > 0 ? "font-semibold text-risk" : "text-ink-faint"}`}>
                        {s.violations}
                      </td>
                      <td className="tnum py-2.5 text-right font-mono text-ink-soft">{compact(s.actionCostPaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2.5 max-w-xl text-[10.5px] leading-relaxed text-ink-faint">
                Attempts = gateway charges · Contacts = customer messages · Violations = actions a sane policy would never take
                (retrying expired cards, messaging fraud-flagged customers) · Cost = the action cost model (₹1.5 per retry up to
                ₹15 per engineered touch).
              </p>
            </div>

            <div className="border-l border-line pl-8 lg:border-l-0">
              <div className="space-y-3">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-[12px] text-ink-soft">Held for merchant approval this window</p>
                  <p className="display-money text-[15px] text-ink">
                    {compact(recoverai.refusalBreakdown.find((b) => b.reason === "gated")?.amountPaise ?? 0)}
                  </p>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-[12px] text-ink-soft">Escalated to human review</p>
                  <p className="display-money text-[15px] text-ink">
                    {compact(recoverai.refusalBreakdown.find((b) => b.reason === "escalated")?.amountPaise ?? 0)}
                  </p>
                </div>
              </div>
              <p className="mt-2.5 text-[11.5px] leading-relaxed text-ink-soft">
                <span className="font-semibold text-ink">
                  {recoverai.approvalGatedCount} high-value payments
                </span>{" "}
                sit untouched pending a human decision — the system will not move that money without merchant sign-off.
                Blind retry and generic dunning take it without asking.
              </p>
            </div>
          </div>
        </Section>
      </section>

      {/* ============ AI CONTRIBUTION ============ */}
      <section className="mt-9">
        <Section
          title="AI contribution — deterministic engine vs LLM"
          hint={`active: ${providerInfo.active} (${providerInfo.model}) · LLM pass is stochastic by nature`}
        >
          <div className="border-b border-line py-4">
            <LlmPass
              seed={run.meta.seed}
              worldSize={worldSize}
              configured={providerInfo.configured}
            />
          </div>
        </Section>
      </section>

      {/* ============ WHERE RECOVERY CAME FROM ============ */}
      <section className="mt-9">
        <Section title="Where recovery came from" hint="RecoverAI · recovered rupees by failure type">
          <ul className="max-w-3xl space-y-3.5 pt-5">
            {byCategory.map((c) => {
              const pct = c.atRiskPaise > 0 ? c.recoveredPaise / c.atRiskPaise : 0
              return (
                <li key={c.category}>
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <span className="truncate text-[12px] font-medium text-ink">
                      {humanizeCategory(c.category)}
                      <span className="ml-1.5 tnum text-[10px] font-normal text-ink-faint">×{c.count}</span>
                    </span>
                    <span className="flex items-baseline gap-2.5">
                      <span className={`tnum font-mono text-[10px] ${pct > 0 ? "font-semibold text-good" : "text-ink-faint"}`}>
                        {pct > 0 ? `${(pct * 100).toFixed(0)}%` : "—"}
                      </span>
                      <span className="tnum shrink-0 font-mono text-[11px] text-ink-soft">{compact(c.recoveredPaise)}</span>
                    </span>
                  </div>
                  <div className="flex h-[7px] w-full overflow-hidden rounded-full bg-track" role="img" aria-label={`${humanizeCategory(c.category)}: ${compact(c.recoveredPaise)} of ${compact(c.atRiskPaise)} recovered`}>
                    <div className="h-full bg-good/70" style={{ width: `${pct * 100}%` }} />
                  </div>
                </li>
              )
            })}
          </ul>
          <p className="max-w-2xl pt-4 text-[11.5px] leading-relaxed text-ink-faint">
            The AI sends the right intervention for the right failure: re-authentication nudges convert authentication
            failures; soft-decline retries convert after the issuer clears; expired cards are routed to alternate methods —
            never retried.
          </p>
        </Section>
      </section>

      {/* ============ WHEN WE REFUSED ============ */}
      <section className="mt-9">
        <Section
          title="When we refused"
          hint="RecoverAI turns money down on purpose — the safety design"
          action={<ShieldCheck size={13} className="text-brand-deep" aria-hidden />}
        >
          <div className="grid gap-px overflow-hidden rounded-[8px] border border-line bg-line pt-5 sm:grid-cols-2 lg:grid-cols-3">
            {recoverai.refusalBreakdown.map((b: RefusalBucket) => (
              <div key={b.reason} className="bg-surface px-4 py-3.5">
                <p className="text-[11.5px] font-semibold leading-snug text-ink">{REFUSAL_LABELS[b.reason] ?? b.reason}</p>
                <p className="tnum mt-1.5 font-mono text-[11px] text-ink-faint">
                  {b.count} {b.count === 1 ? "payment" : "payments"} · {compact(b.amountPaise)}
                </p>
              </div>
            ))}
            {recoverai.refusalBreakdown.length === 0 && (
              <p className="bg-surface px-4 py-3.5 text-[12px] text-ink-faint">No refusals in this world.</p>
            )}
          </div>
          <div className="mt-4 max-w-3xl border-t border-line pt-4">
            <p className="text-[11.5px] leading-relaxed text-ink-soft">
              <EyeOff size={12} className="mr-1.5 inline text-ink-faint" aria-hidden />
              RecoverAI is not trying to recover every payment. It maximizes recoverable revenue while knowing when to
              stop: futile retries, unsafe contacts, uneconomic outreach, and unapproved high-value actions all stay
              unexecuted — and every refusal is recorded with its reason and economics.
            </p>
          </div>
        </Section>
      </section>

      {/* ============ METHODOLOGY ============ */}
      <section className="mt-9">
        <Section title="Methodology — what this does and does not claim" hint="read before quoting these numbers">
          <ol className="max-w-3xl list-none space-y-2 pt-4">
            {run.methodology.map((m, i) => (
              <li key={i} className="flex gap-2.5 text-[12px] leading-relaxed text-ink-soft">
                <span className="tnum mt-px shrink-0 font-mono text-[10px] text-ink-faint">{String(i + 1).padStart(2, "0")}</span>
                {m}
              </li>
            ))}
          </ol>
          <p className="max-w-3xl pt-3 text-[11px] leading-relaxed text-ink-faint">
            Demo vs evaluation: the interactive <span className="font-medium">demo simulator</span> (top bar) writes real
            rows into your database through the production pipeline; the <span className="font-medium">Recovery Lab</span>{" "}
            is a separate, in-memory evaluation with its own seed and outcome model. Two different instruments.
          </p>
        </Section>
      </section>
    </Shell>
  )
}