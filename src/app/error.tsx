"use client"

import { useEffect } from "react"

/** Route-level error boundary — keeps failures explainable instead of a white screen. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[recoverai]", error)
  }, [error])

  const needsSeed = /No merchant found/i.test(error.message)

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-risk-soft text-risk font-bold">!</span>
      <h2 className="text-[17px] font-bold text-ink">
        {needsSeed ? "Database not seeded yet" : "Something went wrong"}
      </h2>
      <p className="max-w-md text-[13px] leading-relaxed text-ink-soft">
        {needsSeed ? (
          <>
            Run <code className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-[12px]">npm run setup</code> to create
            the database and demo data, then reload.
          </>
        ) : (
          error.digest ? `Reference ${error.digest} — check the server logs.` : "Check the server logs for details."
        )}
      </p>
      <button
        onClick={reset}
        className="mt-1 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white hover:bg-brand-deep transition-colors cursor-pointer"
      >
        Try again
      </button>
    </div>
  )
}
