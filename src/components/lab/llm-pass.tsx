"use client"

import { useState } from "react"
import { Loader2, ArrowRight } from "lucide-react"
import { formatINR } from "@/lib/types"
import type { EvaluationRun, LlmAblation } from "@/lib/eval/harness"

const f = (p: number, compact = true) => formatINR(p, { compact })

/**
 * Recovery Lab — LLM ablation pass. Runs the RecoverAI strategy against the
 * configured LLM provider on the SAME seeded world the mock pass used, then
 * shows the marginal contribution. Stochastic by nature; the API caches the
 * most recent pass in-process so re-renders don't re-run it.
 */
export function LlmPass({ seed, worldSize, configured }: {
  seed: string
  worldSize: number
  configured: boolean
}) {
  const [run, setRun] = useState<EvaluationRun | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function runLlm() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/evaluation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ n: worldSize, seed, withLLM: true }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error ?? "LLM pass failed")
      setRun(json.data.run as EvaluationRun)
    } catch (err) {
      setError(err instanceof Error ? err.message : "LLM pass failed")
    } finally {
      setBusy(false)
    }
  }

  const ablation: LlmAblation | null = run?.llmAblation ?? null
  const mockGross = run?.strategies.find((s) => s.key === "RECOVERAI")?.grossRecoveredPaise ?? null
  const delta = ablation ? ablation.marginalVsMock.grossRecoveredDeltaPaise : null

  return (
    <div>
      {!ablation && (
        <button
          onClick={runLlm}
          disabled={busy || !configured}
          className="inline-flex cursor-pointer items-center gap-2 rounded-[6px] bg-primary px-4 py-2 text-[12.5px] font-semibold text-on-primary transition-[background-color,transform] duration-150 hover:bg-primary-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" aria-hidden /> : null}
          {busy ? `Running ${worldSize} LLM diagnoses…` : "Run the RecoverAI LLM pass"}
        </button>
      )}

      {!configured && !busy && (
        <p className="mt-2 text-[11.5px] leading-relaxed text-ink-faint">
          No LLM provider configured — set <span className="font-mono">AI_PROVIDER=deepseek|gemini</span> and its API key
          to compare the LLM-driven pass against the deterministic engine.
        </p>
      )}
      {error && <p className="mt-2 text-[12px] text-risk">{error}</p>}

      {ablation && mockGross !== null && (
        <div className="animate-settle-in mt-4">
          <div className="grid gap-px overflow-hidden rounded-[8px] border border-line bg-line sm:grid-cols-3">
            <div className="bg-surface px-4 py-3.5">
              <p className="label-caps text-ink-faint">Deterministic engine (mock)</p>
              <p className="display-money mt-1.5 text-[22px] leading-none text-ink">{f(mockGross)}</p>
              <p className="tnum mt-1.5 text-[10.5px] text-ink-faint">reproducible · offline-safe</p>
            </div>
            <div className="bg-surface px-4 py-3.5">
              <p className="label-caps text-ink-faint">LLM-enabled ({ablation.provider} · {ablation.model})</p>
              <p className="display-money mt-1.5 text-[22px] leading-none text-ink">{f(ablation.metrics.grossRecoveredPaise)}</p>
              <p className="tnum mt-1.5 text-[10.5px] text-ink-faint">
                {(ablation.metrics.recoveryRate * 100).toFixed(1)}% rate · {ablation.metrics.policyRefusals} refusals
              </p>
            </div>
            <div className={`bg-surface px-4 py-3.5 ${delta !== null && delta > 0 ? "border-t-2 border-good" : delta !== null ? "border-t-2 border-risk" : ""}`}>
              <p className="label-caps text-ink-faint">LLM marginal contribution</p>
              <p className={`display-money mt-1.5 text-[22px] leading-none ${delta !== null && delta > 0 ? "text-good" : delta !== null ? "text-risk" : "text-ink-faint"}`}>
                {delta !== null ? `${delta > 0 ? "+" : ""}${f(delta)}` : "—"}
              </p>
              <p className="tnum mt-1.5 text-[10.5px] text-ink-faint">
                {ablation.diagnosisFallbacks > 0
                  ? `${ablation.diagnosisFallbacks}/${ablation.calls} diagnoses fell back to the deterministic engine`
                  : `${ablation.calls} calls · ${Math.round(ablation.elapsedMs / 1000)}s`}
              </p>
            </div>
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-[10.5px] leading-relaxed text-ink-faint">
            <ArrowRight size={11} className="mt-0.5 shrink-0" aria-hidden />
            Stochastic by nature — the LLM pass is a sample, not a claim. Run it again to see variance. The mock pass above
            is bit-for-bit reproducible.
          </p>
        </div>
      )}
    </div>
  )
}