/**
 * A slip as commands rather than markup — the wire format the Android wrapper
 * reads. Kept deliberately dumb: no nesting, no styling beyond four sizes, so
 * the renderer on the far side is a loop and not a layout engine.
 *
 * Sizes map to points on the device, not to CSS. `md` is the body size.
 */

import { baht } from './print'
import { itemLines, type SlipItem, type SlipBill, type SlipOrder } from './slipLines'
import { METHOD_LABELS, type PaymentMethod } from './billing'
import type { ShopSettings } from './shopSettings'

export type SlipAlign = 'left' | 'center' | 'right'
export type SlipSize = 'sm' | 'md' | 'lg' | 'xl'

export type PrintCmd =
  | { kind: 'text'; text: string; align?: SlipAlign; size?: SlipSize; bold?: boolean }
  | { kind: 'row'; left: string; right: string; size?: SlipSize; bold?: boolean }
  | { kind: 'item'; qty: string; name: string; price: string; indent: boolean }
  | { kind: 'rule' }
  | { kind: 'qr'; data: string; caption?: string }
  | { kind: 'feed'; lines: number }

export type PrintJob = { widthMm: number; cmds: PrintCmd[] }

function thaiDateTime(at: string | Date): string {
  return new Date(at).toLocaleString('th-TH', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const rule = (): PrintCmd => ({ kind: 'rule' })
const money = (left: string, value: number): PrintCmd =>
  ({ kind: 'row', left, right: baht(value) })

/** Multi-line shop header/footer text becomes one centred command per line. */
function lines(block: string, size: SlipSize = 'md'): PrintCmd[] {
  return block.split('\n').filter(l => l.trim() !== '')
    .map((l): PrintCmd => ({ kind: 'text', text: l, align: 'center', size }))
}

function itemCmds(items: SlipItem[], withPrice: boolean): PrintCmd[] {
  return itemLines(items, withPrice).map((l): PrintCmd =>
    ({ kind: 'item', qty: l.qty, name: l.name, price: l.price, indent: l.indent }))
}

/**
 * Customer receipt. `qrPayload` is the raw PromptPay EMVCo string — the
 * printer draws the code itself, so nothing has to rasterise an SVG.
 */
export function receiptJob(
  bill: SlipBill, settings: ShopSettings, qrPayload: string | null,
): PrintJob {
  const items = bill.orders.flatMap(o => o.items)
  const method = METHOD_LABELS[bill.method as PaymentMethod] ?? bill.method
  const vatLabel = settings.vatMode === 'included'
    ? `VAT ${settings.vatRate}% (รวมในราคาแล้ว)`
    : `VAT ${settings.vatRate}%`

  const cmds: PrintCmd[] = [
    { kind: 'text', text: settings.shopName, align: 'center', size: 'lg', bold: true },
    ...(settings.receiptHeader ? lines(settings.receiptHeader) : []),
    rule(),
    { kind: 'row', left: `ใบเสร็จ #${bill.id}`, right: thaiDateTime(bill.createdAt), size: 'sm' },
    ...(bill.tableNumber
      ? [{ kind: 'row', left: 'โต๊ะ', right: bill.tableNumber } as PrintCmd] : []),
    {
      kind: 'row', left: 'ออเดอร์',
      right: bill.orders.map(o => `#${o.dailyNumber ?? o.id}`).join(' '),
    },
    rule(),
    ...itemCmds(items, true),
    rule(),
    money('รวมค่าอาหาร', bill.subtotal),
  ]

  if (bill.discount > 0) {
    cmds.push(money(`ส่วนลด${bill.discountNote ? ` (${bill.discountNote})` : ''}`, -bill.discount))
  }
  if (bill.serviceCharge > 0) {
    cmds.push(money(`ค่าบริการ ${settings.serviceChargeRate}%`, bill.serviceCharge))
  }
  if (bill.vat > 0) cmds.push(money(vatLabel, bill.vat))

  cmds.push(
    rule(),
    { kind: 'row', left: 'รวมทั้งสิ้น', right: baht(bill.total), size: 'xl', bold: true },
    rule(),
    { kind: 'row', left: 'ชำระโดย', right: method },
  )
  if (bill.received != null) cmds.push(money('รับเงิน', bill.received))
  if (bill.changeDue != null) cmds.push(money('เงินทอน', bill.changeDue))
  if (qrPayload) cmds.push({ kind: 'qr', data: qrPayload, caption: 'สแกนเพื่อชำระเงิน' })

  cmds.push(
    rule(),
    ...(settings.receiptFooter
      ? lines(settings.receiptFooter)
      : [{ kind: 'text', text: 'ขอบคุณที่ใช้บริการ', align: 'center' } as PrintCmd]),
    { kind: 'feed', lines: 4 },
  )
  return { widthMm: settings.receiptWidth, cmds }
}

/**
 * Kitchen ticket: no prices at all, big order number, options and notes shown
 * in full. What the line cook needs and nothing else.
 */
export function kitchenTicketJob(order: SlipOrder, shopName: string, widthMm: number): PrintJob {
  const cmds: PrintCmd[] = [
    { kind: 'text', text: shopName, align: 'center', bold: true },
    {
      kind: 'text', text: `ออเดอร์ #${order.dailyNumber ?? order.id}`,
      align: 'center', size: 'xl', bold: true,
    },
    ...(order.tableNumber
      ? [{
          kind: 'text', text: `โต๊ะ ${order.tableNumber}`,
          align: 'center', size: 'lg', bold: true,
        } as PrintCmd]
      : []),
    ...(order.customerName
      ? [{ kind: 'text', text: order.customerName, align: 'center' } as PrintCmd]
      : []),
    { kind: 'text', text: thaiDateTime(order.createdAt), align: 'center', size: 'sm' },
    rule(),
    ...itemCmds(order.items, false),
  ]
  if (order.note) {
    cmds.push(rule(), { kind: 'text', text: `หมายเหตุ: ${order.note}`, bold: true })
  }
  cmds.push({ kind: 'feed', lines: 4 })
  return { widthMm, cmds }
}
