# HANDOFF — for the next engineer/model

Status as of handoff: **submission-ready**. Full pipeline, dashboard, tests, docs all working.
Read `ARCHITECTURE.md` first, then this.

## Commands

```bash
npm run setup      # migrate + seed (deterministic)
npm run dev        # :3000
npm test           # 44 tests (vitest, isolated test.db via global-setup)
npm run typecheck && npm run lint && npm run build
npm run db:reset   # wipe + reseed identical data
```

## Architecture (current)

- Next.js 16 App Router, React 19, Tailwind 4, Prisma 6 + SQLite (`prisma/dev.db`), Zod 4.
- Engine (`src/lib/engine`) is framework-free and DB-driven:
  - `ingestion.ts` — the single failure funnel (seed/simulator/webhook all route through it) + `audit()` helper
  - `recovery-engine.ts` — pipeline orchestrator + `approveAndExecute` / `rejectAction` + `buildFailureContext`
  - `policy-engine.ts` — pure authorization function (the safety core)
  - `actions.ts` — bounded action catalog (risk/cooldown/threshold/efficacy per action)
  - `simulator.ts` — deterministic outcome execution (charge retry / engagement roll / escalation)
- AI (`src/lib/ai`): `resolveProvider()` + `analyzeWithFallback()`. mock/gemini/deepseek implement
  `AIProvider`. Prompt + defensive JSON extraction in `prompt.ts`. Zod contract in `types.ts`.
- Gateway adapter (`src/lib/gateway/payment-gateway.ts`): code→category map, `simulateCharge`,
  seeded RNG (`hashSeed`/`seededRandom`) used everywhere determinism matters.
- API routes under `src/app/api/**` (see ARCHITECTURE.md map). UI pages: `/`, `/opportunities`,
  `/payments/[id]`, `/activity`, `/safety`.

## Database

Schema in `prisma/schema.prisma`; seed in `prisma/seed.ts` (fixed payment ids `seedpayNNN` —
outcomes are deterministic functions of these ids; **don't rename them** or the recovery mix changes).
Status/category fields are Strings + Zod (no Prisma enums on SQLite; keeps Postgres portability).
Money is integer paise everywhere.

## Completed

- Full pipeline end-to-end: failure → AI → policy → action → outcome → audit → analytics
- Human-in-the-loop approval gates (dashboard inline + API)
- Fraud guard rails (policy blocks customer contact, escalation only)
- Demo simulator (modal with scenario picker) + webhook entry point
- Analytics all computed from DB; deterministic seed (~33 payments, 19 failures, all 10 categories)
- 44 tests green; typecheck/lint/build clean; all pages browser-verified

## Known bugs / sharp edges

- `/payments/nonexistent` renders the not-found UI but streams with HTTP 200 (Next streaming
  behavior; cosmetic).
- `runRecoveryPipeline` re-run on a still-FAILED payment creates a new analysis+action each time
  (policy correctly rejects duplicates via cooldown/already-executed, but rows accumulate). A
  `PENDING`-state dedup guard would be the fix.
- Approval-banner copy, opportunity table, audit timeline have no pagination (fine at demo scale;
  audit page capped at 200 entries).
- Webhook HMAC verification is documented-but-stubbed (see route).

## Recommended next 10 improvements

1. Dedup guard for concurrent pipeline runs on one payment (unique partial index or status check).
2. Real Razorpay webhook signature verification (HMAC-SHA256 over raw body) + `payment.captured`
   events marking payments recovered externally.
3. Postgres migration path: change provider/URL, run `migrate dev`, verify JSON `data` column
   handling (it's a String of JSON — fine on both).
4. Job queue (BullMQ/pg-boss) for `DELAY_AND_RETRY` scheduled execution — currently the delay is
   simulated synchronously; the catalog carries the cooldown data already.
5. Razorpay Payment Link / SMS-email adapter behind `simulator.ts`'s interfaces (send real links).
6. Authn/authz (NextAuth) + merchant scoping middleware on `/api`.
7. Seed the AI analysis cache: reuse recent analyses for identical failure signatures to cut cost.
8. Confidence calibration report: compare AI `estimatedRecoveryProbability` vs realized outcomes.
9. Pagination + server-side filters on opportunities/audit.
10. E2E test (Playwright) covering the simulate → approve → analytics flow in a real browser.

## Do NOT refactor these without strong reason

- `policy-engine.ts` evaluate() shape — tests + safety story depend on its purity.
- Seed payment ids (`seedpayNNN`) — determinism of the demo dataset depends on them.
- The String+Zod pattern for status fields — it's deliberate (SQLite enums / Postgres portability).
- Money-as-paise integers.
- The two-layer "LLM recommends / rules authorize" split — it's the product's core claim.

## Demo instructions

`DEMO.md` (flows A–D) and `DEMO_SCRIPT.md` (timed 5-minute video script). Reset with
`npm run db:reset` before recording.
