import { it, expect } from 'vitest'
import { receiptHtml, kitchenTicketHtml } from './receipt'
import { receiptJob, kitchenTicketJob } from './printJob'
import { DEFAULT_SHOP_SETTINGS } from './shopSettings'

const bill = { id: 1, subtotal: 100, discount: 0, serviceCharge: 0, vat: 0, total: 100,
  method: 'promptpay', createdAt: '2026-08-18T00:00:00Z', orders: [] }
const order = { id: 1, createdAt: '2026-08-18T00:00:00Z', items: [] }
const texts = (j: ReturnType<typeof receiptJob>) =>
  j.cmds.filter(c => c.kind === 'text').map(c => (c as { text: string }).text)
const images = (j: ReturnType<typeof receiptJob>) => j.cmds.filter(c => c.kind === 'image').length

it('logo replaces the shop name, and the name returns without one', () => {
  const withLogo = { ...DEFAULT_SHOP_SETTINGS, shopName: 'ร้านเครป', logoUrl: 'u' }
  const bare = { ...DEFAULT_SHOP_SETTINGS, shopName: 'ร้านเครป' }

  expect(texts(receiptJob(bill, withLogo, null, 'LOGO'))).not.toContain('ร้านเครป')
  expect(images(receiptJob(bill, withLogo, null, 'LOGO'))).toBe(1)
  expect(texts(receiptJob(bill, bare, null, null))).toContain('ร้านเครป')
  expect(images(receiptJob(bill, bare, null, null))).toBe(0)

  expect(texts(kitchenTicketJob(order, 'ร้านเครป', 58, 'LOGO'))).not.toContain('ร้านเครป')
  expect(texts(kitchenTicketJob(order, 'ร้านเครป', 58, null))).toContain('ร้านเครป')

  expect(receiptHtml(bill, withLogo, null)).not.toContain('ร้านเครป')
  expect(receiptHtml(bill, bare, null)).toContain('ร้านเครป')
  expect(kitchenTicketHtml(order, 'ร้านเครป', 'u')).not.toContain('ร้านเครป')
  expect(kitchenTicketHtml(order, 'ร้านเครป', '')).toContain('ร้านเครป')
})

it('prints the uploaded QR with the amount spelled out, never encoded', () => {
  const j = receiptJob(bill, DEFAULT_SHOP_SETTINGS, null, null, 'QRPNG')
  expect(images(j)).toBe(1)
  expect(texts(j).join(' ')).toContain('กรอกยอด')
  // no `qr` command: nothing was encoded, so nothing can carry a wrong amount
  expect(j.cmds.some(c => c.kind === 'qr')).toBe(false)
})

it('a generated PromptPay code wins over the uploaded image', () => {
  const j = receiptJob(bill, DEFAULT_SHOP_SETTINGS, 'PAYLOAD', null, 'QRPNG')
  expect(j.cmds.some(c => c.kind === 'qr')).toBe(true)
  expect(images(j)).toBe(0)
  expect(texts(j).join(' ')).not.toContain('กรอกยอด')
})

it('html shows the uploaded QR only for promptpay with no id', () => {
  const s = { ...DEFAULT_SHOP_SETTINGS, paymentQrUrl: 'https://x/q.png' }
  expect(receiptHtml(bill, s, null)).toContain('payqr')
  expect(receiptHtml({ ...bill, method: 'cash' }, s, null)).not.toContain('payqr')
  expect(receiptHtml(bill, { ...s, promptPayId: '0812345678' }, null)).not.toContain('payqr')
})
