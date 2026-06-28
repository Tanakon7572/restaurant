import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { priceOrderItems } from '@/lib/order'
import { loadMenuForPricing } from '@/lib/menuLoader'
import type { OrderItemInput } from '@/lib/types'

export async function POST(request: Request) {
  try {
    const { tableNumber, customerName, note, items } = await request.json() as
      { tableNumber?: string; customerName?: string; note?: string; items: OrderItemInput[] }

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'ต้องมีรายการอาหารอย่างน้อย 1 รายการ' }, { status: 400 })
    }

    const menu = await loadMenuForPricing(prisma, items.map(i => i.menuItemId), true)

    const result = priceOrderItems(items, menu)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

    const order = await prisma.order.create({
      data: {
        tableNumber: tableNumber || null,
        customerName: customerName || null,
        note: note || null,
        status: 'awaiting',
        totalPrice: result.totalPrice,
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
      include: { items: { include: { options: true } } },
    })

    return NextResponse.json({
      id: order.id,
      status: order.status,
      totalPrice: order.totalPrice,
      tableNumber: order.tableNumber,
      items: order.items.map(i => ({
        itemName: i.itemName,
        menuItem: { name: i.itemName },
        quantity: i.quantity,
        price: i.price,
        note: i.note,
        options: i.options,
      })),
    }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to create order', detail: String(err) }, { status: 500 })
  }
}
