import Link from "next/link"
import type { ReactNode } from "react"
import { LayoutDashboard, Target, ScrollText, ShieldCheck } from "lucide-react"
import { SimulateButton } from "@/components/simulate-button"
import { ThemeToggle } from "@/components/theme-toggle"

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/opportunities", label: "Work queue", icon: Target },
  { href: "/activity", label: "Activity & audit", icon: ScrollText },
  { href: "/safety", label: "Safety model", icon: ShieldCheck },
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
      {/* Command sidebar */}
      <aside className="hidden md:flex w-[232px] shrink-0 flex-col bg-navy">
        <Link href="/" className="group flex items-center gap-3 px-6 pt-6 pb-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-navy text-[17px] font-bold">
            ₹
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold leading-tight tracking-[-0.01em] text-white">
              RecoverAI
            </span>
            <span className="label-caps mt-0.5 block text-[9px] text-navy-text">
              Revenue recovery
            </span>
          </span>
        </Link>

        <div className="mx-6 mb-4 h-px bg-navy-line" aria-hidden />

        <nav className="flex-1 px-3" aria-label="Primary">
          <p className="label-caps px-3 pb-2 text-[9px] text-navy-text/70">Command center</p>
          <ul className="space-y-0.5">
            {NAV.map((item) => {
              const isActive = active === item.href
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={`relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                      isActive
                        ? "bg-white/[0.08] text-white"
                        : "text-navy-text hover:bg-white/[0.04] hover:text-white"
                    }`}
                  >
                    {isActive && (
                      <span
                        className="absolute left-0 top-1/2 h-4 w-[2.5px] -translate-y-1/2 rounded-r bg-brand"
                        aria-hidden
                      />
                    )}
                    <item.icon size={15} strokeWidth={isActive ? 2.4 : 2} aria-hidden />
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="space-y-3 px-6 py-5">
          <div className="rounded-lg border border-navy-line/70 bg-white/[0.03] px-3.5 py-3">
            <p className="text-[10.5px] font-medium leading-relaxed text-navy-text">
              LLM recommends.
              <br />
              <span className="text-white">Application rules authorize.</span>
            </p>
          </div>
          <ThemeToggle />
        </div>
      </aside>

      {/* Main canvas */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 lg:px-8">
            <div className="min-w-0">
              <h1 className="truncate text-[16px] font-semibold tracking-[-0.015em] text-ink">{title}</h1>
              {subtitle && <p className="truncate text-[12px] text-ink-faint">{subtitle}</p>}
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden items-center gap-2 text-[11.5px] text-ink-faint sm:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-good animate-pulse-soft" aria-hidden />
                TechNova Commerce · demo
              </div>
              <div className="md:hidden">
                <ThemeToggle variant="compact" />
              </div>
              <SimulateButton />
            </div>
          </div>
          {/* Mobile nav */}
          <nav className="flex gap-1 overflow-x-auto px-4 pb-2 md:hidden" aria-label="Primary">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-2.5 py-1 text-[12px] font-medium whitespace-nowrap ${
                  active === item.href ? "bg-primary text-white" : "text-ink-soft"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="flex-1 px-6 py-7 lg:px-8">{children}</main>
      </div>
    </div>
  )
}
