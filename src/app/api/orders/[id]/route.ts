import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { priceOrderItems } from '@/lib/order'
import { loadMenuForPricing } from '@/lib/menuLoader'
import { SET_GROUP_NAME } from '@/lib/setMenu'
import type { OrderItemInput } from '@/lib/types'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    const order = await prisma.order.findUnique({
      where: { id: parseInt(id) },
      include: { items: { include: { menuItem: true, options: true } } },
    })
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    // Stored options are name snapshots, so an editor cannot re-submit them
    // as-is. Rebuild the live option groups for each ordered item and map the
    // snapshots back to choice ids; anything unmatched (renamed or deleted
    // choice) is reported so the UI can warn instead of silently dropping it.
    const menuItemIds = [...new Set(order.items.map(i => i.menuItemId).filter((x): x is number => x != null))]
    const menu = menuItemIds.length > 0 ? await loadMenuForPricing(prisma, menuItemIds, false, { staffCrustSwap: true }) : new Map()

    const items = order.items.map(it => {
      const priced = it.menuItemId != null ? menu.get(it.menuItemId) : undefined
      const groups = priced?.optionGroups ?? []
      // A set's parts are recorded as options so slips can list them, but they
      // were never chosen and map to no choice id. Leaving them in would make
      // every set line look like it had lost an option.
      const chosen = it.options.filter(o => o.groupName !== SET_GROUP_NAME)
      const optionChoiceIds: number[] = []
      for (const o of chosen) {
        const choice = groups
          .find((g: { name: string }) => g.name === o.groupName)
          ?.choices.find((c: { name: string }) => c.name === o.choiceName)
        if (choice) optionChoiceIds.push(choice.id)
      }
      return {
        ...it,
        optionChoiceIds,
        // The item's price on today's menu, not the one frozen into the line.
        // Reopening a line to edit it re-prices from here, which is what the
        // server will charge on save anyway.
        menuPrice: priced?.price ?? null,
        // false = at least one option no longer exists on the menu
        optionsResolved: optionChoiceIds.length === chosen.length,
        optionGroups: groups.map((g: { id: number; name: string; required: boolean; minSelect: number; maxSelect: number; choices: { id: number; name: string; priceDelta: number; available: boolean }[] }, gi: number) => ({
          id: g.id, name: g.name, required: g.required,
          minSelect: g.minSelect, maxSelect: g.maxSelect, order: gi,
          choices: g.choices.map((c, ci) => ({ ...c, order: ci })),
        })),
      }
    })

    return NextResponse.json({ ...order, items })
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
      const inputs = body.items as OrderItemInput[]
      if (inputs.length === 0) {
        return NextResponse.json({ error: 'ต้องมีรายการอาหารอย่างน้อย 1 รายการ' }, { status: 400 })
      }

      // Price through the same path as order creation so chosen options and
      // per-item notes survive the edit and the total stays consistent.
      const menu = await loadMenuForPricing(prisma, inputs.map(i => i.menuItemId), false, { staffCrustSwap: true })
      const result = priceOrderItems(inputs, menu)
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

      const order = await prisma.order.update({
        where: { id: orderId },
        data: {
          totalPrice: result.totalPrice,
          ...(body.tableNumber !== undefined ? { tableNumber: body.tableNumber } : {}),
          ...(body.customerName !== undefined ? { customerName: body.customerName } : {}),
          ...(body.note !== undefined ? { note: body.note } : {}),
          ...(body.status !== undefined ? { status: body.status } : {}),
          items: {
            deleteMany: {},
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
      return NextResponse.json(order)
    }

    const updateData: Record<string, unknown> = {}
    if (body.status !== undefined) updateData.status = body.status
    if (body.tableNumber !== undefined) updateData.tableNumber = body.tableNumber
    if (body.note !== undefined) updateData.note = body.note

    const order = await prisma.order.update({
      where: { id: orderId },
      data: updateData,
      include: { items: { include: { menuItem: true, options: true } } },
    })
    // Finishing or cancelling the last open order retires the ordering link.
    if (body.status === 'completed' || body.status === 'cancelled') {
      const { deactivateSessionIfFinished } = await import('@/lib/tableSession')
      await deactivateSessionIfFinished(prisma, order.sessionToken)
    }
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
