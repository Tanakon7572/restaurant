import { escapeHtml, baht } from './print'
import { itemLines, type SlipItem, type SlipOrder, type SlipBill } from './slipLines'
import { METHOD_LABELS, type PaymentMethod } from './billing'
import type { ShopSettings } from './shopSettings'

// The slip data model lives in ./slipLines, where both renderers can reach it.
export type { SlipOption, SlipItem, SlipOrder, SlipBill } from './slipLines'

function thaiDateTime(at: string | Date): string {
  return new Date(at).toLocaleString('th-TH', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function itemRows(items: SlipItem[], withPrice: boolean): string {
  // The qty cell carries `q` only on item rows: an indented row's cell is a
  // spacer, and the column's width is already set by the rows above it.
  return itemLines(items, withPrice).map(l => `<tr>
      <td${l.indent ? '' : ' class="q"'}>${escapeHtml(l.qty)}</td>
      <td${l.indent ? ' class="opt"' : ''}>${escapeHtml(l.name)}</td>
      ${withPrice ? `<td class="p">${escapeHtml(l.price)}</td>` : ''}
    </tr>`).join('')
}

function moneyRow(label: string, value: number, cls = ''): string {
  return `<div class="row ${cls}"><span>${escapeHtml(label)}</span><span>${baht(value)}</span></div>`
}

/**
 * The shop's mark above the name. Sized in millimetres because this markup is
 * bound for a paper width, not a screen, and printed at full contrast so the
 * browser's dialog does not helpfully lighten it.
 */
function logoBlock(url: string): string {
  return url ? `<img class="logo" src="${escapeHtml(url)}" alt="">` : ''
}

/**
 * Customer receipt. `qrSvg` is the already-rendered PromptPay QR markup —
 * passed in rather than generated here so this module stays free of React and
 * printing works with no network.
 */
export function receiptHtml(
  bill: SlipBill, settings: ShopSettings, qrSvg?: string | null,
): string {
  const items = bill.orders.flatMap(o => o.items)
  const method = METHOD_LABELS[bill.method as PaymentMethod] ?? bill.method

  const vatLabel = settings.vatMode === 'included'
    ? `VAT ${settings.vatRate}% (รวมในราคาแล้ว)`
    : `VAT ${settings.vatRate}%`

  return `
    <div class="c">
      ${settings.logoUrl
        ? logoBlock(settings.logoUrl)
        : `<div class="lg b">${escapeHtml(settings.shopName)}</div>`}
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
    ${qrSvg
      ? `<div class="qr">${qrSvg}</div><div class="c">สแกนเพื่อชำระเงิน</div>`
      : settings.paymentQrUrl && !settings.promptPayId && bill.method === 'promptpay'
        // The shop's own QR carries no amount. The total is already set in the
        // largest type on the slip a few lines up.
        ? `<div class="rule"></div><div class="c">สแกนเพื่อชำระเงิน</div>
           <img class="payqr" src="${escapeHtml(settings.paymentQrUrl)}" alt="">`
        : ''}
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
export function kitchenTicketHtml(order: SlipOrder, shopName: string, logoUrl = ''): string {
  return `
    <div class="c">
      ${logoUrl ? logoBlock(logoUrl) : `<div class="b">${escapeHtml(shopName)}</div>`}
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
