'use client'

import { useEffect, useState, useCallback } from 'react'
import EmptyState from '@/components/EmptyState'

interface KitchenOrderItem {
  id: number
  itemName: string
  quantity: number
  note: string | null
  menuItem?: { name: string } | null
  options?: { groupName: string; choiceName: string; priceDelta: number }[]
}

interface KitchenOrder {
  id: number
  dailyNumber?: number
  status: 'awaiting' | 'pending' | 'preparing'
  tableNumber: string | null
  customerName: string | null
  note: string | null
  createdAt: string
  items: KitchenOrderItem[]
}

function elapsed(createdAt: string) {
  const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000)
  if (diff < 60) return `${diff} วิ`
  const m = Math.floor(diff / 60)
  if (m < 60) return `${m} นาที`
  return `${Math.floor(m / 60)} ชม. ${m % 60} นาที`
}

function ElapsedTimer({ createdAt, warn }: { createdAt: string; warn: number }) {
  const [text, setText] = useState('')
  const [isWarn, setIsWarn] = useState(false)

  useEffect(() => {
    function tick() {
      setText(elapsed(createdAt))
      setIsWarn((Date.now() - new Date(createdAt).getTime()) / 60000 >= warn)
    }
    tick()
    const id = setInterval(tick, 10_000)
    return () => clearInterval(id)
  }, [createdAt, warn])

  if (!text) return null
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        fontSize: 'var(--text-xs)', fontWeight: isWarn ? 700 : 500,
        color: isWarn ? 'var(--c-danger)' : 'var(--c-text-3)',
        background: isWarn ? 'var(--c-danger-bg)' : 'var(--c-surface-2)',
        padding: '2px 8px', borderRadius: '99px',
        border: isWarn ? '1px solid var(--c-danger)' : '1px solid var(--c-border)',
      }}
    >
      {isWarn && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2L1 21h22L12 2zm0 3.5L20.5 19h-17L12 5.5zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z"/>
        </svg>
      )}
      {text}
    </span>
  )
}

