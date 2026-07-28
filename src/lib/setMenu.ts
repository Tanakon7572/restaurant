export type SetPart = {
  name: string
  price: number
  quantity: number
}

/**
 * What a set is called on the menu: every part, in the order staff arranged
 * them. A set's value is in what's inside it, so the parts are the name —
 * "แป้งวานิลลา + ฝอยทอง + มาร์ชเมลโล่" tells a customer more than "เซ็ต A" ever will.
 *
 * A part taken more than once is marked, so "แป้ง + ฝอยทอง ×2" doesn't read as
 * the same thing listed twice.
 */
export function setDisplayName(parts: SetPart[], fallback: string): string {
  if (parts.length === 0) return fallback
  return parts
    .map(p => (p.quantity > 1 ? `${p.name} ×${p.quantity}` : p.name))
    .join(' + ')
}

// What the parts would cost bought separately.
export function partsTotal(parts: SetPart[]): number {
  return parts.reduce((sum, p) => sum + p.price * p.quantity, 0)
}

/**
 * How much the set saves against buying the parts one by one. Zero when the
 * set costs the same or more — a "saving" of −฿5 is not something to print.
 */
export function setSaving(parts: SetPart[], setPrice: number): number {
  return Math.max(0, partsTotal(parts) - setPrice)
}
