import { it, expect } from 'vitest'
import { resolveEditTarget } from './editLine'
import { CRUST_GROUP_ID } from './options'
import type { CartLine, MenuCategoryDTO, MenuItemDTO } from './types'

const line = (over: Partial<CartLine> = {}): CartLine => ({
  key: 'k', menuItemId: 7, name: 'A', basePrice: 100, quantity: 2, note: 'ไม่ใส่ผัก',
  optionChoiceIds: [30], choices: [], unitPrice: 130, ...over,
})

const plainItem: MenuItemDTO = {
  id: 7, name: 'ครีมสด', price: 100, imageUrl: '/a.jpg',
  optionGroups: [{
    id: 1, name: 'ท็อปปิ้ง', required: false, minSelect: 0, maxSelect: 3, order: 0,
    choices: [{ id: 30, name: 'สตรอว์เบอร์รี', priceDelta: 20, available: true, order: 0, imageUrl: '/s.jpg' }],
  }],
}

const normalCat: MenuCategoryDTO = { id: 1, name: 'ซิกเนเจอร์', order: 0, items: [plainItem] }

// A DIY builder: แป้ง is a step, and each crust is also a real menu item that
// lives in the pool category the builder was derived from.
const diyCat: MenuCategoryDTO = {
  id: 2, name: 'จัดเอง', order: 1, diy: true,
  items: [{ id: 50, name: 'แป้งวานิลลา', price: 40, imageUrl: '/v.jpg', optionGroups: [] }],
  diyGroups: [
    {
      id: CRUST_GROUP_ID, name: 'เลือกแป้ง', required: true, minSelect: 1, maxSelect: 1, order: 0,
      choices: [
        { id: 50, name: 'แป้งวานิลลา', priceDelta: 40, available: true, order: 0, imageUrl: '/v.jpg' },
        { id: 51, name: 'แป้งช็อกโกแลต', priceDelta: 45, available: true, order: 1, imageUrl: '/c.jpg' },
      ],
    },
    {
      id: -100, name: 'ไส้', required: false, minSelect: 0, maxSelect: 5, order: 1,
      choices: [{ id: 60, name: 'นูเทลล่า', priceDelta: 25, available: true, order: 0, imageUrl: '/n.jpg' }],
    },
  ],
}

it('resolves a normal line to its menu item, photos and all', () => {
  const t = resolveEditTarget(line(), [normalCat, diyCat])
  expect(t?.item.id).toBe(7)
  expect(t?.item.optionGroups[0].choices[0].imageUrl).toBe('/s.jpg')
  expect(t?.initial).toEqual({ optionChoiceIds: [30], quantity: 2, note: 'ไม่ใส่ผัก' })
})

it('resolves a DIY line back to the builder so the crust step comes back', () => {
  const t = resolveEditTarget(line({ menuItemId: 50, optionChoiceIds: [60] }), [normalCat, diyCat])
  expect(t?.item.optionGroups.some(g => g.id === CRUST_GROUP_ID)).toBe(true)
  // The crust must arrive ticked, or saving would lose it.
  expect(t?.initial.optionChoiceIds).toEqual([60, 50])
})

it('prefers the DIY builder over the pool category the crust also sits in', () => {
  const poolTab: MenuCategoryDTO = { id: 3, name: 'แป้ง', order: 2, items: [
    { id: 50, name: 'แป้งวานิลลา', price: 40, imageUrl: '/v.jpg', optionGroups: [] },
  ] }
  const t = resolveEditTarget(line({ menuItemId: 50, optionChoiceIds: [] }), [poolTab, diyCat])
  expect(t?.item.optionGroups.some(g => g.id === CRUST_GROUP_ID)).toBe(true)
})

it('falls back to the order-supplied item when the menu no longer browses it', () => {
  const hidden: MenuItemDTO = { id: 99, name: 'เมนูซ่อน', price: 80, imageUrl: null, optionGroups: [] }
  const t = resolveEditTarget(line({ menuItemId: 99 }), [normalCat], { 99: hidden })
  expect(t?.item.name).toBe('เมนูซ่อน')
})

it('returns null when the line cannot be reconfigured against anything', () => {
  expect(resolveEditTarget(line({ menuItemId: 404 }), [normalCat, diyCat])).toBeNull()
})
