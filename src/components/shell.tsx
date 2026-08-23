import Link from "next/link"
import type { ReactNode } from "react"
import { LayoutDashboard, Target, ScrollText, ShieldCheck } from "lucide-react"
import { SimulateButton } from "@/components/simulate-button"

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/opportunities", label: "Opportunities", icon: Target },
  { href: "/activity", label: "Activity & Audit", icon: ScrollText },
  { href: "/safety", label: "Safety Model", icon: ShieldCheck },
]

export function Shell({
  children,
  active,
  title,
  subtitle,
}: {
  children: ReactNode
  active: string
  title: string
  subtitle?: string
}) {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden md:flex w-[218px] shrink-0 flex-col border-r border-line bg-surface">
        <Link href="/" className="flex items-center gap-2.5 px-5 py-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-white font-bold text-[15px]">₹</span>
          <span>
            <span className="block text-[14.5px] font-bold tracking-tight text-ink leading-tight">RecoverAI</span>
            <span className="block text-[10.5px] text-ink-faint leading-tight">Revenue Recovery</span>
          </span>
        </Link>
        <nav className="mt-2 px-3 space-y-0.5">
          {NAV.map((item) => {
            const isActive = active === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                  isActive ? "bg-brand-soft text-brand-deep" : "text-ink-soft hover:bg-[#f1f2f5] hover:text-ink"
                }`}
              >
                <item.icon size={16} strokeWidth={2.1} />
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="mt-auto px-5 py-4 border-t border-line">
          <p className="text-[11px] text-ink-faint leading-relaxed">
            LLM recommends.
            <br />
            Application rules authorize.
          </p>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-7 py-3.5">
            <div className="min-w-0">
              <h1 className="truncate text-[16.5px] font-bold tracking-tight text-ink">{title}</h1>
              {subtitle && <p className="truncate text-[12.5px] text-ink-faint mt-0.5">{subtitle}</p>}
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 text-[12px] text-ink-faint">
                <span className="h-1.5 w-1.5 rounded-full bg-good animate-pulse-soft" />
                TechNova Commerce · demo environment
              </div>
              <SimulateButton compact />
            </div>
          </div>
          {/* Mobile nav */}
          <nav className="flex md:hidden gap-1 px-4 pb-2 overflow-x-auto">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-3 py-1 text-[12px] font-medium whitespace-nowrap ${
                  active === item.href ? "bg-brand-soft text-brand-deep" : "text-ink-soft"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="flex-1 px-5 sm:px-7 py-6">{children}</main>
      </div>
    </div>
  )
}
