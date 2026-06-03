import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request) {
  try {
    const { tableNumber, note, items } = await request.json()

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'ต้องมีรายการอาหารอย่างน้อย 1 รายการ' }, { status: 400 })
    }

    const menuItemIds = items.map((i: { menuItemId: number }) => i.menuItemId)
    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: menuItemIds }, available: true },
    })

    const priceMap = new Map(menuItems.map(m => [m.id, m.price]))

    let totalPrice = 0
    const orderItems = items.map((item: { menuItemId: number; quantity: number }) => {
      const price = priceMap.get(item.menuItemId) ?? 0
      totalPrice += price * item.quantity
      return { menuItemId: item.menuItemId, quantity: item.quantity, price, note: null }
    })

    const order = await prisma.order.create({
      data: {
        tableNumber: tableNumber || null,
        note: note || null,
        totalPrice,
        items: { create: orderItems },
      },
      include: {
        items: { include: { menuItem: { select: { name: true } } } },
      },
    })

    return NextResponse.json({
      id: order.id,
      status: order.status,
      totalPrice: order.totalPrice,
      tableNumber: order.tableNumber,
      items: order.items.map(i => ({
        menuItem: { name: i.menuItem.name },
        quantity: i.quantity,
        price: i.price,
      })),
    }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to create order', detail: String(err) }, { status: 500 })
  }
}
