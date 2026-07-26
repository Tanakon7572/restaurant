// Bill arithmetic, kept free of Prisma so the checkout screen and the API can
// compute the same numbers and the tests can pin them down.

// none    = ไม่คิด VAT
// included = ราคาเมนูรวม VAT อยู่แล้ว — ถอดออกมาแสดงเฉย ๆ ไม่บวกซ้ำ
// added   = บวก VAT เพิ่มจากยอดหลังหักส่วนลด
export type VatMode = 'none' | 'included' | 'added'

export type BillSettings = {
  vatMode: VatMode
  vatRate: number            // percent
  serviceChargeRate: number  // percent
}

export type BillInput = {
  subtotal: number
  discount: number
}

export type BillTotals = {
  subtotal: number
  discount: number
  afterDiscount: number
  serviceCharge: number
  vat: number
  total: number
}

// Money is stored as Float, so every derived figure is rounded to satang
// before it is added to anything else — otherwise the printed lines don't
// sum to the printed total.
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export const PAYMENT_METHODS = ['cash', 'promptpay', 'transfer', 'card'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'เงินสด',
  promptpay: 'พร้อมเพย์',
  transfer: 'โอนเงิน',
  card: 'บัตร',
}

export function isPaymentMethod(v: unknown): v is PaymentMethod {
  return typeof v === 'string' && (PAYMENT_METHODS as readonly string[]).includes(v)
}

/**
 * Service charge applies to the discounted food total; VAT applies on top of
 * that including the service charge, which is how Thai restaurant bills read.
 * A discount larger than the subtotal is clamped — staff mistype it.
 */
export function computeBill(input: BillInput, settings: BillSettings): BillTotals {
  const subtotal = round2(Math.max(0, input.subtotal))
  const discount = round2(Math.min(Math.max(0, input.discount), subtotal))
  const afterDiscount = round2(subtotal - discount)

  const serviceCharge = round2(afterDiscount * Math.max(0, settings.serviceChargeRate) / 100)
  const base = round2(afterDiscount + serviceCharge)
  const rate = Math.max(0, settings.vatRate)

  if (settings.vatMode === 'added') {
    const vat = round2(base * rate / 100)
    return { subtotal, discount, afterDiscount, serviceCharge, vat, total: round2(base + vat) }
  }
  if (settings.vatMode === 'included') {
    // Back out the tax already sitting inside the price; the total is unchanged.
    const vat = round2(base - base * 100 / (100 + rate))
    return { subtotal, discount, afterDiscount, serviceCharge, vat, total: base }
  }
  return { subtotal, discount, afterDiscount, serviceCharge, vat: 0, total: base }
}

// Change owed for a cash payment. Negative (underpaid) is reported as such so
// the UI can block the sale rather than quietly showing ฿0.
export function changeFor(total: number, received: number): number {
  return round2(received - total)
}
