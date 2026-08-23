# Demo Guide

## Setup (2 minutes, once)

```bash
npm install
npm run setup     # migrate + deterministic seed
npm run dev       # → http://localhost:3000
```

The dashboard is immediately populated: ~33 payments, 19 failures across all 10 categories,
9 already recovered, 2 awaiting merchant approval, 2 fraud escalations, 74 audit entries.

## Demo flow A — the one-click pipeline (core demo)

1. **Overview** — point at Revenue at Risk / Recovered / Recovery Rate. "Every number here is
   computed from the database; nothing is mocked in the UI."
2. Click **Simulate Failed Payment** (top right). Defaults: ₹12,499 card decline for Rahul Sharma
   (8 successful payments, active subscription).
3. Click **Run failure → recovery → outcome**. The modal shows the pipeline inline:
   `diagnosis → DELAY_AND_RETRY`, `policy → APPROVED`, `outcome → RECOVERED/FAILED`.
4. Click **View payment detail →** — walk the page top to bottom: AI diagnosis (root cause,
   confidence, reasoning, customer context), policy validation with justification, action history,
   gateway attempts, audit trail with per-second timestamps.
5. Back on **Overview** — the KPIs and trend updated.

## Demo flow B — the safety story (human-in-the-loop)

1. Simulate a failure with amount **₹75,000**, scenario *Temporary card decline*.
   → Policy returns `NEEDS_APPROVAL` (above the ₹50,000 retry threshold).
2. Overview shows the approval banner + queue entry: "AI recommends delay and retry — merchant
   sign-off required."
3. Click **Approve & execute** → the action runs, outcome recorded, audit trail gains
   `recovery.approved` (actor: MERCHANT) and the execution entry.
   (Or **Reject** → action closed, payment stays failed, decision audited.)

## Demo flow C — fraud guard rails

1. Simulate *Potential fraud signal* for **Mohit Bhandari** (risk score 0.85).
2. The AI escalates (`ESCALATE_TO_MERCHANT`) and the policy **rejects all customer contact** —
   show the payment detail: "Policy rejected — fraud signals never trigger automated recovery."
   Only one gateway attempt exists: the system never re-charged.

## Demo flow D — offline resilience

- With `AI_PROVIDER=mock` (default): everything above works with zero network.
- With `AI_PROVIDER=gemini` but **no key**: the Safety page shows the provider degraded to the
  deterministic engine, and the workflow is unchanged. Kill the network mid-demo — same result.

## Reproducibility

`npm run db:reset` reseeds identical data (fixed ids + deterministic providers/simulators).
Simulated outcomes are seeded from payment ids, so the same scenario replays the same way.

## API (for judges who read code or curl)

```bash
# full pipeline on a random realistic failure
curl -X POST localhost:3000/api/payments/simulate-failure -H 'content-type: application/json' -d '{}'

# the spec's flagship scenario, exactly
curl -X POST localhost:3000/api/payments/simulate-failure -H 'content-type: application/json' \
  -d '{"amount":1249900,"method":"CARD","failureCategory":"TEMPORARY_DECLINE","customerEmail":"rahul.sharma@gmail.com"}'

# webhook entry point (where real Razorpay events plug in)
curl -X POST localhost:3000/api/webhooks/razorpay -H 'content-type: application/json' \
  -d '{"event":"payment.failed","payload":{"orderId":"order_x","status":"FAILED","gatewayCode":"card_expired"}}'

curl localhost:3000/api/analytics | jq .data.metrics.recoveryRate
curl localhost:3000/api/recovery/opportunities | jq '.data | length'
curl "localhost:3000/api/audit?take=5" | jq '.data[].message'
```
