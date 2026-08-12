import { describe, it, expect } from 'vitest'
import { receiptJob, kitchenTicketJob, type PrintCmd } from './printJob'
import { DEFAULT_SHOP_SETTINGS } from './shopSettings'
import type { SlipBill, SlipOrder } from './slipLines'

const settings = { ...DEFAULT_SHOP_SETTINGS, shopName: 'ครัวคุณแม่', receiptWidth: 58 }

const order: SlipOrder = {
  id: 7, dailyNumber: 12, tableNumber: 'A3', customerName: null, note: null,
  createdAt: '2026-08-11T03:00:00.000Z',
  items: [{ itemName: 'ผัดกะเพรา', quantity: 1, price: 80 }],
}

const bill: SlipBill = {
  id: 5, tableNumber: 'A3',
  subtotal: 80, discount: 0, serviceCharge: 0, vat: 0, total: 80,
  method: 'cash', received: 100, changeDue: 20,
  createdAt: '2026-08-11T03:05:00.000Z', orders: [order],
}

const texts = (cmds: PrintCmd[]) =>
  cmds.flatMap(c => (c.kind === 'text' ? [c.text] : c.kind === 'row' ? [c.left] : []))

describe('receiptJob', () => {
  it('carries the paper width from settings', () => {
    expect(receiptJob(bill, settings, null).widthMm).toBe(58)
  })

  it('leads with the shop name, centred and large', () => {
    const [first] = receiptJob(bill, settings, null).cmds
    expect(first).toEqual({ kind: 'text', text: 'ครัวคุณแม่', align: 'center', size: 'lg', bold: true })
  })

  it('prints the grand total as the largest row on the slip', () => {
    const total = receiptJob(bill, settings, null).cmds
      .find(c => c.kind === 'row' && c.left === 'รวมทั้งสิ้น')
    expect(total).toEqual({ kind: 'row', left: 'รวมทั้งสิ้น', right: '80.00', size: 'xl', bold: true })
  })

  it('shows cash received and change when the bill was paid in cash', () => {
    expect(texts(receiptJob(bill, settings, null).cmds)).toEqual(
      expect.arrayContaining(['รับเงิน', 'เงินทอน']),
    )
  })

  it('omits discount, service and VAT rows when they are zero', () => {
    const labels = texts(receiptJob(bill, settings, null).cmds)
    expect(labels).not.toEqual(expect.arrayContaining(['ส่วนลด']))
    expect(labels.some(l => l.startsWith('VAT'))).toBe(false)
  })

  it('appends a QR command only when a PromptPay payload is supplied', () => {
    expect(receiptJob(bill, settings, null).cmds.some(c => c.kind === 'qr')).toBe(false)
    const withQr = receiptJob(bill, settings, '00020101021229...6304ABCD').cmds
    expect(withQr.find(c => c.kind === 'qr')).toEqual({
      kind: 'qr', data: '00020101021229...6304ABCD', caption: 'สแกนเพื่อชำระเงิน',
    })
  })

  it('ends with a paper feed so the slip clears the head', () => {
    const cmds = receiptJob(bill, settings, null).cmds
    expect(cmds[cmds.length - 1]).toEqual({ kind: 'feed', lines: 4 })
  })
})

describe('kitchenTicketJob', () => {
  it('prints the daily order number at the largest size', () => {
    const cmds = kitchenTicketJob(order, 'ครัวคุณแม่', 58).cmds
    expect(cmds).toEqual(expect.arrayContaining([
      { kind: 'text', text: 'ออเดอร์ #12', align: 'center', size: 'xl', bold: true },
    ]))
  })

  it('never puts a price on a kitchen ticket', () => {
    const cmds = kitchenTicketJob(order, 'ครัวคุณแม่', 58).cmds
    const priced = cmds.filter(c => c.kind === 'item' && c.price !== '')
    expect(priced).toEqual([])
  })
})
