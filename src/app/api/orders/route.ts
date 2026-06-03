import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
    const { tableNumber, note, items } = await request.json()

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'ต้องมีรายการอาหารอย่างน้อย 1 รายการ' }, { status: 400 })
    }

    const menuItemIds = items.map((i: { menuItemId: number }) => i.menuItemId)
    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: menuItemIds } },
    })

    const menuItemMap = new Map(menuItems.map(m => [m.id, m]))

    let totalPrice = 0
    const orderItems = items.map((item: { menuItemId: number; quantity: number; note?: string }) => {
      const mi = menuItemMap.get(item.menuItemId)
      const price = mi?.price ?? 0
      totalPrice += price * item.quantity
      return {
        menuItemId: item.menuItemId,
        itemName: mi?.name ?? '',
        quantity: item.quantity,
        price,
        note: item.note || null,
      }
    })

    const order = await prisma.order.create({
      data: {
        tableNumber: tableNumber || null,
        note: note || null,
        totalPrice,
        items: { create: orderItems },
      },
      include: { items: { include: { menuItem: true } } },
    })

    return NextResponse.json(order, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to create order', detail: String(err) }, { status: 500 })
  }
}
