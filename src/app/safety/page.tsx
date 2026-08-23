import { Brain, Scale, User, ShieldCheck, Lock, Webhook } from "lucide-react"
import { Shell } from "@/components/shell"
import { Panel, OpenSection, Badge, providerLabel } from "@/components/ui"
import { ACTION_CATALOG } from "@/lib/engine/actions"
import { resolveProvider } from "@/lib/ai"
import { formatINR } from "@/lib/types"

export const dynamic = "force-dynamic"

/**
 * Safety model — a trust center. The authorization architecture is a
 * diagram first: advisory above, authorization below, human when required.
 */
export default async function SafetyPage() {
  const { provider, configured } = resolveProvider()
  const requested = process.env.AI_PROVIDER ?? "mock"

  return (
    <Shell active="/safety" title="Safety model" subtitle="How financial actions stay governed when an LLM is in the loop">
      {/* Governing statements */}
      <Panel className="grid divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <div className="px-7 py-6 lg:px-9">
          <p className="label-caps text-ink-faint">The governing principle</p>
          <p className="mt-2.5 text-[21px] font-bold leading-snug tracking-[-0.02em] text-ink">
            LLM recommends.
            <br />
            Application rules authorize.
          </p>
        </div>
        <div className="border-brand/25 bg-brand-soft/30 px-7 py-6 sm:border-l-[3px] lg:px-9">
          <p className="label-caps text-brand-deep/70">The hard guarantee</p>
          <p className="mt-2.5 text-[21px] font-bold leading-snug tracking-[-0.02em] text-brand-deep">
            AI reasoning never executes directly.
          </p>
        </div>
      </Panel>

      {/* =============== The authorization architecture diagram =============== */}
      <div className="mt-8">
        <OpenSection title="Authorization architecture" hint="every action passes through these gates, in order">
          <div className="max-w-3xl pt-6">
            {/* Layer 1 */}
            <div className="flex gap-4">
              <div className="flex w-6 shrink-0 flex-col items-center">
                <span className="label-caps rounded bg-violet-soft px-1 py-0.5 text-[8.5px] text-violet">L1</span>
                <span className="mt-2 w-px flex-1 bg-violet/30" aria-hidden />
              </div>
              <div className="flex-1 border-l-2 border-violet/50 pb-8 pl-5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Brain size={14} className="text-violet" strokeWidth={2.2} aria-hidden />
                  <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">AI reasoning</h3>
                  <span className="label-caps rounded border border-violet/25 bg-violet-soft px-1.5 py-0.5 text-violet">
                    advisory
                  </span>
                </div>
                <p className="mt-1.5 max-w-xl text-[12.5px] leading-relaxed text-ink-soft">
                  Interprets the failure and proposes. Cannot execute, override, or mint actions — output is
                  schema-validated against a fixed vocabulary and any invalid response is replaced by the deterministic
                  engine.
                </p>
                <ul className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1">
                  {["Diagnose", "Classify", "Rank", "Explain"].map((v) => (
                    <li key={v} className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink">
                      <span className="h-1 w-1 rounded-full bg-violet/70" aria-hidden />
                      {v}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Layer 2 */}
            <div className="flex gap-4">
              <div className="flex w-6 shrink-0 flex-col items-center">
                <span className="label-caps rounded bg-brand-soft px-1 py-0.5 text-[8.5px] text-brand-deep">L2</span>
                <span className="mt-2 w-px flex-1 bg-brand/30" aria-hidden />
              </div>
              <div className="flex-1 border-l-2 border-brand/50 pb-8 pl-5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Scale size={14} className="text-brand-deep" strokeWidth={2.2} aria-hidden />
                  <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">Deterministic policy engine</h3>
                  <span className="label-caps rounded border border-brand/25 bg-brand-soft px-1.5 py-0.5 text-brand-deep">
                    authorization
                  </span>
                </div>
                <p className="mt-1.5 max-w-xl text-[12.5px] leading-relaxed text-ink-soft">
                  A pure function over payment + history decides what may run: category/action physics, fraud contact
                  ceilings, cooldowns, duplicate suppression, effort caps, amount thresholds. The LLM cannot talk past
                  this layer.
                </p>
                <ul className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1">
                  {["Approve", "Reject", "Gate for human", "Enforce limits"].map((v) => (
                    <li key={v} className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink">
                      <span className="h-1 w-1 rounded-full bg-brand/70" aria-hidden />
                      {v}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Human */}
            <div className="flex gap-4">
              <div className="flex w-6 shrink-0 flex-col items-center">
                <span className="label-caps rounded bg-warn-soft px-1 py-0.5 text-[8.5px] text-warn">H</span>
              </div>
              <div className="flex-1 border-l-2 border-warn/50 pl-5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <User size={14} className="text-warn" strokeWidth={2.2} aria-hidden />
                  <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">Human approval</h3>
                  <span className="label-caps rounded border border-warn/25 bg-warn-soft px-1.5 py-0.5 text-warn">
                    when required
                  </span>
                </div>
                <p className="mt-1.5 max-w-xl text-[12.5px] leading-relaxed text-ink-soft">
                  Actions at or above their approval threshold pause as <em>awaiting approval</em> and execute only after
                  an explicit merchant decision — recorded in the audit trail with attribution.
                </p>
              </div>
            </div>
          </div>
        </OpenSection>
      </div>

      {/* =============== Guardrails values + provider =============== */}
      <div className="mt-9 grid gap-x-12 gap-y-9 lg:grid-cols-2">
        <OpenSection title="Guardrail values in force" hint="read live from the policy engine" action={<Lock size={13} className="text-ink-faint" aria-hidden />}>
          <dl className="divide-y divide-line border-y border-line">
            {Object.values(ACTION_CATALOG)
              .filter((a) => a.approvalThreshold <= 1e12)
              .map((a) => (
                <div key={a.type} className="flex items-baseline justify-between gap-6 py-2.5">
                  <dt className="text-[12px] text-ink-soft">{a.label}</dt>
                  <dd className="flex items-baseline gap-3">
                    <span className="tnum font-mono text-[10.5px] text-ink-faint">{a.cooldownHours}h cooldown</span>
                    <span className="display-money text-[13.5px] text-ink">
                      approval at {formatINR(a.approvalThreshold)}
                    </span>
                  </dd>
                </div>
              ))}
          </dl>
          <p className="mt-3 flex items-start gap-2 text-[11.5px] leading-relaxed text-ink-faint">
            <ShieldCheck size={13} className="mt-px shrink-0 text-brand-deep" aria-hidden />
            The bounded catalog below is the complete set of actions the AI may recommend — schema-enforced. Invented
            actions are rejected at parse time.
          </p>
        </OpenSection>

        <OpenSection title="AI engine" hint="swap providers with one environment variable">
          <dl className="divide-y divide-line border-y border-line">
            {[
              ["Active", providerLabel(provider.name, false)],
              ["Engine", `${provider.name} · ${provider.model}`],
              [
                "Network required",
                provider.name === "mock" ? "No — offline-safe" : configured ? "Configured" : `Key not set (${requested})`,
              ],
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-6 py-2.5">
                <dt className="text-[12px] text-ink-faint">{label}</dt>
                <dd className="text-[12.5px] font-medium text-ink">
                  {label === "Network required" && provider.name === "mock" ? (
                    <Badge value="APPROVED">No — offline-safe</Badge>
                  ) : (
                    value
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[11.5px] leading-relaxed text-ink-faint">
            The full demo runs on the offline-safe engine: same schema, same policy gates, same audit trail — no network
            dependency.
          </p>
          <p className="mt-4 flex items-start gap-2 border-t border-line pt-3 text-[11.5px] leading-relaxed text-ink-soft">
            <Webhook size={13} className="mt-px shrink-0 text-ink-faint" aria-hidden />
            <span>
              Razorpay integration point: <span className="font-mono text-[11px]">POST /api/webhooks/razorpay</span> —
              signature-verified in production, normalized through the same category map the simulator uses.
            </span>
          </p>
        </OpenSection>
      </div>

      {/* =============== Bounded action catalog =============== */}
      <div className="mt-9">
        <OpenSection title="Bounded action catalog" hint="the policy control surface — nothing outside this set exists">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-[13px]">
              <thead>
                <tr className="border-b-2 border-rule text-left">
                  <th scope="col" className="label-caps py-2.5 pr-5 font-semibold text-ink-faint">Action</th>
                  <th scope="col" className="label-caps py-2.5 pr-4 font-semibold text-ink-faint">Risk</th>
                  <th scope="col" className="label-caps py-2.5 pr-4 text-right font-semibold text-ink-faint">Cooldown</th>
                  <th scope="col" className="label-caps py-2.5 pr-4 text-right font-semibold text-ink-faint">Approval at</th>
                  <th scope="col" className="label-caps py-2.5 pr-4 font-semibold text-ink-faint">Customer contact</th>
                  <th scope="col" className="label-caps py-2.5 text-right font-semibold text-ink-faint">Base efficacy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {Object.values(ACTION_CATALOG).map((a) => (
                  <tr key={a.type} className="transition-colors hover:bg-surface-sunken/80">
                    <td className="py-3 pr-5">
                      <span className="font-medium text-ink">{a.label}</span>
                      <span className="block max-w-[260px] text-[11px] leading-snug text-ink-faint">{a.description}</span>
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`text-[11px] font-semibold uppercase tracking-[0.06em] ${
                          a.riskLevel === "HIGH" ? "text-risk" : a.riskLevel === "MEDIUM" ? "text-warn" : "text-ink-soft"
                        }`}
                      >
                        {a.riskLevel.toLowerCase()}
                      </span>
                    </td>
                    <td className="tnum py-3 pr-4 text-right font-mono text-ink-soft">{a.cooldownHours}h</td>
                    <td className="tnum py-3 pr-4 text-right font-mono text-ink">
                      {a.approvalThreshold > 1e12 ? "never" : formatINR(a.approvalThreshold)}
                    </td>
                    <td className="py-3 pr-4">
                      {a.customerFacing ? (
                        <span className="text-[12px] font-medium text-ink">Yes</span>
                      ) : (
                        <span className="text-[12px] font-medium text-good">No — internal</span>
                      )}
                    </td>
                    <td className="tnum py-3 text-right font-mono text-ink-soft">{(a.efficacy * 100).toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </OpenSection>
      </div>
    </Shell>
  )
}
