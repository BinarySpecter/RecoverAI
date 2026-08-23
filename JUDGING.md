# Judging Mapping

How RecoverAI addresses the dimensions hackathon judges typically weigh. These are our own
mappings to the challenge theme — not claims about official criteria.

## Problem relevance
Payment failures are silent revenue leakage for every merchant on a gateway: a large share of
failures are recoverable (soft declines, transient network, abandoned checkouts, saved-card
expiry), yet the default UX is a dead-end "failed" status and maybe one generic retry. RecoverAI
converts failures into a systematic recovery pipeline with measurable ROI: revenue at risk,
revenue recovered, recovery rate — computed from real state, not vanity metrics.

## AI usage (meaningful, not a wrapper)
The LLM performs genuine domain reasoning: fusing payment context, customer history, failure
signals, and merchant-level recovery patterns into a structured diagnosis with a recommended
action and calibrated probabilities. Crucially it is **part of a governed workflow** — schema-
validated output, a deterministic policy layer, human approval gates, and full audit — the
architecture fintech AI actually requires, not "prompt → prose".

## Technical execution
- Two-layer decision system: AI recommendation + pure-function policy authorization
- Provider abstraction (mock/gemini/deepseek) with graceful degradation to a deterministic engine
- Complete audit trail on every step; analytics derived entirely from the database
- 44 meaningful tests: policy rules, AI parsing/fallback, pipeline, analytics, validation
- Clean typed codebase: TypeScript strict, Zod at every boundary, no `any` in domain logic

## Business impact
Direct revenue protection with clear unit economics: recovery rate × failed volume = saved
revenue, visible on the dashboard. Subscription renewal failures (churn prevention) and
high-value approvals get special handling — the highest-value cases get the most care.

## UX
A command center a payments ops person would recognise: scannable KPIs, actionable opportunity
table with inline approve/reject, payment detail that tells the whole story (diagnosis → policy →
action → outcome → audit), one-click live simulation, polished empty/loading/error states,
responsive layout. No chart-library defaults, no lorem ipsum.

## Safety
- LLM cannot execute, mint actions, or bypass policy (structurally impossible, not prompted)
- Fraud signals hard-block all customer contact; escalation instead
- Amount-based human-in-the-loop gates; cooldowns; duplicate suppression; effort caps
- AI output treated as untrusted input; server-only secrets; safe error messages
- Append-only audit with actor attribution (GATEWAY / AI:provider / POLICY / MERCHANT / SYSTEM)

## Scalability
- Engine is Next.js-free — lifts to a worker/queue service unchanged for async recovery at scale
- Multi-merchant ready (every query scoped by merchantId)
- SQLite → PostgreSQL is a config change; the schema is portable by construction
- AI providers swappable per env; mock engine keeps the system functional at zero marginal cost
