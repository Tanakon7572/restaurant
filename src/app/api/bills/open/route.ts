import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { loadShopSettings } from '@/lib/shopSettings'

/**
 * Everything still owing money, grouped into what the cashier will actually
 * ring up: one group per table, plus one group per walk-in order that has no
 * table. `awaiting` orders are left out — the shop hasn't accepted them yet.
 */
export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const orders = await prisma.order.findMany({
      where: {
        billId: null,
        status: { in: ['pending', 'preparing', 'completed'] },
      },
      orderBy: { createdAt: 'asc' },
      include: { items: { include: { options: true } } },
    })
    const groups = new Map<string, typeof orders>()
    for (const o of orders) {
      // Untabled orders never merge with each other — each is its own bill.
      const key = o.tableNumber ? `t:${o.tableNumber}` : `o:${o.id}`
      groups.set(key, [...(groups.get(key) ?? []), o])
    }

    const settings = await loadShopSettings(prisma)
    return NextResponse.json({
      settings,
      groups: [...groups.entries()].map(([key, list]) => ({
        key,
        tableNumber: list[0].tableNumber,
        customerName: list.find(o => o.customerName)?.customerName ?? null,
        openedAt: list[0].createdAt,
        subtotal: list.reduce((s, o) => s + o.totalPrice, 0),
        orders: list,
      })),
    })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch open bills', detail: String(err) }, { status: 500 })
  }
}
