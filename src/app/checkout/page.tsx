'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import PosShell from '@/components/PosShell'
import { computeBill, changeFor, round2, PAYMENT_METHODS, METHOD_LABELS, type PaymentMethod } from '@/lib/billing'
import { promptPayPayload } from '@/lib/promptpay'
import { DEFAULT_SHOP_SETTINGS, type ShopSettings } from '@/lib/shopSettings'
import { printSlipJob } from '@/lib/printBridge'
import { receiptJob } from '@/lib/printJob'
import { receiptHtml, type SlipBill, type SlipOrder } from '@/lib/receipt'

const QRCode = dynamic(() => import('react-qr-code'), { ssr: false })

type OpenGroup = {
  key: string
  tableNumber: string | null
  customerName: string | null
  openedAt: string
  subtotal: number
  orders: SlipOrder[]
}

// Notes that get filled in with one tap instead of typing on a phone.
const QUICK_CASH = [100, 200, 500, 1000]
const DISCOUNT_PCTS = [5, 10, 20]

// A glyph per method so the tile is aimed at, not read. Decorative only —
// the label underneath is what a screen reader announces.
const METHOD_ICONS: Record<PaymentMethod, string> = {
  cash: '฿',
  promptpay: '⧉',
  transfer: '⇄',
  card: '▭',
}

