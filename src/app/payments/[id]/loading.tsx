export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-16 rounded-xl border border-line bg-surface" />
      <div className="grid lg:grid-cols-5 gap-5">
        <div className="lg:col-span-3 space-y-5">
          <div className="h-[320px] rounded-xl border border-line bg-surface" />
          <div className="h-[200px] rounded-xl border border-line bg-surface" />
        </div>
        <div className="lg:col-span-2 space-y-5">
          <div className="h-[220px] rounded-xl border border-line bg-surface" />
          <div className="h-[260px] rounded-xl border border-line bg-surface" />
        </div>
      </div>
    </div>
  )
}
