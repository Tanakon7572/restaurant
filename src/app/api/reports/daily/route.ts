import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { round2, PAYMENT_METHODS, type PaymentMethod } from '@/lib/billing'
import { bangkokDayStart, bangkokDayKey } from '@/lib/orderNumber'

// Bangkok-day window for a YYYY-MM-DD label (or today when none is given).
function dayWindow(date: string | null) {
  const anchor = date ? new Date(`${date}T12:00:00+07:00`) : new Date()
  const start = bangkokDayStart(anchor)
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000), key: bangkokDayKey(anchor) }
}

async function buildReport(date: string | null) {
  const { start, end, key } = dayWindow(date)

  const [bills, cancelledCount] = await Promise.all([
    prisma.bill.findMany({
      where: { createdAt: { gte: start, lt: end } },
      orderBy: { createdAt: 'asc' },
      include: { orders: { include: { items: true } } },
    }),
    prisma.order.count({ where: { createdAt: { gte: start, lt: end }, status: 'cancelled' } }),
  ])

  const live = bills.filter(b => !b.voidedAt)
  const voided = bills.filter(b => b.voidedAt)

  const sum = (pick: (b: (typeof live)[number]) => number) => round2(live.reduce((s, b) => s + pick(b), 0))

  const byMethod = Object.fromEntries(
    PAYMENT_METHODS.map(m => {
      const rows = live.filter(b => b.method === m)
      return [m, { count: rows.length, amount: round2(rows.reduce((s, b) => s + b.total, 0)) }]
    }),
  ) as Record<PaymentMethod, { count: number; amount: number }>

  // Sales per hour of the Bangkok day — shows when the rush actually is.
  const hourly = Array.from({ length: 24 }, (_, h) => ({ hour: h, amount: 0, count: 0 }))
  for (const b of live) {
    const h = new Date(b.createdAt.getTime() + 7 * 60 * 60 * 1000).getUTCHours()
    hourly[h].amount = round2(hourly[h].amount + b.total)
    hourly[h].count += 1
  }

  // Best sellers, counted off the items actually paid for.
  const items = new Map<string, { name: string; quantity: number; amount: number }>()
  for (const b of live) {
    for (const o of b.orders) {
      for (const i of o.items) {
        const name = i.itemName || '(ลบแล้ว)'
        const row = items.get(name) ?? { name, quantity: 0, amount: 0 }
        row.quantity += i.quantity
        row.amount = round2(row.amount + i.price * i.quantity)
        items.set(name, row)
      }
    }
  }
  const topItems = [...items.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 15)

  const totalSales = sum(b => b.total)
  const expectedCash = byMethod.cash.amount

  return {
    date: key,
    billCount: live.length,
    totalSales,
    subtotal: sum(b => b.subtotal),
    discount: sum(b => b.discount),
    serviceCharge: sum(b => b.serviceCharge),
    vat: sum(b => b.vat),
    averageBill: live.length > 0 ? round2(totalSales / live.length) : 0,
    expectedCash,
    byMethod,
    hourly,
    topItems,
    voided: { count: voided.length, amount: round2(voided.reduce((s, b) => s + b.total, 0)) },
    cancelledOrders: cancelledCount,
    close: await prisma.dayClose.findUnique({ where: { dayKey: key } }),
  }
}

export async function GET(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { searchParams } = new URL(request.url)
    return NextResponse.json(await buildReport(searchParams.get('date')))
  } catch (err) {
    return NextResponse.json({ error: 'Failed to build report', detail: String(err) }, { status: 500 })
  }
}

/**
 * Close the till for a day. The stored figures are recomputed here rather
 * than taken from the request, so the snapshot always matches the bills.
 * Re-closing the same day overwrites — staff recount.
 */
export async function POST(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const report = await buildReport(body.date ?? null)
    const countedCash = Math.max(0, Number(body.countedCash) || 0)

    const close = await prisma.dayClose.upsert({
      where: { dayKey: report.date },
      create: {
        dayKey: report.date,
        billCount: report.billCount,
        totalSales: report.totalSales,
        expectedCash: report.expectedCash,
        countedCash,
        note: body.note?.trim() || null,
      },
      update: {
        closedAt: new Date(),
        billCount: report.billCount,
        totalSales: report.totalSales,
        expectedCash: report.expectedCash,
        countedCash,
        note: body.note?.trim() || null,
      },
    })
    return NextResponse.json({ ...report, close })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to close the day', detail: String(err) }, { status: 500 })
  }
}
