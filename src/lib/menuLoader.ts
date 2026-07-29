import type { PrismaClient } from '@prisma/client'
import type { MenuItemForPricing } from './order'
import {
  deriveGroupsFromPoolsForPricing, deriveDiyExtrasFromPools, deriveSetCrustGroupForPricing,
  expandPoolIds, withoutCrustStep, withoutHiddenPools, isCrust, DIY_NAME_PREFIX,
  type Ingredient, type IngredientPool,
} from './options'
import { setDisplayName } from './setMenu'

type Prisma = PrismaClient

/**
 * Build the menu map used by priceOrderItems for the given item ids.
 * Each item uses its own real OptionGroups if it has any; otherwise:
 *  - if its category links ingredient categories (Signature), one group per
 *    linked pool is derived (แป้ง = free swap, others priced);
 *  - if its own category IS an ingredient pool (DIY), the item is a base
 *    crust ordered directly and the sibling pools' extras groups apply.
 * `onlyAvailable` filters ordered items to available ones (customer flow).
 * `staffCrustSwap` adds the set crust step, which only the till offers — the
 * QR menu never shows it, so it must not accept it either.
 */
export async function loadMenuForPricing(
  prisma: Prisma,
  itemIds: number[],
  onlyAvailable: boolean,
  { staffCrustSwap = false }: { staffCrustSwap?: boolean } = {},
): Promise<Map<number, MenuItemForPricing>> {
  const items = await prisma.menuItem.findMany({
    where: { id: { in: itemIds }, ...(onlyAvailable ? { available: true } : {}) },
    select: {
      id: true, name: true, price: true, categoryId: true, isSet: true,
      setComponents: {
        orderBy: { order: 'asc' },
        select: { quantity: true, item: { select: { name: true, price: true } } },
      },
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
    select: {
      id: true, name: true, parentId: true,
      ingredientCategoryId: true, ingredientCategoryIds: true,
      showCrustStep: true, hiddenPoolCategoryIds: true,
    },
  })
  const nameByCat = new Map(cats.map(c => [c.id, c.name]))
  const showCrustByCat = new Map(cats.map(c => [c.id, c.showCrustStep]))
  const hiddenPoolsByCat = new Map(cats.map(c => [c.id, c.hiddenPoolCategoryIds]))
  const childrenOf = new Map<number, number[]>()
  for (const c of cats) {
    if (c.parentId) childrenOf.set(c.parentId, [...(childrenOf.get(c.parentId) ?? []), c.id])
  }
  const linksOf = (c: { ingredientCategoryId: number | null; ingredientCategoryIds: number[] }): number[] =>
    c.ingredientCategoryIds.length > 0
      ? c.ingredientCategoryIds
      : (c.ingredientCategoryId ? [c.ingredientCategoryId] : [])
  const linksByCat = new Map(cats.map(c => [c.id, expandPoolIds(linksOf(c), childrenOf)]))

  // For a DIY base item, its category (or a sub-category of a pool) belongs
  // to some category's expanded pool set; those pools are its siblings.
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
    // A set derives its add-on steps from its category's pools even though it
    // may carry option groups of its own.
    if (!it.isSet && it.optionGroups.length > 0) continue
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
    ids.map(id => ({
      id,
      name: nameByCat.get(id) ?? '',
      items: ingredientsByCat.get(id) ?? [],
      generic: (childrenOf.get(id)?.length ?? 0) > 0,
    }))

  const map = new Map<number, MenuItemForPricing>()
  for (const it of items) {
    let groups = it.optionGroups
    let name = it.name
    // A set is bought whole at its own price: it takes no option steps, and
    // must not pick up its category's Signature pools. The parts go on the
    // line as well as into the name, so the kitchen ticket and the receipt
    // itemise what to make instead of printing one run-on line.
    if (it.isSet) {
      const parts = it.setComponents.map(c =>
        ({ name: c.item.name, price: c.item.price, quantity: c.quantity }))
      // Add-ons only: the set's own contents are fixed, but its category's
      // pools are still on offer as extras. Mirror the customer menu's
      // switched-off steps, or pricing rejects an order the UI allowed.
      const setPools = poolsOf(linksByCat.get(it.categoryId) ?? [])
      const extras = setPools.length > 0
        ? withoutHiddenPools(
            deriveDiyExtrasFromPools(setPools), setPools, hiddenPoolsByCat.get(it.categoryId) ?? [])
        : []
      // Swapping the crust is a staff move, and only means anything when the
      // set actually comes with one.
      const setCrust = parts.find(p => isCrust(p.name))
      const swap = staffCrustSwap && setCrust && setPools.length > 0
        ? deriveSetCrustGroupForPricing(setPools, setCrust.price)
        : null
      map.set(it.id, {
        id: it.id,
        name: setDisplayName(parts, it.name),
        price: it.price,
        optionGroups: swap ? [swap, ...extras] : extras,
        setParts: parts.map(p =>
          ({ name: p.name, quantity: p.quantity, price: p.price, crust: isCrust(p.name) })),
      })
      continue
    }
    if (groups.length === 0) {
      const ownLinks = linksByCat.get(it.categoryId) ?? []
      const siblings = poolSetContaining(it.categoryId)
      if (ownLinks.length > 0) {
        // Signature item: category links pools. Mirror the customer menu's
        // switched-off steps exactly, or pricing would reject an order the UI
        // never offered those choices for.
        const sigPools = poolsOf(ownLinks)
        groups = deriveGroupsFromPoolsForPricing(sigPools, 'signature')
        if (showCrustByCat.get(it.categoryId) === false) groups = withoutCrustStep(groups)
        groups = withoutHiddenPools(groups, sigPools, hiddenPoolsByCat.get(it.categoryId) ?? [])
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
