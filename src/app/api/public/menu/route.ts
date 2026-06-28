import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { deriveOptionGroups, type Ingredient } from '@/lib/options'

export async function GET() {
  try {
    const categories = await prisma.menuCategory.findMany({
      orderBy: { order: 'asc' },
      select: {
        id: true, name: true, order: true, hidden: true, ingredientCategoryId: true,
        items: {
          where: { available: true },
          orderBy: { order: 'asc' },
          select: {
            id: true, name: true, price: true, imageUrl: true,
            optionGroups: {
              orderBy: { order: 'asc' },
              select: {
                id: true, name: true, required: true, minSelect: true, maxSelect: true, order: true,
                choices: {
                  orderBy: { order: 'asc' },
                  select: { id: true, name: true, priceDelta: true, available: true, order: true },
                },
              },
            },
          },
        },
      },
    })

    // Ingredient pools (include items from hidden categories) for derivation.
    const allItemsByCat = new Map<number, Ingredient[]>()
    for (const c of categories) {
      allItemsByCat.set(c.id, c.items.map(i => ({ id: i.id, name: i.name, price: i.price, available: true })))
    }

    const browsable = categories
      .filter(c => !c.hidden && c.items.length > 0)
      .map(c => ({
        id: c.id, name: c.name, order: c.order,
        items: c.items.map(it => {
          const groups = it.optionGroups.length > 0
            ? it.optionGroups
            : (c.ingredientCategoryId ? deriveOptionGroups(allItemsByCat.get(c.ingredientCategoryId) ?? []) : [])
          return { id: it.id, name: it.name, price: it.price, imageUrl: it.imageUrl, optionGroups: groups }
        }),
      }))

    return NextResponse.json(browsable, {
      headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=60' },
    })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch menu', detail: String(err) }, { status: 500 })
  }
}
