import type { OptionGroupDTO, MenuItemDTO, MenuCategoryDTO, CartLine } from './types'
import type { GroupForPricing } from './order'
import { lineKey } from './cart'

// An ingredient is just a menu item from the linked (hidden) ingredient category.
export type Ingredient = { id: number; name: string; price: number; available: boolean }

// Synthetic, item-local group ids for derived groups (negative to never collide
// with real OptionGroup ids, which are positive autoincrement).
export const CRUST_GROUP_ID = -1
export const EXTRA_GROUP_ID = -2

export function isCrust(name: string): boolean {
  return name.startsWith('แป้ง')
}

// Vanilla is the standard Signature crust (free baseline). Accepts both
// common Thai spellings (วานิลลา / วนิลลา).
export function isVanilla(name: string): boolean {
  return name.includes('วานิลลา') || name.includes('วนิลลา')
}

// Baseline crust price for Signature pricing: the vanilla crust's price, or
// the cheapest crust when no vanilla is present.
export function crustBaseline(crusts: { name: string; price: number }[]): number {
  const vanilla = crusts.find(c => isVanilla(c.name))
  if (vanilla) return vanilla.price
  return crusts.length > 0 ? Math.min(...crusts.map(c => c.price)) : 0
}

// Signature crust upcharge = difference from the standard (vanilla) crust,
// never negative. Vanilla itself costs +0.
function sigCrustDelta(price: number, baseline: number): number {
  return Math.max(0, price - baseline)
}

/**
 * Build derived option groups for a Signature-style item from the ingredient list:
 *  - "เลือกแป้ง": required, single-select, free swap (priceDelta 0)
 *  - "เพิ่มไส้ / ท็อปปิ้ง": optional, multi-select, priceDelta = ingredient price
 * Derived choice ids are the ingredient menuItem ids.
 */
export function deriveOptionGroups(ingredients: Ingredient[]): OptionGroupDTO[] {
  const crusts = ingredients.filter(i => isCrust(i.name))
  const extras = ingredients.filter(i => !isCrust(i.name))
  const groups: OptionGroupDTO[] = []

  if (crusts.length > 0) {
    const baseline = crustBaseline(crusts)
    groups.push({
      id: CRUST_GROUP_ID, name: 'เลือกแป้ง', required: true, minSelect: 1, maxSelect: 1, order: 0,
      choices: crusts.map((c, i) => ({ id: c.id, name: c.name, priceDelta: sigCrustDelta(c.price, baseline), available: c.available, order: i })),
    })
  }
  if (extras.length > 0) {
    groups.push({
      id: EXTRA_GROUP_ID, name: 'เพิ่มไส้ / ท็อปปิ้ง', required: false, minSelect: 0, maxSelect: extras.length, order: 1,
      choices: extras.map((e, i) => ({ id: e.id, name: e.name, priceDelta: e.price, available: e.available, order: i })),
    })
  }
  return groups
}

// Same derivation shaped for the server-side pricing helper.
export function deriveGroupsForPricing(ingredients: Ingredient[]): GroupForPricing[] {
  return deriveOptionGroups(ingredients).map(g => ({
    id: g.id, name: g.name, required: g.required, minSelect: g.minSelect, maxSelect: g.maxSelect,
    choices: g.choices.map(c => ({ id: c.id, name: c.name, priceDelta: c.priceDelta, available: c.available })),
  }))
}

// ── Multi-pool groups (แป้ง / แยม / ไส้หวาน / ไส้เค็ม / …) ───────────
// A category may link several ingredient categories; each linked category
// becomes one option group named after it. A pool category whose name
// starts with "แป้ง" is the base group: required, single-select, free swap
// for Signature / real price for DIY.
// `generic` marks a parent/self pool whose leftovers are "not yet sorted
// into a sub-category" — its residual group keeps the generic topping label.
export type IngredientPool = { id: number; name: string; items: Ingredient[]; generic?: boolean }

// Synthetic ids for per-pool groups; CRUST_GROUP_ID stays reserved for the
// base (แป้ง) group so DIY translation can find it.
const POOL_GROUP_BASE_ID = -100

export function isCrustCategory(name: string): boolean {
  return name.trim().startsWith('แป้ง')
}

/**
 * Expand linked pool category ids into the actual pools: a category with
 * sub-categories contributes itself plus its children (empty pools are
 * dropped later during group derivation, so a parent whose items were all
 * moved into sub-categories simply disappears from the steps).
 */
export function expandPoolIds(catIds: number[], childrenOf: Map<number, number[]>): number[] {
  const seen = new Set<number>()
  const out: number[] = []
  for (const id of catIds) {
    for (const x of [id, ...(childrenOf.get(id) ?? [])]) {
      if (!seen.has(x)) { seen.add(x); out.push(x) }
    }
  }
  return out
}

