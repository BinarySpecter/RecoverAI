import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Razorpay webhook signature verification.
 *
 * Razorpay signs webhook deliveries with HMAC-SHA256 over the RAW request
 * body using the webhook secret, hex-encoded in the `X-Razorpay-Signature`
 * header. Verification must run against the body bytes exactly as received —
 * reparsing/pretty-printing the JSON before hashing breaks the signature.
 */

export function verifyRazorpaySignature(input: {
  rawBody: string | Buffer
  signature: string | null
  secret: string
}): { valid: boolean; reason?: string } {
  const { rawBody, signature, secret } = input
  if (!signature) return { valid: false, reason: "missing signature header" }

  // Razorpay sends hex. Decode defensively; mismatched encodings fail closed.
  let received: Buffer
  try {
    received = Buffer.from(signature.trim(), "hex")
  } catch {
    return { valid: false, reason: "malformed signature" }
  }
  if (received.length === 0) return { valid: false, reason: "empty signature" }

  const expected = createHmac("sha256", secret).update(rawBody).digest()

  // Constant-time comparison; length mismatch fails without leaking length.
  const a = Buffer.from(expected)
  const b = Buffer.from(received)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, reason: "signature mismatch" }
  }
  return { valid: true }
}