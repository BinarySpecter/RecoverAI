/**
 * Per-payment in-process mutex.
 *
 * A webhook redelivery or a double-click can fire the recovery pipeline for
 * the same payment concurrently. Without serialization, two racing requests
 * can both pass the "is this payment FAILED?" check and each create their own
 * analysis + action rows. This lock chains work per payment so exactly one
 * pipeline runs at a time; callers re-check state after acquiring it.
 *
 * Node/Next run one event loop per process, so an in-memory promise chain is
 * sufficient for a single instance. Multi-instance deployments would back
 * this with a distributed lock (Redis) or database-level guards.
 */

const locks = new Map<string, Promise<void>>()

export function withPaymentLock<T>(paymentId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(paymentId) ?? Promise.resolve()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  // New callers wait on `chain`, which resolves only when this holder releases.
  const chain = prev.then(() => gate)
  locks.set(paymentId, chain)
  // `fn` runs once the previous holder released (prev resolved); the lock is
  // held until fn settles, at which point the gate opens for the next caller.
  return prev.then(fn).finally(() => {
    release()
    if (locks.get(paymentId) === chain) locks.delete(paymentId)
  })
}