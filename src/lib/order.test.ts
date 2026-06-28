import { it, expect } from 'vitest'
import { priceOrderItems, type MenuItemForPricing } from './order'

const steak: MenuItemForPricing = {
  id: 1, name: 'ข้าวหน้าเนื้อ', price: 199,
  optionGroups: [
    { id: 10, name: 'ระดับความสุก', required: true, minSelect: 1, maxSelect: 1,
      choices: [
        { id: 100, name: 'แรร์', priceDelta: 0, available: true },
        { id: 101, name: 'เวลดัน', priceDelta: 0, available: true },
      ] },
    { id: 11, name: 'ท็อปปิ้ง', required: false, minSelect: 0, maxSelect: 10,
      choices: [
        { id: 110, name: 'ไข่ดอง', priceDelta: 30, available: true },
        { id: 111, name: 'เนื้อสไลด์', priceDelta: 129, available: false },
      ] },
  ],
}

const menu = new Map([[1, steak]])

it('prices base + selected option deltas', () => {
  const r = priceOrderItems([{ menuItemId: 1, quantity: 2, optionChoiceIds: [100, 110] }], menu)
  expect(r.ok).toBe(true)
  if (!r.ok) return
  expect(r.items[0].price).toBe(229)        // 199 + 30
  expect(r.totalPrice).toBe(458)            // 229 * 2
  expect(r.items[0].options).toEqual([
    { groupName: 'ระดับความสุก', choiceName: 'แรร์', priceDelta: 0 },
    { groupName: 'ท็อปปิ้ง', choiceName: 'ไข่ดอง', priceDelta: 30 },
  ])
})

it('rejects when required group missing', () => {
  const r = priceOrderItems([{ menuItemId: 1, quantity: 1, optionChoiceIds: [110] }], menu)
  expect(r.ok).toBe(false)
})

it('rejects when exceeding maxSelect', () => {
  const r = priceOrderItems([{ menuItemId: 1, quantity: 1, optionChoiceIds: [100, 101] }], menu)
  expect(r.ok).toBe(false)
})

it('rejects unavailable choice', () => {
  const r = priceOrderItems([{ menuItemId: 1, quantity: 1, optionChoiceIds: [100, 111] }], menu)
  expect(r.ok).toBe(false)
})

it('rejects unknown menu item', () => {
  const r = priceOrderItems([{ menuItemId: 999, quantity: 1 }], menu)
  expect(r.ok).toBe(false)
})

it('rejects unknown choice id', () => {
  const r = priceOrderItems([{ menuItemId: 1, quantity: 1, optionChoiceIds: [100, 555] }], menu)
  expect(r.ok).toBe(false)
})
