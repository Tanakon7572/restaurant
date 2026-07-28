import { it, expect } from 'vitest'
import { setDisplayName, partsTotal, setSaving } from './setMenu'

const parts = [
  { name: 'แป้งวานิลลา', price: 40, quantity: 1 },
  { name: 'ฝอยทอง', price: 10, quantity: 1 },
  { name: 'มาร์ชเมลโล่', price: 5, quantity: 2 },
]

it('names a set after everything in it', () => {
  expect(setDisplayName(parts, 'เซ็ต')).toBe('แป้งวานิลลา + ฝอยทอง + มาร์ชเมลโล่ ×2')
})

it('falls back to the typed name while a set has no parts yet', () => {
  expect(setDisplayName([], 'เซ็ตใหม่')).toBe('เซ็ตใหม่')
})

it('totals the parts at their own prices, counting quantity', () => {
  expect(partsTotal(parts)).toBe(60)
})

it('reports what the set saves against buying the parts separately', () => {
  expect(setSaving(parts, 49)).toBe(11)
})

it('reports no saving when the set is not cheaper', () => {
  expect(setSaving(parts, 60)).toBe(0)
  expect(setSaving(parts, 75)).toBe(0)
})
