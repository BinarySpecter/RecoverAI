# AI Architecture

## Design principle

The AI is a **diagnostic advisor inside a governed workflow**, not an autonomous agent. It sees a
rich failure context, returns one schema-validated diagnosis with a recommended action, and has
zero ability to execute anything. Execution authority lives in the deterministic policy engine
(`src/lib/engine/policy-engine.ts`).

**LLM recommends. Application rules authorize.**

## Provider abstraction

```
src/lib/ai/
├── provider.ts    # AIProvider interface — the only seam business code sees
├── mock.ts        # deterministic rules engine (default + universal fallback)
├── gemini.ts      # Google Gemini (REST, JSON mode)
├── deepseek.ts    # DeepSeek (OpenAI-compatible, json_object)
├── prompt.ts      # shared prompt construction + defensive JSON extraction
└── index.ts       # resolveProvider() + analyzeWithFallback()
```

Selection is env-driven (`AI_PROVIDER=mock|gemini|deepseek`). Swapping providers touches exactly
one file; the rest of the system is provider-agnostic.

## The structured-output contract

Every provider must return a single JSON object validated by `AIAnalysisResultSchema` (Zod):

```json
{
  "failureCategory": "TEMPORARY_DECLINE",       // from a fixed vocabulary of 10
  "rootCause": "Issuer returned a soft decline…",
  "confidence": 0.87,                            // [0,1]
  "severity": "high",                            // low|medium|high|critical
  "recommendedAction": "DELAY_AND_RETRY",        // from a fixed vocabulary of 8
  "reasoning": "…",
  "customerContext": "…",
  "estimatedRecoveryProbability": 0.72           // [0,1]
}
```

AI output is **untrusted input**: JSON is extracted defensively (markdown fences, surrounding
chatter), then Zod-validated. Invalid category, invented action, or out-of-range confidence all
throw and trigger the fallback — never propagate.

## The context given to the AI (`FailureContext`)

Payment (amount, method, retry count, order), customer history (success/fail counts, LTV, AOV,
subscription, risk score), the normalized failure + raw gateway code + attempt number, and the
merchant's historical recovery pattern for this failure type (times seen / recovered / best action).
No free-form merchant data — bounded, structured context only.

## Deterministic fallback (`MockProvider`)

A transparent rules engine encoding the same domain knowledge the prompt teaches LLMs:

- A diagnosis matrix per failure category (root cause, reasoning, base confidence/recovery, severity)
- Context-sensitive overrides (e.g. 3+ soft-decline retries → switch to payment link)
- Customer-quality scoring (success rate + LTV + subscription − risk score) modulating probabilities

Triggered on: missing API key, timeout (`AI_TIMEOUT_MS`), HTTP 401/429/5xx, empty response,
malformed JSON, schema-invalid output. The analysis is marked `usedFallback` and audited at `warn`
level — degradation is visible, never silent. **The live demo runs entirely on this engine.**

## Observability

Every analysis persists: provider, model, latency, structured output, raw output, fallback flag,
confidence — plus an audit entry (`ai.analysis.completed`) linked to the payment. The payment detail
page renders the full decision trail: input context → diagnosis → policy verdict → action → outcome.

## What the AI is not allowed to do

- Invent actions outside the 8-action catalog (schema-enforced)
- Execute anything (policy engine authorizes)
- Contact customers on fraud signals (hard policy rule)
- Bypass cooldowns, amount thresholds, or the effort cap (deterministic checks)
- See other merchants' data (context is scoped per merchant)
