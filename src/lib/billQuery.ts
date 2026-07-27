import type { PrismaClient } from '@prisma/client'
import { assignDailyNumbers, bangkokDayStart } from './orderNumber'

// Everything a receipt needs, in one shape shared by every bill endpoint.
export const BILL_INCLUDE = {
  orders: {
    orderBy: { id: 'asc' as const },
    include: { items: { include: { options: true } } },
  },
}

type WithDaily<O> = O & { dailyNumber: number }
type Numbered<B, O> = Omit<B, 'orders'> & { orders: WithDaily<O>[] }

/**
 * Stamp each bill's orders with the daily number staff actually see on screen.
 * Without this a receipt falls back to the raw row id, so order #4 prints as
 * #74 — the number nobody in the shop recognises. One query covers every bill
 * in the list, so printing a day's takings doesn't fan out per bill.
 */
export async function withBillDailyNumbers<
  O extends { id: number; createdAt: Date },
  B extends { orders: O[] },
>(prisma: PrismaClient, bills: B[]): Promise<Numbered<B, O>[]> {
  const orders = bills.flatMap(b => b.orders)
  if (orders.length === 0) {
    return bills.map(b => ({ ...b, orders: [] as WithDaily<O>[] }))
  }
  const earliest = orders.reduce((m, o) => (o.createdAt < m ? o.createdAt : m), orders[0].createdAt)
  const sameDayOnward = await prisma.order.findMany({
    where: { createdAt: { gte: bangkokDayStart(earliest) } },
    select: { id: true, createdAt: true },
    orderBy: { id: 'asc' },
  })
  const map = assignDailyNumbers(sameDayOnward)
  return bills.map(b => ({
    ...b,
    orders: b.orders.map(o => ({ ...o, dailyNumber: map.get(o.id) ?? 0 })),
  }))
}

export async function withBillDailyNumbersOne<
  O extends { id: number; createdAt: Date },
  B extends { orders: O[] },
>(prisma: PrismaClient, bill: B): Promise<Numbered<B, O>> {
  const [only] = await withBillDailyNumbers<O, B>(prisma, [bill])
  return only
}
