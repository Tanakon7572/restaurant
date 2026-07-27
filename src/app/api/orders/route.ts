import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { priceOrderItems } from '@/lib/order'
import { loadMenuForPricing } from '@/lib/menuLoader'
import { sweepExpiredOrdersThrottled } from '@/lib/retention'
import { reserveDailyNumber } from '@/lib/orderNumber'
import type { OrderItemInput } from '@/lib/types'

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await sweepExpiredOrdersThrottled(prisma)

  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const today = searchParams.get('today')

    const days = searchParams.get('days')

    const from = searchParams.get('from')
    const to   = searchParams.get('to')

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (today === 'true') {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      const end = new Date()
      end.setHours(23, 59, 59, 999)
      where.createdAt = { gte: start, lte: end }
    } else if (from || to) {
      const range: Record<string, Date> = {}
      if (from) { const d = new Date(from); d.setHours(0, 0, 0, 0); range.gte = d }
      if (to)   { const d = new Date(to);   d.setHours(23, 59, 59, 999); range.lte = d }
      where.createdAt = range
    } else if (days) {
      const n = parseInt(days)
      if (!isNaN(n) && n > 0) {
        const start = new Date()
        start.setDate(start.getDate() - n + 1)
        start.setHours(0, 0, 0, 0)
        where.createdAt = { gte: start }
      }
    }

    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        items: { include: { menuItem: true } },
      },
    })
    return NextResponse.json(orders)
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch orders', detail: String(err) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { tableNumber, customerName, note, items } = await request.json() as
      { tableNumber?: string; customerName?: string; note?: string; items: OrderItemInput[] }

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'ต้องมีรายการอาหารอย่างน้อย 1 รายการ' }, { status: 400 })
    }

    const menu = await loadMenuForPricing(prisma, items.map(i => i.menuItemId), false)

    const result = priceOrderItems(items, menu)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

    // The number is claimed alongside the insert so it can never be handed to
    // two orders, and is never spent if the insert fails.
    const order = await prisma.$transaction(async tx => {
      const { dayKey, dailyNumber } = await reserveDailyNumber(tx)
      return tx.order.create({
        data: {
          tableNumber: tableNumber || null,
          customerName: customerName || null,
          note: note || null,
          totalPrice: result.totalPrice,
          dayKey,
          dailyNumber,
          items: {
            create: result.items.map(it => ({
              menuItemId: it.menuItemId,
              itemName: it.itemName,
              quantity: it.quantity,
              price: it.price,
              note: it.note,
              options: { create: it.options },
            })),
          },
        },
        include: { items: { include: { menuItem: true, options: true } } },
      })
    })

    return NextResponse.json(order, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to create order', detail: String(err) }, { status: 500 })
  }
}
