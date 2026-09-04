import Link from "next/link"
import type { ReactNode } from "react"
import { LayoutDashboard, Target, FlaskConical, ShieldCheck, ScrollText, BadgeCheck } from "lucide-react"
import { SimulateButton } from "@/components/simulate-button"
import { ThemeToggle } from "@/components/theme-toggle"
import { db, getMerchant } from "@/lib/db"
import { resolveEvalProvider } from "@/lib/eval/harness"
import { providerLabel } from "@/components/ui"

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/opportunities", label: "Recovery", icon: Target },
  { href: "/lab", label: "Recovery Lab", icon: FlaskConical },
  { href: "/approvals", label: "Approvals", icon: BadgeCheck },
  { href: "/activity", label: "Activity", icon: ScrollText },
  { href: "/safety", label: "Safety", icon: ShieldCheck },
]

export async function Shell({
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
  const merchant = await getMerchant()
  const [pendingApprovals, providerState] = await Promise.all([
    db.recoveryAction.count({ where: { status: "AWAITING_APPROVAL", payment: { merchantId: merchant.id } } }),
    resolveEvalProvider(),
  ])

  return (
    <div className="flex min-h-screen">
      {/* Command sidebar — fixed identity in both themes */}
      <aside className="hidden md:flex w-[224px] shrink-0 flex-col bg-navy">
        <Link href="/" className="group flex items-baseline gap-2.5 px-5 pt-6 pb-5">
          <span className="display-money text-[22px] leading-none text-navy-bright">₹</span>
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold leading-tight tracking-[-0.01em] text-navy-bright">
              RecoverAI
            </span>
            <span className="label-caps mt-1 block text-[9px] text-navy-text/80">Revenue recovery</span>
          </span>
        </Link>

        <div className="mx-5 mb-4 h-px bg-navy-line" aria-hidden />

        <nav className="flex-1 px-2.5" aria-label="Primary">
          <ul className="space-y-0.5">
            {NAV.map((item) => {
              const isActive = active === item.href
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={`relative flex items-center gap-2.5 rounded-[6px] px-3 py-[7px] text-[13px] font-medium transition-colors ${
                      isActive
                        ? "bg-white/[0.07] text-navy-bright"
                        : "text-navy-text hover:bg-white/[0.04] hover:text-navy-bright"
                    }`}
                  >
                    {isActive && (
                      <span
                        className="absolute left-0 top-1/2 h-[15px] w-[2.5px] -translate-y-1/2 rounded-r-sm bg-brand"
                        aria-hidden
                      />
                    )}
                    <item.icon size={15} strokeWidth={isActive ? 2.2 : 1.8} aria-hidden />
                    {item.label}
                    {item.href === "/approvals" && pendingApprovals > 0 && (
                      <span className="tnum ml-auto rounded-[4px] bg-warn px-1.5 py-px font-mono text-[10px] font-semibold text-white">
                        {pendingApprovals}
                      </span>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="space-y-3 px-5 py-5">
          <div className="rounded-[6px] border border-navy-line bg-white/[0.03] px-3 py-2.5">
            <p className="text-[11px] font-medium leading-relaxed text-navy-text">
              LLM recommends.
              <br />
              <span className="text-navy-bright">Application rules authorize.</span>
            </p>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[10.5px] text-navy-text">
              <span
                className={`h-1.5 w-1.5 rounded-full ${providerState.active === "mock" ? "bg-good/80" : "bg-brand"}`}
                aria-hidden
              />
              {providerLabel(providerState.active, false)}
            </span>
            <ThemeToggle variant="compact" />
          </div>
        </div>
      </aside>

      {/* Main canvas */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-background/90 backdrop-blur-sm">
          <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3 px-5 py-3 lg:px-8">
            <div className="min-w-0">
              <h1 className="truncate text-[15px] font-semibold tracking-[-0.015em] text-ink">{title}</h1>
              {subtitle && <p className="truncate text-[11.5px] text-ink-faint">{subtitle}</p>}
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-2 text-[11px] text-ink-faint lg:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-good animate-pulse-soft" aria-hidden />
                TechNova Commerce · demo
              </div>
              <div className="md:hidden">
                <ThemeToggle variant="compact" />
              </div>
              <SimulateButton compact />
            </div>
          </div>
          {/* Mobile nav */}
          <nav className="flex gap-1 overflow-x-auto px-4 pb-2 md:hidden" aria-label="Primary">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-2.5 py-1 text-[12px] font-medium whitespace-nowrap ${
                  active === item.href ? "bg-primary text-on-primary" : "text-ink-soft"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-5 py-7 lg:px-8">{children}</main>
      </div>
    </div>
  )
}