import { describe, it, expect } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { withBillDailyNumbers, withBillDailyNumbersOne } from './billQuery'

// Four orders on one Bangkok day, with the high row ids a live shop accumulates.
const DAY = [
  { id: 71, createdAt: new Date('2026-07-27T04:00:00Z') },
  { id: 72, createdAt: new Date('2026-07-27T04:30:00Z') },
  { id: 73, createdAt: new Date('2026-07-27T05:00:00Z') },
  { id: 74, createdAt: new Date('2026-07-27T05:30:00Z') },
]

function fakePrisma(orders = DAY): PrismaClient {
  return { order: { findMany: async () => orders } } as unknown as PrismaClient
}

describe('withBillDailyNumbers', () => {
  it('numbers a bill order by its position in the day, not its row id', async () => {
    const bill = { id: 4, total: 250, orders: [DAY[3]] }
    const [numbered] = await withBillDailyNumbers(fakePrisma(), [bill])
    expect(numbered.orders[0].dailyNumber).toBe(4)
    expect(numbered.orders[0].id).toBe(74)
  })

  it('keeps the rest of the bill intact', async () => {
    const bill = { id: 4, total: 250, orders: [DAY[3]] }
    const [numbered] = await withBillDailyNumbers(fakePrisma(), [bill])
    expect(numbered.id).toBe(4)
    expect(numbered.total).toBe(250)
  })

  it('numbers several orders merged onto one table bill', async () => {
    const bill = { id: 4, orders: [DAY[1], DAY[3]] }
    const [numbered] = await withBillDailyNumbers(fakePrisma(), [bill])
    expect(numbered.orders.map(o => o.dailyNumber)).toEqual([2, 4])
  })

  it('numbers a list of bills from a single lookup', async () => {
    const bills = [{ id: 1, orders: [DAY[0]] }, { id: 2, orders: [DAY[2]] }]
    let calls = 0
    const prisma = {
      order: { findMany: async () => { calls++; return DAY } },
    } as unknown as PrismaClient
    const numbered = await withBillDailyNumbers(prisma, bills)
    expect(numbered.map(b => b.orders[0].dailyNumber)).toEqual([1, 3])
    expect(calls).toBe(1)
  })

  it('handles a bill whose orders were all removed', async () => {
    const numbered = await withBillDailyNumbers(fakePrisma(), [{ id: 9, orders: [] }])
    expect(numbered[0].orders).toEqual([])
  })

  it('withBillDailyNumbersOne returns the single bill', async () => {
    const one = await withBillDailyNumbersOne(fakePrisma(), { id: 4, orders: [DAY[3]] })
    expect(one.orders[0].dailyNumber).toBe(4)
  })
})
