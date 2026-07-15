import type { PrismaClient } from '@prisma/client'

// Orders are kept for this many days, then deleted automatically.
// Staff can export CSV from the orders page before the window passes.
export const RETENTION_DAYS = 7

const THROTTLE_MS = 6 * 60 * 60 * 1000
let lastSweep = 0

export function retentionCutoff(now = new Date()): Date {
  return new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
}

/** Delete orders older than the retention window. Returns deleted count. */
export async function sweepExpiredOrders(prisma: PrismaClient): Promise<number> {
  const result = await prisma.order.deleteMany({
    where: { createdAt: { lt: retentionCutoff() } },
  })
  return result.count
}

/**
 * Opportunistic sweep for request paths (e.g. the staff orders list): runs at
 * most once per instance per THROTTLE_MS so day-to-day use keeps the table
 * trimmed even if the scheduled cron is not configured. Never throws.
 */
export async function sweepExpiredOrdersThrottled(prisma: PrismaClient): Promise<void> {
  const now = Date.now()
  if (now - lastSweep < THROTTLE_MS) return
  lastSweep = now
  try {
    await sweepExpiredOrders(prisma)
  } catch {
    // best-effort; the cron endpoint is the reliable path
  }
}
