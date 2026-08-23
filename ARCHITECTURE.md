# RecoverAI — Architecture

**AI Revenue Recovery Command Center** for the Razorpay AI Buildathon (AI Revenue Recovery track).

## Problem

When payments fail, merchants lose revenue silently. A failed payment is usually shown as a dead-end
status. In reality, most failures are recoverable: temporary issuer declines, insufficient funds at
the wrong moment, expired cards, network blips, abandoned checkouts. Recovery today is manual,
generic (blast a reminder to everyone), and unmeasured.

RecoverAI turns every failure into a **diagnosed, policy-checked, executed, and audited recovery
workflow** — and shows the merchant exactly how much revenue was saved.

## Core Workflow

```
PAYMENT EVENT (webhook / simulated)
        │
        ▼
FAILURE INGESTION  ── normalize gateway code → failure category
        │
        ▼
AI DIAGNOSIS (provider-abstracted, structured JSON, schema-validated)
   failureCategory · rootCause · confidence · severity · recommendedAction · reasoning
        │
        ▼
DETERMINISTIC POLICY ENGINE          ← "LLM recommends. Application rules authorize."
   eligibility · cooldowns · risk caps · duplicate suppression · human-approval gates
        │
        ├── needs approval ──→ PENDING_APPROVAL ──→ merchant Approve/Reject (dashboard)
        │
        ▼
RECOVERY ACTION (bounded set, simulated via gateway adapter)
   retry · payment link · alternate method · reminder · delay · escalate · none
        │
        ▼
OUTCOME + AUDIT LOG (every step recorded: input context, provider, confidence, policy decision)
        │
        ▼
ANALYTICS (revenue at risk, recovered, recovery rate, category breakdown, trend)
```

## Stack

| Layer      | Choice                          | Why                                                                 |
|------------|---------------------------------|----------------------------------------------------------------------|
| Frontend   | Next.js 16 App Router, React 19, Tailwind CSS 4 | One repo, one deploy, SSR dashboards, fast demo setup |
| Backend    | Next.js Route Handlers (Node runtime) | No extra service to run; same types as frontend                |
| Database   | SQLite via Prisma ORM           | Zero-setup for judges; swap `provider` to `postgresql` in one line for prod (schema is portable) |
| Validation | Zod                             | API input validation **and** AI output validation (AI = untrusted input) |
| AI         | Provider abstraction            | `MockProvider` (deterministic, always available) · `GeminiProvider` · `DeepSeekProvider` |
| Tests      | Vitest                          | Fast, TS-native                                                      |

## Key Architectural Decisions

1. **LLM recommends. Application rules authorize.** The AI produces a *diagnosis and recommendation*.
   The deterministic `policyEngine` independently validates whether the action is permitted
   (cooldowns, amount caps, duplicate actions, risk gates, approval requirements). The LLM can
   never execute a financial action directly or invent an unbudgeted one.
2. **Bounded action set.** Recovery actions come from an enum defined in code with eligibility
   rules, risk levels, cooldowns, and estimated recovery probabilities. The LLM maps a situation
   onto this set; it cannot create new actions.
3. **Graceful AI degradation.** Every AI call goes through `analyzePaymentFailure()` with schema
   validation, timeouts, and a deterministic rules-based fallback engine. The full workflow works
   with zero external API keys — critical for the live demo.
4. **Single SQLite file.** The demo must run in minutes anywhere. The Prisma schema is kept
   PostgreSQL-portable (no SQLite-only types).
5. **Razorpay behind an adapter.** `paymentGateway.ts` simulates Razorpay-style events/codes.
   A real integration = implement the same interface with Razorpay SDK + webhook signature
   verification; `POST /api/webhooks/razorpay` is the designated connection point.

## Module Map

```
src/
├── app/
│   ├── page.tsx                  # Dashboard overview
│   ├── payments/[id]/page.tsx    # Payment detail + audit timeline
│   ├── activity/page.tsx         # Full audit log
│   ├── settings/page.tsx         # Provider status + demo tools
│   └── api/
│       ├── payments/             # GET list, POST simulate-failure
│       ├── payments/[id]/        # GET detail, POST analyze, POST recover
│       ├── recovery/opportunities/
│       ├── recovery/[id]/approve · reject
│       ├── analytics/ · audit/
│       └── webhooks/razorpay/    # designated real-webhook entry point
├── components/                   # Dashboard UI (cards, tables, charts, badges)
├── lib/
│   ├── db.ts                     # Prisma singleton
│   ├── types.ts                  # Domain types (FailureCategory, RecoveryActionType, ...)
│   ├── ai/                       # provider.ts (interface) · mock.ts · gemini.ts · deepseek.ts · index.ts
│   ├── engine/
│   │   ├── ingestion.ts          # event → normalized failure
│   │   ├── recovery-engine.ts    # orchestrates the full pipeline
│   │   ├── policy-engine.ts      # deterministic authorization
│   │   ├── actions.ts            # bounded action definitions
│   │   └── simulator.ts          # deterministic outcome simulation
│   ├── gateway/payment-gateway.ts # simulated Razorpay adapter
│   └── analytics.ts              # dashboard metrics
prisma/
├── schema.prisma
└── seed.ts                       # deterministic synthetic dataset
tests/                            # vitest suites per engine component
```

## Database Schema (summary)

- `Merchant` — demo merchant (single-tenant demo, multi-merchant ready)
- `Customer` — payment history aggregates that feed the AI context
- `Payment` / `PaymentAttempt` — amounts, method, status, gateway refs, retry counts
- `FailureEvent` — normalized failure categories + raw gateway codes
- `AIAnalysis` — provider, latency, raw+validated output, fallback flag
- `RecoveryAction` — recommended action, policy decision, approval state, outcome
- `AuditLog` — append-only trail of every pipeline step

## AI Design

Structured JSON in/out, validated by Zod (`AIAnalysisSchema`). Providers implement:

```ts
interface AIProvider {
  name: string
  analyzePaymentFailure(ctx: FailureContext): Promise<AIProviderResult>
}
```

Selection via `AI_PROVIDER` env (`mock` | `gemini` | `deepseek`). Timeout, malformed JSON, rate
limits, and missing keys all fall back to `MockProvider` — a transparent, deterministic
rules engine that classifies failures and recommends actions with confidence scores.

## Safety Model

- Server-side only AI + gateway secrets (never shipped to the browser)
- Zod validation on all API inputs and AI outputs
- Amount-based approval gates (high-value actions require explicit merchant approval)
- Per-action cooldowns and duplicate suppression prevent customer harassment
- Append-only audit log; every AI decision is traceable to input context + provider + output
- Safe error messages (no stack traces or provider keys leaked to clients)
