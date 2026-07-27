import type { Prisma } from '@prisma/client'

// Order numbers shown to customers and staff restart at 1 each day. A "day"
// is the Asia/Bangkok calendar day (UTC+7, no DST). The number is claimed when
// the order is created and stored on the row, so it never moves afterwards —
// deleting an order leaves a gap rather than renumbering the ones behind it.
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000

// UTC instant of the most recent Bangkok midnight at or before `at`.
export function bangkokDayStart(at: Date = new Date()): Date {
  const shifted = new Date(at.getTime() + BKK_OFFSET_MS)
  shifted.setUTCHours(0, 0, 0, 0)
  return new Date(shifted.getTime() - BKK_OFFSET_MS)
}

// YYYY-MM-DD label of the Bangkok day containing `at`.
export function bangkokDayKey(at: Date): string {
  return new Date(at.getTime() + BKK_OFFSET_MS).toISOString().slice(0, 10)
}

/**
 * Claim the next number for today. Must run inside the same transaction as the
 * order insert: the counter row stays locked until commit, so concurrent tills
 * queue up instead of both reading the same value, and a rolled-back order
 * gives its number back.
 */
export async function reserveDailyNumber(
  tx: Prisma.TransactionClient,
  at: Date = new Date(),
): Promise<{ dayKey: string; dailyNumber: number }> {
  const dayKey = bangkokDayKey(at)
  const rows = await tx.$queryRaw<{ next: number }[]>`
    INSERT INTO "DailyCounter" ("dayKey", "next") VALUES (${dayKey}, 1)
    ON CONFLICT ("dayKey") DO UPDATE SET "next" = "DailyCounter"."next" + 1
    RETURNING "next"
  `
  return { dayKey, dailyNumber: rows[0].next }
}
