import { it, expect } from 'vitest'
import {
  deriveOptionGroups, isCrust, deriveGroupsForPricing,
  deriveDiyGroups, deriveDiyExtrasForPricing, buildDiyItem, translateDiyLine,
  CRUST_GROUP_ID, DIY_NAME_PREFIX,
} from './options'
import { priceOrderItems, type MenuItemForPricing } from './order'
import type { MenuCategoryDTO } from './types'

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

// ── DIY (จัดเอง) ──────────────────────────────────────────────────

it('DIY groups charge the crust at its real price', () => {
  const groups = deriveDiyGroups(ingredients)
  const crust = groups.find(g => g.id === CRUST_GROUP_ID)!
  expect(crust.required).toBe(true)
  expect(crust.choices.find(c => c.id === 31)!.priceDelta).toBe(20)
  expect(crust.choices.find(c => c.id === 32)!.priceDelta).toBe(25)
})

const diyCategory: MenuCategoryDTO = {
  id: 4, name: 'DIY', order: 0, diy: true,
  items: ingredients.map(i => ({ id: i.id, name: i.name, price: i.price, imageUrl: null, optionGroups: [] })),
}

it('builds a synthetic DIY item with a negative id and ฿0 base', () => {
  const item = buildDiyItem(diyCategory)
  expect(item.id).toBe(-4)
  expect(item.price).toBe(0)
  expect(item.optionGroups).toHaveLength(2)
})

it('translates a DIY line: crust becomes the base item, extras stay options', () => {
  const item = buildDiyItem(diyCategory)
  const line = translateDiyLine({
    key: '', menuItemId: item.id, name: item.name, basePrice: 0,
    quantity: 2, note: 'หวานน้อย',
    optionChoiceIds: [32, 50],
    choices: [
      { groupName: 'เลือกแป้ง', choiceName: 'แป้งชาร์โคล', priceDelta: 25 },
      { groupName: 'เพิ่มไส้ / ท็อปปิ้ง', choiceName: 'ฝอยทอง', priceDelta: 10 },
    ],
    unitPrice: 35,
  }, item)
  expect(line).not.toBeNull()
  expect(line!.menuItemId).toBe(32)
  expect(line!.name).toBe(`${DIY_NAME_PREFIX}แป้งชาร์โคล`)
  expect(line!.basePrice).toBe(25)
  expect(line!.optionChoiceIds).toEqual([50])
  expect(line!.choices).toEqual([{ groupName: 'เพิ่มไส้ / ท็อปปิ้ง', choiceName: 'ฝอยทอง', priceDelta: 10 }])
  expect(line!.unitPrice).toBe(35)
})

it('returns null when translating a DIY line without a crust', () => {
  const item = buildDiyItem(diyCategory)
  const line = translateDiyLine({
    key: '', menuItemId: item.id, name: item.name, basePrice: 0,
    quantity: 1, note: null, optionChoiceIds: [50], choices: [], unitPrice: 10,
  }, item)
  expect(line).toBeNull()
})

it('prices a DIY base crust with extras-only derived groups', () => {
  const crustItem: MenuItemForPricing = {
    id: 32, name: `${DIY_NAME_PREFIX}แป้งชาร์โคล`, price: 25,
    optionGroups: deriveDiyExtrasForPricing(ingredients),
  }
  const menu = new Map([[32, crustItem]])
  const r = priceOrderItems([{ menuItemId: 32, quantity: 1, optionChoiceIds: [50] }], menu)
  expect(r.ok).toBe(true)
  if (!r.ok) return
  expect(r.items[0].price).toBe(35) // 25 + 10
  expect(r.items[0].itemName).toBe('DIY · แป้งชาร์โคล')
})

it('rejects unavailable extras on a DIY base crust', () => {
  const crustItem: MenuItemForPricing = {
    id: 32, name: 'แป้งชาร์โคล', price: 25,
    optionGroups: deriveDiyExtrasForPricing(ingredients),
  }
  const menu = new Map([[32, crustItem]])
  const r = priceOrderItems([{ menuItemId: 32, quantity: 1, optionChoiceIds: [51] }], menu)
  expect(r.ok).toBe(false)
})
