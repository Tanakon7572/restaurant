import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { deactivateSessionIfFinished } from '@/lib/tableSession'
import { withDailyNumbers } from '@/lib/orderNumber'

export async function GET() {
  try {
    const orders = await prisma.order.findMany({
      // Kitchen sees customer requests (awaiting) too and can confirm them
      // itself — no admin round-trip needed.
      where: { status: { in: ['awaiting', 'pending', 'preparing'] } },
      orderBy: { createdAt: 'asc' },
      include: {
        items: {
          include: {
            menuItem: { select: { name: true } },
            options: { select: { groupName: true, choiceName: true, priceDelta: true } },
          },
        },
      },
    })
    return NextResponse.json(await withDailyNumbers(prisma, orders))
  } catch (err) {
    return NextResponse.json({ error: 'Failed', detail: String(err) }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const { id, status } = await request.json()
    if (!id || !['pending', 'preparing', 'completed'].includes(status)) {
      return NextResponse.json({ error: 'Invalid' }, { status: 400 })
    }
    const order = await prisma.order.update({
      where: { id: Number(id) },
      data: { status },
      include: { items: { include: { menuItem: { select: { name: true } } } } },
    })
    // Finishing the food retires the table's ordering link.
    if (status === 'completed') {
      await deactivateSessionIfFinished(prisma, order.sessionToken)
    }
    return NextResponse.json(order)
  } catch (err) {
    return NextResponse.json({ error: 'Failed', detail: String(err) }, { status: 500 })
  }
}
