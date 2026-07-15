import type { PrismaClient } from '@prisma/client'
import type { MenuItemForPricing } from './order'
import {
  deriveGroupsFromPoolsForPricing, deriveDiyExtrasFromPools,
  DIY_NAME_PREFIX, type Ingredient, type IngredientPool,
} from './options'

type Prisma = PrismaClient

/**
 * Build the menu map used by priceOrderItems for the given item ids.
 * Each item uses its own real OptionGroups if it has any; otherwise:
 *  - if its category links ingredient categories (Signature), one group per
 *    linked pool is derived (แป้ง = free swap, others priced);
 *  - if its own category IS an ingredient pool (DIY), the item is a base
 *    crust ordered directly and the sibling pools' extras groups apply.
 * `onlyAvailable` filters ordered items to available ones (customer flow).
 */
export async function loadMenuForPricing(
  prisma: Prisma,
  itemIds: number[],
  onlyAvailable: boolean,
): Promise<Map<number, MenuItemForPricing>> {
  const items = await prisma.menuItem.findMany({
    where: { id: { in: itemIds }, ...(onlyAvailable ? { available: true } : {}) },
    select: {
      id: true, name: true, price: true, categoryId: true,
      optionGroups: {
        select: {
          id: true, name: true, required: true, minSelect: true, maxSelect: true,
          choices: { select: { id: true, name: true, priceDelta: true, available: true } },
        },
      },
    },
  })

  // All category link structures (cheap: categories are few).
  const cats = await prisma.menuCategory.findMany({
    select: { id: true, name: true, ingredientCategoryId: true, ingredientCategoryIds: true },
  })
  const nameByCat = new Map(cats.map(c => [c.id, c.name]))
  const linksOf = (c: { ingredientCategoryId: number | null; ingredientCategoryIds: number[] }): number[] =>
    c.ingredientCategoryIds.length > 0
      ? c.ingredientCategoryIds
      : (c.ingredientCategoryId ? [c.ingredientCategoryId] : [])
  const linksByCat = new Map(cats.map(c => [c.id, linksOf(c)]))

  // For a DIY base item, its category is a pool; the relevant pool set is the
  // one of the (first) category that links it.
  const poolSetContaining = (poolCatId: number): number[] | null => {
    for (const c of cats) {
      const links = linksByCat.get(c.id) ?? []
      if (links.includes(poolCatId)) return links
    }
    return null
  }

  // Collect every pool category we need ingredients for.
  const neededPoolIds = new Set<number>()
  for (const it of items) {
    if (it.optionGroups.length > 0) continue
    for (const id of linksByCat.get(it.categoryId) ?? []) neededPoolIds.add(id)
    const siblings = poolSetContaining(it.categoryId)
    if (siblings) for (const id of siblings) neededPoolIds.add(id)
  }

  const ingredientsByCat = new Map<number, Ingredient[]>()
  if (neededPoolIds.size > 0) {
    const ing = await prisma.menuItem.findMany({
      where: { categoryId: { in: [...neededPoolIds] } },
      orderBy: { order: 'asc' },
      select: { id: true, name: true, price: true, available: true, categoryId: true },
    })
    for (const cat of neededPoolIds) ingredientsByCat.set(cat, [])
    for (const i of ing) ingredientsByCat.get(i.categoryId)?.push(i)
  }

  const poolsOf = (ids: number[]): IngredientPool[] =>
    ids.map(id => ({ id, name: nameByCat.get(id) ?? '', items: ingredientsByCat.get(id) ?? [] }))

  const map = new Map<number, MenuItemForPricing>()
  for (const it of items) {
    let groups = it.optionGroups
    let name = it.name
    if (groups.length === 0) {
      const ownLinks = linksByCat.get(it.categoryId) ?? []
      const siblings = poolSetContaining(it.categoryId)
      if (ownLinks.length > 0) {
        // Signature item: category links pools.
        groups = deriveGroupsFromPoolsForPricing(poolsOf(ownLinks), 'signature')
      } else if (siblings) {
        // DIY base (crust) ordered directly: extras from all sibling pools.
        groups = deriveDiyExtrasFromPools(poolsOf(siblings))
        name = `${DIY_NAME_PREFIX}${it.name}`
      }
    }
    map.set(it.id, { id: it.id, name, price: it.price, optionGroups: groups })
  }
  return map
}
