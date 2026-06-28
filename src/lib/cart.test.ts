import { it, expect } from 'vitest'
import { lineKey, addLine, cartTotal, type CartState } from './cart'
import type { CartLine } from './types'

const base = (over: Partial<CartLine> = {}): CartLine => ({
  key: '', menuItemId: 1, name: 'A', basePrice: 100, quantity: 1, note: null,
  optionChoiceIds: [110, 100], choices: [], unitPrice: 130, ...over,
})

it('lineKey is order-independent for choice ids', () => {
  expect(lineKey(1, [100, 110], null)).toBe(lineKey(1, [110, 100], null))
})

it('lineKey separates by note', () => {
  expect(lineKey(1, [100], 'no veg')).not.toBe(lineKey(1, [100], null))
})

it('addLine merges identical lines by quantity', () => {
  let s: CartState = []
  s = addLine(s, base({ quantity: 1 }))
  s = addLine(s, base({ quantity: 2 }))
  expect(s).toHaveLength(1)
  expect(s[0].quantity).toBe(3)
})

it('cartTotal sums unitPrice * quantity', () => {
  const s: CartState = [base({ key: 'k', quantity: 2, unitPrice: 130 })]
  expect(cartTotal(s)).toBe(260)
})
