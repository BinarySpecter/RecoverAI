# RecoverAI — AI Revenue Recovery Command Center

**Razorpay AI Buildathon · AI Revenue Recovery track**

Failed payments are usually a dead-end status. RecoverAI turns every failure into a **diagnosed,
policy-checked, executed, and audited recovery workflow** — and shows the merchant exactly how much
revenue was at risk and how much was saved.

```
PAYMENT EVENT → FAILURE → AI DIAGNOSIS → POLICY VALIDATION → RECOVERY ACTION → OUTCOME → AUDIT → ANALYTICS
```

**The core safety guarantee: the LLM recommends. Application rules authorize.** The AI never executes
a financial action directly — a deterministic policy engine validates every recommendation against
bounded rules (cooldowns, amount thresholds, fraud ceilings, duplicate suppression) before anything runs.

## Quick start

```bash
npm install
npm run setup        # migrate + deterministic seed (creates prisma/dev.db)
npm run dev          # http://localhost:3000
```

No API keys required — the app runs fully offline on the deterministic AI engine. To use a real
LLM provider, copy `.env.example` → `.env` and set `AI_PROVIDER=gemini|deepseek` with the key.

### All commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server at :3000 |
| `npm run setup` | Migrate + seed deterministic demo data |
| `npm run db:reset` | Drop, migrate, reseed (reproducible) |
| `npm run db:seed` | Reseed only |
| `npm test` | Vitest suite (44 tests) |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |
| `npm run build && npm start` | Production build + serve |

## The 60-second tour

1. **Overview** — revenue at risk / recovered / recovery rate, 7-day trend, failure categories, approval queue, audit stream.
2. **Simulate Failed Payment** (top-right) — pick amount, method, scenario, customer → the full pipeline runs live: gateway failure → AI diagnosis → policy verdict → action → outcome. High-value amounts (₹50,000+) demonstrate the human-approval gate.
3. **Opportunities** — every open failure with its AI diagnosis, recommended action, confidence, and policy status. Approve/reject gated actions inline.
4. **Payment detail** — the complete story: customer history the AI weighed, root cause, reasoning, policy decision with justification, action history, gateway attempts, and the chronological audit trail.
5. **Activity & Audit** — append-only log of every decision (AI, policy, gateway, merchant).
6. **Safety Model** — the two-layer architecture, active provider status, and the full bounded action catalog.

## What's real vs simulated

| Real (would work with real credentials) | Simulated for the demo |
|---|---|
| Failure ingestion, normalization, audit trail, analytics | Payment gateway charge outcomes (deterministic simulator) |
| AI diagnosis via provider abstraction (Gemini/DeepSeek) | Razorpay webhooks (adapter + `POST /api/webhooks/razorpay` ready; no signature verification in demo mode) |
| Policy engine, approvals, action lifecycle | Customer responses to links/reminders (probability roll) |

See `AI.md` for the AI architecture, `DEMO.md` for demo runs, `ARCHITECTURE.md` for the system,
`DECISIONS.md` for trade-offs, `DEMO_SCRIPT.md` for the 5-minute video.

## Environment variables

All optional except `DATABASE_URL` (defaults to local SQLite):

```
DATABASE_URL=file:./dev.db     # swap to postgresql://… for Postgres
AI_PROVIDER=mock               # mock | gemini | deepseek
GEMINI_API_KEY= / DEEPSEEK_API_KEY=
AI_TIMEOUT_MS=8000
RAZORPAY_KEY_ID= / RAZORPAY_KEY_SECRET= / RAZORPAY_WEBHOOK_SECRET=
```

## Testing

44 tests cover failure ingestion, AI structured-output parsing, provider fallback (timeout / garbage /
schema-invalid / HTTP errors), every policy rule, the high-risk approval gate, the full pipeline,
analytics math, and input validation. `npm test`.

## Known limitations

- Single demo merchant (schema is multi-merchant ready)
- No auth (demo environment by design)
- Outcome simulation is deterministic pseudo-random, not a real gateway
- Webhook signature verification stubbed (documented at the route)
