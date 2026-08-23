import Link from "next/link"

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f1f2f5] text-ink-faint font-bold">?</span>
      <h2 className="text-[17px] font-bold text-ink">Payment not found</h2>
      <p className="max-w-md text-[13px] text-ink-soft">
        This payment doesn&apos;t exist — it may have been part of a database reset.
      </p>
      <Link
        href="/opportunities"
        className="mt-1 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white hover:bg-brand-deep transition-colors"
      >
        Back to opportunities
      </Link>
    </div>
  )
}
