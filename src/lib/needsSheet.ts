import type { MenuItemDTO } from './types'

/**
 * Does tapping this item need to open the option sheet, or can it drop
 * straight into the cart?
 *
 * Options are the obvious reason. A set is the other: it has no choices to
 * make, but its whole selling point is what's inside it and what that would
 * cost separately — dropping it in silently would hide both.
 */
export function needsSheet(item: MenuItemDTO): boolean {
  return item.optionGroups.length > 0 || (item.setParts?.length ?? 0) > 0
}
