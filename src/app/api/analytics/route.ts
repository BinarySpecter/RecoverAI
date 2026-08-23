import { getMerchant } from "@/lib/db"
import { getDashboardMetrics } from "@/lib/analytics"
import { resolveProvider } from "@/lib/ai"
import { ok, handleRouteError } from "@/lib/api-utils"

export const dynamic = "force-dynamic"

/** GET /api/analytics — dashboard metrics + active AI provider status. */
export async function GET() {
  try {
    const merchant = await getMerchant()
    const metrics = await getDashboardMetrics(merchant.id)
    const { provider, configured } = resolveProvider()
    return ok({
      metrics,
      ai: {
        requested: process.env.AI_PROVIDER ?? "mock",
        active: provider.name,
        model: provider.model,
        configured,
      },
    })
  } catch (err) {
    return handleRouteError(err)
  }
}
