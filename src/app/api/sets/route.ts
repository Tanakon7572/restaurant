import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { parseSetBody, checkParts, SET_INCLUDE } from '@/lib/setPayload'

/**
 * Create a set in one go: the menu item and everything it contains.
 *
 * Sets used to be made by adding an ordinary item and then editing it into a
 * set, which meant a half-made set could sit on the live menu in between.
 */
export async function POST(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const categoryId = parseInt(body.categoryId)
    if (!Number.isInteger(categoryId)) {
      return NextResponse.json({ error: 'ไม่พบหมวดหมู่' }, { status: 400 })
    }

    const parsed = parseSetBody(body)
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
    if (parsed.parts.length === 0) {
      return NextResponse.json({ error: 'กรุณาเลือกรายการในเซ็ตอย่างน้อย 1 รายการ' }, { status: 400 })
    }

    const bad = await checkParts(prisma, parsed.parts)
    if (bad) return NextResponse.json({ error: bad }, { status: 400 })

    const maxOrder = await prisma.menuItem.aggregate({
      where: { categoryId },
      _max: { order: true },
    })

    const item = await prisma.menuItem.create({
      data: {
        // The name is generated from the parts when left blank, so an untitled
        // set still reads as what it contains rather than as nothing.
        name: parsed.name,
        price: parsed.price,
        setDiscount: parsed.discount,
        imageUrl: parsed.imageUrl,
        categoryId,
        order: (maxOrder._max.order ?? -1) + 1,
        isSet: true,
        setComponents: {
          create: parsed.parts.map((p, i) => ({ itemId: p.itemId, quantity: p.quantity, order: i })),
        },
      },
      include: SET_INCLUDE,
    })

    return NextResponse.json(item, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to create set', detail: String(err) }, { status: 500 })
  }
}
