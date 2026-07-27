import { it, expect, vi } from 'vitest'
import type { Prisma } from '@prisma/client'
import { bangkokDayKey, bangkokDayStart, reserveDailyNumber } from './orderNumber'

it('assigns orders to the Bangkok day across the UTC-evening boundary', () => {
  // 16:30Z = 23:30 Bangkok (still the 21st); 17:30Z = 00:30 Bangkok (the 22nd)
  expect(bangkokDayKey(new Date('2026-07-21T16:30:00Z'))).toBe('2026-07-21')
  expect(bangkokDayKey(new Date('2026-07-21T17:30:00Z'))).toBe('2026-07-22')
})

it('bangkokDayStart returns the UTC instant of local midnight', () => {
  const start = bangkokDayStart(new Date('2026-07-21T18:00:00Z')) // 01:00 BKK, 22nd
  expect(start.toISOString()).toBe('2026-07-21T17:00:00.000Z')    // 00:00 BKK, 22nd
})

function fakeTx(next: number) {
  const queryRaw = vi.fn().mockResolvedValue([{ next }])
  return { tx: { $queryRaw: queryRaw } as unknown as Prisma.TransactionClient, queryRaw }
}

it('claims the number the counter hands back', async () => {
  const { tx } = fakeTx(5)
  const claimed = await reserveDailyNumber(tx, new Date('2026-07-21T04:00:00Z'))
  expect(claimed).toEqual({ dayKey: '2026-07-21', dailyNumber: 5 })
})

it('files an order opened after midnight UTC under the Bangkok day it belongs to', async () => {
  const { tx, queryRaw } = fakeTx(1)
  // 19:00Z on the 21st is 02:00 on the 22nd in Bangkok — a late-night order
  // must start the new day's sequence, not extend the previous one.
  const claimed = await reserveDailyNumber(tx, new Date('2026-07-21T19:00:00Z'))
  expect(claimed.dayKey).toBe('2026-07-22')
  expect(queryRaw.mock.calls[0][1]).toBe('2026-07-22')
})

it('increments in one statement so concurrent tills cannot share a number', async () => {
  const { tx, queryRaw } = fakeTx(2)
  await reserveDailyNumber(tx, new Date('2026-07-21T04:00:00Z'))
  const sql = (queryRaw.mock.calls[0][0] as string[]).join('?')
  expect(sql).toMatch(/ON CONFLICT [\s\S]*DO UPDATE/)
  expect(sql).toMatch(/"next" \+ 1/)
  expect(queryRaw).toHaveBeenCalledTimes(1)
})
