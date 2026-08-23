"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, X, Loader2, RefreshCw, Sparkles } from "lucide-react"

function useMutation(url: string, method: "POST" = "POST") {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function run(body?: unknown) {
    setPending(true)
    setError(null)
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error ?? "Request failed")
      router.refresh()
      return json.data
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed")
      return null
    } finally {
      setPending(false)
    }
  }

  return { pending, error, run }
}

export function ApproveRejectButtons({ actionId }: { actionId: string }) {
  const approve = useMutation(`/api/recovery/${actionId}/approve`)
  const reject = useMutation(`/api/recovery/${actionId}/reject`)
  const busy = approve.pending || reject.pending
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => approve.run()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-good px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:brightness-110 active:scale-[0.98] disabled:opacity-50 transition-[filter,transform] duration-150 cursor-pointer"
        >
          {approve.pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} strokeWidth={3} />}
          Approve &amp; execute
        </button>
        <button
          onClick={() => reject.run({ reason: "Rejected from dashboard" })}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3.5 py-1.5 text-[12.5px] font-medium text-ink-soft hover:bg-surface-sunken active:scale-[0.98] disabled:opacity-50 transition-[background-color,transform] duration-150 cursor-pointer"
        >
          {reject.pending ? <Loader2 size={13} className="animate-spin" /> : <X size={13} strokeWidth={3} />}
          Reject
        </button>
      </div>
      {(approve.error || reject.error) && (
        <p className="mt-1.5 text-[12px] text-risk">{approve.error ?? reject.error}</p>
      )}
    </div>
  )
}

export function RunRecoveryButton({ paymentId, label = "Run AI recovery" }: { paymentId: string; label?: string }) {
  const { pending, error, run } = useMutation(`/api/payments/${paymentId}/recover`)
  return (
    <div>
      <button
        onClick={() => run()}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-brand-deep active:scale-[0.98] disabled:opacity-50 transition-[background-color,transform] duration-150 cursor-pointer"
      >
        {pending ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
        {pending ? "Running pipeline…" : label}
      </button>
      {error && <p className="mt-1.5 text-[12px] text-risk">{error}</p>}
    </div>
  )
}

export function ReanalyzeButton({ paymentId }: { paymentId: string }) {
  const { pending, error, run } = useMutation(`/api/payments/${paymentId}/analyze`)
  return (
    <div>
      <button
        onClick={() => run()}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-ink-soft hover:bg-surface-sunken active:scale-[0.98] disabled:opacity-50 transition-[background-color,transform] duration-150 cursor-pointer"
      >
        {pending ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
        Re-run AI diagnosis
      </button>
      {error && <p className="mt-1.5 text-[12px] text-risk">{error}</p>}
    </div>
  )
}
