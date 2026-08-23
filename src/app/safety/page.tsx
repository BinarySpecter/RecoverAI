import { ShieldCheck, Brain, Scale, Lock, FileSearch, Webhook } from "lucide-react"
import { Shell } from "@/components/shell"
import { Card, CardHeader, Badge } from "@/components/ui"
import { ACTION_CATALOG } from "@/lib/engine/actions"
import { resolveProvider } from "@/lib/ai"

export const dynamic = "force-dynamic"

/**
 * Safety model page — makes the "LLM recommends, application rules authorize"
 * guarantee visible and explains the bounded action set to judges/merchants.
 */
export default async function SafetyPage() {
  const { provider, configured } = resolveProvider()
  const requested = process.env.AI_PROVIDER ?? "mock"

  return (
    <Shell
      active="/safety"
      title="Safety Model"
      subtitle="How financial actions stay governed when an LLM is in the loop"
    >
      <div className="grid lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <CardHeader title="Two-layer decision architecture" subtitle="AI reasoning never executes directly" action={<Scale size={16} className="text-brand-deep" />} />
          <div className="px-5 pb-5 space-y-4">
            <div className="rounded-lg border border-violet/25 bg-violet-soft/40 p-4">
              <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                <Brain size={14} className="text-violet" /> Layer 1 — AI reasoning (advisory)
              </p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft">
                The provider returns a <span className="font-semibold">schema-validated</span> diagnosis: failure
                category, root cause, confidence, severity, and exactly one recommended action from the bounded
                catalog. Invalid output, timeouts, rate limits, or missing keys degrade to a deterministic rules
                engine — the workflow never stalls and never accepts malformed AI output.
              </p>
            </div>
            <div className="rounded-lg border border-brand/25 bg-brand-soft/40 p-4">
              <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                <ShieldCheck size={14} className="text-brand-deep" /> Layer 2 — deterministic policy engine (authorization)
              </p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft">
                A pure function over payment + history decides what may actually run: category/action physics
                (an expired card can never be retried), fraud contact ceilings, per-action cooldowns, duplicate
                suppression, effort caps per payment, and amount thresholds that route high-value actions to
                explicit merchant approval. The LLM cannot talk past this layer.
              </p>
            </div>
            <div className="rounded-lg border border-line bg-[#f8f9fb] p-4">
              <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                <Lock size={14} className="text-ink-soft" /> Human-in-the-loop
              </p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft">
                Actions at or above their approval threshold pause as <em>Awaiting approval</em> and only execute
                after an explicit merchant decision from the dashboard — with the full decision trail attached.
              </p>
            </div>
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Active AI provider" subtitle="Server-side configured" action={<FileSearch size={16} className="text-ink-faint" />} />
            <div className="px-5 pb-5 space-y-2 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="text-ink-faint">Requested</span>
                <span className="font-mono font-medium">{requested}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-faint">Active</span>
                <span className="font-mono font-medium">{provider.name} · {provider.model}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-faint">API key</span>
                {configured ? <Badge value="APPROVED" /> : <Badge value="PENDING" />}
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
            <CardHeader title="Razorpay integration point" subtitle="Adapter boundary" action={<Webhook size={16} className="text-ink-faint" />} />
            <div className="px-5 pb-5 text-[12.5px] leading-relaxed text-ink-soft">
              <p>
                The gateway is an adapter (<span className="font-mono text-[11.5px]">src/lib/gateway/payment-gateway.ts</span>).
                Real Razorpay webhooks plug in at <span className="font-mono text-[11.5px]">POST /api/webhooks/razorpay</span> —
                signature-verified, then normalized through the same failure-category map the simulator uses.
                Charge retries route through the same interface against Razorpay captures.
              </p>
            </div>
          </Card>
        </div>
      </div>

      <Card className="mt-5">
        <CardHeader title="The bounded action catalog" subtitle="The complete set of actions the AI may recommend — nothing else exists" />
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[760px]">
            <thead>
              <tr className="border-y border-line/70 text-left text-[11px] uppercase tracking-wide text-ink-faint">
                <th className="px-5 py-2 font-medium">Action</th>
                <th className="px-4 py-2 font-medium">Risk</th>
                <th className="px-4 py-2 font-medium">Cooldown</th>
                <th className="px-4 py-2 font-medium">Needs approval at</th>
                <th className="px-4 py-2 font-medium">Customer-facing</th>
                <th className="px-4 py-2 font-medium">Base efficacy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {Object.values(ACTION_CATALOG).map((a) => (
                <tr key={a.type} className="hover:bg-[#f8f9fb]">
                  <td className="px-5 py-2.5">
                    <span className="font-medium text-ink">{a.label}</span>
                    <span className="block text-[11.5px] text-ink-faint">{a.description}</span>
                  </td>
                  <td className="px-4 py-2.5"><Badge value={a.riskLevel} /></td>
                  <td className="px-4 py-2.5 font-mono">{a.cooldownHours}h</td>
                  <td className="px-4 py-2.5 font-mono">
                    {a.approvalThreshold > 1e12 ? "never" : `₹${(a.approvalThreshold / 100).toLocaleString("en-IN")}`}
                  </td>
                  <td className="px-4 py-2.5">{a.customerFacing ? "Yes" : "No"}</td>
                  <td className="px-4 py-2.5 font-mono">{(a.efficacy * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </Shell>
  )
}
