import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const orders = await prisma.order.findMany({
      where: { status: { in: ['pending', 'preparing'] } },
      orderBy: { createdAt: 'asc' },
      include: {
        items: {
          include: { menuItem: { select: { name: true } } },
        },
      },
    })
    return NextResponse.json(orders)
  } catch (err) {
    return NextResponse.json({ error: 'Failed', detail: String(err) }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const { id, status } = await request.json()
    if (!id || !['preparing', 'completed'].includes(status)) {
      return NextResponse.json({ error: 'Invalid' }, { status: 400 })
    }
    const order = await prisma.order.update({
      where: { id: Number(id) },
      data: { status },
      include: { items: { include: { menuItem: { select: { name: true } } } } },
    })
    return NextResponse.json(order)
  } catch (err) {
    return NextResponse.json({ error: 'Failed', detail: String(err) }, { status: 500 })
  }
}
