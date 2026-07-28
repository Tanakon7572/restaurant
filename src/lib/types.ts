export type OptionChoiceDTO = {
  id: number
  name: string
  priceDelta: number
  available: boolean
  order: number
  // Only derived choices carry one: they are ingredient menu items, so the
  // picker can show the same photo the item has. Hand-made option choices
  // have no image and fall back to a letter tile.
  imageUrl?: string | null
}

export type OptionGroupDTO = {
  id: number
  name: string
  required: boolean
  minSelect: number
  maxSelect: number
  order: number
  choices: OptionChoiceDTO[]
}

// One part of a fixed set, priced as it would be if bought on its own.
export type SetPartDTO = {
  itemId: number
  name: string
  price: number
  quantity: number
}

export type MenuItemDTO = {
  id: number
  name: string
  price: number
  imageUrl: string | null
  // false = sold out: shown struck-through with a "หมด" badge, not orderable
  available?: boolean
  optionGroups: OptionGroupDTO[]
  // Non-empty = a fixed set. `price` is the set price; the parts are shown so
  // the customer can see what they get and what it would cost separately.
  setParts?: SetPartDTO[]
}

export type MenuCategoryDTO = {
  id: number
  name: string
  order: number
  items: MenuItemDTO[]
  // Ingredient-pool category shown as a single "build your own" entry
  diy?: boolean
  // Server-derived option groups for the DIY builder (one per linked pool)
  diyGroups?: OptionGroupDTO[]
}

// One configured line in the cart / order request
export type CartLine = {
  key: string            // stable identity: menuItemId + sorted choiceIds + note
  menuItemId: number
  name: string           // snapshot for display
  basePrice: number
  quantity: number
  note: string | null
  optionChoiceIds: number[]
  // display-only snapshot of chosen options
  choices: { groupName: string; choiceName: string; priceDelta: number }[]
  unitPrice: number      // basePrice + Σ priceDelta (display; server recomputes)
}

// Wire format sent to order POST endpoints
export type OrderItemInput = {
  menuItemId: number
  quantity: number
  note?: string | null
  optionChoiceIds?: number[]
}
