import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { planConversion, type Candidate } from '@/lib/setNameMatch'
import { partsTotal } from '@/lib/setMenu'

// Everything that could be an ingredient: any menu item, minus the ones whose
// own name reads as a set. Pool categories are usually hidden, so this can't
// be limited to what customers browse.
async function loadCandidates(): Promise<Candidate[]> {
  return prisma.menuItem.findMany({ select: { id: true, name: true, price: true } })
}

/**
 * Preview turning "a+b+c" items in a category into real sets. Changes nothing:
 * the matching is fuzzy by necessity (menus spell ingredients inconsistently),
 * so a human confirms it before anything is written.
 */
export async function GET(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { searchParams } = new URL(request.url)
    const categoryId = parseInt(searchParams.get('categoryId') ?? '')
    if (!Number.isInteger(categoryId)) {
      return NextResponse.json({ error: 'ไม่พบหมวดหมู่' }, { status: 400 })
    }

    const items = await prisma.menuItem.findMany({
      where: { categoryId, isSet: false },
      orderBy: { order: 'asc' },
      select: { id: true, name: true, price: true },
    })
    const priceById = new Map(items.map(i => [i.id, i.price]))
    const plans = planConversion(items, await loadCandidates())

    return NextResponse.json({
      plans: plans.map(p => {
        const separate = partsTotal(p.parts.flatMap(t =>
          t.match ? [{ name: t.match.name, price: t.match.price, quantity: 1 }] : []))
        return {
          ...p,
          price: priceById.get(p.itemId) ?? 0,
          // What the parts come to, so staff can see at a glance whether the
          // set's existing price is a markdown or a markup.
          separate,
        }
      }),
    })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to plan conversion', detail: String(err) }, { status: 500 })
  }
}

/**
 * Apply the conversion for the confirmed items. Takes the item ids rather than
 * re-deciding, so what gets written is exactly what was reviewed.
 *
 * Prices are left alone: these items already sell at a price the shop chose,
 * and rewriting that from the parts would change what customers pay.
 */
export async function POST(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const categoryId = parseInt(body.categoryId)
    const wanted: number[] = Array.isArray(body.itemIds) ? body.itemIds.map(Number) : []
    if (!Number.isInteger(categoryId) || wanted.length === 0) {
      return NextResponse.json({ error: 'ไม่มีรายการที่จะแปลง' }, { status: 400 })
    }

    const items = await prisma.menuItem.findMany({
      where: { categoryId, isSet: false, id: { in: wanted } },
      orderBy: { order: 'asc' },
      select: { id: true, name: true },
    })
    // Re-planned server-side: the client sends which items to convert, never
    // what they contain, so a stale preview can't write the wrong parts.
    const plans = planConversion(items, await loadCandidates()).filter(p => p.complete)
    if (plans.length === 0) {
      return NextResponse.json({ error: 'ไม่มีรายการที่จับคู่ได้ครบ' }, { status: 400 })
    }

    await prisma.$transaction(async tx => {
      for (const p of plans) {
        await tx.setComponent.deleteMany({ where: { setId: p.itemId } })
        await tx.setComponent.createMany({
          data: p.parts.map((t, i) => ({
            setId: p.itemId, itemId: t.match!.id, quantity: 1, order: i,
          })),
        })
        await tx.menuItem.update({ where: { id: p.itemId }, data: { isSet: true } })
      }
    })

    return NextResponse.json({ converted: plans.length })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to convert', detail: String(err) }, { status: 500 })
  }
}