function OrderCard({
  order,
  updating,
  onAction,
}: {
  order: KitchenOrder
  updating: boolean
  onAction: () => void
}) {
  const isPending = order.status !== 'preparing'
  const isAwaiting = order.status === 'awaiting'
  // The tint comes from the status class, not from a colour written here.
  // The previous version hard-coded oklch values that were left behind by a
  // palette change and no longer matched anything.
  const tint = isAwaiting ? 's-billing' : isPending ? 's-seated' : 's-preparing'

  return (
    <div
      className={`status-card ${tint}`}
      style={{
        padding: 0,
        overflow: 'hidden',
        opacity: updating ? 0.55 : 1,
        transition: 'opacity 0.18s, transform 0.18s',
        transform: updating ? 'scale(0.98)' : 'scale(1)',
      }}
    >
      <div style={{ height: '4px', background: 'var(--status)' }} />

      {/* Header */}
      <div style={{
        padding: '14px 16px 10px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        borderBottom: '1px solid var(--c-border)',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontSize: 'var(--text-lg)', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums' }}>
              #{order.dailyNumber ?? order.id}
            </span>
            {isAwaiting && <span className="badge badge-awaiting">คำขอใหม่จากลูกค้า</span>}
            {order.tableNumber && (
              <span style={{
                background: 'var(--c-surface-2)', color: 'var(--c-text-2)',
                border: '1px solid var(--c-border)',
                padding: '2px 10px', borderRadius: '99px',
                fontSize: 'var(--text-xs)', fontWeight: 600,
              }}>
                โต๊ะ {order.tableNumber}
              </span>
            )}
            {order.customerName && (
              <span style={{
                background: 'var(--c-surface-2)', color: 'var(--c-text-2)',
                border: '1px solid var(--c-border)',
                padding: '2px 10px', borderRadius: '99px',
                fontSize: 'var(--text-xs)', fontWeight: 600,
              }}>
                {order.customerName}
              </span>
            )}
          </div>
          <ElapsedTimer createdAt={order.createdAt} warn={15} />
        </div>

        {/* Item count badge */}
        <span className="status-badge" style={{
          borderRadius: '99px', padding: '3px 10px',
          fontSize: 'var(--text-xs)', fontWeight: 700,
        }}>
          {order.items.reduce((s, i) => s + i.quantity, 0)} รายการ
        </span>
      </div>

      {/* Items list */}
      <div style={{ padding: '10px 16px 4px' }}>
        {order.items.map((item, idx) => (
          <div
            key={item.id}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              padding: '8px 0',
              borderBottom: idx < order.items.length - 1 ? '1px solid var(--c-border)' : 'none',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <span style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--c-text)', lineHeight: 1.3 }}>
                {item.itemName || item.menuItem?.name || '(ลบแล้ว)'}
              </span>
              {item.options && item.options.length > 0 && (
                <ul style={{ listStyle: 'none', margin: '2px 0 0', paddingLeft: 2, fontSize: 'var(--text-sm)', color: 'var(--c-text-2)', lineHeight: 1.4 }}>
                  {item.options.map((o, i) => <li key={i}>• {o.choiceName}</li>)}
                </ul>
              )}
              {item.note && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--c-warning)', marginTop: 2, fontWeight: 600 }}>📝 {item.note}</p>}
            </div>
            <span style={{
              fontSize: 'var(--text-lg)', fontWeight: 800,
              color: 'var(--status)',
              fontFamily: 'var(--font-num)',
              fontVariantNumeric: 'tabular-nums',
              marginLeft: '12px', flexShrink: 0,
            }}>
              ×{item.quantity}
            </span>
          </div>
        ))}

        {order.note && (
          <div style={{
            margin: '8px 0 4px',
            padding: '8px 10px',
            background: 'var(--c-warning-bg)',
            border: '1px solid var(--c-accent)',
            borderRadius: '8px',
            fontSize: 'var(--text-xs)', color: 'var(--c-warning)', fontStyle: 'italic',
          }}>
            ⚠ {order.note}
          </div>
        )}
      </div>

      {/* Action button */}
      <div style={{ padding: '12px 16px' }}>
        <button
          onClick={onAction}
          disabled={updating}
          style={{
            width: '100%', padding: '14px',
            borderRadius: '10px', border: 'none',
            background: isPending ? 'var(--c-primary)' : 'var(--c-success-solid)',
            color: isPending ? 'var(--c-on-primary)' : '#fff',
            fontFamily: 'var(--font)', fontSize: 'var(--text-base)', fontWeight: 800,
            cursor: updating ? 'wait' : 'pointer',
            letterSpacing: '-0.01em',
            boxShadow: 'var(--shadow)',
            transition: 'opacity 0.12s, transform 0.12s',
          }}
          onMouseDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.97)' }}
          onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)' }}
        >
          {isAwaiting ? 'ยืนยัน + เริ่มทำ' : isPending ? 'รับออเดอร์' : 'เสร็จแล้ว ✓'}
        </button>
      </div>
    </div>
  )
}

function Column({
  title, count, color, accentBg, icon, children, empty,
}: {
  title: string; count: number; color: string; accentBg: string; icon: React.ReactNode; children: React.ReactNode; empty: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Column header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '14px 20px 12px',
        background: accentBg,
        borderBottom: `2px solid ${color}`,
        position: 'sticky', top: '65px', zIndex: 10,
      }}>
        <span style={{ color }}>{icon}</span>
        <span style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--c-text)' }}>{title}</span>
        <span style={{
          background: count > 0 ? color : 'var(--c-surface-3)',
          color: count > 0 ? 'var(--c-on-primary)' : 'var(--c-text-3)',
          borderRadius: '99px', padding: '1px 10px',
          fontSize: 'var(--text-xs)', fontWeight: 800, marginLeft: 'auto',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {count}
        </span>
      </div>

      {/* Cards */}
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
        {count === 0 ? empty : children}
      </div>
    </div>
  )
}

