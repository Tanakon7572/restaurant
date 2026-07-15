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
export function buildDiyItem(cat: MenuCategoryDTO): MenuItemDTO {
  const ingredients: Ingredient[] = cat.items.map(i => ({
    id: i.id, name: i.name, price: i.price, available: true,
  }))
  return {
    id: -cat.id, // negative = synthetic; translated to the chosen crust id on add
    name: cat.name,
    price: 0,
    imageUrl: cat.items.find(i => isCrust(i.name) && i.imageUrl)?.imageUrl ?? null,
    optionGroups: deriveDiyGroups(ingredients),
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
// only the extras group applies — the crust itself is the base item.
export function deriveDiyExtrasForPricing(ingredients: Ingredient[]): GroupForPricing[] {
  return deriveGroupsForPricing(ingredients).filter(g => g.id !== CRUST_GROUP_ID)
}
