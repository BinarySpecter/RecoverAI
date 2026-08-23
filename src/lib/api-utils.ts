import { NextResponse } from "next/server"
import { ZodError } from "zod"

/**
 * Consistent, safe API responses — no stack traces or internals leaked.
 */

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init)
}

export function fail(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ ok: false, error: message, ...(details ? { details } : {}) }, { status })
}

export function handleRouteError(err: unknown) {
  if (err instanceof ZodError) {
    return fail("Invalid input", 422, err.issues.map((i) => `${i.path.join(".")}: ${i.message}`))
  }
  if (err instanceof Error) {
    // Known domain errors pass their message; unexpected ones stay generic.
    const known = [
      "not AWAITING_APPROVAL",
      "No customer with email",
      "No customers exist",
      "No merchant found",
      "Payment is ",
      "Payment not found",
      "Action not found",
      "Payment has no failure event",
    ]
    if (known.some((k) => err.message.includes(k))) return fail(err.message, 400)
  }
  console.error("[api] unexpected error:", err)
  return fail("Something went wrong. Check server logs.", 500)
}
