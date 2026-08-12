/**
 * A slip's item section, reduced to rows, before anything decides whether it
 * becomes HTML for a browser dialog or bitmap commands for the handheld's
 * built-in head. Both renderers read from here so a set can never reconcile
 * one way on paper and another way on screen.
 */

import { baht } from './print'

// Structural shapes only: these come off the API as JSON, where dates are
// strings, so nothing here may assume a Date instance.
export type SlipOption = {
  groupName: string; choiceName: string; priceDelta: number
  // Set parts only: what the part is worth on its own. Null for a chosen
  // option, whose price is already inside the line total.
  unitPrice?: number | null
}
export type SlipItem = {
  itemName: string; quantity: number; price: number
  note?: string | null; options?: SlipOption[]
}
export type SlipOrder = {
  id: number; dailyNumber?: number; tableNumber?: string | null
  customerName?: string | null; note?: string | null
  createdAt: string | Date; items: SlipItem[]
}
export type SlipBill = {
  id: number; tableNumber?: string | null
  subtotal: number; discount: number; discountNote?: string | null
  serviceCharge: number; vat: number; total: number
  method: string; received?: number | null; changeDue?: number | null
  createdAt: string | Date; orders: SlipOrder[]
}

/** One printable row. `price` is already formatted, or '' when there is none. */
export type SlipLine = { qty: string; name: string; price: string; indent: boolean }

/**
 * One row per line, then one per option beneath it.
 *
 * Options sit in rows of their own rather than inside the name cell so a set's
 * parts can carry a figure in the price column. A part's price is what it
 * costs on its own — the set is sold for whatever the shop set, which is not
 * always the sum — so when the two differ the set price is spelled out on a
 * closing row instead of leaving the customer to add up and disagree.
 */
export function itemLines(items: SlipItem[], withPrice: boolean): SlipLine[] {
  const out: SlipLine[] = []
  const sub = (name: string, price: string) =>
    out.push({ qty: '', name, price: withPrice ? price : '', indent: true })

  for (const i of items) {
    const options = i.options ?? []
    out.push({
      qty: `${i.quantity}×`,
      name: i.itemName || '(ลบแล้ว)',
      price: withPrice ? baht(i.price * i.quantity) : '',
      indent: false,
    })

    for (const o of options) {
      sub(`• ${o.choiceName}`, o.unitPrice != null ? baht(o.unitPrice * i.quantity) : '')
    }

    // The set's own price, with any chosen option stripped back out of it.
    const parts = options.filter(o => o.unitPrice != null)
    const partsSum = parts.reduce((s, o) => s + (o.unitPrice ?? 0), 0)
    const setPrice = i.price - options.reduce((s, o) => s + o.priceDelta, 0)
    if (withPrice && parts.length > 0 && partsSum !== setPrice) {
      sub('ราคาเซ็ต', baht(setPrice * i.quantity))
    }

    if (i.note) sub(`** ${i.note}`, '')
  }
  return out
}
