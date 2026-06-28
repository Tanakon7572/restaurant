import type { OrderItemInput } from './types'

export type ChoiceForPricing = { id: number; name: string; priceDelta: number; available: boolean }
export type GroupForPricing = {
  id: number; name: string; required: boolean; minSelect: number; maxSelect: number
  choices: ChoiceForPricing[]
}
export type MenuItemForPricing = {
  id: number; name: string; price: number; optionGroups: GroupForPricing[]
}

export type PricedOption = { groupName: string; choiceName: string; priceDelta: number }
export type PricedItem = {
  menuItemId: number; itemName: string; quantity: number; price: number
  note: string | null; options: PricedOption[]
}
export type PriceResult =
  | { ok: true; items: PricedItem[]; totalPrice: number }
  | { ok: false; error: string }

export function priceOrderItems(
  inputs: OrderItemInput[],
  menu: Map<number, MenuItemForPricing>,
): PriceResult {
  const priced: PricedItem[] = []
  let totalPrice = 0

  for (const input of inputs) {
    const item = menu.get(input.menuItemId)
    if (!item) return { ok: false, error: `ไม่พบเมนู (id ${input.menuItemId})` }

    const qty = Math.max(1, Math.floor(input.quantity || 1))
    const chosenIds = input.optionChoiceIds ?? []
    const chosenSet = new Set(chosenIds)

    // index choices across all groups of this item
    const choiceToGroup = new Map<number, { group: GroupForPricing; choice: ChoiceForPricing }>()
    for (const g of item.optionGroups)
      for (const c of g.choices) choiceToGroup.set(c.id, { group: g, choice: c })

    // every chosen id must belong to this item and be available
    for (const id of chosenIds) {
      const found = choiceToGroup.get(id)
      if (!found) return { ok: false, error: `ตัวเลือกไม่ถูกต้องสำหรับ "${item.name}"` }
      if (!found.choice.available) return { ok: false, error: `"${found.choice.name}" ไม่พร้อมจำหน่าย` }
    }

    // per-group min/max enforcement
    const options: PricedOption[] = []
    let delta = 0
    for (const g of item.optionGroups) {
      const picks = g.choices.filter(c => chosenSet.has(c.id))
      const min = g.required ? Math.max(1, g.minSelect) : g.minSelect
      if (picks.length < min) return { ok: false, error: `กรุณาเลือก "${g.name}"` }
      if (picks.length > g.maxSelect) return { ok: false, error: `"${g.name}" เลือกได้สูงสุด ${g.maxSelect}` }
      for (const c of picks) {
        delta += c.priceDelta
        options.push({ groupName: g.name, choiceName: c.name, priceDelta: c.priceDelta })
      }
    }

    const unit = item.price + delta
    totalPrice += unit * qty
    priced.push({
      menuItemId: item.id, itemName: item.name, quantity: qty, price: unit,
      note: input.note?.trim() ? input.note.trim() : null, options,
    })
  }

  return { ok: true, items: priced, totalPrice }
}
