import { buildDiyItem, CRUST_GROUP_ID } from './options'
import type { CartLine, MenuCategoryDTO, MenuItemDTO } from './types'

export type EditTarget = {
  key: string
  item: MenuItemDTO
  initial: { optionChoiceIds: number[]; quantity: number; note: string | null }
}

/**
 * Find the picker a line was configured with, so it can be reopened with the
 * same steps the line was built from.
 *
 * The browsable menu is the source of truth here, not the order: only the menu
 * carries the photos on option choices. DIY is the awkward case — the builder
 * turns the chosen crust into the line's base menu item, so the item's own
 * groups no longer contain a แป้ง step at all. Resolving such a line back to
 * its builder puts the crust back on the sheet as a choice, which is the only
 * way staff can change it.
 *
 * `fallback` covers items the customer menu doesn't browse (a hidden category,
 * or one deleted since the order was taken): those reopen without photos.
 */
export function resolveEditTarget(
  line: CartLine,
  categories: MenuCategoryDTO[],
  fallback: Record<number, MenuItemDTO> = {},
): EditTarget | null {
  const initial = {
    optionChoiceIds: line.optionChoiceIds,
    quantity: line.quantity,
    note: line.note,
  }

  // DIY first: a crust also sits in its pool category's item list, and opening
  // it as a plain item would be the very bug this exists to avoid.
  for (const cat of categories) {
    if (!cat.diy) continue
    const crusts = (cat.diyGroups ?? []).find(g => g.id === CRUST_GROUP_ID)
    if (!crusts?.choices.some(c => c.id === line.menuItemId)) continue
    return {
      key: line.key,
      item: buildDiyItem(cat),
      // The crust stops being the base item and becomes a ticked choice again.
      initial: { ...initial, optionChoiceIds: [...line.optionChoiceIds, line.menuItemId] },
    }
  }

  for (const cat of categories) {
    if (cat.diy) continue
    const item = cat.items.find(i => i.id === line.menuItemId)
    if (item) return { key: line.key, item, initial }
  }

  const known = fallback[line.menuItemId]
  return known ? { key: line.key, item: known, initial } : null
}
