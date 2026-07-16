'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import { fetchWithCache } from '@/lib/cache'

interface OrderItem {
  menuItemId: number | null
  itemName: string
  quantity: number
  price: number
  menuItem?: { name: string } | null
}

interface Order {
  id: number
  status: string
  totalPrice: number
  tableNumber: string | null
  createdAt: string
  items: OrderItem[]
}

const STATUS_LABELS: Record<string, string> = {
  pending:   'รอรับ',
  preparing: 'กำลังทำ',
  completed: 'เสร็จแล้ว',
  cancelled: 'ยกเลิก',
}

type Period = 'today' | '7d' | '30d'
const PERIODS: { value: Period; label: string; days?: number }[] = [
  { value: 'today', label: 'วันนี้' },
  { value: '7d',   label: '7 วัน',  days: 7 },
  { value: '30d',  label: '30 วัน', days: 30 },
]

function getDayLabel(date: Date) {
  return date.toLocaleDateString('th-TH', { weekday: 'short' })
}

function getShortDate(date: Date) {
  return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
}

function StatCard({ label, value, color, sub }: { label: string; value: number | string; color?: string; sub?: string }) {
  return (
    <div className="glass-panel" style={{ padding: '14px 12px', textAlign: 'center' }}>
      <p style={{ fontSize: '1.55rem', fontWeight: 700, color: color ?? 'var(--c-text)', letterSpacing: '-0.025em', lineHeight: 1 }}>
        {value}
      </p>
      <p style={{ color: 'var(--c-text-3)', fontSize: 'var(--text-xs)', marginTop: '5px' }}>{label}</p>
      {sub && <p style={{ color: 'var(--c-text-4)', fontSize: '0.62rem', marginTop: '2px' }}>{sub}</p>}
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="page-container">
      <div className="page-header" style={{ gap: '12px' }}>
        <div className="skeleton" style={{ height: '28px', width: '120px' }} />
        <div className="skeleton" style={{ height: '32px', width: '180px', borderRadius: '99px' }} />
      </div>
      <div className="skeleton" style={{ height: '96px', borderRadius: '12px', marginBottom: '12px' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '20px' }}>
        {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: '72px', borderRadius: '12px' }} />)}
      </div>
      <div className="skeleton" style={{ height: '160px', borderRadius: '12px', marginBottom: '16px' }} />
      <BottomNav />
    </div>
  )
}

