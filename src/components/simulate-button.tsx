"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Zap, X, Loader2, CheckCircle2, AlertTriangle } from "lucide-react"

const CATEGORIES = [
  ["TEMPORARY_DECLINE", "Temporary card decline"],
  ["INSUFFICIENT_FUNDS", "Insufficient funds"],
  ["EXPIRED_CARD", "Expired card"],
  ["NETWORK_FAILURE", "Network failure"],
  ["AUTHENTICATION_FAILURE", "Authentication (3DS) failure"],
  ["ABANDONED_CHECKOUT", "Abandoned checkout"],
  ["REPEATED_FAILURES", "Repeated failed attempts"],
  ["HIGH_VALUE_FAILURE", "High-value payment failure"],
  ["SUBSCRIPTION_RENEWAL_FAILURE", "Subscription renewal failure"],
  ["FRAUD_RISK", "Potential fraud signal"],
] as const

const METHODS = ["CARD", "UPI", "NETBANKING", "WALLET"] as const

interface PipelineResult {
  actionType: string
  policyDecision: string
  status: string
  outcome?: string
  outcomeDetail?: string
  paymentId: string
}

/** One-click demo: simulate a failed payment and watch the full pipeline run. */
export function SimulateButton({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string; pipeline?: PipelineResult } | null>(null)
  const router = useRouter()

  const [amount, setAmount] = useState("12499")
  const [category, setCategory] = useState<string>("TEMPORARY_DECLINE")
  const [method, setMethod] = useState<string>("CARD")
  const [customerEmail, setCustomerEmail] = useState("rahul.sharma@gmail.com")

  async function run(custom?: { category?: string; amount?: number; method?: string }) {
    setRunning(true)
    setResult(null)
    try {
      const body = custom
        ? { failureCategory: custom.category, amount: custom.amount, method: custom.method }
        : {
            amount: Math.round(Number(amount) * 100),
            failureCategory: category,
            method,
            ...(customerEmail ? { customerEmail } : {}),
          }
      const res = await fetch("/api/payments/simulate-failure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error ?? "Simulation failed")
      setResult({
        ok: true,
        message: "Pipeline complete — dashboard updated.",
        pipeline: json.data.pipeline,
      })
      router.refresh()
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : "Simulation failed" })
    } finally {
      setRunning(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-2 rounded-lg bg-brand text-white font-medium shadow-[0_1px_2px_rgba(2,4,43,0.2),inset_0_1px_0_rgba(255,255,255,0.15)] hover:bg-brand-deep transition-colors cursor-pointer ${
          compact ? "px-3 py-1.5 text-[12.5px]" : "px-4 py-2 text-[13.5px]"
        }`}
      >
        <Zap size={15} strokeWidth={2.4} />
        Simulate Failed Payment
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-[2px]" onClick={() => !running && setOpen(false)}>
          <div
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-surface border border-line shadow-2xl animate-fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-line">
              <div>
                <h3 className="text-[15px] font-semibold text-ink">Simulate a failed payment</h3>
                <p className="text-[12px] text-ink-faint mt-0.5">Runs the complete recovery pipeline end-to-end.</p>
              </div>
              <button onClick={() => setOpen(false)} className="p-1 rounded-md text-ink-faint hover:bg-[#f1f2f5] cursor-pointer" aria-label="Close">
                <X size={17} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11.5px] font-medium text-ink-soft">Amount (₹)</span>
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
                    className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-[13.5px] font-mono focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                    inputMode="numeric"
                  />
                </label>
                <label className="block">
                  <span className="text-[11.5px] font-medium text-ink-soft">Method</span>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand cursor-pointer"
                  >
                    {METHODS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="text-[11.5px] font-medium text-ink-soft">Failure scenario</span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand cursor-pointer"
                >
                  {CATEGORIES.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-[11.5px] font-medium text-ink-soft">Customer</span>
                <select
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand cursor-pointer"
                >
                  <option value="rahul.sharma@gmail.com">Rahul Sharma — loyal, active subscription</option>
                  <option value="priya.patel@outlook.com">Priya Patel — high-value enterprise</option>
                  <option value="mohit.b@gmail.com">Mohit Bhandari — high risk score</option>
                  <option value="sneha.reddy@yahoo.com">Sneha Reddy — new customer</option>
                  <option value="rohan.gupta@gmail.com">Rohan Gupta — frequent failures</option>
                </select>
              </label>

              {result && (
                <div className={`rounded-lg border px-3.5 py-3 text-[12.5px] leading-relaxed animate-fade-up ${result.ok ? "border-good/30 bg-good-soft/60 text-ink" : "border-risk/30 bg-risk-soft text-ink"}`}>
                  <div className="flex items-center gap-2 font-semibold">
                    {result.ok ? <CheckCircle2 size={15} className="text-good" /> : <AlertTriangle size={15} className="text-risk" />}
                    {result.ok ? "Pipeline complete" : "Error"}
                  </div>
                  {result.pipeline && (
                    <div className="mt-1.5 grid gap-0.5 font-mono text-[11.5px] text-ink-soft">
                      <span>diagnosis → {result.pipeline.actionType}</span>
                      <span>policy → {result.pipeline.policyDecision}</span>
                      <span>outcome → {result.pipeline.outcome ?? result.pipeline.status}</span>
                      {result.pipeline.outcomeDetail && <span className="text-ink-faint">{result.pipeline.outcomeDetail}</span>}
                    </div>
                  )}
                  {!result.pipeline && <p className="mt-1 text-ink-soft">{result.message}</p>}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-line">
              <button
                onClick={() => run()}
                disabled={running || !amount}
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white hover:bg-brand-deep disabled:opacity-50 transition-colors cursor-pointer"
              >
                {running && <Loader2 size={14} className="animate-spin" />}
                {running ? "Running pipeline…" : "Run failure → recovery → outcome"}
              </button>
              <button
                onClick={() => router.push("/payments/" + result?.pipeline?.paymentId)}
                disabled={!result?.pipeline}
                className="rounded-lg border border-line px-3.5 py-2 text-[12.5px] font-medium text-ink-soft hover:bg-[#f6f7f9] disabled:opacity-40 transition-colors cursor-pointer"
              >
                View payment detail →
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
