import { it, expect } from 'vitest'
import { priceOrderItems, type MenuItemForPricing } from './order'
import { SET_GROUP_NAME } from './setMenu'

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

// A fixed set is one line on the bill, but the receipt and the kitchen ticket
// both have to say what is in it — so the parts ride along as options.
const setItem: MenuItemForPricing = {
  id: 2, name: 'แป้งวานิลลา + ฝอยทอง + มาร์ชเมลโลว์', price: 120,
  optionGroups: [],
  setParts: [
    { name: 'แป้งวานิลลา', quantity: 1 },
    { name: 'ฝอยทอง', quantity: 1 },
    { name: 'มาร์ชเมลโลว์', quantity: 2 },
  ],
}
const setMenu = new Map([[2, setItem]])

it('itemises a set into its parts', () => {
  const r = priceOrderItems([{ menuItemId: 2, quantity: 1 }], setMenu)
  expect(r.ok).toBe(true)
  if (!r.ok) return
  expect(r.items[0].options).toEqual([
    { groupName: SET_GROUP_NAME, choiceName: 'แป้งวานิลลา', priceDelta: 0 },
    { groupName: SET_GROUP_NAME, choiceName: 'ฝอยทอง', priceDelta: 0 },
    { groupName: SET_GROUP_NAME, choiceName: 'มาร์ชเมลโลว์ ×2', priceDelta: 0 },
  ])
})

it('charges the set price, not the parts', () => {
  const r = priceOrderItems([{ menuItemId: 2, quantity: 3 }], setMenu)
  expect(r.ok).toBe(true)
  if (!r.ok) return
  expect(r.items[0].price).toBe(120)
  expect(r.totalPrice).toBe(360)
})

it('leaves an ordinary item without set parts', () => {
  const r = priceOrderItems([{ menuItemId: 1, quantity: 1, optionChoiceIds: [100] }], menu)
  expect(r.ok).toBe(true)
  if (!r.ok) return
  expect(r.items[0].options.every(o => o.groupName !== SET_GROUP_NAME)).toBe(true)
})
