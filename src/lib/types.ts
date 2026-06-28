export type OptionChoiceDTO = {
  id: number
  name: string
  priceDelta: number
  available: boolean
  order: number
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

export type MenuItemDTO = {
  id: number
  name: string
  price: number
  imageUrl: string | null
  optionGroups: OptionGroupDTO[]
}

export type MenuCategoryDTO = {
  id: number
  name: string
  order: number
  items: MenuItemDTO[]
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
