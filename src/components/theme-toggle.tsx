"use client"

import { useEffect, useSyncExternalStore } from "react"
import { Sun, Moon, Monitor } from "lucide-react"

export type ThemeMode = "light" | "dark" | "system"

const STORAGE_KEY = "recoverai-theme"
const MODE_EVENT = "recoverai:mode"

function applyMode(mode: ThemeMode) {
  const dark =
    mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  document.documentElement.classList.toggle("dark", dark)
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback)
  window.addEventListener(MODE_EVENT, callback)
  return () => {
    window.removeEventListener("storage", callback)
    window.removeEventListener(MODE_EVENT, callback)
  }
}

function getSnapshot(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === "light" || stored === "dark" ? stored : "system"
}

function getServerSnapshot(): ThemeMode {
  return "system"
}

function setMode(mode: ThemeMode) {
  if (mode === "system") localStorage.removeItem(STORAGE_KEY)
  else localStorage.setItem(STORAGE_KEY, mode)
  applyMode(mode)
  window.dispatchEvent(new Event(MODE_EVENT))
}

/**
 * Theme control — Light / System / Dark, persisted in localStorage,
 * defaulting to System and following OS changes while in System mode.
 */
export function ThemeToggle({ variant = "segment" }: { variant?: "segment" | "compact" }) {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  // Keep the rendered theme in sync (covers the pre-hydration no-FOUC guess
  // and live OS-preference changes while in System mode).
  useEffect(() => {
    applyMode(mode)
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => mode === "system" && applyMode("system")
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [mode])

  const options: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
    { value: "light", label: "Light", icon: Sun },
    { value: "system", label: "System", icon: Monitor },
    { value: "dark", label: "Dark", icon: Moon },
  ]

  if (variant === "compact") {
    const current = options.find((o) => o.value === mode) ?? options[1]
    const next: ThemeMode = mode === "light" ? "dark" : mode === "dark" ? "system" : "light"
    const NextIcon = (options.find((o) => o.value === next)?.icon) ?? Monitor
    return (
      <button
        onClick={() => setMode(next)}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[10.5px] font-medium text-ink-soft transition-colors hover:bg-surface-sunken"
        aria-label={`Theme: ${current.label}. Switch to ${next}`}
        title={`Theme: ${current.label} — click for ${next}`}
      >
        <current.icon size={12} aria-hidden />
        {current.label}
        <NextIcon size={10} className="text-ink-faint" aria-hidden />
      </button>
    )
  }

  return (
    <div role="radiogroup" aria-label="Theme" className="flex items-center gap-0.5 rounded-lg border border-navy-line/70 bg-white/[0.03] p-0.5">
      {options.map((o) => {
        const active = mode === o.value
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            onClick={() => setMode(o.value)}
            className={`flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[10.5px] font-medium transition-colors ${
              active ? "bg-white/[0.12] text-white" : "text-navy-text hover:bg-white/[0.06] hover:text-white"
            }`}
            title={`${o.label} theme`}
          >
            <o.icon size={12} aria-hidden />
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
