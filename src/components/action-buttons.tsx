"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, X, Loader2, RefreshCw, Zap } from "lucide-react"

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

const primaryBtn =
  "inline-flex cursor-pointer items-center gap-1.5 rounded-[6px] bg-primary font-semibold text-on-primary transition-[background-color,transform] duration-150 hover:bg-primary-hover active:scale-[0.98] disabled:opacity-50"
const ghostBtn =
  "inline-flex cursor-pointer items-center gap-1.5 rounded-[6px] border border-line font-medium text-ink-soft transition-[background-color,transform] duration-150 hover:bg-surface-sunken active:scale-[0.98] disabled:opacity-50"

export function ApproveRejectButtons({ actionId, compact = false }: { actionId: string; compact?: boolean }) {
  const approve = useMutation(`/api/recovery/${actionId}/approve`)
  const reject = useMutation(`/api/recovery/${actionId}/reject`)
  const busy = approve.pending || reject.pending
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => approve.run()}
          disabled={busy}
          className={`${primaryBtn} ${compact ? "px-2.5 py-1 text-[11.5px]" : "px-3.5 py-1.5 text-[12.5px]"}`}
        >
          {approve.pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} strokeWidth={3} />}
          {compact ? "Approve" : "Approve & execute"}
        </button>
        <button
          onClick={() => reject.run({ reason: "Rejected from dashboard" })}
          disabled={busy}
          className={`${ghostBtn} ${compact ? "px-2.5 py-1 text-[11.5px]" : "px-3.5 py-1.5 text-[12.5px]"}`}
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
        className={`${primaryBtn} px-3 py-1.5 text-[12px]`}
      >
        {pending ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} strokeWidth={2.2} />}
        {pending ? "Running…" : label}
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
        className={`${ghostBtn} px-3 py-1.5 text-[12px]`}
      >
        {pending ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
        Re-run AI diagnosis
      </button>
      {error && <p className="mt-1.5 text-[12px] text-risk">{error}</p>}
    </div>
  )
}