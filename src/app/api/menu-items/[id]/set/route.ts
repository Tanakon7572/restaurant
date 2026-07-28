import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

type PartInput = { itemId: number; quantity?: number }

/**
 * Define what a set contains. Replaces the whole part list rather than
 * patching it, so what staff see in the editor is exactly what gets stored.
 *
 * Sending an empty list turns the item back into an ordinary menu item.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    const setId = parseInt(id)
    const body = await request.json()
    const raw: PartInput[] = Array.isArray(body.parts) ? body.parts : []

    const parts = raw
      .map(p => ({ itemId: Number(p.itemId), quantity: Math.max(1, Math.floor(Number(p.quantity) || 1)) }))
      .filter(p => Number.isInteger(p.itemId))

    if (parts.some(p => p.itemId === setId)) {
      return NextResponse.json({ error: 'เซ็ตใส่ตัวเองเป็นส่วนประกอบไม่ได้' }, { status: 400 })
    }

    // Every part must exist, and none of them may itself be a set: nesting
    // would make the price and the generated name recursive.
    if (parts.length > 0) {
      const found = await prisma.menuItem.findMany({
        where: { id: { in: parts.map(p => p.itemId) } },
        select: { id: true, name: true, isSet: true },
      })
      const byId = new Map(found.map(f => [f.id, f]))
      const missing = parts.find(p => !byId.has(p.itemId))
      if (missing) return NextResponse.json({ error: 'มีรายการที่ไม่มีอยู่ในเมนูแล้ว' }, { status: 400 })
      const nested = found.find(f => f.isSet)
      if (nested) {
        return NextResponse.json({ error: `"${nested.name}" เป็นเซ็ตอยู่แล้ว ใส่ซ้อนกันไม่ได้` }, { status: 400 })
      }
    }

    const item = await prisma.$transaction(async tx => {
      await tx.setComponent.deleteMany({ where: { setId } })
      if (parts.length > 0) {
        await tx.setComponent.createMany({
          data: parts.map((p, i) => ({ setId, itemId: p.itemId, quantity: p.quantity, order: i })),
        })
      }
      return tx.menuItem.update({
        where: { id: setId },
        data: { isSet: parts.length > 0 },
        include: {
          setComponents: {
            orderBy: { order: 'asc' },
            select: { itemId: true, quantity: true, item: { select: { name: true, price: true } } },
          },
        },
      })
    })

    return NextResponse.json(item)
  } catch (err) {
    return NextResponse.json({ error: 'Failed to save set', detail: String(err) }, { status: 500 })
  }
}
