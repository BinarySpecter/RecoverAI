"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Zap,
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Server,
  Brain,
  Scale,
  CircleCheck,
  ArrowRight,
  ExternalLink,
} from "lucide-react"

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

interface SimPayment {
  amount: number
  customer: { name: string }
  failure: { category: string; rawMessage: string | null } | null
}

type StepState = "idle" | "active" | "done"

/**
 * One-click demo: simulate a failed payment and watch the full pipeline run.
 * The staged animation mirrors the real server-side sequence (failure →
 * diagnosis → policy → action → outcome); steps complete as the result lands.
 */
export function SimulateButton({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [steps, setSteps] = useState<Record<string, StepState>>({})
  const [result, setResult] = useState<{ ok: boolean; message: string; pipeline?: PipelineResult; payment?: SimPayment } | null>(null)
  const [bannerShown, setBannerShown] = useState(false)
  const router = useRouter()
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const [amount, setAmount] = useState("12499")
  const [category, setCategory] = useState<string>("TEMPORARY_DECLINE")
  const [method, setMethod] = useState<string>("CARD")
  const [customerEmail, setCustomerEmail] = useState("rahul.sharma@gmail.com")

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  function clearTimers() {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }

  async function run() {
    clearTimers()
    setRunning(true)
    setResult(null)
    setBannerShown(false)
    setSteps({ failed: "active" })

    // Animate the first three stages while the server runs the real pipeline.
    timers.current.push(setTimeout(() => setSteps((s) => ({ ...s, failed: "done", diagnosis: "active" })), 350))
    timers.current.push(setTimeout(() => setSteps((s) => ({ ...s, diagnosis: "done", policy: "active" })), 750))

    try {
      const res = await fetch("/api/payments/simulate-failure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Math.round(Number(amount) * 100),
          failureCategory: category,
          method,
          ...(customerEmail ? { customerEmail } : {}),
        }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error ?? "Simulation failed")

      // Complete policy, then reveal action + outcome in quick succession.
      setSteps((s) => ({ ...s, failed: "done", diagnosis: "done", policy: "done", action: "active" }))
      timers.current.push(setTimeout(() => setSteps((s) => ({ ...s, action: "done", outcome: "active" })), 260))
      timers.current.push(
        setTimeout(() => {
          setSteps((s) => ({ ...s, outcome: "done" }))
          setResult({ ok: true, message: "Pipeline complete", pipeline: json.data.pipeline, payment: json.data.payment })
          setRunning(false)
          router.refresh()
        }, 520),
      )
      timers.current.push(setTimeout(() => setBannerShown(true), 760))
    } catch (err) {
      clearTimers()
      setSteps({})
      setResult({ ok: false, message: err instanceof Error ? err.message : "Simulation failed" })
      setBannerShown(true)
      setRunning(false)
    }
  }

  const p = result?.pipeline
  const paymentAmount = result?.payment ? result.payment.amount / 100 : Number(amount)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-2 rounded-lg bg-ink font-semibold text-white shadow-[0_1px_3px_rgba(2,4,43,0.25)] hover:bg-navy-soft active:scale-[0.98] transition-[background-color,transform] duration-150 cursor-pointer ${
          compact ? "px-3 py-1.5 text-[12.5px]" : "px-4 py-2 text-[13.5px]"
        }`}
      >
        <Zap size={15} strokeWidth={2.4} aria-hidden />
        Simulate Failed Payment
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4 backdrop-blur-[2px]"
          onClick={() => !running && setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Simulate a failed payment"
        >
          <div
            className="max-h-[92vh] w-full max-w-[540px] overflow-y-auto rounded-2xl border border-line bg-surface shadow-2xl animate-fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Simulate a failed payment</h3>
                <p className="mt-0.5 text-[12px] text-ink-faint">Runs the complete recovery pipeline end-to-end.</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="cursor-pointer rounded-md p-1 text-ink-faint transition-colors hover:bg-surface-sunken hover:text-ink"
                aria-label="Close"
                disabled={running}
              >
                <X size={17} aria-hidden />
              </button>
            </div>

            {/* Configuration — hidden once the pipeline starts, to focus the story */}
            {!running && !result && (
              <div className="animate-fade-up space-y-4 px-5 py-4">
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-soft">Amount (₹)</span>
                    <input
                      value={amount}
                      onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
                      className="tnum mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-[13.5px] transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
                      inputMode="numeric"
                      aria-label="Amount in rupees"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-soft">Method</span>
                    <select
                      value={method}
                      onChange={(e) => setMethod(e.target.value)}
                      className="mt-1 w-full cursor-pointer rounded-lg border border-line bg-surface px-3 py-2 text-[13.5px] transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
                      aria-label="Payment method"
                    >
                      {METHODS.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-soft">Failure scenario</span>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="mt-1 w-full cursor-pointer rounded-lg border border-line bg-surface px-3 py-2 text-[13.5px] transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
                    aria-label="Failure scenario"
                  >
                    {CATEGORIES.map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-soft">Customer</span>
                  <select
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="mt-1 w-full cursor-pointer rounded-lg border border-line bg-surface px-3 py-2 text-[13.5px] transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
                    aria-label="Customer"
                  >
                    <option value="rahul.sharma@gmail.com">Rahul Sharma — loyal, active subscription</option>
                    <option value="priya.patel@outlook.com">Priya Patel — high-value enterprise</option>
                    <option value="mohit.b@gmail.com">Mohit Bhandari — high risk score</option>
                    <option value="sneha.reddy@yahoo.com">Sneha Reddy — new customer</option>
                    <option value="rohan.gupta@gmail.com">Rohan Gupta — frequent failures</option>
                  </select>
                </label>

                <button
                  onClick={() => run()}
                  disabled={!amount}
                  className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-[13px] font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-brand-deep active:scale-[0.99] disabled:opacity-50"
                >
                  Run failure → recovery → outcome
                </button>
              </div>
            )}

            {/* Staged pipeline */}
            {(running || result) && p && (
              <div className="px-5 py-4">
                <ol className="relative" aria-label="Recovery pipeline progress">
                  {[
                    {
                      key: "failed",
                      label: "Payment failed",
                      icon: Server,
                      detail: result?.payment?.failure ? `${result.payment.failure.rawMessage ?? category}` : `${category.replace(/_/g, " ").toLowerCase()}`,
                    },
                    {
                      key: "diagnosis",
                      label: "AI diagnosis",
                      icon: Brain,
                      detail: p ? `${p.actionType.replace(/_/g, " ").toLowerCase()} recommended` : "",
                    },
                    {
                      key: "policy",
                      label: "Policy check",
                      icon: Scale,
                      detail: p ? (p.policyDecision === "APPROVED" ? "approved" : p.policyDecision === "NEEDS_APPROVAL" ? "approval required" : "rejected") : "",
                    },
                    {
                      key: "action",
                      label: "Recovery action",
                      icon: Zap,
                      detail: p ? p.actionType.replace(/_/g, " ").toLowerCase() : "",
                    },
                    {
                      key: "outcome",
                      label: "Outcome",
                      icon: CircleCheck,
                      detail: p
                        ? p.outcome === "RECOVERED"
                          ? "payment captured"
                          : p.outcome === "PENDING_REVIEW"
                            ? "escalated to merchant"
                            : p.policyDecision === "NEEDS_APPROVAL"
                              ? "awaiting your approval"
                              : "not recovered"
                        : "",
                    },
                  ].map((step, i, arr) => {
                    const state = steps[step.key] ?? "idle"
                    if (state === "idle") return null
                    const done = state === "done"
                    return (
                      <li
                        key={step.key}
                        className="animate-step-in relative flex gap-3 pb-3.5 last:pb-0"
                        style={{ animationDelay: `${i * 40}ms` }}
                      >
                        {i < arr.length - 1 && steps[arr[i + 1]?.key] !== undefined && (
                          <span className={`absolute left-[9px] top-6 bottom-0 w-px ${done ? "bg-good/50" : "bg-line"}`} aria-hidden />
                        )}
                        <span
                          className={`relative z-10 mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full border ${
                            done ? "border-good/40 bg-good-soft" : "border-brand/40 bg-brand-soft"
                          }`}
                        >
                          {done ? (
                            <CheckCircle2 size={11} strokeWidth={2.6} className="text-good" aria-hidden />
                          ) : (
                            <Loader2 size={11} className="animate-spin-fast text-brand" aria-hidden />
                          )}
                        </span>
                        <div className="min-w-0 pb-0.5">
                          <p className={`text-[12.5px] font-semibold leading-tight ${done ? "text-ink" : "text-brand-deep"}`}>
                            {step.label}
                          </p>
                          {done && step.detail && (
                            <p className="mt-0.5 text-[11.5px] leading-snug text-ink-faint">{step.detail}</p>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ol>

                {/* Outcome banner */}
                {bannerShown && result?.ok && p && (
                  <div className="animate-settle-in mt-4">
                    {p.outcome === "RECOVERED" ? (
                      <div className="rounded-xl border border-good/30 bg-good-soft px-4 py-3.5" role="status">
                        <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-good">
                          <CheckCircle2 size={14} strokeWidth={2.6} aria-hidden />
                          Revenue recovered
                        </div>
                        <p className="tnum mt-1 text-[26px] font-bold leading-none tracking-[-0.02em] text-good">
                          ₹{paymentAmount.toLocaleString("en-IN")}
                        </p>
                        <p className="mt-1.5 text-[12px] leading-relaxed text-ink-soft">{p.outcomeDetail}</p>
                      </div>
                    ) : p.policyDecision === "NEEDS_APPROVAL" ? (
                      <div className="rounded-xl border border-warn/35 bg-warn-soft px-4 py-3.5" role="status">
                        <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-warn">
                          <AlertTriangle size={14} strokeWidth={2.4} aria-hidden />
                          Approval required
                        </div>
                        <p className="mt-1 text-[13px] font-semibold text-ink">
                          ₹{paymentAmount.toLocaleString("en-IN")} · {p.actionType.replace(/_/g, " ").toLowerCase()}
                        </p>
                        <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">
                          The AI recommended it; the policy engine gated it above the amount threshold. Your call — review it
                          on the dashboard.
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-risk/30 bg-risk-soft px-4 py-3.5" role="status">
                        <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-risk">
                          <AlertTriangle size={14} strokeWidth={2.4} aria-hidden />
                          {p.outcome === "PENDING_REVIEW" ? "Escalated to you" : "Not recovered this time"}
                        </div>
                        <p className="mt-1 text-[13px] font-semibold text-ink">
                          ₹{paymentAmount.toLocaleString("en-IN")} · {p.actionType.replace(/_/g, " ").toLowerCase()}
                        </p>
                        <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">{p.outcomeDetail}</p>
                      </div>
                    )}
                  </div>
                )}
                {bannerShown && result && !result.ok && (
                  <div className="animate-settle-in mt-4 rounded-xl border border-risk/30 bg-risk-soft px-4 py-3 text-[12.5px] text-ink" role="alert">
                    {result.message}
                  </div>
                )}

                {/* Footer actions */}
                {!running && (
                  <div className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-line pt-4">
                    <button
                      onClick={() => {
                        setResult(null)
                        setSteps({})
                        setBannerShown(false)
                      }}
                      className="cursor-pointer rounded-lg border border-line px-3.5 py-1.5 text-[12.5px] font-medium text-ink-soft transition-colors hover:bg-surface-sunken"
                    >
                      Run another
                    </button>
                    <button
                      onClick={() => router.push("/payments/" + p?.paymentId)}
                      disabled={!p}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-ink px-3.5 py-1.5 text-[12.5px] font-medium text-white transition-[background-color,transform] duration-150 hover:bg-ink/90 active:scale-[0.98] disabled:opacity-40"
                    >
                      View payment detail
                      <ArrowRight size={12} strokeWidth={2.4} aria-hidden />
                    </button>
                    <span className="ml-auto hidden items-center gap-1 text-[11px] text-ink-faint sm:flex">
                      <ExternalLink size={11} aria-hidden /> full audit trail on the detail page
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
