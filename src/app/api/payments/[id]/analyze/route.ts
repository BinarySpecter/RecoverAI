import { db } from "@/lib/db"
import { analyzeWithFallback } from "@/lib/ai"
import { buildFailureContext } from "@/lib/engine/recovery-engine"
import { audit } from "@/lib/engine/ingestion"
import { ok, fail, handleRouteError } from "@/lib/api-utils"

export const dynamic = "force-dynamic"

/**
 * POST /api/payments/[id]/analyze — run AI diagnosis only (no action).
 * Useful for showing the AI layer in isolation in the UI.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const payment = await db.payment.findUnique({ where: { id }, include: { failure: true } })
    if (!payment) return fail("Payment not found", 404)
    if (!payment.failure) return fail("Payment has no failure event", 400)

    const ctx = await buildFailureContext(id)
    const result = await analyzeWithFallback(ctx)

    const analysis = await db.aIAnalysis.create({
      data: {
        paymentId: id,
        provider: result.provider,
        model: result.model,
        failureCategory: result.analysis.failureCategory,
        rootCause: result.analysis.rootCause,
        confidence: result.analysis.confidence,
        severity: result.analysis.severity,
        recommendedAction: result.analysis.recommendedAction,
        reasoning: result.analysis.reasoning,
        customerContext: result.analysis.customerContext,
        estimatedRecoveryProbability: result.analysis.estimatedRecoveryProbability,
        latencyMs: result.latencyMs,
        usedFallback: result.usedFallback,
        rawOutput: JSON.stringify(result.analysis),
      },
    })

    await audit(payment.merchantId, {
      paymentId: id,
      actor: `AI:${result.provider}`,
      event: "ai.analysis.completed",
      message: `Manual re-analysis: ${result.analysis.failureCategory} (confidence ${result.analysis.confidence.toFixed(2)}), recommended ${result.analysis.recommendedAction}`,
      data: { analysisId: analysis.id, manual: true },
    })

    return ok({ analysis, usedFallback: result.usedFallback, latencyMs: result.latencyMs })
  } catch (err) {
    return handleRouteError(err)
  }
}
