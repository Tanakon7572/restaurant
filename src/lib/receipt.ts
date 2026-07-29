import { escapeHtml, baht } from './print'
import { METHOD_LABELS, type PaymentMethod } from './billing'
import type { ShopSettings } from './shopSettings'

// Structural shapes only: these come off the API as JSON, where dates are
// strings, so nothing here may assume a Date instance.
export type SlipOption = {
  groupName: string; choiceName: string; priceDelta: number
  // Set parts only: what the part is worth on its own. Null for a chosen
  // option, whose price is already inside the line total.
  unitPrice?: number | null
}
export type SlipItem = {
  itemName: string; quantity: number; price: number
  note?: string | null; options?: SlipOption[]
}
export type SlipOrder = {
  id: number; dailyNumber?: number; tableNumber?: string | null
  customerName?: string | null; note?: string | null
  createdAt: string | Date; items: SlipItem[]
}
export type SlipBill = {
  id: number; tableNumber?: string | null
  subtotal: number; discount: number; discountNote?: string | null
  serviceCharge: number; vat: number; total: number
  method: string; received?: number | null; changeDue?: number | null
  createdAt: string | Date; orders: SlipOrder[]
}

function thaiDateTime(at: string | Date): string {
  return new Date(at).toLocaleString('th-TH', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

/**
 * One row per line, then one per option beneath it.
 *
 * Options sit in rows of their own rather than inside the name cell so a set's
 * parts can carry a figure in the price column. A part's price is what it
 * costs on its own — the set is sold for whatever the shop set, which is not
 * always the sum — so when the two differ the set price is spelled out on a
 * closing row instead of leaving the customer to add up and disagree.
 */
function itemRows(items: SlipItem[], withPrice: boolean): string {
  const cell = (v: string) => (withPrice ? `<td class="p">${v}</td>` : '')
  const sub = (label: string, price: string) =>
    `<tr><td></td><td class="opt">${label}</td>${cell(price)}</tr>`

  return items.map(i => {
    const options = i.options ?? []
    const rows = options
      .map(o => sub(`• ${escapeHtml(o.choiceName)}`,
        o.unitPrice != null ? baht(o.unitPrice * i.quantity) : ''))
      .join('')

    // The set's own price, with any chosen option stripped back out of it.
    const parts = options.filter(o => o.unitPrice != null)
    const partsSum = parts.reduce((s, o) => s + (o.unitPrice ?? 0), 0)
    const setPrice = i.price - options.reduce((s, o) => s + o.priceDelta, 0)
    const reconcile = withPrice && parts.length > 0 && partsSum !== setPrice
      ? sub('ราคาเซ็ต', baht(setPrice * i.quantity))
      : ''

    const note = i.note ? sub(`** ${escapeHtml(i.note)}`, '') : ''
    return `<tr>
      <td class="q">${i.quantity}×</td>
      <td>${escapeHtml(i.itemName || '(ลบแล้ว)')}</td>
      ${cell(baht(i.price * i.quantity))}
    </tr>${rows}${reconcile}${note}`
  }).join('')
}

function moneyRow(label: string, value: number, cls = ''): string {
  return `<div class="row ${cls}"><span>${escapeHtml(label)}</span><span>${baht(value)}</span></div>`
}

/**
 * Customer receipt. `qrSvg` is the already-rendered PromptPay QR markup —
 * passed in rather than generated here so this module stays free of React and
 * printing works with no network.
 */
export function receiptHtml(bill: SlipBill, settings: ShopSettings, qrSvg?: string | null): string {
  const items = bill.orders.flatMap(o => o.items)
  const method = METHOD_LABELS[bill.method as PaymentMethod] ?? bill.method

  const vatLabel = settings.vatMode === 'included'
    ? `VAT ${settings.vatRate}% (รวมในราคาแล้ว)`
    : `VAT ${settings.vatRate}%`

  return `
    <div class="c">
      <div class="lg b">${escapeHtml(settings.shopName)}</div>
      ${settings.receiptHeader
        ? `<div>${escapeHtml(settings.receiptHeader).replace(/\n/g, '<br>')}</div>` : ''}
    </div>
    <div class="rule"></div>
    <div class="row"><span>ใบเสร็จ #${bill.id}</span><span>${escapeHtml(thaiDateTime(bill.createdAt))}</span></div>
    ${bill.tableNumber ? `<div class="row"><span>โต๊ะ</span><span>${escapeHtml(bill.tableNumber)}</span></div>` : ''}
    <div class="row"><span>ออเดอร์</span><span>${bill.orders.map(o => `#${o.dailyNumber ?? o.id}`).join(' ')}</span></div>
    <div class="rule"></div>
    <table>${itemRows(items, true)}</table>
    <div class="rule"></div>
    ${moneyRow('รวมค่าอาหาร', bill.subtotal)}
    ${bill.discount > 0
      ? moneyRow(`ส่วนลด${bill.discountNote ? ` (${bill.discountNote})` : ''}`, -bill.discount) : ''}
    ${bill.serviceCharge > 0
      ? moneyRow(`ค่าบริการ ${settings.serviceChargeRate}%`, bill.serviceCharge) : ''}
    ${bill.vat > 0 ? moneyRow(vatLabel, bill.vat) : ''}
    <div class="rule"></div>
    <div class="row b xl"><span>รวมทั้งสิ้น</span><span>${baht(bill.total)}</span></div>
    <div class="rule"></div>
    <div class="row"><span>ชำระโดย</span><span>${escapeHtml(method)}</span></div>
    ${bill.received != null ? moneyRow('รับเงิน', bill.received) : ''}
    ${bill.changeDue != null ? moneyRow('เงินทอน', bill.changeDue) : ''}
    ${qrSvg ? `<div class="qr">${qrSvg}</div><div class="c">สแกนเพื่อชำระเงิน</div>` : ''}
    <div class="rule"></div>
    <div class="c">
      ${settings.receiptFooter
        ? `<div>${escapeHtml(settings.receiptFooter).replace(/\n/g, '<br>')}</div>`
        : '<div>ขอบคุณที่ใช้บริการ</div>'}
    </div>
    <div style="height:8mm"></div>
  `
}

/**
 * Kitchen ticket: no prices at all, big order number, options and notes shown
 * in full. What the line cook needs and nothing else.
 */
export function kitchenTicketHtml(order: SlipOrder, shopName: string): string {
  return `
    <div class="c">
      <div class="b">${escapeHtml(shopName)}</div>
      <div class="xl b">ออเดอร์ #${order.dailyNumber ?? order.id}</div>
      ${order.tableNumber ? `<div class="lg b">โต๊ะ ${escapeHtml(order.tableNumber)}</div>` : ''}
      ${order.customerName ? `<div>${escapeHtml(order.customerName)}</div>` : ''}
      <div>${escapeHtml(thaiDateTime(order.createdAt))}</div>
    </div>
    <div class="rule"></div>
    <table>${itemRows(order.items, false)}</table>
    ${order.note ? `<div class="rule"></div><div class="b">หมายเหตุ: ${escapeHtml(order.note)}</div>` : ''}
    <div style="height:8mm"></div>
  `
}