export default function KitchenPage() {
  const [orders, setOrders] = useState<KitchenOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<number | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [pulse, setPulse] = useState(false)

  const fetchOrders = useCallback(() => {
    fetch('/api/public/kitchen')
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        if (Array.isArray(data)) {
          setOrders(prev => {
            if (data.length > prev.length) setPulse(true)
            return data
          })
          setLastRefresh(new Date())
        }
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { if (pulse) { const t = setTimeout(() => setPulse(false), 600); return () => clearTimeout(t) } }, [pulse])

  useEffect(() => {
    fetchOrders()
    const id = setInterval(fetchOrders, 15_000)
    return () => clearInterval(id)
  }, [fetchOrders])

  async function updateStatus(id: number, status: 'preparing' | 'completed') {
    setUpdating(id)
    try {
      const res = await fetch('/api/public/kitchen', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      if (res.ok) fetchOrders()
    } finally {
      setUpdating(null)
    }
  }

  const pending   = orders.filter(o => o.status === 'pending' || o.status === 'awaiting')
  const preparing = orders.filter(o => o.status === 'preparing')

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--c-bg)',
      fontFamily: 'var(--font)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Top bar */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: 'var(--c-surface)',
        borderBottom: '1px solid var(--c-border)',
        padding: '0 20px',
        height: '65px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        boxShadow: 'var(--shadow)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '10px',
            background: 'var(--c-primary-light)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--c-primary)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <path d="M16 10a4 4 0 0 1-8 0"/>
            </svg>
          </div>
          <div>
            <p style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--c-text)', lineHeight: 1 }}>Kitchen Display</p>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--c-text-3)', marginTop: '2px', lineHeight: 1 }}>
              {lastRefresh
                ? `อัปเดต ${lastRefresh.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                : 'กำลังโหลด…'}
            </p>
          </div>
          {/* Live pulse dot */}
          <div style={{
            width: '8px', height: '8px', borderRadius: '50%',
            background: pulse ? 'var(--c-success)' : 'var(--c-surface-3)',
            transition: 'background 0.3s',
          }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {orders.length > 0 && (
            <span style={{
              background: 'var(--c-warning-bg)', color: 'var(--c-warning)',
              border: '1px solid var(--c-accent)',
              borderRadius: '99px', padding: '4px 14px',
              fontSize: 'var(--text-xs)', fontWeight: 700,
            }}>
              {orders.length} รายการรอ
            </span>
          )}
          <button
            onClick={fetchOrders}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: 'var(--c-surface-2)', border: '1px solid var(--c-border)',
              color: 'var(--c-text-2)', borderRadius: '8px', padding: '7px 14px',
              fontFamily: 'var(--font)', fontSize: 'var(--text-xs)', fontWeight: 500, cursor: 'pointer',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 4v6h6"/><path d="M23 20v-6h-6"/>
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
            </svg>
            รีเฟรช
          </button>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
          <div style={{ width: '36px', height: '36px', border: '3px solid var(--c-border)', borderTopColor: 'var(--c-primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <p style={{ color: 'var(--c-text-3)', fontSize: 'var(--text-sm)' }}>กำลังโหลดออเดอร์…</p>
        </div>
      ) : (
        <div style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 0,
          alignItems: 'start',
          borderTop: '1px solid var(--c-border)',
        }}>
          {/* Pending column */}
          <div style={{ borderRight: '1px solid var(--c-border)', minHeight: '100%' }}>
            <Column
              title="รอรับ"
              count={pending.length}
              color="var(--c-primary)"
              accentBg="var(--c-primary-light)"
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
              }
              empty={
                <EmptyState
                  title="ครัวโล่ง"
                  hint="ออเดอร์ที่รับเข้ามาจะเด้งขึ้นตรงนี้เอง ไม่ต้องรีเฟรช"
                />
              }
            >
              {pending.map(order => (
                <OrderCard key={order.id} order={order} updating={updating === order.id} onAction={() => updateStatus(order.id, 'preparing')} />
              ))}
            </Column>
          </div>

          {/* Preparing column */}
          <div>
            <Column
              title="กำลังทำ"
              count={preparing.length}
              color="var(--c-info)"
              accentBg="var(--c-info-bg)"
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a5 5 0 0 1 5 5v3H7V7a5 5 0 0 1 5-5z"/>
                  <path d="M6 10v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8"/>
                </svg>
              }
              empty={
                <EmptyState
                  title="ยังไม่มีจานที่กำลังทำ"
                  hint="กด “เริ่มทำ” บนตั๋วทางซ้ายเพื่อย้ายมาที่นี่"
                />
              }
            >
              {preparing.map(order => (
                <OrderCard key={order.id} order={order} updating={updating === order.id} onAction={() => updateStatus(order.id, 'completed')} />
              ))}
            </Column>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
