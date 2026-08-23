# 5-Minute Demo Script

Recorded against a freshly seeded database (`npm run db:reset`). Timings are targets, not straitjackets.

---

### 0:00–0:30 — The problem

> "When a payment fails, most merchants see a dead-end status. But most failures are recoverable —
> soft declines, network blips, expired saved cards, abandoned checkouts. Today that recovery is
> manual, generic, and unmeasured. This is RecoverAI — an AI revenue recovery command center."

*Screen: Overview dashboard, populated KPIs.*

### 0:30–1:00 — Introduce RecoverAI

> "Every number here is real database state: ₹X lakh at risk, ₹Y recovered, a Z% recovery rate,
> seven-day trend, failure categories. And this banner — an action is waiting for my approval.
> Keep that in mind."

*Point at: Revenue at Risk, Recovery Rate, the approval banner.*

### 1:00–2:30 — Live failed-payment scenario

> "Let's make a payment fail right now."

- Click **Simulate Failed Payment** → defaults: ₹12,499, card decline, Rahul Sharma
  (8 successful payments, active subscription).
- **Run failure → recovery → outcome.**

> "The full pipeline just ran: gateway failure → AI diagnosis → policy validation → recovery
> action → outcome — in about a second."

- Click **View payment detail →**.
- Walk the page: **AI diagnosis** — "temporary issuer decline, confidence 0.84, and look at the
  reasoning — it weighed his 8 successful payments and active subscription. Recommended:
  delayed automatic retry, 81% estimated recovery." Then **Policy**: "approved, eligible, under
  threshold." Then the **audit trail** — every step, timestamped to the second, attributed to
  GATEWAY, AI, POLICY, or SYSTEM.

### 2:30–3:30 — AI diagnosis + policy + human approval

> "Now the part that matters for real money. Same scenario, but ₹75,000."

- Simulate ₹75,000 temporary decline → `policy → NEEDS_APPROVAL`.
- Overview → approval queue: "The AI recommends a delayed retry. The policy engine refuses to run
  it without me — above the ₹50,000 threshold."

> "The LLM recommends. Application rules authorize. And for high-value actions, I authorize."

- Click **Approve & execute** → outcome lands, audit gains `recovery.approved` (MERCHANT).

- Simulate *fraud signal* for the high-risk customer (Mohit, risk 0.85):
  "Fraud flag → the AI escalates and policy **blocks every customer-facing action**. A
  'recovered' fraudulent charge is just a future chargeback."

### 3:30–4:15 — Recovery analytics

- Back to **Overview**: KPIs moved; trend/category charts updated.
- **Opportunities** page: the live worklist — every open failure, its diagnosis, recommended
  action, confidence, policy status; approve/reject inline.
- **Activity & Audit**: "append-only, every decision this system has made."

### 4:15–4:45 — Architecture & AI safety

> "Three layers under this: a provider-abstracted AI — Gemini, DeepSeek, or a deterministic
  engine — returning schema-validated JSON. Every failure mode degrades to that engine, so the
  demo you just watched runs with zero external APIs. Then the deterministic policy layer —
  cooldowns, thresholds, fraud ceilings — then execution against a gateway adapter where real
  Razorpay webhooks plug in. Show the Safety Model page: the full bounded action catalog the AI
  cannot leave."

### 4:45–5:00 — Business impact + close

> "Failed payments are a permanent tax on every merchant. RecoverAI turns them into a measured,
  governed recovery pipeline — the AI does the diagnosis, the rules keep it safe, and the
  dashboard proves the money saved. RecoverAI — revenue you stopped losing."

---

## Backup answers for likely questions

- **"Is the AI doing anything?"** — Diagnosis + action selection + probability calibration over
  fused context (payment, customer history, merchant patterns). The mock engine is the offline
  fallback; flip `AI_PROVIDER=gemini` with a key to see identical schema-validated output from Gemini.
- **"What if the LLM hallucinates?"** — Zod rejects anything outside the vocabularies → fallback.
  Even valid output is only ever a *recommendation*.
- **"Where does Razorpay connect?"** — `POST /api/webhooks/razorpay` (signature-verified in prod)
  → same ingestion → same pipeline. Charge retries go through the gateway adapter.
- **"Why is a retry sometimes rejected?"** — Show the cooldown/duplicate policy reasons on a
  re-run; that's the customer-experience protection working.
