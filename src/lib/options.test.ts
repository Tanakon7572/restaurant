import { it, expect } from 'vitest'
import { deriveOptionGroups, isCrust } from './options'
import { priceOrderItems, type MenuItemForPricing } from './order'
import { deriveGroupsForPricing } from './options'

const ingredients = [
  { id: 31, name: 'แป้งวานิลลา', price: 20, available: true },
  { id: 32, name: 'แป้งชาร์โคล', price: 25, available: true },
  { id: 50, name: 'ฝอยทอง', price: 10, available: true },
  { id: 51, name: 'ลูกเกด', price: 5, available: false },
]

it('detects crust by แป้ง prefix', () => {
  expect(isCrust('แป้งวานิลลา')).toBe(true)
  expect(isCrust('ฝอยทอง')).toBe(false)
})

it('builds a required single crust group and an optional multi extras group', () => {
  const groups = deriveOptionGroups(ingredients)
  expect(groups).toHaveLength(2)
  const [crust, extra] = groups
  expect(crust.name).toBe('เลือกแป้ง')
  expect(crust.required).toBe(true)
  expect(crust.maxSelect).toBe(1)
  expect(crust.choices.every(c => c.priceDelta === 0)).toBe(true)
  expect(extra.name).toBe('เพิ่มไส้ / ท็อปปิ้ง')
  expect(extra.required).toBe(false)
  expect(extra.maxSelect).toBe(2)
  expect(extra.choices.find(c => c.id === 50)!.priceDelta).toBe(10)
  expect(extra.choices.find(c => c.id === 51)!.available).toBe(false)
})

it('prices a Signature item with derived groups (crust free + extras added)', () => {
  const item: MenuItemForPricing = {
    id: 6, name: 'บลูเบอรี่+ฝอยทอง+ลูกเกด', price: 40,
    optionGroups: deriveGroupsForPricing(ingredients),
  }
  const menu = new Map([[6, item]])
  // pick crust 32 (free) + extra 50 (+10)
  const r = priceOrderItems([{ menuItemId: 6, quantity: 1, optionChoiceIds: [32, 50] }], menu)
  expect(r.ok).toBe(true)
  if (!r.ok) return
  expect(r.items[0].price).toBe(50) // 40 + 0 + 10
})

it('rejects a Signature item with no crust selected (required)', () => {
  const item: MenuItemForPricing = {
    id: 6, name: 'x', price: 40, optionGroups: deriveGroupsForPricing(ingredients),
  }
  const menu = new Map([[6, item]])
  const r = priceOrderItems([{ menuItemId: 6, quantity: 1, optionChoiceIds: [50] }], menu)
  expect(r.ok).toBe(false)
})
