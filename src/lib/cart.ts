import type { CartLine } from './types'

export type CartState = CartLine[]

export function lineKey(menuItemId: number, choiceIds: number[], note: string | null): string {
  const ids = [...choiceIds].sort((a, b) => a - b).join(',')
  return `${menuItemId}|${ids}|${note ?? ''}`
}

export function addLine(state: CartState, line: CartLine): CartState {
  const key = line.key || lineKey(line.menuItemId, line.optionChoiceIds, line.note)
  const normalized = { ...line, key }
  const idx = state.findIndex(l => l.key === key)
  if (idx === -1) return [...state, normalized]
  const next = [...state]
  next[idx] = { ...next[idx], quantity: next[idx].quantity + normalized.quantity }
  return next
}

export function setQuantity(state: CartState, key: string, quantity: number): CartState {
  if (quantity <= 0) return state.filter(l => l.key !== key)
  return state.map(l => (l.key === key ? { ...l, quantity } : l))
}

export function removeLine(state: CartState, key: string): CartState {
  return state.filter(l => l.key !== key)
}

export function cartTotal(state: CartState): number {
  return state.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0)
}

export function cartCount(state: CartState): number {
  return state.reduce((sum, l) => sum + l.quantity, 0)
}