function money(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function elapsed(from: string) {
  const mins = Math.floor((Date.now() - new Date(from).getTime()) / 60000)
  if (mins < 60) return `${mins} นาที`
  return `${Math.floor(mins / 60)} ชม. ${mins % 60} นาที`
}

export default function CheckoutPage() {
  const router = useRouter()
  const [groups, setGroups] = useState<OpenGroup[]>([])
  const [settings, setSettings] = useState<ShopSettings>(DEFAULT_SHOP_SETTINGS)
  const [loading, setLoading] = useState(true)

  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [discount, setDiscount] = useState('')
  const [discountNote, setDiscountNote] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [received, setReceived] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [paidBill, setPaidBill] = useState<SlipBill | null>(null)

  const load = useCallback(() => {
    fetch('/api/bills/open')
      .then(res => {
        if (res.status === 401) { router.push('/'); return null }
        return res.json()
      })
      .then(data => {
        if (!data?.groups) return
        setGroups(data.groups)
        setSettings(data.settings)
      })
      .finally(() => setLoading(false))
  }, [router])

  useEffect(() => { load() }, [load])

  const active = groups.find(g => g.key === activeKey) ?? null

  // The same arithmetic the server will redo on submit — this is a preview.
  const totals = computeBill(
    { subtotal: active?.subtotal ?? 0, discount: Number(discount) || 0 },
    settings,
  )
  // Which preset the current baht figure corresponds to, if any. Derived
  // rather than stored, so typing an amount by hand clears the chip instead
  // of leaving a wrong one lit.
  const discountValue = Number(discount) || 0
  const subtotalNow = active?.subtotal ?? 0
  const pctOff = discountValue === 0
    ? 0
    : DISCOUNT_PCTS.find(p => round2(subtotalNow * p / 100) === round2(discountValue)) ?? -1

  const change = changeFor(totals.total, Number(received) || 0)
  const cashShort = method === 'cash' && (received === '' || change < 0)

  // A generated PromptPay code carries the amount, so it always wins over an
  // uploaded image: the customer can't mistype what they never type.
  const qrPayload = method === 'promptpay' && settings.promptPayId
    ? promptPayPayload(settings.promptPayId, totals.total)
    : null
  const qrImage = method === 'promptpay' && !settings.promptPayId ? settings.paymentQrUrl : ''
  const hasPaymentQr = !!settings.promptPayId || !!settings.paymentQrUrl

  function openGroup(key: string) {
    setActiveKey(key)
    setDiscount(''); setDiscountNote(''); setMethod('cash'); setReceived('')
    setError(''); setPaidBill(null)
  }

  function printReceipt(bill: SlipBill) {
    // The handheld draws the QR from the payload itself; the browser dialog
    // lifts the on-screen SVG instead, so the slip carries the exact code the
    // customer was shown.
    //
    // Built from the bill, not from `qrPayload`: confirming a payment drops the
    // group out of `groups`, so the form's running total is already back to
    // zero by the time this runs, and a zero-amount payload is a QR the
    // customer can type any figure into.
    const payload = bill.method === 'promptpay' && settings.promptPayId
      ? promptPayPayload(settings.promptPayId, bill.total)
      : null
    printSlipJob(
      receiptJob(bill, settings, payload),
      () => {
        const qrSvg = bill.method === 'promptpay'
          ? document.querySelector('#promptpay-qr svg')?.outerHTML ?? null
          : null
        return receiptHtml(bill, settings, qrSvg)
      },
    )
  }

  async function confirm() {
    if (!active) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderIds: active.orders.map(o => o.id),
          method,
          discount: Number(discount) || 0,
          discountNote,
          received: method === 'cash' ? Number(received) || 0 : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'เกิดข้อผิดพลาด'); return }
      setPaidBill(data)
      setGroups(gs => gs.filter(g => g.key !== active.key))
      printReceipt(data)
    } catch {
      setError('เชื่อมต่อไม่ได้ กรุณาลองใหม่')
    } finally {
      setSaving(false)
    }
  }

  // ── Paid: receipt actions ────────────────────────────────────────────
  if (paidBill) {
    return (
      <PosShell>
        <div className="page-container fade-in">
          <div className="page-header"><h1 className="page-title">เก็บเงินแล้ว</h1></div>
          <div className="glass-panel" style={{ padding: '28px 20px', textAlign: 'center', marginBottom: '12px' }}>
            <div style={{ fontSize: '2.4rem', lineHeight: 1, marginBottom: '10px' }}>✅</div>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--c-text-3)' }}>ใบเสร็จ #{paidBill.id}</p>
            <p style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--c-primary)', margin: '4px 0' }}>
              ฿{money(paidBill.total)}
            </p>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--c-text-2)' }}>
              {METHOD_LABELS[paidBill.method as PaymentMethod] ?? paidBill.method}
              {paidBill.changeDue != null && paidBill.changeDue > 0 && ` · ทอน ฿${money(paidBill.changeDue)}`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => printReceipt(paidBill)}>
              พิมพ์ใบเสร็จอีกครั้ง
            </button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => { setPaidBill(null); setActiveKey(null); load() }}>
              เสร็จสิ้น
            </button>
          </div>
        </div>
      </PosShell>
    )
  }

  // ── Payment panel for one table ──────────────────────────────────────
  if (active) {
    return (
      <PosShell>
        <div className="page-container fade-in">
          <div className="page-header">
            <button className="btn btn-ghost btn-sm" onClick={() => setActiveKey(null)}>← กลับ</button>
            <h1 className="page-title" style={{ fontSize: '1.1rem' }}>
              {active.tableNumber ? `โต๊ะ ${active.tableNumber}` : `ออเดอร์ #${active.orders[0].dailyNumber ?? active.orders[0].id}`}
            </h1>
          </div>

          {/* Items */}
          <div className="glass-panel" style={{ padding: '14px 16px', marginBottom: '12px' }}>
            {active.orders.map(o => (
              <div key={o.id} style={{ marginBottom: '10px' }}>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--c-text-3)', marginBottom: '4px' }}>
                  ออเดอร์ #{o.dailyNumber ?? o.id}
                </p>
                {o.items.map((i, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '2px 0' }}>
                    <span style={{ fontSize: 'var(--text-sm)' }}>
                      {i.quantity}× {i.itemName}
                      {(i.options ?? []).length > 0 && (
                        <span style={{ color: 'var(--c-text-3)', fontSize: 'var(--text-xs)', display: 'block', paddingLeft: '14px' }}>
                          {(i.options ?? []).map(op => op.choiceName).join(', ')}
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: 'var(--text-sm)', whiteSpace: 'nowrap' }}>฿{money(i.price * i.quantity)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Discount */}
          <div className="glass-panel" style={{ padding: '14px 16px', marginBottom: '12px' }}>
            <span className="section-label">ส่วนลด</span>
            {/* Percentages are the discounts a floor actually gives. They
                write into the same baht field the cashier can still type in,
                so nothing new is stored and the bill maths is untouched. */}
            <div className="discount-chips" style={{ marginBottom: '8px' }}>
              <button
                type="button"
                className="discount-chip"
                aria-pressed={pctOff === 0}
                onClick={() => { setDiscount(''); setDiscountNote('') }}
              >
                ไม่ลด
              </button>
              {DISCOUNT_PCTS.map(pct => (
                <button
                  key={pct}
                  type="button"
                  className="discount-chip"
                  aria-pressed={pctOff === pct}
                  onClick={() => {
                    setDiscount(String(round2((active?.subtotal ?? 0) * pct / 100)))
                    setDiscountNote(`ลด ${pct}%`)
                  }}
                >
                  ลด {pct}%
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input
                className="input" type="number" inputMode="decimal" min="0"
                placeholder="0" value={discount} onChange={e => setDiscount(e.target.value)}
                style={{ flex: 1, minWidth: '90px' }}
              />
              <input
                className="input" placeholder="เหตุผล (ไม่บังคับ)"
                value={discountNote} onChange={e => setDiscountNote(e.target.value)}
                style={{ flex: 2, minWidth: '130px' }}
              />
            </div>
          </div>

          {/* Totals */}
          <div className="glass-panel" style={{ padding: '14px 16px', marginBottom: '12px' }}>
            <Row label="รวมค่าอาหาร" value={totals.subtotal} />
            {totals.discount > 0 && <Row label="ส่วนลด" value={-totals.discount} />}
            {totals.serviceCharge > 0 && <Row label={`ค่าบริการ ${settings.serviceChargeRate}%`} value={totals.serviceCharge} />}
            {totals.vat > 0 && (
              <Row
                label={`VAT ${settings.vatRate}%${settings.vatMode === 'included' ? ' (รวมแล้ว)' : ''}`}
                value={totals.vat}
              />
            )}
          </div>

          {/* Method. The amount owed leads the panel — it is the one figure
              the cashier reads aloud, so it is the loudest thing here. */}
          <div className="glass-panel-flush" style={{ marginBottom: '12px' }}>
            <div className="amount-hero">
              <span className="amount-hero-label">ยอดที่ต้องชำระ</span>
              <span className="amount-hero-value">฿{money(totals.total)}</span>
            </div>

            <div style={{ padding: '14px 16px' }}>
              <span className="section-label">วิธีชำระเงิน</span>
              <div className="pay-tiles">
                {PAYMENT_METHODS.map(m => (
                  <button
                    key={m}
                    type="button"
                    className="pay-tile"
                    aria-pressed={method === m}
                    onClick={() => setMethod(m)}
                    disabled={m === 'promptpay' && !hasPaymentQr}
                    title={m === 'promptpay' && !hasPaymentQr ? 'ยังไม่ได้ตั้งค่าพร้อมเพย์ หรืออัปโหลด QR รับเงิน' : undefined}
                  >
                    <span className="pay-tile-icon" aria-hidden="true">{METHOD_ICONS[m]}</span>
                    {METHOD_LABELS[m]}
                  </button>
                ))}
              </div>

            {method === 'cash' && (
              <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div className="cash-bar">
                  <span className="cash-bar-label">รับเงินมา</span>
                  <span className="cash-bar-value">฿{money(Number(received) || 0)}</span>
                </div>
                {/* Counted on keys, not typed into a field: a cashier holding
                    the handheld one-handed is not going to aim at a caret. */}
                <div className="keypad">
                  <button type="button" className="key key-note key-wide"
                    onClick={() => setReceived(String(totals.total))}>พอดี</button>
                  {QUICK_CASH.map(n => (
                    <button key={n} type="button" className="key key-note"
                      onClick={() => setReceived(String(n))}>{n}</button>
                  ))}
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                    <button key={n} type="button" className="key"
                      onClick={() => setReceived(r => (r === '0' ? '' : r) + n)}>{n}</button>
                  ))}
                  <button type="button" className="key"
                    onClick={() => setReceived(r => (r === '0' ? '' : r) + '0')}>0</button>
                  <button type="button" className="key" aria-label="ลบตัวเลขท้ายสุด"
                    onClick={() => setReceived(r => r.slice(0, -1))}>⌫</button>
                  <button type="button" className="key" aria-label="ล้างจำนวนเงิน"
                    onClick={() => setReceived('')}>C</button>
                  {received !== '' && (
                    <div className={`change-block${change < 0 ? ' is-short' : ''}`}>
                      {change < 0 ? 'ขาดอีก' : 'เงินทอน'}
                      <span className="change-block-value">฿{money(Math.abs(change))}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {method === 'promptpay' && (
              <div style={{ marginTop: '12px', textAlign: 'center' }}>
                {qrPayload ? (
                  <>
                    <div id="promptpay-qr" style={{ background: '#fff', padding: '12px', borderRadius: 'var(--radius-sm)', display: 'inline-block' }}>
                      <QRCode value={qrPayload} size={196} />
                    </div>
                    <p style={{ fontSize: 'var(--text-sm)', color: 'var(--c-text-3)', marginTop: '8px' }}>
                      ให้ลูกค้าสแกน — ยอด ฿{money(totals.total)} ถูกใส่ไว้ในคิวอาร์แล้ว
                    </p>
                  </>
                ) : qrImage ? (
                  <>
                    <div style={{ background: '#fff', padding: '12px', borderRadius: 'var(--radius-sm)', display: 'inline-block' }}>
                      <img src={qrImage} alt="QR รับเงิน" style={{ width: 196, height: 'auto', display: 'block' }} />
                    </div>
                    {/* The amount isn't in the code, so staff have to check it
                        against the customer's screen before accepting. */}
                    <p style={{ fontSize: 'var(--text-sm)', color: 'var(--c-warning)', fontWeight: 600, marginTop: '8px' }}>
                      ลูกค้าต้องกรอกยอดเอง ฿{money(totals.total)}
                    </p>
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--c-text-3)', marginTop: '2px' }}>
                      กรุณาตรวจสลิปว่ายอดตรงก่อนกดเก็บเงิน
                    </p>
                  </>
                ) : settings.promptPayId ? (
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--c-danger)' }}>
                    เบอร์พร้อมเพย์ในหน้าตั้งค่าไม่ถูกต้อง
                  </p>
                ) : (
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--c-danger)' }}>
                    ยังไม่ได้ตั้งค่าพร้อมเพย์ หรืออัปโหลด QR รับเงินในหน้าตั้งค่า
                  </p>
                )}
              </div>
            )}
            </div>
          </div>

          {error && (
            <p style={{ color: 'var(--c-danger)', fontSize: 'var(--text-sm)', marginBottom: '10px' }}>{error}</p>
          )}

          <button
            className="btn btn-primary btn-full"
            style={{ padding: '14px', fontSize: '1.05rem' }}
            disabled={saving || cashShort || totals.total < 0}
            onClick={confirm}
          >
            {saving ? 'กำลังบันทึก…' : `เก็บเงิน ฿${money(totals.total)}`}
          </button>
        </div>
      </PosShell>
    )
  }

  // ── Open tables ──────────────────────────────────────────────────────
  return (
    <PosShell>
      <div className="page-container fade-in">
        <div className="page-header">
          <h1 className="page-title">เก็บเงิน</h1>
          <button className="btn btn-ghost btn-sm" onClick={() => router.push('/reports')}>ปิดรอบขาย →</button>
        </div>

        {loading && <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--c-text-3)' }}>กำลังโหลด…</div>}

        {!loading && groups.length === 0 && (
          <div className="glass-panel" style={{ padding: '56px 24px', textAlign: 'center' }}>
            <p style={{ color: 'var(--c-text-3)' }}>ไม่มีบิลค้างชำระ</p>
          </div>
        )}

        {groups.map(g => (
          <button
            key={g.key}
            className="glass-panel"
            onClick={() => openGroup(g.key)}
            style={{
              display: 'block', width: '100%', textAlign: 'left', border: 'none',
              padding: '14px 16px', marginBottom: '8px', cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontWeight: 700, fontSize: 'var(--text-md)' }}>
                {g.tableNumber ? `โต๊ะ ${g.tableNumber}` : `ออเดอร์ #${g.orders[0].dailyNumber ?? g.orders[0].id}`}
              </span>
              <span className="price-tag">฿{money(g.subtotal)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', color: 'var(--c-text-3)' }}>
              <span>
                {g.orders.length} ออเดอร์ · {g.orders.reduce((s, o) => s + o.items.length, 0)} รายการ
                {g.customerName ? ` · ${g.customerName}` : ''}
              </span>
              <span>เปิดมา {elapsed(g.openedAt)}</span>
            </div>
          </button>
        ))}
      </div>
    </PosShell>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', color: 'var(--c-text-2)', padding: '2px 0' }}>
      <span>{label}</span>
      <span>฿{money(value)}</span>
    </div>
  )
}
