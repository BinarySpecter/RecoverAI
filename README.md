# RecoverAI

> ### Turn failed payments into recovered revenue — without letting an AI touch money on its own.

> **AI recommends. Application rules authorize.**

That one line is the product's core design decision, and every screen in the app is built around it.

## Live Demo

**[Open the RecoverAI demo →](https://recoverai-v90c.onrender.com/)**

RecoverAI is deployed as a live hackathon demo on Render. The hosted demo uses deterministic
simulated payment outcomes and the offline-safe AI engine, so the complete recovery workflow can be
demonstrated without external credentials or real money movement.

- **Real in the hosted app:** the application architecture, UI, recovery workflow, policy engine,
  authorization logic, approval gates, audit trail, and database operations.
- **Simulated:** payment gateway outcomes, AI diagnosis (deterministic offline-safe engine), demo
  customer and payment data, and all money movement.

Try it: run the default **₹12,499 temporary decline** (usually recovers automatically), an
**₹85,000** payment (hits the approval gate — nothing executes until you approve it), and the
**fraud signal** scenario (escalated to the merchant with no automated customer contact).

## The problem

Failed payments are usually a dead-end status. Every "card declined" is revenue the merchant has
already earned and is about to lose. But the obvious fix — let an AI agent retry charges, email
customers, switch payment methods — is unsafe. A hallucinated recovery action on a real payment
rails system means charging the wrong customer, spamming fraud victims, or retrying into a decline
spiral.

## The solution

RecoverAI splits the problem in two:

- **AI does the reasoning.** It diagnoses *why* a payment failed and recommends one recovery action
  from a bounded catalog.
- **Application rules do the authorizing.** A deterministic policy engine — not the LLM — decides
  whether that recommendation is allowed to execute.

```
PAYMENT FAILURE → AI DIAGNOSIS → POLICY VALIDATION → RECOVERY ACTION → OUTCOME → AUDIT TRAIL → ANALYTICS
```

## Why RecoverAI

- **AI diagnosis** — every failure is classified and explained (temporary decline, insufficient
  funds, expired card, fraud risk, …) with a recommended action and confidence, in structured,
  schema-validated output.
- **Deterministic financial authorization** — a pure-function policy engine independently checks
  payment state, cooldowns, amount thresholds, risk ceilings, and duplicate execution before
  anything runs. Same inputs, same verdict, every time.
- **Human approval where it matters** — higher-risk and high-value actions don't run until a
  merchant approves them. One click in the work queue, fully logged.
- **Complete auditability** — every step (AI, policy, gateway, merchant) lands in an append-only
  audit trail, and the analytics quantify exactly how much revenue was at risk and recovered.

## The product

- **Overview** — what's at risk, what's been recovered, the 7-day trend, what needs your approval
  right now, and the guardrails currently in force.
- **Work Queue** — every open failure with its AI diagnosis, recommended action, confidence, and
  policy status. Gated actions can be approved or rejected inline.
- **Payment Detail** — the complete story of one payment: the customer history the AI weighed, the
  root cause, the policy verdict with its justification, gateway attempts, and the chronological
  audit trail.
- **Activity & Audit** — the append-only log of every decision the system has made.
- **Safety Model** — the two-layer architecture, the active AI provider, and the full bounded action
  catalog — the safety claims are inspectable, not marketing.

## The safety model

**Layer 1 — AI reasoning.** The provider (deterministic offline engine, Gemini, or DeepSeek behind a
single interface) receives the failure and customer context, and returns a structured diagnosis plus
one recommended action from a fixed catalog of eight. The output is validated against a schema;
anything malformed is rejected and replaced by the deterministic fallback.

**Layer 2 — deterministic policy.** Application code independently evaluates the recommendation:
payment state, failure category, retry cooldowns, amount thresholds (retries above ₹50,000 require
approval), fraud risk ceilings (no automated customer contact above 0.8), duplicate-execution
suppression, and per-action approval rules.

**The LLM never directly executes a financial action.** It cannot charge, email, or escalate — it
can only recommend, and a recommendation that fails policy is stopped with a reason. Actions above
the risk or value thresholds are held for a merchant decision — the human-in-the-loop gate — before
execution.

## Demo (60 seconds)

Run the strongest scenario end-to-end:

1. Click **Simulate Failed Payment** on the Overview. Defaults: **₹12,499 card decline**.
2. Watch the pipeline run live: gateway failure → **AI diagnoses Temporary Decline** → recommends
   **Delay And Retry** → **policy approves** (low risk, under threshold) → retry executes →
   **₹12,499 recovered**.
3. Open the payment's detail page — the audit trail records every step, actor, and justification.

Two contrasting paths are seeded and one click away:

- **High-value:** a ₹1,24,999 high-value failure → policy returns `NEEDS_APPROVAL` (above the
  ₹50,000 retry threshold) → nothing runs until the merchant approves it in the work queue.
- **Fraud:** a fraud-signal failure (₹49,999, gift-card pattern) → policy blocks all automated
  customer contact → the case is escalated to the merchant instead.

## Technical architecture

- **Next.js (App Router) + React + TypeScript**, Tailwind, Prisma, SQLite for the demo.
- **Gateway abstraction** — failures are ingested through a normalized event path
  (`POST /api/webhooks/razorpay` adapter included); charge outcomes come from a deterministic
  offline-safe simulator.
- **AI provider abstraction** — one interface over the deterministic offline engine, Gemini, and
  DeepSeek, with timeout/garbage/schema fallback to the offline engine. **AI output is treated as
  untrusted input** and schema-validated.
- **Pure-function policy engine** — every rule is testable and deterministic; the engine has no I/O.
- **Money is integer paise** end to end — no floats anywhere in the money path.
- **Append-only audit trail** — every decision by every actor is persisted and rendered in the UI.

`ARCHITECTURE.md` has the full system; `AI.md` covers prompts, schema, and fallback behavior.

## Real vs simulated

Stated plainly, for judge trust:

| Real (works with real credentials) | Simulated for the hackathon |
|---|---|
| Failure ingestion, normalization, audit, analytics | Gateway charge outcomes (deterministic simulator) |
| AI diagnosis via the provider abstraction (Gemini/DeepSeek) | Razorpay webhooks (adapter exists; signature verification stubbed) |
| Policy engine, approvals, action lifecycle, cooldowns | Customer responses to links/reminders (probability roll) |

No real money was recovered in this demo. The gateway boundary is where a production integration
would connect.

## Quick start

```bash
npm install     # dependencies
npm run setup   # migrate + deterministic seed (creates prisma/dev.db)
npm run dev     # dev server at http://localhost:3000
```

The demo runs **without any API keys** — the deterministic offline-safe engine handles diagnosis.
To use a real provider: copy `.env.example` → `.env`, set `AI_PROVIDER=gemini|deepseek` and the key.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server at :3000 |
| `npm run setup` | Migrate + seed deterministic demo data |
| `npm run db:reset` | Drop, migrate, reseed (reproducible) |
| `npm run db:seed` | Reseed only |
| `npm test` | Vitest suite (44 tests) |
| `npm run typecheck` / `npm run lint` | TypeScript / ESLint |
| `npm run build && npm start` | Production build + serve |

## Demo scenarios

1. **Temporary decline → automatic recovery.** ₹12,499 card decline diagnosed, policy-approved,
   retried, recovered, audited.
2. **High-value payment → human approval.** ₹1,24,999 failure requires a merchant decision before
   anything executes.
3. **Fraud risk → escalation.** Fraud signal blocks all automated customer contact; the case goes
   to the merchant.

## Testing

**44 tests** (`npm test`) covering failure ingestion and validation, AI structured-output parsing,
provider fallback (timeout / garbage / schema-invalid / HTTP errors), every policy rule in
isolation, the high-value approval gate, fraud-signal suppression, the full pipeline end-to-end,
and analytics math.

## Documentation

| Doc | Contents |
|---|---|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | System design and data model |
| [`AI.md`](AI.md) | Prompts, schema, provider fallback |
| [`DEMO.md`](DEMO.md) | Demo runs, API examples |
| [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md) | 5-minute demo walkthrough |
| [`DECISIONS.md`](DECISIONS.md) | Trade-offs and why |
| [`JUDGING.md`](JUDGING.md) | Track criteria mapping |
| [`HANDOFF.md`](HANDOFF.md) | Handoff notes |

## Known limitations

- Single demo merchant (schema is multi-merchant ready)
- No authentication (demo environment, by design)
- Webhook signature verification stubbed (documented at the route)
- Outcome simulation is deterministic pseudo-random, not a real gateway

## Why this matters

RecoverAI is not trying to replace payment infrastructure with an autonomous agent. It puts AI
where it is genuinely useful — diagnosing failures and recommending the next move — and keeps
authorization deterministic, bounded, and auditable. That is the version of "AI revenue recovery"
a merchant can actually say yes to: every action explainable after the fact, every high-stakes
decision held for a human, and every rupee of recovery measurable on the dashboard.