export default function DashboardPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [chartOrders, setChartOrders] = useState<Order[]>([])
  const [period, setPeriod] = useState<Period>('today')
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  const fetchData = useCallback(() => {
    setLoading(true)
    const todayQ   = '/api/orders?today=true'
    const chartQ   = period === 'today' ? '/api/orders?today=true' : `/api/orders?days=${period === '7d' ? 7 : 30}`
    const mainQ    = period === 'today' ? todayQ : `/api/orders?days=${period === '7d' ? 7 : 30}`

    Promise.all([
      fetchWithCache<Order[]>(`dashboard:${period}:main`, mainQ, 30_000).then(d => {
        if (d === null) fetch(mainQ).then(r => { if (r.status === 401) router.push('/') })
        return d
      }),
      period !== 'today' ? fetchWithCache<Order[]>(`dashboard:${period}:chart`, chartQ, 30_000) : Promise.resolve(null),
    ]).then(([mainData, chartData]) => {
      if (Array.isArray(mainData)) setOrders(mainData)
      if (Array.isArray(chartData)) setChartOrders(chartData)
      else if (Array.isArray(mainData)) setChartOrders(mainData)
    }).finally(() => setLoading(false))
  }, [period, router])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) return <DashboardSkeleton />

  const active = orders.filter(o => o.status !== 'cancelled' && o.status !== 'awaiting')
  const stats = {
    total:     orders.length,
    pending:   orders.filter(o => o.status === 'pending').length,
    preparing: orders.filter(o => o.status === 'preparing').length,
    completed: orders.filter(o => o.status === 'completed').length,
    revenue:   active.reduce((s, o) => s + o.totalPrice, 0),
    avgOrder:  active.length > 0 ? Math.round(active.reduce((s, o) => s + o.totalPrice, 0) / active.length) : 0,
  }

  // Chart data
  const chartDays = period === '30d' ? 30 : 7
  const chartData = (() => {
    const days: { label: string; revenue: number; date: string }[] = []
    for (let i = chartDays - 1; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().slice(0, 10)
      const label   = period === '30d' ? getShortDate(d) : getDayLabel(d)
      const revenue = chartOrders
        .filter(o => o.status !== 'cancelled' && o.status !== 'awaiting' && o.createdAt.slice(0, 10) === dateStr)
        .reduce((s, o) => s + o.totalPrice, 0)
      days.push({ label, revenue, date: dateStr })
    }
    return days
  })()

  const maxRevenue = Math.max(...chartData.map(d => d.revenue), 1)
  const todayStr   = new Date().toISOString().slice(0, 10)

  // Top items
  const topItems = (() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>()
    for (const order of orders) {
      if (order.status === 'cancelled' || order.status === 'awaiting') continue
      for (const item of order.items) {
        const name = item.itemName || item.menuItem?.name || '(ลบแล้ว)'
        const key  = String(item.menuItemId ?? name)
        const e = map.get(key)
        if (e) { e.qty += item.quantity; e.revenue += item.price * item.quantity }
        else     map.set(key, { name, qty: item.quantity, revenue: item.price * item.quantity })
      }
    }
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty).slice(0, 5)
  })()

  async function handleLogout() {
    await fetch('/api/auth', { method: 'DELETE' })
    router.push('/')
  }

  const periodConfig = PERIODS.find(p => p.value === period)!
  const dateLabel = period === 'today'
    ? new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
    : `${periodConfig.days} วันล่าสุด`

  return (
    <div className="page-container fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">สรุป</h1>
          <p style={{ color: 'var(--c-text-3)', fontSize: 'var(--text-sm)', marginTop: '2px' }}>{dateLabel}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Period switcher */}
          <div style={{ display: 'flex', background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', borderRadius: 'var(--radius-sm)', padding: '3px', gap: '2px' }}>
            {PERIODS.map(p => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                style={{
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  background: period === p.value ? 'var(--c-surface)' : 'transparent',
                  color: period === p.value ? 'var(--c-text)' : 'var(--c-text-3)',
                  fontFamily: 'var(--font)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: period === p.value ? 600 : 400,
                  cursor: 'pointer',
                  boxShadow: period === p.value ? 'var(--shadow-xs)' : 'none',
                  transition: 'all var(--t-fast)',
                  whiteSpace: 'nowrap',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={handleLogout}>ออก</button>
        </div>
      </div>

      {/* Revenue hero card */}
      <div className="glass-panel" style={{ padding: '20px', marginBottom: '10px', background: 'var(--c-primary)', border: 'none', boxShadow: 'var(--shadow-md)' }}>
        <p style={{ color: 'oklch(1 0 0 / 0.85)', fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '6px' }}>
          รายได้{period === 'today' ? 'วันนี้' : ` ${periodConfig.days} วัน`}
        </p>
        <p style={{ fontSize: 'var(--text-3xl)', fontWeight: 800, letterSpacing: '-0.035em', color: 'var(--c-on-primary)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          ฿{stats.revenue.toLocaleString('th-TH')}
        </p>
        {stats.avgOrder > 0 && (
          <p style={{ color: 'oklch(1 0 0 / 0.78)', fontSize: 'var(--text-xs)', marginTop: '8px', fontWeight: 600 }}>
            เฉลี่ยต่อออเดอร์ ฿{stats.avgOrder.toLocaleString('th-TH')}
          </p>
        )}
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '20px' }}>
        <StatCard label="ทั้งหมด"  value={stats.total}     color="var(--c-text)" />
        <StatCard label="รอรับ"    value={stats.pending}   color="var(--c-warning)" />
        <StatCard label="กำลังทำ"  value={stats.preparing} color="var(--c-info)" />
        <StatCard label="เสร็จแล้ว" value={stats.completed} color="var(--c-success)" />
      </div>

      {/* Chart */}
      <div className="glass-panel" style={{ padding: '18px 16px 14px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '16px' }}>
          <h2 style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>รายได้แต่ละวัน</h2>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--c-text-3)' }}>
            สูงสุด ฿{maxRevenue.toLocaleString('th-TH')}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: period === '30d' ? '3px' : '6px', height: '100px' }}>
          {chartData.map((d) => {
            const isToday = d.date === todayStr
            const heightPct = maxRevenue > 0 ? Math.max((d.revenue / maxRevenue) * 100, d.revenue > 0 ? 4 : 1) : 1
            return (
              <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', height: '100%', justifyContent: 'flex-end' }}>
                <div
                  style={{
                    width: '100%',
                    height: `${heightPct}%`,
                    background: isToday ? 'var(--c-primary)' : 'var(--c-primary-light)',
                    borderRadius: '4px 4px 2px 2px',
                    border: isToday ? 'none' : '1px solid var(--c-border)',
                    transition: 'height 0.4s ease',
                    minHeight: '3px',
                    cursor: 'default',
                  }}
                  title={`฿${d.revenue.toLocaleString('th-TH')}`}
                />
                {period !== '30d' && (
                  <span style={{ fontSize: '0.62rem', color: isToday ? 'var(--c-primary)' : 'var(--c-text-3)', fontWeight: isToday ? 700 : 400, lineHeight: 1 }}>
                    {d.label}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Top items */}
      {topItems.length > 0 && (
        <div className="glass-panel-flush" style={{ marginBottom: '20px' }}>
          <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--c-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2 style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>เมนูขายดี</h2>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--c-text-3)' }}>
              {period === 'today' ? 'วันนี้' : `${periodConfig.days} วัน`}
            </span>
          </div>
          {topItems.map((item, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '11px 16px',
                borderBottom: idx < topItems.length - 1 ? '1px solid var(--c-border)' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span
                  style={{
                    width: '24px', height: '24px', borderRadius: '50%',
                    background: idx === 0 ? 'var(--c-primary)' : idx === 1 ? 'var(--c-surface-3)' : 'var(--c-surface-2)',
                    color: idx === 0 ? 'var(--c-on-primary)' : 'var(--c-text-3)',
                    fontSize: 'var(--text-xs)', fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}
                >
                  {idx + 1}
                </span>
                <span style={{ fontSize: 'var(--text-base)', fontWeight: 500 }}>{item.name}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--c-primary)' }}>{item.qty} ชิ้น</p>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--c-text-3)' }}>฿{item.revenue.toLocaleString('th-TH')}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recent orders */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' }}>
        <h2 style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>ออเดอร์ล่าสุด</h2>
        <button className="btn btn-ghost btn-xs" onClick={() => router.push('/orders')}>ดูทั้งหมด</button>
      </div>

      {orders.filter(o => o.status !== 'cancelled').slice(0, 8).map(order => (
        <div
          key={order.id}
          className="glass-panel"
          onClick={() => router.push(`/orders/${order.id}`)}
          style={{ padding: '12px 16px', marginBottom: '6px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          onMouseEnter={e => (e.currentTarget.style.boxShadow = 'var(--shadow-md)')}
          onMouseLeave={e => (e.currentTarget.style.boxShadow = 'var(--shadow)')}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
              <span style={{ fontWeight: 700, fontSize: 'var(--text-base)' }}>#{order.id}</span>
              {order.tableNumber && (
                <span style={{ color: 'var(--c-text-2)', fontSize: 'var(--text-xs)', background: 'var(--c-surface-2)', padding: '2px 7px', borderRadius: 'var(--radius-full)', border: '1px solid var(--c-border)' }}>
                  โต๊ะ {order.tableNumber}
                </span>
              )}
            </div>
            <p style={{ color: 'var(--c-text-3)', fontSize: 'var(--text-xs)' }}>
              {new Date(order.createdAt).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span className={`badge badge-${order.status}`}>{STATUS_LABELS[order.status]}</span>
            <p className="price-tag" style={{ marginTop: '4px', fontSize: 'var(--text-base)' }}>
              ฿{order.totalPrice.toLocaleString('th-TH')}
            </p>
          </div>
        </div>
      ))}

      {orders.length === 0 && (
        <div className="glass-panel" style={{ padding: '56px 24px', textAlign: 'center' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--c-text-4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 12px' }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
          </svg>
          <p style={{ color: 'var(--c-text-3)', fontSize: 'var(--text-base)', marginBottom: '16px' }}>ยังไม่มีออเดอร์</p>
          <button className="btn btn-primary btn-sm" onClick={() => router.push('/orders/new')}>
            สั่งอาหารแรก
          </button>
        </div>
      )}

      <BottomNav />
    </div>
  )
}
