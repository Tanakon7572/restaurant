import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    const order = await prisma.order.findUnique({
      where: { id: parseInt(id) },
      include: { items: { include: { menuItem: true } } },
    })
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    return NextResponse.json(order)
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch order', detail: String(err) }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    const orderId = parseInt(id)
    const body = await request.json()

    if (body.items) {
      await prisma.orderItem.deleteMany({ where: { orderId } })

      const menuItemIds = body.items.map((i: { menuItemId: number }) => i.menuItemId)
      const menuItems = await prisma.menuItem.findMany({
        where: { id: { in: menuItemIds } },
      })
      const priceMap = new Map(menuItems.map(m => [m.id, m.price]))

      let totalPrice = 0
      const orderItems = body.items.map((item: { menuItemId: number; quantity: number; note?: string }) => {
        const price = priceMap.get(item.menuItemId) ?? 0
        totalPrice += price * item.quantity
        return {
          orderId,
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          price,
          note: item.note || null,
        }
      })

      await prisma.orderItem.createMany({ data: orderItems })

      const order = await prisma.order.update({
        where: { id: orderId },
        data: {
          totalPrice,
          tableNumber: body.tableNumber ?? undefined,
          note: body.note ?? undefined,
          status: body.status ?? undefined,
        },
        include: { items: { include: { menuItem: true } } },
      })
      return NextResponse.json(order)
    }

    const updateData: Record<string, unknown> = {}
    if (body.status !== undefined) updateData.status = body.status
    if (body.tableNumber !== undefined) updateData.tableNumber = body.tableNumber
    if (body.note !== undefined) updateData.note = body.note

    const order = await prisma.order.update({
      where: { id: orderId },
      data: updateData,
      include: { items: { include: { menuItem: true } } },
    })
    return NextResponse.json(order)
  } catch (err) {
    return NextResponse.json({ error: 'Failed to update order', detail: String(err) }, { status: 500 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    await prisma.order.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to delete order', detail: String(err) }, { status: 500 })
  }
}
