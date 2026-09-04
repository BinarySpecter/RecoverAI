import { Brain, Scale, ShieldCheck, Lock, Webhook, Ban, CircleCheck } from "lucide-react"
import { Shell } from "@/components/shell"
import { Panel, Section, Badge, providerLabel, humanize } from "@/components/ui"
import { ACTION_CATALOG, actionCostPaise } from "@/lib/engine/actions"
import { resolveProvider } from "@/lib/ai"
import { formatINR } from "@/lib/types"
import { db, getMerchant } from "@/lib/db"

export const dynamic = "force-dynamic"

const DAY_MS = 86_400_000
function daysAgoUtc(days: number): Date {
  return new Date(Date.now() - days * DAY_MS)
}

/** Safety model — a trust center. The authorization architecture is a
 *  diagram first: advisory above, authorization below, human when required.
 *  Refusals are first-class operational outcomes, counted live. */
export default async function SafetyPage() {
  const { provider, configured } = resolveProvider()
  const requested = process.env.AI_PROVIDER ?? "mock"
  const merchant = await getMerchant()

  const [rejected, suppressed] = await Promise.all([
    db.recoveryAction.findMany({
      where: { policyDecision: "REJECTED", payment: { merchantId: merchant.id }, createdAt: { gte: daysAgoUtc(7) } },
      include: { payment: { select: { amount: true } } },
    }),
    db.auditLog.count({ where: { merchantId: merchant.id, event: "recovery.duplicate_suppressed", createdAt: { gte: daysAgoUtc(7) } } }),
  ])

  const buckets = new Map<string, { count: number; amount: number }>()
  for (const r of rejected) {
    let key = "other"
    if (r.policyReason.startsWith("Economically refused")) key = "economic"
    else if (/risk score|ceiling/i.test(r.policyReason)) key = "customer-contact-ceiling"
    else if (/not permitted for/i.test(r.policyReason)) key = "banned-combination"
    else if (/cap/i.test(r.policyReason)) key = "effort-cap"
    else if (/cooldown/i.test(r.policyReason)) key = "cooldown"
    else if (/already executed/i.test(r.policyReason)) key = "duplicate"
    const b = buckets.get(key) ?? { count: 0, amount: 0 }
    b.count++
    b.amount += r.payment.amount
    buckets.set(key, b)
  }
  const refusalView = [...buckets.entries()]
    .map(([reason, v]) => ({ reason, ...v }))
    .sort((a, b) => b.amount - a.amount)

  const REFUSAL_LABELS: Record<string, string> = {
    economic: "Uneconomic actions refused",
    "customer-contact-ceiling": "Customer-contact ceiling (fraud guard)",
    "banned-combination": "Structurally futile or unsafe combos",
    "effort-cap": "Effort cap — max actions reached",
    cooldown: "Cooldown not elapsed",
    duplicate: "Duplicate action suppressed",
    other: "Other refusals",
  }

  return (
    <Shell active="/safety" title="Safety model" subtitle="How financial actions stay governed when an LLM is in the loop">
      {/* Governing statements */}
      <Panel className="grid divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <div className="px-6 py-6 lg:px-8">
          <p className="label-caps text-ink-faint">The governing principle</p>
          <p className="mt-2.5 text-[21px] font-bold leading-snug tracking-[-0.02em] text-ink">
            LLM recommends.
            <br />
            Application rules authorize.
          </p>
        </div>
        <div className="border-brand/25 bg-brand-soft/40 px-6 py-6 sm:border-l-[3px] lg:px-8">
          <p className="label-caps text-brand-deep/80">The hard guarantee</p>
          <p className="mt-2.5 text-[21px] font-bold leading-snug tracking-[-0.02em] text-brand-deep">
            AI reasoning never executes directly.
          </p>
        </div>
      </Panel>

      {/* =============== THE AUTHORIZATION ARCHITECTURE (what AI can/cannot do) =============== */}
      <div className="mt-8">
        <Section title="Authorization architecture" hint="every action passes through these gates, in order">
          <div className="max-w-3xl pt-5">
            {/* Layer 1 */}
            <div className="flex gap-4">
              <div className="flex w-6 shrink-0 flex-col items-center">
                <span className="label-caps rounded-[4px] bg-violet-soft px-1 py-0.5 text-[8.5px] text-violet">L1</span>
                <span className="mt-2 w-px flex-1 bg-violet/30" aria-hidden />
              </div>
              <div className="flex-1 border-l-2 border-violet/50 pb-8 pl-5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Brain size={14} className="text-violet" strokeWidth={2.2} aria-hidden />
                  <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">AI reasoning</h3>
                  <span className="label-caps rounded-[4px] border border-violet/25 bg-violet-soft px-1.5 py-0.5 text-violet">
                    advisory
                  </span>
                </div>
                <p className="mt-1.5 max-w-xl text-[12.5px] leading-relaxed text-ink-soft">
                  Interprets the failure and proposes. Output is schema-validated against a fixed vocabulary; anything
                  invalid is replaced by the deterministic engine.
                </p>
                <ul className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1">
                  {["Diagnose", "Classify", "Rank", "Explain"].map((v) => (
                    <li key={v} className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink">
                      <CircleCheck size={11} className="text-violet" strokeWidth={2.4} aria-hidden />
                      {v}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Layer 2 */}
            <div className="flex gap-4">
              <div className="flex w-6 shrink-0 flex-col items-center">
                <span className="label-caps rounded-[4px] bg-brand-soft px-1 py-0.5 text-[8.5px] text-brand-deep">L2</span>
                <span className="mt-2 w-px flex-1 bg-brand/30" aria-hidden />
              </div>
              <div className="flex-1 border-l-2 border-brand/50 pb-8 pl-5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Scale size={14} className="text-brand-deep" strokeWidth={2.2} aria-hidden />
                  <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">Deterministic policy engine</h3>
                  <span className="label-caps rounded-[4px] border border-brand/25 bg-brand-soft px-1.5 py-0.5 text-brand-deep">
                    authorization
                  </span>
                </div>
                <p className="mt-1.5 max-w-xl text-[12.5px] leading-relaxed text-ink-soft">
                  A pure function over payment + history decides what may run: category/action physics, fraud contact
                  ceilings, cooldowns, duplicate suppression, effort caps, amount thresholds, and the economic stopping
                  rule (expected recovery value vs action cost). The LLM cannot talk past this layer.
                </p>
                <ul className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1">
                  {["Approve", "Reject", "Refuse uneconomic", "Gate for human", "Enforce limits"].map((v) => (
                    <li key={v} className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink">
                      <CircleCheck size={11} className="text-brand-deep" strokeWidth={2.4} aria-hidden />
                      {v}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Execution */}
            <div className="flex gap-4">
              <div className="flex w-6 shrink-0 flex-col items-center">
                <span className="label-caps rounded-[4px] bg-surface-sunken px-1 py-0.5 text-[8.5px] text-ink-soft">X</span>
              </div>
              <div className="flex-1 pl-5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <ShieldCheck size={14} className="text-ink" strokeWidth={2.2} aria-hidden />
                  <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">Execution</h3>
                </div>
                <p className="mt-1.5 max-w-xl text-[12.5px] leading-relaxed text-ink-soft">
                  Only policy-sanctioned actions reach the gateway. Every execution is recorded with its decision
                  rationale and economics — the audit trail is the receipt.
                </p>
              </div>
            </div>
          </div>

          {/* WHAT AI CAN / CANNOT DO */}
          <div className="mt-8 grid gap-px overflow-hidden rounded-[8px] border border-line bg-line md:grid-cols-2">
            <div className="bg-surface px-5 py-4">
              <p className="label-caps text-violet">What AI can do</p>
              <ul className="mt-2.5 space-y-1.5">
                {["Diagnose the failure and its root cause", "Recommend an action from the bounded catalog", "Explain its reasoning, in plain language", "Estimate recovery probability — advisory only"].map((v) => (
                  <li key={v} className="flex items-center gap-2 text-[12px] text-ink-soft">
                    <CircleCheck size={12} className="shrink-0 text-violet" strokeWidth={2.4} aria-hidden />
                    {v}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-surface px-5 py-4">
              <p className="label-caps text-risk">What AI cannot do</p>
              <ul className="mt-2.5 space-y-1.5">
                {["Authorize money movement of any kind", "Bypass, override, or mint policy", "Contact a fraud-flagged customer", "Ignore the economic stopping rule", "Execute outside the bounded action catalog"].map((v) => (
                  <li key={v} className="flex items-center gap-2 text-[12px] text-ink-soft">
                    <Ban size={12} className="shrink-0 text-risk" strokeWidth={2.4} aria-hidden />
                    {v}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Section>
      </div>

      {/* =============== REFUSED BY POLICY — first-class outcome =============== */}
      <div className="mt-9">
        <Section
          title="Refused by policy — last 7 days"
          hint="refusal is an operational outcome the product reports, not hides"
          action={<ShieldCheck size={13} className="text-brand-deep" aria-hidden />}
        >
          {refusalView.length === 0 && rejected.length === 0 ? (
            <p className="border-b border-line py-4 text-[12.5px] text-ink-faint">
              No policy refusals in the last 7 days — every proposed action was permitted or is awaiting approval.
            </p>
          ) : (
            <div className="grid gap-px overflow-hidden rounded-[8px] border border-line bg-line pt-4 sm:grid-cols-2 lg:grid-cols-3">
              {refusalView.map((b) => (
                <div key={b.reason} className="bg-surface px-4 py-3.5">
                  <p className="text-[11.5px] font-semibold leading-snug text-ink">
                    {REFUSAL_LABELS[b.reason] ?? humanize(b.reason)}
                  </p>
                  <p className="tnum mt-1.5 font-mono text-[11px] text-ink-faint">
                    {b.count} {b.count === 1 ? "refusal" : "refusals"} · {formatINR(b.amount, { compact: true })} protected
                  </p>
                </div>
              ))}
              {suppressed > 0 && (
                <div className="bg-surface px-4 py-3.5">
                  <p className="text-[11.5px] font-semibold leading-snug text-ink">Duplicate deliveries suppressed</p>
                  <p className="tnum mt-1.5 font-mono text-[11px] text-ink-faint">
                    {suppressed} {suppressed === 1 ? "event" : "events"} — no double actions
                  </p>
                </div>
              )}
            </div>
          )}
          <p className="mt-3 flex items-start gap-2 text-[11.5px] leading-relaxed text-ink-faint">
            <ShieldCheck size={13} className="mt-px shrink-0 text-brand-deep" aria-hidden />
            Each refusal is stored with its reason and economics in the audit trail — open any case file to read why.
          </p>
        </Section>
      </div>

      {/* =============== GUARDRAILS + PROVIDER =============== */}
      <div className="mt-9 grid gap-x-12 gap-y-9 lg:grid-cols-2">
        <Section title="Guardrail values in force" hint="read live from the policy engine" action={<Lock size={13} className="text-ink-faint" aria-hidden />}>
          <dl className="divide-y divide-line border-b border-line pt-1">
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
        </Section>

        <Section title="AI engine" hint="swap providers with one environment variable">
          <dl className="divide-y divide-line border-b border-line pt-1">
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
            dependency. The Recovery Lab measures both engines head-to-head.
          </p>
          <p className="mt-4 flex items-start gap-2 border-t border-line pt-3 text-[11.5px] leading-relaxed text-ink-soft">
            <Webhook size={13} className="mt-px shrink-0 text-ink-faint" aria-hidden />
            <span>
              Razorpay integration point: <span className="font-mono text-[11px]">POST /api/webhooks/razorpay</span> —
              HMAC-SHA256 signature of the raw body verified against{" "}
              <span className="font-mono text-[11px]">RAZORPAY_WEBHOOK_SECRET</span> before processing; events normalize
              through the same category map the simulator uses.
            </span>
          </p>
        </Section>
      </div>

      {/* =============== BOUNDED ACTION CATALOG =============== */}
      <div className="mt-9">
        <Section title="Bounded action catalog" hint="the policy control surface — nothing outside this set exists">
          <div className="overflow-x-auto pt-4">
            <table className="w-full min-w-[780px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left">
                  <th scope="col" className="label-caps py-2.5 pr-5 font-semibold text-ink-faint">Action</th>
                  <th scope="col" className="label-caps py-2.5 pr-4 font-semibold text-ink-faint">Risk</th>
                  <th scope="col" className="label-caps py-2.5 pr-4 text-right font-semibold text-ink-faint">Cooldown</th>
                  <th scope="col" className="label-caps py-2.5 pr-4 text-right font-semibold text-ink-faint">Approval at</th>
                  <th scope="col" className="label-caps py-2.5 pr-4 font-semibold text-ink-faint">Customer contact</th>
                  <th scope="col" className="label-caps py-2.5 pr-4 text-right font-semibold text-ink-faint">Cost</th>
                  <th scope="col" className="label-caps py-2.5 text-right font-semibold text-ink-faint">Base efficacy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {Object.values(ACTION_CATALOG).map((a) => (
                  <tr key={a.type} className="transition-colors hover:bg-surface-sunken/60">
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
                    <td className="tnum py-3 pr-4 text-right font-mono text-ink-soft">
                      {rupeeAmount(actionCostPaise(a.type))}
                    </td>
                    <td className="tnum py-3 text-right font-mono text-ink-soft">{(a.efficacy * 100).toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </Shell>
  )
}

function rupeeAmount(paise: number): string {
  const rupees = paise / 100
  const hasFraction = Math.round(rupees * 100) % 100 !== 0
  return `₹${rupees.toLocaleString("en-IN", { minimumFractionDigits: hasFraction ? 2 : 0, maximumFractionDigits: 2 })}`
}