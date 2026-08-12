'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import PosShell from '@/components/PosShell'
import { METHOD_LABELS, PAYMENT_METHODS, round2, type PaymentMethod } from '@/lib/billing'
import { escapeHtml, baht } from '@/lib/print'
import { printSlipJob } from '@/lib/printBridge'
import type { PrintCmd, PrintJob } from '@/lib/printJob'
import { DEFAULT_SHOP_SETTINGS, type ShopSettings } from '@/lib/shopSettings'

type Report = {
  date: string
  billCount: number
  totalSales: number
  subtotal: number
  discount: number
  serviceCharge: number
  vat: number
  averageBill: number
  expectedCash: number
  byMethod: Record<PaymentMethod, { count: number; amount: number }>
  hourly: { hour: number; amount: number; count: number }[]
  topItems: { name: string; quantity: number; amount: number }[]
  voided: { count: number; amount: number }
  cancelledOrders: number
  close: { dayKey: string; closedAt: string; countedCash: number; expectedCash: number; note: string | null } | null
}

function money(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function todayKey() {
  // Bangkok day, matching how the server buckets bills.
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)
}

// Z-report slip: the summary the owner keeps, not a customer receipt.
function closeSlipHtml(r: Report, shopName: string, counted: number) {
  const diff = round2(counted - r.expectedCash)
  const line = (l: string, v: string) => `<div class="row"><span>${escapeHtml(l)}</span><span>${v}</span></div>`
  return `
    <div class="c"><div class="lg b">${escapeHtml(shopName)}</div><div class="b">สรุปปิดรอบขาย</div>
      <div>${escapeHtml(r.date)}</div></div>
    <div class="rule"></div>
    ${line('จำนวนบิล', String(r.billCount))}
    ${line('ยอดขายรวม', baht(r.totalSales))}
    ${line('เฉลี่ยต่อบิล', baht(r.averageBill))}
    <div class="rule"></div>
    ${PAYMENT_METHODS.map(m =>
      line(`${METHOD_LABELS[m]} (${r.byMethod[m].count})`, baht(r.byMethod[m].amount))).join('')}
    <div class="rule"></div>
    ${r.discount > 0 ? line('ส่วนลดรวม', baht(r.discount)) : ''}
    ${r.serviceCharge > 0 ? line('ค่าบริการรวม', baht(r.serviceCharge)) : ''}
    ${r.vat > 0 ? line('VAT รวม', baht(r.vat)) : ''}
    ${line('บิลที่ยกเลิก', `${r.voided.count} (${baht(r.voided.amount)})`)}
    ${line('ออเดอร์ที่ยกเลิก', String(r.cancelledOrders))}
    <div class="rule"></div>
    ${line('เงินสดที่ควรมี', baht(r.expectedCash))}
    ${line('เงินสดที่นับได้', baht(counted))}
    <div class="row b"><span>${diff === 0 ? 'ตรงพอดี' : diff > 0 ? 'เกิน' : 'ขาด'}</span><span>${baht(Math.abs(diff))}</span></div>
    <div class="rule"></div>
    <div class="c">พิมพ์ ${escapeHtml(new Date().toLocaleString('th-TH'))}</div>
    <div style="height:8mm"></div>
  `
}

// The same Z-report as `closeSlipHtml`, as commands for the handheld's head.
function closeSlipJob(r: Report, shopName: string, counted: number, widthMm: number): PrintJob {
  const diff = round2(counted - r.expectedCash)
  const row = (left: string, right: string): PrintCmd => ({ kind: 'row', left, right })
  const cmds: PrintCmd[] = [
    { kind: 'text', text: shopName, align: 'center', size: 'lg', bold: true },
    { kind: 'text', text: 'สรุปปิดรอบขาย', align: 'center', bold: true },
    { kind: 'text', text: r.date, align: 'center', size: 'sm' },
    { kind: 'rule' },
    row('จำนวนบิล', String(r.billCount)),
    row('ยอดขายรวม', baht(r.totalSales)),
    row('เฉลี่ยต่อบิล', baht(r.averageBill)),
    { kind: 'rule' },
    ...PAYMENT_METHODS.map(m =>
      row(`${METHOD_LABELS[m]} (${r.byMethod[m].count})`, baht(r.byMethod[m].amount))),
    { kind: 'rule' },
  ]
  if (r.discount > 0) cmds.push(row('ส่วนลดรวม', baht(r.discount)))
  if (r.serviceCharge > 0) cmds.push(row('ค่าบริการรวม', baht(r.serviceCharge)))
  if (r.vat > 0) cmds.push(row('VAT รวม', baht(r.vat)))
  cmds.push(
    row('บิลที่ยกเลิก', `${r.voided.count} (${baht(r.voided.amount)})`),
    row('ออเดอร์ที่ยกเลิก', String(r.cancelledOrders)),
    { kind: 'rule' },
    row('เงินสดที่ควรมี', baht(r.expectedCash)),
    row('เงินสดที่นับได้', baht(counted)),
    {
      kind: 'row', bold: true,
      left: diff === 0 ? 'ตรงพอดี' : diff > 0 ? 'เกิน' : 'ขาด',
      right: baht(Math.abs(diff)),
    },
    { kind: 'rule' },
    {
      kind: 'text', align: 'center', size: 'sm',
      text: `พิมพ์ ${new Date().toLocaleString('th-TH')}`,
    },
    { kind: 'feed', lines: 4 },
  )
  return { widthMm, cmds }
}

