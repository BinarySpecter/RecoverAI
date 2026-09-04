import { NextRequest } from "next/server"
import { z } from "zod"
import { generateWorld, DEFAULT_EVAL_SEED } from "@/lib/eval/world"
import { runEvaluation } from "@/lib/eval/harness"
import { ok, fail, handleRouteError } from "@/lib/api-utils"
import type { EvaluationRun } from "@/lib/eval/harness"

export const dynamic = "force-dynamic"

const RunSchema = z.object({
  n: z.number().int().min(50).max(1000).optional(),
  seed: z.string().min(1).max(120).optional(),
  withLLM: z.boolean().optional(),
})

/**
 * POST /api/evaluation/run — run the offline counterfactual evaluation.
 *
 * Replays one fixed seeded world through the four strategies (do nothing,
 * blind retry, generic dunning, RecoverAI) and returns the metrics. With
 * withLLM=true the RecoverAI strategy is additionally run against the
 * configured LLM provider (requires AI_PROVIDER + API key; stochastic).
 *
 * The evaluation is in-memory and writes nothing to the database.
 * The last LLM pass is cached in-process for immediate re-display.
 */

// In-process cache of the most recent LLM ablation (per process, dev/demo only).
let lastLlmRun: { key: string; run: EvaluationRun; at: string } | null = null

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const input = RunSchema.safeParse(body)
    if (!input.success) return fail("Invalid evaluation request", 422)
    const { n = 500, seed = DEFAULT_EVAL_SEED, withLLM = false } = input.data

    const world = generateWorld(n, seed)
    const cacheKey = `${seed}:${n}`

    if (withLLM) {
      if (lastLlmRun?.key === cacheKey) return ok({ run: lastLlmRun.run, cached: true, ranAt: lastLlmRun.at })
      const run = await runEvaluation({ world, seed, withLLM: true })
      lastLlmRun = { key: cacheKey, run, at: new Date().toISOString() }
      return ok({ run, cached: false })
    }

    const run = await runEvaluation({ world, seed })
    return ok({ run })
  } catch (err) {
    if (err instanceof Error && /No LLM provider configured/.test(err.message)) return fail(err.message, 400)
    return handleRouteError(err)
  }
}