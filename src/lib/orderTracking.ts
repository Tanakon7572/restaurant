import { bangkokDayKey } from './orderNumber'

/**
 * Should the customer's device still be showing this order?
 *
 * Paying ends it. The kitchen's `completed` only means the food went out, so
 * a device left on that screen sits there for good — the shop uses one
 * permanent QR, and the next person to scan it would land on someone else's
 * receipt.
 *
 * The day check is the safety net for orders that never reach a bill: voided,
 * cancelled, or simply forgotten. Yesterday's order is never the one in front
 * of you.
 */
export function stillTracking(
  order: { paid?: boolean; createdAt?: string | null },
  now: Date = new Date(),
): boolean {
  if (order.paid) return false
  if (order.createdAt && bangkokDayKey(new Date(order.createdAt)) !== bangkokDayKey(now)) return false
  return true
}
