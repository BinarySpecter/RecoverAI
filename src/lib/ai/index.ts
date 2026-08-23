import type { AIProvider, AIProviderResult, FailureContext } from "@/lib/ai/provider"
import { MockProvider } from "@/lib/ai/mock"
import { GeminiProvider } from "@/lib/ai/gemini"
import { DeepSeekProvider } from "@/lib/ai/deepseek"

/**
 * Provider selection + universal fallback.
 *
 * AI_PROVIDER env selects the active provider. Any failure — missing key,
 * timeout, rate limit, malformed/invalid output — degrades to the
 * deterministic MockProvider so the recovery workflow never stalls.
 */

export type ProviderName = "mock" | "gemini" | "deepseek"

export function resolveProvider(name?: string): { provider: AIProvider; configured: boolean } {
  const requested = (name ?? process.env.AI_PROVIDER ?? "mock").toLowerCase()
  switch (requested) {
    case "gemini": {
      const key = process.env.GEMINI_API_KEY
      if (key) return { provider: new GeminiProvider(key), configured: true }
      return { provider: new MockProvider(), configured: false }
    }
    case "deepseek": {
      const key = process.env.DEEPSEEK_API_KEY
      if (key) return { provider: new DeepSeekProvider(key), configured: true }
      return { provider: new MockProvider(), configured: false }
    }
    default:
      return { provider: new MockProvider(), configured: true }
  }
}

/** The single entry point the recovery engine uses for diagnosis. */
export async function analyzeWithFallback(ctx: FailureContext): Promise<AIProviderResult> {
  const { provider } = resolveProvider()
  const started = Date.now()
  try {
    const analysis = await provider.analyzePaymentFailure(ctx)
    return {
      analysis,
      provider: provider.name,
      model: provider.model,
      latencyMs: Date.now() - started,
      usedFallback: false,
    }
  } catch (err) {
    // Never leak provider errors/keys into responses; degrade deterministically.
    console.warn(
      `[ai] provider "${provider.name}" failed (${err instanceof Error ? err.message : "unknown"}), falling back to deterministic engine`,
    )
    const fallback = new MockProvider()
    const analysis = await fallback.analyzePaymentFailure(ctx)
    return {
      analysis,
      provider: "fallback",
      model: fallback.model,
      latencyMs: Date.now() - started,
      usedFallback: true,
    }
  }
}
