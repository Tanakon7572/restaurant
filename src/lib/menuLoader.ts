import type { PrismaClient } from '@prisma/client'
import type { MenuItemForPricing } from './order'
import { deriveGroupsForPricing, type Ingredient } from './options'

type Prisma = PrismaClient

/**
 * Build the menu map used by priceOrderItems for the given item ids.
 * Each item uses its own real OptionGroups if it has any; otherwise, if its
 * category links an ingredient category, groups are derived from that category.
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

  // Fetch ingredient pools for any linked categories (deduped).
  const ingredientCatIds = [...new Set(
    items.map(i => i.category?.ingredientCategoryId).filter((x): x is number => !!x),
  )]
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
    if (groups.length === 0 && it.category?.ingredientCategoryId) {
      const pool = ingredientsByCat.get(it.category.ingredientCategoryId) ?? []
      groups = deriveGroupsForPricing(pool)
    }
    map.set(it.id, { id: it.id, name: it.name, price: it.price, optionGroups: groups })
  }
  return map
}
