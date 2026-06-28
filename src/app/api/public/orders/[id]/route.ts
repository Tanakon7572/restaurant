import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const order = await prisma.order.findUnique({
      where: { id: parseInt(id) },
      select: {
        id: true,
        status: true,
        totalPrice: true,
        tableNumber: true,
        customerName: true,
        updatedAt: true,
        items: {
          select: {
            itemName: true,
            menuItem: { select: { name: true } },
            quantity: true,
            price: true,
            note: true,
            options: { select: { groupName: true, choiceName: true, priceDelta: true } },
          },
        },
      },
    })
    if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(order)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch order' }, { status: 500 })
  }
}
