import { approveAndExecute, rejectAction } from "@/lib/engine/recovery-engine"
import { ok, handleRouteError } from "@/lib/api-utils"

export const dynamic = "force-dynamic"

/** POST /api/recovery/[id]/approve — merchant approves a gated action; it executes. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const result = await approveAndExecute(id)
    return ok(result)
  } catch (err) {
    return handleRouteError(err)
  }
}
