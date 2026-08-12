'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import PosShell from '@/components/PosShell'
import EmptyState from '@/components/EmptyState'

interface OrderItem {
  id: number
  itemName: string
  menuItem?: { name: string } | null
  quantity: number
  price: number
}

interface Order {
  id: number
  dailyNumber?: number
  status: string
  totalPrice: number
  tableNumber: string | null
  customerName: string | null
  note: string | null
  createdAt: string
  items: OrderItem[]
}

const STATUS_LABELS: Record<string, string> = {
  awaiting:  'รอยืนยัน',
  pending:   'รอรับ',
  preparing: 'กำลังทำ',
  completed: 'เสร็จแล้ว',
  cancelled: 'ยกเลิก',
}

const STATUSES = ['all', 'awaiting', 'pending', 'preparing', 'completed', 'cancelled'] as const

// Which tint a card wears. Kept beside the labels so a status can never pick
// up a colour here that means something else on the kitchen screen.
const STATUS_TINT: Record<string, string> = {
  awaiting:  's-billing',    // a customer is waiting on a yes
  pending:   's-seated',     // accepted, not started
  preparing: 's-preparing',
  completed: 's-free',
  cancelled: '',             // no tint: it is over, it should recede
}

// Past this, an order that is not finished has been sitting too long.
const LATE_AFTER_MIN = 20

function minutesSince(iso: string) {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
}

type Period = 'today' | '7d' | '30d' | 'custom'

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'today', label: 'วันนี้' },
  { value: '7d',    label: '7 วัน' },
  { value: '30d',   label: '30 วัน' },
  { value: 'custom', label: 'กำหนดเอง' },
]

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10)
}

function buildQuery(period: Period, from: string, to: string, status: string) {
  const params = new URLSearchParams()
  if (status !== 'all') params.set('status', status)

  if (period === 'today') {
    params.set('today', 'true')
  } else if (period === '7d') {
    params.set('days', '7')
  } else if (period === '30d') {
    params.set('days', '30')
  } else if (period === 'custom') {
    if (from) params.set('from', from)
    if (to)   params.set('to', to)
  }
  return params.toString()
}

