import { z } from "zod"
import { rejectAction } from "@/lib/engine/recovery-engine"
import { ok, handleRouteError } from "@/lib/api-utils"

export const dynamic = "force-dynamic"

const BodySchema = z.object({ reason: z.string().max(300).optional() }).default({})

/** POST /api/recovery/[id]/reject — merchant rejects a gated action. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = BodySchema.parse(await req.json().catch(() => ({})))
    await rejectAction(id, body.reason)
    return ok({ rejected: true })
  } catch (err) {
    return handleRouteError(err)
  }
}
