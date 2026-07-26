import { it, expect } from 'vitest'
import { computeBill, changeFor, round2 } from './billing'
import { promptPayPayload, normalizePromptPayId, crc16 } from './promptpay'

const plain = { vatMode: 'none' as const, vatRate: 7, serviceChargeRate: 0 }

it('passes the subtotal straight through when nothing is configured', () => {
  const b = computeBill({ subtotal: 250, discount: 0 }, plain)
  expect(b.total).toBe(250)
  expect(b.vat).toBe(0)
  expect(b.serviceCharge).toBe(0)
})

it('subtracts the discount before anything else', () => {
  const b = computeBill({ subtotal: 250, discount: 50 }, { ...plain, serviceChargeRate: 10 })
  expect(b.afterDiscount).toBe(200)
  expect(b.serviceCharge).toBe(20)
  expect(b.total).toBe(220)
})

it('clamps a discount bigger than the bill instead of going negative', () => {
  const b = computeBill({ subtotal: 100, discount: 500 }, plain)
  expect(b.discount).toBe(100)
  expect(b.total).toBe(0)
})

it('adds VAT on top of food plus service charge', () => {
  const b = computeBill({ subtotal: 100, discount: 0 }, { vatMode: 'added', vatRate: 7, serviceChargeRate: 10 })
  expect(b.serviceCharge).toBe(10)
  expect(b.vat).toBe(7.7)   // 7% of 110
  expect(b.total).toBe(117.7)
})

it('backs VAT out of a price that already includes it, leaving the total alone', () => {
  const b = computeBill({ subtotal: 107, discount: 0 }, { vatMode: 'included', vatRate: 7, serviceChargeRate: 0 })
  expect(b.total).toBe(107)
  expect(b.vat).toBe(7)
})

it('keeps the printed lines summing to the printed total', () => {
  const b = computeBill({ subtotal: 333.33, discount: 11.11 }, { vatMode: 'added', vatRate: 7, serviceChargeRate: 10 })
  expect(round2(b.afterDiscount + b.serviceCharge + b.vat)).toBe(b.total)
})

it('reports underpayment as negative change so the sale can be blocked', () => {
  expect(changeFor(220, 500)).toBe(280)
  expect(changeFor(220, 200)).toBe(-20)
})

it('normalises PromptPay ids to their 13-digit QR form', () => {
  expect(normalizePromptPayId('081-234-5678')).toEqual({ tag: '01', value: '0066812345678' })
  expect(normalizePromptPayId('+66812345678')).toEqual({ tag: '01', value: '0066812345678' })
  expect(normalizePromptPayId('1234567890123')).toEqual({ tag: '02', value: '1234567890123' })
  expect(normalizePromptPayId('12345')).toBeNull()
})

it('builds a PromptPay payload with a valid trailing checksum', () => {
  const payload = promptPayPayload('0812345678', 117.7)!
  expect(payload.startsWith('000201')).toBe(true)
  expect(payload).toContain('010212')          // dynamic: amount is fixed
  expect(payload).toContain('540611' + '7.70') // 54 06 117.70
  // Re-checksumming everything up to the last four chars must reproduce them.
  expect(crc16(payload.slice(0, -4))).toBe(payload.slice(-4))
})

it('marks an amount-less PromptPay QR as static', () => {
  const payload = promptPayPayload('0812345678')!
  expect(payload).toContain('010211')
  expect(payload).not.toContain('5406')
})

it('refuses to build a payload for an unusable id', () => {
  expect(promptPayPayload('abc', 100)).toBeNull()
})
