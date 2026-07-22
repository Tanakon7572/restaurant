import type { PrismaClient } from '@prisma/client'

// Order numbers shown to customers and staff restart at 1 each day. A "day"
// is the Asia/Bangkok calendar day (UTC+7, no DST). The number is derived,
// not stored: an order's number is its rank (by id) among the orders created
// on the same Bangkok day, so it resets automatically at local midnight.
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

// Map each order id → its daily number, grouping by Bangkok day and ranking
// by id ascending (1-based). Works off whatever order set is passed in, so
// callers must pass the full set of orders for the days they care about.
export function assignDailyNumbers(orders: { id: number; createdAt: Date | string }[]): Map<number, number> {
  const byDay = new Map<string, number[]>()
  for (const o of orders) {
    const key = bangkokDayKey(new Date(o.createdAt))
    const list = byDay.get(key) ?? []
    list.push(o.id)
    byDay.set(key, list)
  }
  const out = new Map<number, number>()
  for (const ids of byDay.values()) {
    ids.sort((a, b) => a - b)
    ids.forEach((id, i) => out.set(id, i + 1))
  }
  return out
}

// Attach `dailyNumber` to a list of fetched orders. Fetches only id+createdAt
// for every order from the earliest present day onward (cheap), so numbers are
// correct even when the caller's list was filtered by status.
export async function withDailyNumbers<T extends { id: number; createdAt: Date }>(
  prisma: PrismaClient,
  orders: T[],
): Promise<(T & { dailyNumber: number })[]> {
  if (orders.length === 0) return []
  const earliest = orders.reduce((m, o) => (o.createdAt < m ? o.createdAt : m), orders[0].createdAt)
  const all = await prisma.order.findMany({
    where: { createdAt: { gte: bangkokDayStart(earliest) } },
    select: { id: true, createdAt: true },
    orderBy: { id: 'asc' },
  })
  const map = assignDailyNumbers(all)
  return orders.map(o => ({ ...o, dailyNumber: map.get(o.id) ?? 0 }))
}

// Daily number for a single order: count of same-day orders with id ≤ this one.
export async function dailyNumberFor(
  prisma: PrismaClient,
  order: { id: number; createdAt: Date },
): Promise<number> {
  const start = bangkokDayStart(order.createdAt)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return prisma.order.count({
    where: { createdAt: { gte: start, lt: end }, id: { lte: order.id } },
  })
}
