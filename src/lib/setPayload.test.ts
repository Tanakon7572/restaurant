import { it, expect } from 'vitest'
import { parseSetBody } from './setPayload'

const ok = (body: Record<string, unknown>) => {
  const r = parseSetBody(body)
  if ('error' in r) throw new Error(r.error)
  return r
}

it('stores the price the customer is charged, not the pre-discount figure', () => {
  // The form does the subtraction and sends the result; nothing at checkout
  // re-derives it, so the menu and the till can never disagree.
  expect(ok({ price: 49, discount: 11, parts: [] }).price).toBe(49)
  expect(ok({ price: 49, discount: 11, parts: [] }).discount).toBe(11)
})

it('rejects a missing or negative price rather than charging zero', () => {
  expect(parseSetBody({ parts: [] })).toEqual({ error: 'ราคาไม่ถูกต้อง' })
  expect(parseSetBody({ price: -5, parts: [] })).toEqual({ error: 'ราคาไม่ถูกต้อง' })
})

it('treats a nonsense discount as none', () => {
  expect(ok({ price: 50, discount: -20, parts: [] }).discount).toBe(0)
  expect(ok({ price: 50, discount: 'abc', parts: [] }).discount).toBe(0)
})

it('keeps part quantities whole and at least one', () => {
  const parsed = ok({
    price: 10,
    parts: [{ itemId: 1, quantity: 2.7 }, { itemId: 2, quantity: 0 }, { itemId: 3 }],
  })
  expect(parsed.parts).toEqual([
    { itemId: 1, quantity: 2 },
    { itemId: 2, quantity: 1 },
    { itemId: 3, quantity: 1 },
  ])
})

it('drops parts with no usable item id', () => {
  const parsed = ok({ price: 10, parts: [{ itemId: 'x' }, { itemId: 4 }] })
  expect(parsed.parts).toEqual([{ itemId: 4, quantity: 1 }])
})

it('normalises a blank name and image to their empty forms', () => {
  const parsed = ok({ price: 10, name: '  ', imageUrl: '  ', parts: [] })
  expect(parsed.name).toBe('')
  expect(parsed.imageUrl).toBeNull()
})
