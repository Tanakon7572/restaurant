import { it, expect } from 'vitest'
import { priceOrderItems, type MenuItemForPricing } from './order'
import { SET_GROUP_NAME } from './setMenu'
import { CRUST_GROUP_ID } from './options'

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
    { groupName: 'ระดับความสุก', choiceName: 'แรร์', priceDelta: 0, unitPrice: null },
    { groupName: 'ท็อปปิ้ง', choiceName: 'ไข่ดอง', priceDelta: 30, unitPrice: null },
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
  optionGroups: [
    // Staff-only crust swap, priced against the ฿40 crust already in the set.
    { id: CRUST_GROUP_ID, name: 'เปลี่ยนแป้ง', required: false, minSelect: 0, maxSelect: 1,
      choices: [
        { id: 200, name: 'แป้งชาร์โคล', priceDelta: 5, available: true },
        { id: 201, name: 'แป้งงาดำ', priceDelta: -10, available: true },
      ] },
    { id: -100, name: 'ไส้หวาน', required: false, minSelect: 0, maxSelect: 5,
      choices: [{ id: 300, name: 'ฝอยทองเพิ่ม', priceDelta: 10, available: true }] },
  ],
  setParts: [
    { name: 'แป้งวานิลลา', quantity: 1, price: 40, crust: true },
    { name: 'ฝอยทอง', quantity: 1, price: 10 },
    { name: 'มาร์ชเมลโลว์', quantity: 2, price: 5 },
  ],
}
const setMenu = new Map([[2, setItem]])

it('itemises a set into its parts, each with what it is worth', () => {
  const r = priceOrderItems([{ menuItemId: 2, quantity: 1 }], setMenu)
  expect(r.ok).toBe(true)
  if (!r.ok) return
  expect(r.items[0].options).toEqual([
    { groupName: SET_GROUP_NAME, choiceName: 'แป้งวานิลลา', priceDelta: 0, unitPrice: 40 },
    { groupName: SET_GROUP_NAME, choiceName: 'ฝอยทอง', priceDelta: 0, unitPrice: 10 },
    { groupName: SET_GROUP_NAME, choiceName: 'มาร์ชเมลโลว์ ×2', priceDelta: 0, unitPrice: 10 },
  ])
})

it('lets a swapped crust stand in for the one the set came with', () => {
  const r = priceOrderItems([{ menuItemId: 2, quantity: 1, optionChoiceIds: [200] }], setMenu)
  expect(r.ok).toBe(true)
  if (!r.ok) return
  expect(r.items[0].options.map(o => o.choiceName))
    .toEqual(['แป้งชาร์โคล', 'ฝอยทอง', 'มาร์ชเมลโลว์ ×2'])
  expect(r.items[0].price).toBe(125)
})

it('gives back the difference when the swap is to a cheaper crust', () => {
  const r = priceOrderItems([{ menuItemId: 2, quantity: 1, optionChoiceIds: [201] }], setMenu)
  expect(r.ok).toBe(true)
  if (!r.ok) return
  expect(r.items[0].price).toBe(110)
})

it('reads crust, then the set, then what was added on top', () => {
  const r = priceOrderItems([{ menuItemId: 2, quantity: 1, optionChoiceIds: [200, 300] }], setMenu)
  expect(r.ok).toBe(true)
  if (!r.ok) return
  expect(r.items[0].options.map(o => o.choiceName))
    .toEqual(['แป้งชาร์โคล', 'ฝอยทอง', 'มาร์ชเมลโลว์ ×2', 'ฝอยทองเพิ่ม'])
  expect(r.items[0].price).toBe(135)
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
