import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { deriveGroupsFromPools, CRUST_GROUP_ID, type Ingredient, type IngredientPool } from '@/lib/options'

export async function GET() {
  try {
    const categories = await prisma.menuCategory.findMany({
      orderBy: { order: 'asc' },
      select: {
        id: true, name: true, order: true, hidden: true,
        ingredientCategoryId: true, ingredientCategoryIds: true,
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
    const nameByCat = new Map<number, string>()
    for (const c of categories) {
      allItemsByCat.set(c.id, c.items.map(i => ({ id: i.id, name: i.name, price: i.price, available: true })))
      nameByCat.set(c.id, c.name)
    }

    // Linked pool ids for a category: multi-link list, falling back to the
    // legacy single link.
    const linksOf = (c: { ingredientCategoryId: number | null; ingredientCategoryIds: number[] }): number[] =>
      c.ingredientCategoryIds.length > 0
        ? c.ingredientCategoryIds
        : (c.ingredientCategoryId ? [c.ingredientCategoryId] : [])

    const poolsOf = (ids: number[]): IngredientPool[] =>
      ids
        .filter(id => allItemsByCat.has(id))
        .map(id => ({ id, name: nameByCat.get(id) ?? '', items: allItemsByCat.get(id) ?? [] }))

    // Categories referenced as an ingredient source = DIY pools; when visible,
    // the client renders them as a single "build your own" entry. A visible
    // category with links but no items of its own is also a DIY builder.
    const referencedPoolIds = new Set(categories.flatMap(c => linksOf(c)))

    const browsable = categories
      .filter(c => !c.hidden && (c.items.length > 0 || linksOf(c).length > 0))
      .map(c => {
        const links = linksOf(c)
        const maybeDiy = referencedPoolIds.has(c.id) || (links.length > 0 && c.items.length === 0)
        // For a legacy visible pool category, the builder derives from its
        // own items; otherwise from its linked pools.
        const diyPools: IngredientPool[] = maybeDiy
          ? (links.length > 0 ? poolsOf(links) : [{ id: c.id, name: c.name, items: allItemsByCat.get(c.id) ?? [] }])
          : []
        const diyGroups = maybeDiy ? deriveGroupsFromPools(diyPools, 'diy') : []
        // The builder needs a base (แป้ง) group to order against.
        const isDiy = maybeDiy && diyGroups.some(g => g.id === CRUST_GROUP_ID)
        return {
          id: c.id, name: c.name, order: c.order,
          diy: isDiy,
          diyGroups: isDiy ? diyGroups : [],
          items: c.items.map(it => {
            const groups = it.optionGroups.length > 0
              ? it.optionGroups
              : (links.length > 0 && !isDiy ? deriveGroupsFromPools(poolsOf(links), 'signature') : [])
            return { id: it.id, name: it.name, price: it.price, imageUrl: it.imageUrl, optionGroups: groups }
          }),
        }
      })

    return NextResponse.json(browsable, {
      headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=60' },
    })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch menu', detail: String(err) }, { status: 500 })
  }
}
