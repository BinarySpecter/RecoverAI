export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-line bg-surface p-4">
            <div className="h-3 w-20 rounded bg-track" />
            <div className="mt-3 h-7 w-24 rounded bg-track" />
            <div className="mt-2 h-2.5 w-28 rounded bg-track" />
          </div>
        ))}
      </div>
      <div className="grid lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 h-[240px] rounded-xl border border-line bg-surface" />
        <div className="lg:col-span-2 h-[240px] rounded-xl border border-line bg-surface" />
      </div>
      <div className="h-[200px] rounded-xl border border-line bg-surface" />
    </div>
  )
}