export default function ReportsPage() {
  const router = useRouter()
  const [date, setDate] = useState(todayKey())
  const [report, setReport] = useState<Report | null>(null)
  const [settings, setSettings] = useState<ShopSettings>(DEFAULT_SHOP_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [counted, setCounted] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/reports/daily?date=${date}`)
      .then(res => {
        if (res.status === 401) { router.push('/'); return null }
        return res.json()
      })
      .then(data => {
        if (!data?.date) return
        setReport(data)
        setCounted(data.close ? String(data.close.countedCash) : '')
        setNote(data.close?.note ?? '')
      })
      .finally(() => setLoading(false))
  }, [date, router])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    fetch('/api/settings')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.shopName) setSettings(s => ({ ...s, ...d })) })
      .catch(() => {})
  }, [])

  async function closeDay() {
    setSaving(true); setMsg('')
    try {
      const res = await fetch('/api/reports/daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, countedCash: Number(counted) || 0, note }),
      })
      const data = await res.json()
      if (res.ok) { setReport(data); setMsg('ปิดรอบเรียบร้อย') }
      else setMsg(data.error || 'เกิดข้อผิดพลาด')
    } finally {
      setSaving(false)
    }
  }

  const diff = report ? round2((Number(counted) || 0) - report.expectedCash) : 0
  const peak = report ? Math.max(1, ...report.hourly.map(h => h.amount)) : 1

  return (
    <PosShell>
      <div className="page-container fade-in">
        <div className="page-header">
          <h1 className="page-title">ปิดรอบขาย</h1>
          <input
            className="input" type="date" value={date} max={todayKey()}
            onChange={e => setDate(e.target.value)}
            style={{ width: 'auto', padding: '6px 10px' }}
          />
        </div>

        {loading && (
          <div className="glass-panel-flush" aria-busy="true" aria-label="กำลังโหลดรายงาน">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="skeleton-row">
                <div className="skeleton skeleton-line" style={{ width: '40%' }} />
                <div className="skeleton skeleton-line" style={{ width: '18%' }} />
              </div>
            ))}
          </div>
        )}

        {!loading && report && (
          <>
            {report.close && (
              <div className="glass-panel" style={{ padding: '10px 14px', marginBottom: '12px', background: 'var(--c-primary-muted)', border: '1px solid var(--c-primary-light)' }}>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--c-text-2)' }}>
                  ปิดรอบแล้วเมื่อ {new Date(report.close.closedAt).toLocaleString('th-TH')} — ปิดซ้ำได้ถ้านับเงินใหม่
                </p>
              </div>
            )}

            {/* Headline */}
            <div className="glass-panel" style={{ padding: '20px', marginBottom: '12px', textAlign: 'center' }}>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--c-text-3)' }}>ยอดขายรวม</p>
              <p style={{ fontSize: '2.2rem', fontWeight: 700, color: 'var(--c-primary)', lineHeight: 1.2 }}>
                ฿{money(report.totalSales)}
              </p>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--c-text-2)' }}>
                {report.billCount} บิล · เฉลี่ย ฿{money(report.averageBill)}/บิล
              </p>
            </div>

            {/* By method */}
            <div className="glass-panel" style={{ padding: '14px 16px', marginBottom: '12px' }}>
              <span className="section-label">แยกตามวิธีชำระ</span>
              {PAYMENT_METHODS.map(m => (
                <div key={m} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 'var(--text-sm)' }}>
                  <span style={{ color: 'var(--c-text-2)' }}>{METHOD_LABELS[m]} <span style={{ color: 'var(--c-text-4)' }}>({report.byMethod[m].count})</span></span>
                  <span>฿{money(report.byMethod[m].amount)}</span>
                </div>
              ))}
            </div>

            {/* Adjustments */}
            <div className="glass-panel" style={{ padding: '14px 16px', marginBottom: '12px' }}>
              <span className="section-label">รายการหัก / ยกเลิก</span>
              <Line label="ส่วนลดรวม" value={`฿${money(report.discount)}`} />
              {report.serviceCharge > 0 && <Line label="ค่าบริการรวม" value={`฿${money(report.serviceCharge)}`} />}
              {report.vat > 0 && <Line label="VAT รวม" value={`฿${money(report.vat)}`} />}
              <Line label="บิลที่ยกเลิก" value={`${report.voided.count} บิล (฿${money(report.voided.amount)})`} />
              <Line label="ออเดอร์ที่ยกเลิก" value={`${report.cancelledOrders} รายการ`} />
            </div>

            {/* Hourly */}
            {report.billCount > 0 && (
              <div className="glass-panel" style={{ padding: '14px 16px', marginBottom: '12px' }}>
                <span className="section-label">ยอดขายตามช่วงเวลา</span>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '80px' }}>
                  {report.hourly.map(h => (
                    <div key={h.hour} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}
                      title={`${h.hour}:00 — ฿${money(h.amount)} (${h.count} บิล)`}>
                      <div style={{
                        height: `${Math.round((h.amount / peak) * 100)}%`,
                        minHeight: h.amount > 0 ? '2px' : '0',
                        background: 'var(--c-primary)', borderRadius: '2px 2px 0 0',
                      }} />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', color: 'var(--c-text-4)', marginTop: '4px' }}>
                  <span>00:00</span><span>12:00</span><span>23:00</span>
                </div>
              </div>
            )}

            {/* Top items */}
            {report.topItems.length > 0 && (
              <div className="glass-panel" style={{ padding: '14px 16px', marginBottom: '12px' }}>
                <span className="section-label">เมนูขายดี</span>
                {report.topItems.map((i, idx) => (
                  <div key={i.name} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '3px 0', fontSize: 'var(--text-sm)' }}>
                    <span style={{ color: 'var(--c-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {idx + 1}. {i.name}
                    </span>
                    <span style={{ whiteSpace: 'nowrap' }}>{i.quantity} · ฿{money(i.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Cash count */}
            <div className="glass-panel" style={{ padding: '14px 16px', marginBottom: '12px' }}>
              <span className="section-label">นับเงินสดในลิ้นชัก</span>
              <Line label="เงินสดที่ควรมี" value={`฿${money(report.expectedCash)}`} />
              <input
                className="input" type="number" inputMode="decimal" min="0"
                placeholder="เงินสดที่นับได้จริง" value={counted}
                onChange={e => setCounted(e.target.value)}
                style={{ marginTop: '8px', fontSize: '1.1rem', fontWeight: 600 }}
              />
              {counted !== '' && (
                <p style={{
                  marginTop: '8px', fontWeight: 700,
                  color: diff === 0 ? 'var(--c-success)' : 'var(--c-danger)',
                }}>
                  {diff === 0 ? 'ตรงพอดี' : diff > 0 ? `เกิน ฿${money(diff)}` : `ขาด ฿${money(-diff)}`}
                </p>
              )}
              <textarea
                className="input" rows={2} placeholder="หมายเหตุ (ไม่บังคับ)"
                value={note} onChange={e => setNote(e.target.value)}
                style={{ marginTop: '8px' }}
              />
              {msg && <p style={{ marginTop: '8px', fontSize: 'var(--text-sm)', color: 'var(--c-success)' }}>{msg}</p>}
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <button
                  className="btn btn-ghost" style={{ flex: 1 }}
                  onClick={() => {
                    const cash = Number(counted) || 0
                    printSlipJob(
                      closeSlipJob(report, settings.shopName, cash, settings.receiptWidth),
                      () => closeSlipHtml(report, settings.shopName, cash),
                    )
                  }}
                >
                  พิมพ์สรุป
                </button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={closeDay} disabled={saving || counted === ''}>
                  {saving ? 'กำลังบันทึก…' : 'ปิดรอบ'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </PosShell>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 'var(--text-sm)' }}>
      <span style={{ color: 'var(--c-text-2)' }}>{label}</span>
      <span>{value}</span>
    </div>
  )
}
