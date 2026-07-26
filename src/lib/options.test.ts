import { it, expect } from 'vitest'
import {
  deriveOptionGroups, isCrust, deriveGroupsForPricing,
  deriveDiyGroups, deriveDiyExtrasForPricing, buildDiyItem, translateDiyLine,
  deriveGroupsFromPools, deriveDiyExtrasFromPools, isCrustCategory, expandPoolIds,
  withoutCrustStep, withoutHiddenPools,
  CRUST_GROUP_ID, DIY_NAME_PREFIX, type IngredientPool,
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
  // Signature crust = difference from the vanilla baseline (แป้งวานิลลา = 20)
  expect(crust.choices.find(c => c.id === 31)!.priceDelta).toBe(0)  // vanilla
  expect(crust.choices.find(c => c.id === 32)!.priceDelta).toBe(5)  // charcoal 25 − 20
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
  // pick crust 32 (charcoal +5 vs vanilla) + extra 50 (+10)
  const r = priceOrderItems([{ menuItemId: 6, quantity: 1, optionChoiceIds: [32, 50] }], menu)
  expect(r.ok).toBe(true)
  if (!r.ok) return
  expect(r.items[0].price).toBe(55) // 40 + 5 + 10
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

// ── Multi-pool groups (แป้ง / แยม / ไส้หวาน / ไส้เค็ม) ───────────────

const pools: IngredientPool[] = [
  { id: 10, name: 'แป้ง', items: [
    { id: 31, name: 'วานิลลา', price: 20, available: true },
    { id: 32, name: 'ชาร์โคล', price: 25, available: true },
  ]},
  { id: 11, name: 'แยม', items: [
    { id: 60, name: 'แยมส้ม', price: 10, available: true },
    { id: 61, name: 'แยมบลูเบอร์รี่', price: 10, available: true },
  ]},
  { id: 12, name: 'ไส้หวาน', items: [
    { id: 70, name: 'ฝอยทอง', price: 15, available: true },
  ]},
  { id: 13, name: 'ไส้เค็ม', items: [
    { id: 80, name: 'แฮมชีส', price: 20, available: false },
  ]},
]

it('keeps the crust step during reorganization (แป้ง items still in the mixed parent pool)', () => {
  // Production-shaped state: parent DIY still holds crusts + leftover
  // toppings, only แยม moved into a sub-category so far.
  const transitional: IngredientPool[] = [
    { id: 4, name: 'DIY', items: [
      { id: 31, name: 'แป้งวานิลลา', price: 20, available: true },
      { id: 32, name: 'แป้งชาร์โคล', price: 25, available: true },
      { id: 59, name: 'ฝอยทอง', price: 10, available: true },
    ]},
    { id: 5, name: 'แยม', items: [
      { id: 40, name: 'แยมส้ม', price: 5, available: true },
    ]},
  ]
  const groups = deriveGroupsFromPools(transitional, 'diy')
  expect(groups.map(g => g.name)).toEqual(['เลือกแป้ง', 'เพิ่มไส้ / ท็อปปิ้ง', 'แยม'])
  const crust = groups[0]
  expect(crust.id).toBe(CRUST_GROUP_ID)
  expect(crust.required).toBe(true)
  expect(crust.choices.map(c => c.id)).toEqual([31, 32])
  expect(crust.choices[1].priceDelta).toBe(25)
  expect(groups[1].choices.map(c => c.id)).toEqual([59])
  // signature mode: same shape, crust priced as the difference from vanilla
  const sig = deriveGroupsFromPools(transitional, 'signature')
  expect(sig[0].choices.find(c => c.id === 31)!.priceDelta).toBe(0) // แป้งวานิลลา
  expect(sig[0].choices.find(c => c.id === 32)!.priceDelta).toBe(5) // แป้งชาร์โคล 25 − 20
})

it('labels a generic parent pool\'s leftovers as toppings, not by category name', () => {
  // แป้ง moved into its own sub-category; parent DIY still holds unsorted
  // toppings and is marked generic.
  const reorganized: IngredientPool[] = [
    { id: 4, name: 'DIY', generic: true, items: [
      { id: 59, name: 'ฝอยทอง', price: 10, available: true },
    ]},
    { id: 6, name: 'แป้ง', items: [
      { id: 31, name: 'วานิลลา', price: 20, available: true },
    ]},
    { id: 5, name: 'แยม', items: [
      { id: 40, name: 'แยมส้ม', price: 5, available: true },
    ]},
  ]
  const groups = deriveGroupsFromPools(reorganized, 'diy')
  expect(groups.map(g => g.name)).toEqual(['เลือกแป้ง', 'เพิ่มไส้ / ท็อปปิ้ง', 'แยม'])
  expect(groups[0].choices[0].id).toBe(31)
})

it('expands pool ids into parent + sub-categories, deduped', () => {
  const childrenOf = new Map<number, number[]>([[4, [10, 11, 12]]])
  expect(expandPoolIds([4], childrenOf)).toEqual([4, 10, 11, 12])
  expect(expandPoolIds([4, 10], childrenOf)).toEqual([4, 10, 11, 12])
  expect(expandPoolIds([7], childrenOf)).toEqual([7])
})

it('detects crust category by แป้ง prefix', () => {
  expect(isCrustCategory('แป้ง')).toBe(true)
  expect(isCrustCategory('แป้งเครป')).toBe(true)
  expect(isCrustCategory('แยม')).toBe(false)
})

it('derives one group per pool, named after the category', () => {
  const groups = deriveGroupsFromPools(pools, 'diy')
  expect(groups.map(g => g.name)).toEqual(['เลือกแป้ง', 'แยม', 'ไส้หวาน', 'ไส้เค็ม'])
  const crust = groups[0]
  expect(crust.id).toBe(CRUST_GROUP_ID)
  expect(crust.required).toBe(true)
  expect(crust.maxSelect).toBe(1)
  expect(crust.choices.find(c => c.id === 32)!.priceDelta).toBe(25) // diy = real price
  const jam = groups[1]
  expect(jam.required).toBe(false)
  expect(jam.maxSelect).toBe(2)
  expect(jam.choices[0].priceDelta).toBe(10)
  expect(groups[3].choices[0].available).toBe(false)
})

it('signature mode prices the crust as the difference from vanilla across pools', () => {
  const groups = deriveGroupsFromPools(pools, 'signature')
  expect(groups[0].choices.find(c => c.id === 31)!.priceDelta).toBe(0) // วานิลลา (baseline 20)
  expect(groups[0].choices.find(c => c.id === 32)!.priceDelta).toBe(5) // ชาร์โคล 25 − 20
  expect(groups[1].choices[0].priceDelta).toBe(10)
})

it('hides the steps a category switched off, leaving the rest priced as before', () => {
  const all = deriveGroupsFromPools(pools, 'signature')
  const groups = withoutHiddenPools(all, pools, [11, 13])
  expect(groups.map(g => g.name)).toEqual(['เลือกแป้ง', 'ไส้หวาน'])
  // The remaining steps keep their ids, so a half-built cart stays valid.
  expect(groups[1].id).toBe(all[2].id)
  expect(withoutHiddenPools(all, pools, [])).toBe(all)
})

it('hides the legacy single-pool extras group too', () => {
  const single: IngredientPool[] = [{ id: 4, name: 'DIY', items: ingredients }]
  const groups = withoutHiddenPools(deriveGroupsFromPools(single, 'signature'), single, [4])
  expect(groups.map(g => g.name)).toEqual(['เลือกแป้ง'])
})

it('combines the crust toggle with hidden pools', () => {
  const groups = withoutHiddenPools(
    withoutCrustStep(deriveGroupsFromPools(pools, 'signature')), pools, [11, 12, 13])
  expect(groups).toEqual([])
})

it('falls back to legacy split for a single mixed pool', () => {
  const single: IngredientPool[] = [{ id: 4, name: 'DIY', items: ingredients }]
  const groups = deriveGroupsFromPools(single, 'signature')
  expect(groups.map(g => g.name)).toEqual(['เลือกแป้ง', 'เพิ่มไส้ / ท็อปปิ้ง'])
})

it('prices a multi-pool DIY order: crust base + extras from sibling pools', () => {
  const crustItem: MenuItemForPricing = {
    id: 32, name: 'DIY · ชาร์โคล', price: 25,
    optionGroups: deriveDiyExtrasFromPools(pools),
  }
  const menu = new Map([[32, crustItem]])
  const r = priceOrderItems([{ menuItemId: 32, quantity: 1, optionChoiceIds: [60, 70] }], menu)
  expect(r.ok).toBe(true)
  if (!r.ok) return
  expect(r.items[0].price).toBe(50) // 25 + 10 + 15
  expect(r.items[0].options.map(o => o.groupName)).toEqual(['แยม', 'ไส้หวาน'])
})

it('multi-pool DIY builder translates the crust into the base item', () => {
  const cat = {
    id: 5, name: 'DIY', order: 0, items: [], diy: true,
    diyGroups: deriveGroupsFromPools(pools, 'diy'),
  }
  const item = buildDiyItem(cat)
  expect(item.optionGroups).toHaveLength(4)
  const line = translateDiyLine({
    key: '', menuItemId: item.id, name: item.name, basePrice: 0,
    quantity: 1, note: null,
    optionChoiceIds: [31, 60],
    choices: [
      { groupName: 'เลือกแป้ง', choiceName: 'วานิลลา', priceDelta: 20 },
      { groupName: 'แยม', choiceName: 'แยมส้ม', priceDelta: 10 },
    ],
    unitPrice: 30,
  }, item)
  expect(line!.menuItemId).toBe(31)
  expect(line!.basePrice).toBe(20)
  expect(line!.optionChoiceIds).toEqual([60])
  expect(line!.choices.map(c => c.groupName)).toEqual(['แยม'])
})
