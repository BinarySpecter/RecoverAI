import { hashSeed, seededRandom } from "@/lib/gateway/payment-gateway"
import type { FailureCategory } from "@/lib/types"

/**
 * GROUND-TRUTH OUTCOME MODEL for the Recovery Lab evaluation.
 *
 * These probabilities model "issuer/network reality" — what actually happens
 * when an intervention is attempted. They are deliberately NOT the efficacy
 * constants that the decision layer (AI diagnosis + policy engine) uses, so
 * the evaluation cannot be circular: the decision machinery reasons with its
 * own estimates, and the outcome machinery resolves with independent ground
 * truth. If they agreed by construction, the evaluation would measure nothing.
 *
 * The randomness is keyed by (payment id + intervention rail + ordinal), NOT
 * by strategy — so every strategy replays the SAME world: a payment whose
 * first charge draw is a success succeeds for any strategy that attempts it.
 */

export const GROUND_TRUTH_RETRY: Record<FailureCategory, number> = {
  TEMPORARY_DECLINE: 0.44, // soft declines often clear
  INSUFFICIENT_FUNDS: 0.2, // funds usually not restored within retry window
  EXPIRED_CARD: 0, // structurally impossible
  NETWORK_FAILURE: 0.68, // transient gateway failure clears fast
  AUTHENTICATION_FAILURE: 0, // cannot succeed without the customer
  ABANDONED_CHECKOUT: 0, // no charge attempt can complete a dropped cart
  REPEATED_FAILURES: 0.07, // instrument itself is the problem
  HIGH_VALUE_FAILURE: 0.36,
  SUBSCRIPTION_RENEWAL_FAILURE: 0.48,
  FRAUD_RISK: 0, // fraud charges must never complete
}

export const GROUND_TRUTH_ENGAGE: Record<FailureCategory, number> = {
  TEMPORARY_DECLINE: 0.34,
  INSUFFICIENT_FUNDS: 0.41, // customer retries once balance returns
  EXPIRED_CARD: 0.36, // customer swaps instrument
  NETWORK_FAILURE: 0.28,
  AUTHENTICATION_FAILURE: 0.54, // customer completes 3DS
  ABANDONED_CHECKOUT: 0.46, // payment link converts drop-offs
  REPEATED_FAILURES: 0.32,
  HIGH_VALUE_FAILURE: 0.42,
  SUBSCRIPTION_RENEWAL_FAILURE: 0.5, // proactive touch protects renewals
  FRAUD_RISK: 0.02, // near-zero: fraud flags rarely convert legitimately
}

export type InterventionRail = "charge" | "engage"

/** Shared world draw: same payment + rail + ordinal → same random, every strategy. */
export function worldDraw(paymentId: string, rail: InterventionRail, ordinal: number): number {
  return seededRandom(hashSeed(`${paymentId}:${rail}:${ordinal}:outcome`))()
}

/** Attempt penalty mirrors real issuer behaviour: odds erode with each failure. */
export function attemptPenalty(priorFailures: number): number {
  return 0.12 * Math.max(0, priorFailures - 1)
}

export function retryGroundTruth(category: FailureCategory): number {
  return GROUND_TRUTH_RETRY[category] ?? 0
}

export function engageGroundTruth(category: FailureCategory): number {
  return GROUND_TRUTH_ENGAGE[category] ?? 0
}

/** Apply customer-quality uplift the same way the gateway does. */
export function qualityAdjusted(probability: number, customerQuality: number): number {
  return Math.max(0.02, Math.min(0.95, probability + 0.2 * customerQuality))
}