import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { priceOrderItems } from '@/lib/order'
import { loadMenuForPricing } from '@/lib/menuLoader'
import { isPermanentToken, PERMANENT_SESSION_TOKEN } from '@/lib/tableSession'
import { reserveDailyNumber } from '@/lib/orderNumber'
import type { OrderItemInput } from '@/lib/types'

export async function POST(request: Request) {
  try {
    const { customerName, note, items, sessionToken } = await request.json() as
      { customerName?: string; note?: string; items: OrderItemInput[]; sessionToken?: string }

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'ต้องมีรายการอาหารอย่างน้อย 1 รายการ' }, { status: 400 })
    }

    // Orders come from the shop's permanent link (single QR, no table): the
    // customer identifies the order by name. Legacy per-table links still work.
    let tableNumber: string | null = null
    let resolvedToken: string
    if (isPermanentToken(sessionToken)) {
      if (!customerName || !customerName.trim()) {
        return NextResponse.json({ error: 'กรุณากรอกชื่อผู้สั่ง' }, { status: 400 })
      }
      resolvedToken = PERMANENT_SESSION_TOKEN
    } else {
      const session = sessionToken
        ? await prisma.tableSession.findUnique({ where: { token: sessionToken } })
        : null
      if (!session || !session.active) {
        return NextResponse.json({ error: 'ลิงก์สั่งอาหารนี้ใช้ไม่ได้แล้ว กรุณาติดต่อพนักงาน' }, { status: 403 })
      }
      tableNumber = session.tableNumber
      resolvedToken = session.token
    }

    const menu = await loadMenuForPricing(prisma, items.map(i => i.menuItemId), true)

    const result = priceOrderItems(items, menu)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

    const order = await prisma.$transaction(async tx => {
      const { dayKey, dailyNumber } = await reserveDailyNumber(tx)
      return tx.order.create({
        data: {
          tableNumber: tableNumber || null,
          customerName: customerName || null,
          sessionToken: resolvedToken,
          note: note || null,
          status: 'awaiting',
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
        include: { items: { include: { options: true } } },
      })
    })

    return NextResponse.json({
      id: order.id,
      dailyNumber: order.dailyNumber,
      status: order.status,
      totalPrice: order.totalPrice,
      tableNumber: order.tableNumber,
      customerName: order.customerName,
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
