import type { PrismaClient } from '@prisma/client'
import type { MenuItemForPricing } from './order'
import { deriveGroupsForPricing, deriveDiyExtrasForPricing, DIY_NAME_PREFIX, type Ingredient } from './options'

type Prisma = PrismaClient

/**
 * Build the menu map used by priceOrderItems for the given item ids.
 * Each item uses its own real OptionGroups if it has any; otherwise:
 *  - if its category links an ingredient category (Signature), groups are
 *    derived from that category (free crust swap + priced extras);
 *  - if its own category IS an ingredient pool (DIY), the item is a base
 *    crust ordered directly and only the extras group applies.
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
      category: { select: { ingredientCategoryId: true } },
    },
  })

  // Categories referenced as an ingredient source by any category = DIY pools.
  const poolLinks = await prisma.menuCategory.findMany({
    where: { ingredientCategoryId: { not: null } },
    select: { ingredientCategoryId: true },
  })
  const poolIds = new Set(poolLinks.map(l => l.ingredientCategoryId).filter((x): x is number => !!x))

  // Fetch ingredient pools for linked categories and for DIY base items (deduped).
  const ingredientCatIds = [...new Set([
    ...items.map(i => i.category?.ingredientCategoryId).filter((x): x is number => !!x),
    ...items.filter(i => i.optionGroups.length === 0 && poolIds.has(i.categoryId)).map(i => i.categoryId),
  ])]
  const ingredientsByCat = new Map<number, Ingredient[]>()
  if (ingredientCatIds.length > 0) {
    const ing = await prisma.menuItem.findMany({
      where: { categoryId: { in: ingredientCatIds } },
      orderBy: { order: 'asc' },
      select: { id: true, name: true, price: true, available: true, categoryId: true },
    })
    for (const cat of ingredientCatIds) ingredientsByCat.set(cat, [])
    for (const i of ing) ingredientsByCat.get(i.categoryId)?.push(i)
  }

  const map = new Map<number, MenuItemForPricing>()
  for (const it of items) {
    let groups = it.optionGroups
    let name = it.name
    if (groups.length === 0 && it.category?.ingredientCategoryId) {
      const pool = ingredientsByCat.get(it.category.ingredientCategoryId) ?? []
      groups = deriveGroupsForPricing(pool)
    } else if (groups.length === 0 && poolIds.has(it.categoryId)) {
      const pool = ingredientsByCat.get(it.categoryId) ?? []
      groups = deriveDiyExtrasForPricing(pool)
      name = `${DIY_NAME_PREFIX}${it.name}`
    }
    map.set(it.id, { id: it.id, name, price: it.price, optionGroups: groups })
  }
  return map
}