export function deriveGroupsFromPools(pools: IngredientPool[], mode: 'signature' | 'diy'): OptionGroupDTO[] {
  // Single mixed pool (legacy layout): split by item-name prefix as before.
  if (pools.length === 1 && !isCrustCategory(pools[0].name)) {
    return mode === 'signature' ? deriveOptionGroups(pools[0].items) : deriveDiyGroups(pools[0].items)
  }

  const groups: OptionGroupDTO[] = []
  let order = 0

  // Base group: every item of a แป้ง-named pool, plus แป้ง-named items still
  // sitting in mixed pools (e.g. the parent category during reorganization).
  const crustItems = pools.flatMap(p =>
    (isCrustCategory(p.name) ? p.items : p.items.filter(i => isCrust(i.name))))
  const crustBase = crustBaseline(crustItems)
  const crustChoices = crustItems.map((i, j) => ({
    id: i.id, name: i.name,
    priceDelta: mode === 'signature' ? sigCrustDelta(i.price, crustBase) : i.price,
    available: i.available, order: j,
  }))
  if (crustChoices.length > 0) {
    groups.push({
      id: CRUST_GROUP_ID, name: 'เลือกแป้ง',
      required: true, minSelect: 1, maxSelect: 1, order: order++,
      choices: crustChoices,
    })
  }

  // One optional group per remaining pool. Leftovers of a generic/mixed
  // parent pool keep the topping label; pure sub-categories are named after
  // themselves.
  pools.forEach((p, idx) => {
    if (isCrustCategory(p.name)) return
    const rest = p.items.filter(i => !isCrust(i.name))
    if (rest.length === 0) return
    const mixed = rest.length !== p.items.length
    groups.push({
      id: POOL_GROUP_BASE_ID - idx,
      name: mixed || p.generic ? 'เพิ่มไส้ / ท็อปปิ้ง' : p.name,
      required: false, minSelect: 0, maxSelect: rest.length, order: order++,
      choices: rest.map((i, j) => ({ id: i.id, name: i.name, priceDelta: i.price, available: i.available, order: j })),
    })
  })

  return groups
}

export function deriveGroupsFromPoolsForPricing(pools: IngredientPool[], mode: 'signature' | 'diy'): GroupForPricing[] {
  return deriveGroupsFromPools(pools, mode).map(g => ({
    id: g.id, name: g.name, required: g.required, minSelect: g.minSelect, maxSelect: g.maxSelect,
    choices: g.choices.map(c => ({ id: c.id, name: c.name, priceDelta: c.priceDelta, available: c.available })),
  }))
}

// ── DIY (จัดเอง) ──────────────────────────────────────────────────
// A DIY category is an ingredient pool the customer orders from directly.
// The UI shows one entry card that opens the same step sheet as Signature,
// but here the base item is ฿0 and the crust is charged at its real price.
export const DIY_NAME_PREFIX = 'DIY · '

export function deriveDiyGroups(ingredients: Ingredient[]): OptionGroupDTO[] {
  return deriveOptionGroups(ingredients).map(g =>
    g.id === CRUST_GROUP_ID
      ? {
          ...g,
          choices: g.choices.map(c => {
            const src = ingredients.find(i => i.id === c.id)
            return { ...c, priceDelta: src?.price ?? 0 }
          }),
        }
      : g,
  )
}

// Synthetic browsable item representing "build your own" for a DIY category.
// Prefers server-derived diyGroups (multi-pool aware); falls back to deriving
// from the category's own items (legacy single-pool layout).
export function buildDiyItem(cat: MenuCategoryDTO): MenuItemDTO {
  const groups = cat.diyGroups && cat.diyGroups.length > 0
    ? cat.diyGroups
    : deriveDiyGroups(cat.items.map(i => ({ id: i.id, name: i.name, price: i.price, available: true })))
  return {
    id: -cat.id, // negative = synthetic; translated to the chosen crust id on add
    name: cat.name,
    price: 0,
    imageUrl: cat.items.find(i => isCrust(i.name) && i.imageUrl)?.imageUrl ?? null,
    optionGroups: groups,
  }
}

/**
 * Convert a cart line produced from a synthetic DIY item into a real order
 * line: the chosen crust becomes the base menu item, the rest stay options.
 * Returns null if no crust was selected (the sheet enforces it as required).
 */
export function translateDiyLine(line: CartLine, diyItem: MenuItemDTO): CartLine | null {
  const crustGroup = diyItem.optionGroups.find(g => g.id === CRUST_GROUP_ID)
  if (!crustGroup) return null
  const crustIds = new Set(crustGroup.choices.map(c => c.id))
  const crustId = line.optionChoiceIds.find(id => crustIds.has(id))
  if (!crustId) return null
  const crust = crustGroup.choices.find(c => c.id === crustId)!
  const extraIds = line.optionChoiceIds.filter(id => id !== crustId)
  const extras = line.choices.filter(c => crustGroup.name !== c.groupName)
  return {
    ...line,
    key: lineKey(crustId, extraIds, line.note),
    menuItemId: crustId,
    name: `${DIY_NAME_PREFIX}${crust.name}`,
    basePrice: crust.priceDelta,
    optionChoiceIds: extraIds,
    choices: extras,
  }
}

// Server-side pricing groups for a DIY base (crust) item ordered directly:
// only the extras groups apply — the crust itself is the base item.
export function deriveDiyExtrasForPricing(ingredients: Ingredient[]): GroupForPricing[] {
  return deriveGroupsForPricing(ingredients).filter(g => g.id !== CRUST_GROUP_ID)
}

export function deriveDiyExtrasFromPools(pools: IngredientPool[]): GroupForPricing[] {
  return deriveGroupsFromPoolsForPricing(pools, 'diy').filter(g => g.id !== CRUST_GROUP_ID)
}
