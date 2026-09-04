import { describe, it, expect } from "vitest"
import { createHmac } from "node:crypto"
import { verifyRazorpaySignature } from "@/lib/gateway/webhook"

const SECRET = "test_webhook_secret"

function sign(body: string | Buffer, secret = SECRET): string {
  return createHmac("sha256", secret).update(body).digest("hex")
}

describe("Razorpay webhook signature verification", () => {
  const body = JSON.stringify({
    event: "payment.failed",
    payload: { orderId: "order_123", status: "FAILED", gatewayCode: "card_declined" },
  })

  it("accepts a valid HMAC-SHA256 signature over the raw body", () => {
    const signature = sign(body)
    expect(verifyRazorpaySignature({ rawBody: body, signature, secret: SECRET })).toEqual({ valid: true })
  })

  it("rejects a wrong signature", () => {
    const signature = sign(body, "another_secret")
    const result = verifyRazorpaySignature({ rawBody: body, signature, secret: SECRET })
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/mismatch/)
  })

  it("rejects a missing signature header", () => {
    const result = verifyRazorpaySignature({ rawBody: body, signature: null, secret: SECRET })
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/missing/)
  })

  it("rejects an empty or malformed signature", () => {
    expect(verifyRazorpaySignature({ rawBody: body, signature: "", secret: SECRET }).valid).toBe(false)
    expect(verifyRazorpaySignature({ rawBody: body, signature: "not-hex!!", secret: SECRET }).valid).toBe(false)
  })

  it("verification depends on the exact byte representation of the body", () => {
    // Pretty-printed (whitespace added) JSON is the same payload but different
    // bytes — the signature over the raw compact body must not verify.
    const pretty = JSON.stringify(JSON.parse(body), null, 2)
    expect(pretty).not.toBe(body)
    const signature = sign(body)
    const result = verifyRazorpaySignature({ rawBody: pretty, signature, secret: SECRET })
    expect(result.valid).toBe(false)
  })

  it("is deterministic for identical input and fails closed on length mismatch", () => {
    const shortSig = sign("a")
    const result = verifyRazorpaySignature({ rawBody: body, signature: shortSig, secret: SECRET })
    expect(result.valid).toBe(false)
    expect(verifyRazorpaySignature({ rawBody: body, signature: sign(body), secret: SECRET }).valid).toBe(true)
  })
})