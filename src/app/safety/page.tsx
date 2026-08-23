import { Brain, Scale, Lock, FileSearch, Webhook, ArrowDown, ShieldCheck, User } from "lucide-react"
import { Shell } from "@/components/shell"
import { Card, CardHeader, Badge, Eyebrow } from "@/components/ui"
import { ACTION_CATALOG } from "@/lib/engine/actions"
import { resolveProvider } from "@/lib/ai"
import { formatINR } from "@/lib/types"

export const dynamic = "force-dynamic"

/**
 * Safety model — the two-layer authorization architecture, stated plainly.
 * The page's job is credibility: show exactly where AI advice stops and
 * deterministic authorization begins.
 */
export default async function SafetyPage() {
  const { provider, configured } = resolveProvider()
  const requested = process.env.AI_PROVIDER ?? "mock"

  return (
    <Shell active="/safety" title="Safety Model" subtitle="How financial actions stay governed when an LLM is in the loop">
      {/* The two statements that define the product */}
      <Card className="mb-5 overflow-hidden">
        <div className="grid divide-y divide-line/70 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <div className="px-6 py-5">
            <Eyebrow>The governing principle</Eyebrow>
            <p className="mt-2 text-[19px] font-bold leading-snug tracking-[-0.015em] text-ink">
              LLM recommends.
              <br />
              Application rules authorize.
            </p>
          </div>
          <div className="border-brand/25 bg-brand-soft/30 px-6 py-5 sm:border-l-[3px]">
            <Eyebrow className="text-brand-deep/70">The hard guarantee</Eyebrow>
            <p className="mt-2 text-[19px] font-bold leading-snug tracking-[-0.015em] text-brand-deep">
              AI reasoning never executes directly.
            </p>
          </div>
        </div>
      </Card>

      {/* ---------- The authorization pipeline ---------- */}
      <Card className="mb-5">
        <CardHeader eyebrow="Authorization pipeline" title="Every action passes through these gates" />
        <div className="px-5 pb-5">
          <ol className="space-y-0">
            {/* Layer 1 */}
            <li className="rounded-xl border border-violet/25 bg-violet-soft/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-violet">
                  <Brain size={14} strokeWidth={2.2} aria-hidden /> Layer 1 — AI reasoning
                </span>
                <Badge value="low" className="border border-violet/25 bg-surface">Advisory</Badge>
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">
                The provider returns a <span className="font-semibold text-ink">schema-validated</span> diagnosis: failure
                category, root cause, confidence, severity, and exactly one recommended action from the bounded catalog
                below. Invalid output, timeouts, rate limits, or missing keys degrade to a deterministic rules engine —
                the workflow never stalls and never accepts malformed AI output.
              </p>
            </li>

            <li className="flex justify-center py-1" aria-hidden>
              <ArrowDown size={16} className="text-ink-faint/60" />
            </li>

            {/* Layer 2 */}
            <li className="rounded-xl border border-brand/25 bg-brand-soft/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-brand-deep">
                  <Scale size={14} strokeWidth={2.2} aria-hidden /> Layer 2 — Deterministic policy engine
                </span>
                <Badge value="APPROVED">Authorization</Badge>
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">
                A pure function over payment + history decides what may actually run: category/action physics (an expired
                card can never be retried), fraud contact ceilings, per-action cooldowns, duplicate suppression, effort
                caps per payment, and amount thresholds that route high-value actions to human approval.{" "}
                <span className="font-semibold text-ink">The LLM cannot talk past this layer.</span>
              </p>
            </li>

            <li className="flex justify-center py-1" aria-hidden>
              <ArrowDown size={16} className="text-ink-faint/60" />
            </li>

            {/* Human */}
            <li className="rounded-xl border border-warn/25 bg-warn-soft/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-warn">
                  <User size={14} strokeWidth={2.2} aria-hidden /> Optional human approval
                </span>
                <Badge value="NEEDS_APPROVAL">High-value gate</Badge>
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">
                Actions at or above their approval threshold pause as <em>awaiting approval</em> and only execute after an
                explicit merchant decision from the dashboard — with the full decision trail attached.
              </p>
            </li>
          </ol>

          <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-line bg-surface-sunken px-3.5 py-3">
            <ShieldCheck size={15} className="mt-0.5 shrink-0 text-ink-soft" aria-hidden />
            <p className="text-[12px] leading-relaxed text-ink-soft">
              <span className="font-semibold text-ink">In production the same gates apply to real charges.</span> Execution
              goes through the gateway adapter — the policy engine sits in front of it, and the audit log records every
              input, provider response, verdict, and outcome.
            </p>
          </div>
        </div>
      </Card>

      {/* ---------- Provider + integration ---------- */}
      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Active AI provider" subtitle="Server-side configured" action={<FileSearch size={16} className="text-ink-faint" aria-hidden />} />
          <div className="space-y-2 px-5 pb-5 text-[13px]">
            <div className="flex items-center justify-between border-b border-line/60 pb-2">
              <span className="text-ink-faint">Requested</span>
              <span className="tnum font-mono font-medium">{requested}</span>
            </div>
            <div className="flex items-center justify-between border-b border-line/60 pb-2">
              <span className="text-ink-faint">Active</span>
              <span className="tnum font-mono font-medium">{provider.name} · {provider.model}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-faint">API key</span>
              {configured ? <Badge value="APPROVED">Configured</Badge> : <Badge value="PENDING">Not set</Badge>}
            </div>
            {!configured && requested !== "mock" && (
              <p className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-[12px] leading-relaxed text-ink-soft">
                No API key found for <span className="font-mono">{requested}</span> — the deterministic engine is
                answering instead. The full workflow remains available offline.
              </p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Razorpay integration point" subtitle="Adapter boundary" action={<Webhook size={16} className="text-ink-faint" aria-hidden />} />
          <div className="px-5 pb-5 text-[12.5px] leading-relaxed text-ink-soft">
            <p>
              The gateway is an adapter (<span className="font-mono text-[11.5px]">src/lib/gateway/payment-gateway.ts</span>).
              Real Razorpay webhooks plug in at <span className="font-mono text-[11.5px]">POST /api/webhooks/razorpay</span> —
              signature-verified, then normalized through the same failure-category map the simulator uses. Charge retries
              route through the same interface against Razorpay captures.
            </p>
          </div>
        </Card>
      </div>

      {/* ---------- Bounded action catalog ---------- */}
      <Card>
        <CardHeader
          eyebrow="Policy control surface"
          title="The bounded action catalog"
          subtitle="The complete set of actions the AI may recommend — nothing else exists"
          action={<Lock size={16} className="text-ink-faint" aria-hidden />}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[13px]">
            <thead>
              <tr className="border-y border-line/70 text-left text-[10px] uppercase tracking-[0.12em] text-ink-faint">
                <th scope="col" className="px-5 py-2.5 font-semibold">Action</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Risk</th>
                <th scope="col" className="px-4 py-2.5 font-semibold text-right">Cooldown</th>
                <th scope="col" className="px-4 py-2.5 font-semibold text-right">Approval at</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Customer contact</th>
                <th scope="col" className="px-4 py-2.5 font-semibold text-right">Base efficacy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {Object.values(ACTION_CATALOG).map((a) => (
                <tr key={a.type} className="transition-colors hover:bg-surface-sunken">
                  <td className="px-5 py-2.5">
                    <span className="font-medium text-ink">{a.label}</span>
                    <span className="block max-w-[280px] text-[11.5px] leading-snug text-ink-faint">{a.description}</span>
                  </td>
                  <td className="px-4 py-2.5"><Badge value={a.riskLevel} /></td>
                  <td className="tnum px-4 py-2.5 text-right font-mono">{a.cooldownHours}h</td>
                  <td className="tnum px-4 py-2.5 text-right font-mono">
                    {a.approvalThreshold > 1e12 ? "never" : formatINR(a.approvalThreshold)}
                  </td>
                  <td className="px-4 py-2.5">
                    {a.customerFacing ? (
                      <span className="font-medium text-ink">Yes</span>
                    ) : (
                      <span className="font-medium text-good">No — internal only</span>
                    )}
                  </td>
                  <td className="tnum px-4 py-2.5 text-right font-mono">{(a.efficacy * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line/70 px-5 py-3 text-[11.5px] leading-relaxed text-ink-faint">
          The AI maps each failure onto this set (schema-enforced — invented actions are rejected at parse time). Risk
          levels, cooldowns, and approval thresholds are enforced by the deterministic policy engine, not by prompts.
        </p>
      </Card>
    </Shell>
  )
}
