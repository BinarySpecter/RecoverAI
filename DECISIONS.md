# Engineering Decisions

Trade-offs made deliberately under a hackathon clock, with the reasoning:

## 1. SQLite over PostgreSQL
**Decision:** Prisma + SQLite (`file:./dev.db`). **Why:** the acceptance test is "a judge clones,
installs, and runs in minutes" — Postgres would add an install/service step and a second failure
mode during live demos. The schema avoids SQLite-only types, so moving to Postgres is a
`provider` + `url` change. Prisma enums don't exist on SQLite, so status/category fields are
Strings validated by Zod at the boundary — which also keeps the schema portable.

## 2. Next.js route handlers over a separate API service
One repo, one process, one deploy. The engine (`src/lib/engine`) has zero Next.js imports — it
would lift into a standalone service unchanged if scale demanded it.

## 3. Deterministic mock AI as a first-class provider, not a stub
The mock provider is a real diagnosis rules engine (category matrix + context overrides +
customer-quality scoring). It doubles as the universal fallback, which makes the "AI is optional"
requirement structural rather than an error path bolted on later. The 5-minute demo never
depends on an external API.

## 4. Policy engine as a pure function
`evaluatePolicy(request, history) → verdict` is side-effect free and fully testable — 11 unit
tests pin every rule. The LLM output is *input* to authorization, never the authorization itself.

## 5. Bounded action catalog over free-form LLM actions
The 8 actions with risk levels/cooldowns/thresholds live in code (`actions.ts`). The AI maps a
situation onto this set (schema-enforced); it cannot mint new financial operations.

## 6. Deterministic outcome simulation
Charge/customer-response outcomes derive from a seeded hash of payment+attempt ids — reproducible
demos, no flaky tests. Real integration replaces `simulateCharge`/engagement rolls behind the same
interfaces; state transitions and audit code are unchanged.

## 7. Money as integer paise
No floating-point currency anywhere in the domain.

## 8. No authentication
Single demo merchant by design (documented); every query already scopes by `merchantId`, so
multi-tenancy is additive. Auth would have consumed demo-polish time without changing the story.

## 9. Hand-rolled SVG charts
Two charts (trend, categories) hand-built in ~100 lines instead of a chart library — full visual
control, zero dependency/version risk under React 19.

## 10. Approval thresholds tuned for demo legibility
₹50,000 for automated retries, ₹1,00,000 for customer messaging — high enough to look sane,
low enough that the demo can trigger the gate live with a round number.

## 11. Webhook signature verification stubbed, loudly
`POST /api/webhooks/razorpay` checks for a signature header when a secret is configured and
documents exactly where HMAC verification goes. Faking verification silently would be worse than
documenting the boundary.

## 12. Prisma 6 (not 7)
Prisma 7's driver-adapter architecture adds setup surface with no benefit at demo scale. Pinning
6 keeps the well-known zero-config SQLite path (and matches what most contributors know).
