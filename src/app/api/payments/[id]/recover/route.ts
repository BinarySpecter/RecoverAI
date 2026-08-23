import { runRecoveryPipeline } from "@/lib/engine/recovery-engine"
import { ok, handleRouteError } from "@/lib/api-utils"

export const dynamic = "force-dynamic"

/** POST /api/payments/[id]/recover — run the full recovery pipeline. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const result = await runRecoveryPipeline(id)
    return ok(result)
  } catch (err) {
    return handleRouteError(err)
  }
}
