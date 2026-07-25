import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { deriveGroupsFromPools, expandPoolIds, withoutCrustStep, CRUST_GROUP_ID, type Ingredient, type IngredientPool } from '@/lib/options'

export async function GET() {
  try {
    const categories = await prisma.menuCategory.findMany({
      orderBy: { order: 'asc' },
      select: {
        id: true, name: true, order: true, hidden: true, parentId: true,
        ingredientCategoryId: true, ingredientCategoryIds: true, showCrustStep: true,
        items: {
          // Unavailable items are included so the UI can show them struck
          // through with a "หมด" badge; ordering them is blocked client- and
          // server-side.
          orderBy: { order: 'asc' },
          select: {
            id: true, name: true, price: true, imageUrl: true, available: true,
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
    const childrenOf = new Map<number, number[]>()
    for (const c of categories) {
      allItemsByCat.set(c.id, c.items.map(i => ({ id: i.id, name: i.name, price: i.price, available: i.available, imageUrl: i.imageUrl })))
      nameByCat.set(c.id, c.name)
      if (c.parentId) childrenOf.set(c.parentId, [...(childrenOf.get(c.parentId) ?? []), c.id])
    }

    // Linked pool ids for a category: multi-link list, falling back to the
    // legacy single link.
    const linksOf = (c: { ingredientCategoryId: number | null; ingredientCategoryIds: number[] }): number[] =>
      c.ingredientCategoryIds.length > 0
        ? c.ingredientCategoryIds
        : (c.ingredientCategoryId ? [c.ingredientCategoryId] : [])

    const poolsOf = (ids: number[]): IngredientPool[] =>
      expandPoolIds(ids, childrenOf)
        .filter(id => allItemsByCat.has(id))
        .map(id => ({
          id,
          name: nameByCat.get(id) ?? '',
          items: allItemsByCat.get(id) ?? [],
          // A linked parent that has sub-categories: its leftovers are the
          // "not yet sorted" pool.
          generic: ids.includes(id) && (childrenOf.get(id)?.length ?? 0) > 0,
        }))

    // Categories referenced as an ingredient source = DIY pools; when visible,
    // the client renders them as a single "build your own" entry. A visible
    // category with links but no items of its own is also a DIY builder.
    const referencedPoolIds = new Set(categories.flatMap(c => linksOf(c)))

    const descendantItems = (id: number) =>
      (childrenOf.get(id) ?? []).flatMap(childId => allItemsByCat.get(childId) ?? [])

    // Only top-level categories become customer tabs; sub-categories exist
    // as option steps / organization only.
    const browsable = categories
      .filter(c => !c.parentId)
      .filter(c => !c.hidden && (c.items.length > 0 || linksOf(c).length > 0 || descendantItems(c.id).length > 0))
      .map(c => {
        const links = linksOf(c)
        const ownContent = c.items.length + descendantItems(c.id).length
        const maybeDiy = referencedPoolIds.has(c.id) || (links.length > 0 && ownContent === 0)
        // For a visible pool category, the builder derives from itself (its
        // sub-categories expand into the steps); otherwise from its links.
        const diyPools: IngredientPool[] = maybeDiy
          ? poolsOf(links.length > 0 ? links : [c.id])
          : []
        const diyGroups = maybeDiy ? deriveGroupsFromPools(diyPools, 'diy') : []
        // The builder needs a base (แป้ง) group to order against.
        const isDiy = maybeDiy && diyGroups.some(g => g.id === CRUST_GROUP_ID)
        // Normal categories flatten their sub-categories' items into the tab.
        const tabItems = isDiy ? c.items : [...c.items, ...(childrenOf.get(c.id) ?? []).flatMap(childId =>
          categories.find(x => x.id === childId)?.items ?? [])]
        return {
          id: c.id, name: c.name, order: c.order,
          diy: isDiy,
          diyGroups: isDiy ? diyGroups : [],
          items: tabItems.map(it => {
            let groups = it.optionGroups.length > 0
              ? it.optionGroups
              : (links.length > 0 && !isDiy ? deriveGroupsFromPools(poolsOf(links), 'signature') : [])
            // Staff can switch the "เลือกแป้ง" step off per category.
            if (it.optionGroups.length === 0 && !isDiy && c.showCrustStep === false) {
              groups = withoutCrustStep(groups)
            }
            return { id: it.id, name: it.name, price: it.price, imageUrl: it.imageUrl, available: it.available, optionGroups: groups }
          }),
        }
      })

    return NextResponse.json(browsable, {
      // Short CDN cache: staff toggle availability during service and expect
      // the customer menu to follow within seconds.
      headers: { 'Cache-Control': 's-maxage=5, stale-while-revalidate=20' },
    })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch menu', detail: String(err) }, { status: 500 })
  }
}
