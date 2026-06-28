import type { OptionGroupDTO } from './types'
import type { GroupForPricing } from './order'

// An ingredient is just a menu item from the linked (hidden) ingredient category.
export type Ingredient = { id: number; name: string; price: number; available: boolean }

// Synthetic, item-local group ids for derived groups (negative to never collide
// with real OptionGroup ids, which are positive autoincrement).
export const CRUST_GROUP_ID = -1
export const EXTRA_GROUP_ID = -2

export function isCrust(name: string): boolean {
  return name.startsWith('แป้ง')
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
    groups.push({
      id: CRUST_GROUP_ID, name: 'เลือกแป้ง', required: true, minSelect: 1, maxSelect: 1, order: 0,
      choices: crusts.map((c, i) => ({ id: c.id, name: c.name, priceDelta: 0, available: c.available, order: i })),
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