function exportCSV(orders: Order[]) {
  const header = 'เลขออเดอร์,โต๊ะ,สถานะ,รายการ,ยอดรวม,วันเวลา'
  const rows = orders.map(o => {
    const items = o.items.map(i => `${i.itemName || i.menuItem?.name || '(ลบแล้ว)'}x${i.quantity}`).join('; ')
    const dt = new Date(o.createdAt).toLocaleString('th-TH', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
    return [
      o.dailyNumber ?? o.id,
      o.tableNumber ?? '-',
      STATUS_LABELS[o.status] ?? o.status,
      `"${items}"`,
      o.totalPrice,
      `"${dt}"`,
    ].join(',')
  })
  const csv = '﻿' + [header, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `orders_${toDateStr(new Date())}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function OrderSkeleton() {
  return (
    <div className="glass-panel" style={{ padding: '13px 16px', marginBottom: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div className="skeleton" style={{ width: '80px', height: '16px' }} />
        <div className="skeleton" style={{ width: '56px', height: '20px' }} />
      </div>
      <div className="skeleton" style={{ width: '60%', height: '13px', marginBottom: '8px' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div className="skeleton" style={{ width: '100px', height: '13px' }} />
        <div className="skeleton" style={{ width: '60px', height: '16px' }} />
      </div>
    </div>
  )
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('all')
  const [period, setPeriod] = useState<Period>('today')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const router = useRouter()

  const fetchOrders = useCallback(() => {
    setLoading(true)
    const q = buildQuery(period, from, to, status)
    fetch(`/api/orders${q ? `?${q}` : ''}`)
      .then(res => {
        if (res.status === 401) { router.push('/'); return null }
        return res.json()
      })
      .then(data => { if (Array.isArray(data)) setOrders(data) })
      .finally(() => setLoading(false))
  }, [period, from, to, status, router])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  const revenue = orders
    .filter(o => o.status !== 'cancelled' && o.status !== 'awaiting')
    .reduce((s, o) => s + o.totalPrice, 0)

  const today = toDateStr(new Date())

  return (
    <PosShell>
    <div className="page-container fade-in">
      <div className="page-header">
        <h1 className="page-title">ออเดอร์</h1>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => exportCSV(orders)}
          disabled={orders.length === 0}
          title="Export CSV"
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          CSV
        </button>
      </div>

      {/* Period tabs */}
      <div className="scroll-x" style={{ marginBottom: '10px' }}>
        {PERIOD_OPTIONS.map(p => (
          <button
            key={p.value}
            className={`btn btn-sm ${period === p.value ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setPeriod(p.value)}
            style={{ flexShrink: 0 }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom date range */}
      {period === 'custom' && (
        <div className="glass-panel fade-in" style={{ padding: '12px 14px', marginBottom: '10px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '130px' }}>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--c-text-3)', marginBottom: '4px' }}>จากวันที่</label>
            <input className="input" type="date" value={from} max={to || today} onChange={e => setFrom(e.target.value)} style={{ padding: '7px 10px' }} />
          </div>
          <div style={{ flex: 1, minWidth: '130px' }}>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--c-text-3)', marginBottom: '4px' }}>ถึงวันที่</label>
            <input className="input" type="date" value={to} min={from} max={today} onChange={e => setTo(e.target.value)} style={{ padding: '7px 10px' }} />
          </div>
          <button className="btn btn-primary btn-sm" onClick={fetchOrders} style={{ marginTop: '18px', flexShrink: 0 }}>
            ค้นหา
          </button>
        </div>
      )}

      {/* Awaiting-confirmation alert */}
      {orders.filter(o => o.status === 'awaiting').length > 0 && status !== 'awaiting' && (
        <button
          className="btn btn-full"
          onClick={() => setStatus('awaiting')}
          style={{ marginBottom: '12px', justifyContent: 'space-between', background: 'var(--c-warning-bg)', color: 'var(--c-warning)', border: '1px solid color-mix(in srgb, var(--c-warning) 35%, transparent)' }}
        >
          <span>🔔 มีคำขอจากลูกค้ารอยืนยัน {orders.filter(o => o.status === 'awaiting').length} รายการ</span>
          <span style={{ fontWeight: 700 }}>ดู →</span>
        </button>
      )}

      {/* Status filter */}
      <div className="scroll-x" style={{ marginBottom: '14px' }}>
        {STATUSES.map(s => (
          <button
            key={s}
            className={`btn btn-sm ${status === s ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setStatus(s)}
            style={{ flexShrink: 0 }}
          >
            {s === 'all' ? 'ทั้งหมด' : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Summary bar */}
      {!loading && orders.length > 0 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 12px',
            background: 'var(--c-primary-muted)',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '12px',
            border: '1px solid var(--c-primary-light)',
          }}
        >
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--c-text-2)', fontWeight: 500 }}>
            {orders.length} รายการ
          </span>
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--c-primary)' }}>
            ฿{revenue.toLocaleString('th-TH')}
          </span>
        </div>
      )}

      {/* List */}
      {loading
        ? Array.from({ length: 5 }).map((_, i) => <OrderSkeleton key={i} />)
        : orders.map(order => (
          (() => {
            const open = order.status !== 'completed' && order.status !== 'cancelled'
            const mins = minutesSince(order.createdAt)
            const late = open && mins >= LATE_AFTER_MIN
            return (
              <div
                key={order.id}
                className={`status-card ${late ? 's-late is-urgent' : STATUS_TINT[order.status] ?? ''}`}
                onClick={() => router.push(`/orders/${order.id}`)}
                style={{ marginBottom: '8px', cursor: 'pointer' }}
              >
                <div className="status-card-head">
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap', minWidth: 0 }}>
                    <span className="status-card-title">#{order.dailyNumber ?? order.id}</span>
                    {order.tableNumber && (
                      <span style={{ color: 'var(--c-text-2)', fontSize: 'var(--text-sm)' }}>
                        โต๊ะ {order.tableNumber}
                      </span>
                    )}
                    {order.customerName && (
                      <span style={{ color: 'var(--c-text-3)', fontSize: 'var(--text-sm)' }}>{order.customerName}</span>
                    )}
                  </div>
                  <span className="status-badge">{STATUS_LABELS[order.status]}</span>
                </div>

                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--c-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {order.items.map(i => `${i.itemName || i.menuItem?.name || '(ลบแล้ว)'} ×${i.quantity}`).join('  ·  ')}
                </p>

                <div className="status-card-foot">
                  {/* Open orders show how long they have been waiting, which
                      is what staff are scanning for. Finished ones show when
                      they happened, which is what a lookup wants. */}
                  <span className={`status-elapsed${late ? ' is-late' : ''}`}>
                    {open
                      ? `${mins} นาที`
                      : new Date(order.createdAt).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="price-tag">฿{order.totalPrice.toLocaleString('th-TH')}</span>
                </div>
              </div>
            )
          })()
        ))
      }

      {!loading && orders.length === 0 && (
        <div className="glass-panel">
          <EmptyState
            title="ไม่พบออเดอร์ในช่วงนี้"
            hint="ลองเปลี่ยนช่วงวันหรือสถานะด้านบน ออเดอร์ใหม่จะขึ้นที่นี่เองเมื่อมีการสั่ง"
          />
        </div>
      )}

    </div>
    </PosShell>
  )
}
