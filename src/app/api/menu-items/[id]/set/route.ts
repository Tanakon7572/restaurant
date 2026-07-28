import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { parseSetBody, checkParts, SET_INCLUDE } from '@/lib/setPayload'

/**
 * Save an existing set — its details and its whole contents in one write.
 *
 * The part list is replaced rather than patched, so what staff see in the
 * editor is exactly what gets stored. Sending an empty list turns the item
 * back into an ordinary menu item.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    const setId = parseInt(id)
    const parsed = parseSetBody(await request.json())
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const bad = await checkParts(prisma, parsed.parts, setId)
    if (bad) return NextResponse.json({ error: bad }, { status: 400 })

    const item = await prisma.$transaction(async tx => {
      await tx.setComponent.deleteMany({ where: { setId } })
      if (parsed.parts.length > 0) {
        await tx.setComponent.createMany({
          data: parsed.parts.map((p, i) => ({ setId, itemId: p.itemId, quantity: p.quantity, order: i })),
        })
      }
      return tx.menuItem.update({
        where: { id: setId },
        data: {
          name: parsed.name,
          price: parsed.price,
          setDiscount: parsed.parts.length > 0 ? parsed.discount : 0,
          imageUrl: parsed.imageUrl,
          isSet: parsed.parts.length > 0,
        },
        include: SET_INCLUDE,
      })
    })

    return NextResponse.json(item)
  } catch (err) {
    return NextResponse.json({ error: 'Failed to save set', detail: String(err) }, { status: 500 })
  }
}
