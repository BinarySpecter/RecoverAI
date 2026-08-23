import type { AIAnalysisResult, FailureContext } from "@/lib/types"

/**
 * AIProvider — the single seam through which the application talks to any LLM.
 * Business code never imports a vendor SDK directly; it calls
 * `getAIProvider().analyzePaymentFailure(ctx)` (see ./index.ts).
 */
export interface AIProvider {
  readonly name: string
  readonly model: string
  analyzePaymentFailure(ctx: FailureContext): Promise<AIAnalysisResult>
}

export interface AIProviderResult {
  analysis: AIAnalysisResult
  provider: string
  model?: string
  latencyMs: number
  usedFallback: boolean
  rawOutput?: string
}

export type { FailureContext, AIAnalysisResult }
