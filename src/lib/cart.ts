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

/**
 * Swap one configured line for a re-configured one. Editing options or the
 * note changes the line's identity, so this is a replace rather than an
 * update: the row keeps its position unless the edit turned it into a line
 * that already exists, in which case the two fold together.
 */
export function replaceLine(state: CartState, key: string, line: CartLine): CartState {
  const idx = state.findIndex(l => l.key === key)
  if (idx === -1) return addLine(state, line)

  const newKey = line.key || lineKey(line.menuItemId, line.optionChoiceIds, line.note)
  const normalized = { ...line, key: newKey }
  const twin = state.findIndex((l, i) => i !== idx && l.key === newKey)
  if (twin === -1) {
    const next = [...state]
    next[idx] = normalized
    return next
  }

  const next = state.filter((_, i) => i !== idx)
  const at = next.findIndex(l => l.key === newKey)
  next[at] = { ...next[at], quantity: next[at].quantity + normalized.quantity }
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
