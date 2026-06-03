'use client'

import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

interface MenuItem {
  id: number
  name: string
  price: number
  imageUrl?: string | null
}

interface Category {
  id: number
  name: string
  items: MenuItem[]
}

interface CartItem {
  menuItemId: number
  name: string
  price: number
  quantity: number
}

interface OrderStatus {
  id: number
  status: string
  totalPrice: number
  tableNumber: string | null
  updatedAt: string
  items: { itemName?: string; menuItem?: { name: string } | null; quantity: number; price: number }[]
}

const STATUS_INFO: Record<string, { label: string; sub: string; color: string; done?: boolean }> = {
  pending:   { label: 'รับออเดอร์แล้ว',    sub: 'รอเตรียมอาหาร…',      color: 'var(--c-warning)' },
  preparing: { label: 'กำลังเตรียมอาหาร',  sub: 'โปรดรอสักครู่',        color: 'var(--c-info)' },
  completed: { label: 'พร้อมเสิร์ฟแล้ว!',  sub: 'เชิญรับอาหารได้เลย',  color: 'var(--c-success)', done: true },
  cancelled: { label: 'ออเดอร์ถูกยกเลิก',  sub: 'กรุณาติดต่อพนักงาน',  color: 'var(--c-danger)',  done: true },
}

interface SessionData {
  orders: number[]
}

function sessionKey(table: string) {
  return `food-order-session-${table || 'notab'}`
}

function loadSession(table: string): SessionData {
  try {
    const stored = localStorage.getItem(sessionKey(table))
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed.orders)) return parsed
    }
  } catch { /* ignore */ }
  return { orders: [] }
}

function saveSession(table: string, data: SessionData) {
  try {
    localStorage.setItem(sessionKey(table), JSON.stringify(data))
  } catch { /* ignore */ }
}

function clearSession(table: string) {
  try {
    localStorage.removeItem(sessionKey(table))
  } catch { /* ignore */ }
}

function ItemThumb({ imageUrl, name, size = 40, cover = false }: { imageUrl?: string | null; name: string; size?: number; cover?: boolean }) {
  const [imgError, setImgError] = useState(false)
  if (cover) {
    if (imageUrl && !imgError) {
      return (
        <img
          src={imageUrl}
          alt={name}
          onError={() => setImgError(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      )
    }
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-primary)', fontWeight: 700, fontSize: '1.8rem' }}>
        {name.charAt(0)}
      </div>
    )
  }
  if (imageUrl && !imgError) {
    return (
      <img
        src={imageUrl}
        alt={name}
        width={size}
        onError={() => setImgError(true)}
        style={{ width: size, height: 'auto', borderRadius: '8px', flexShrink: 0, display: 'block' }}
      />
    )
  }
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '8px',
        background: 'var(--c-primary-light)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--c-primary)', fontWeight: 700, fontSize: size * 0.38, flexShrink: 0,
      }}
    >
      {name.charAt(0)}
    </div>
  )
}

function QROrderPage() {
  const searchParams = useSearchParams()
  const tableParam = searchParams.get('table') || ''

  const [categories, setCategories] = useState<Category[]>([])
  const [activeCategory, setActiveCategory] = useState<number | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [note, setNote] = useState('')
  const [menuLoading, setMenuLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const [phase, setPhase] = useState<'ordering' | 'tracking'>('ordering')
  // Latest order is the last one in the session
  const [sessionOrderIds, setSessionOrderIds] = useState<number[]>([])
  const [orderStatuses, setOrderStatuses] = useState<Map<number, OrderStatus>>(new Map())

  const pollRef = useRef<NodeJS.Timeout | null>(null)

  // ── Restore session on mount ─────────────────────────────────────
  useEffect(() => {
    const session = loadSession(tableParam)
    if (session.orders.length > 0) {
      setSessionOrderIds(session.orders)
      setPhase('tracking')
    }
  }, [tableParam])

  // ── Fetch menu ───────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/public/menu')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setCategories(data)
          if (data.length > 0) setActiveCategory(data[0].id)
        }
      })
      .finally(() => setMenuLoading(false))
  }, [])

  // ── Polling all session orders ───────────────────────────────────
  const pollAll = useCallback((ids: number[]) => {
    ids.forEach(id => {
      fetch(`/api/public/orders/${id}`)
        .then(r => {
          if (r.status === 404) {
            // This order is gone; remove it from session
            setSessionOrderIds(prev => {
              const next = prev.filter(x => x !== id)
              if (next.length === 0) {
                clearSession(tableParam)
                setPhase('ordering')
              } else {
                saveSession(tableParam, { orders: next })
              }
              return next
            })
            return null
          }
          return r.json()
        })
        .then(data => {
          if (data?.id) {
            setOrderStatuses(prev => new Map(prev).set(data.id, data))
          }
        })
    })
  }, [tableParam])

  useEffect(() => {
    if (phase !== 'tracking' || sessionOrderIds.length === 0) return
    pollAll(sessionOrderIds)
    pollRef.current = setInterval(() => pollAll(sessionOrderIds), 5000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [phase, sessionOrderIds, pollAll])

  // ── Cart helpers ─────────────────────────────────────────────────
  function addToCart(item: MenuItem) {
    setCart(prev => {
      const existing = prev.find(c => c.menuItemId === item.id)
      if (existing) {
        return prev.map(c => c.menuItemId === item.id ? { ...c, quantity: c.quantity + 1 } : c)
      }
      return [...prev, { menuItemId: item.id, name: item.name, price: item.price, quantity: 1 }]
    })
  }

  function updateQty(menuItemId: number, delta: number) {
    setCart(prev =>
      prev.map(c => {
        if (c.menuItemId !== menuItemId) return c
        const newQty = c.quantity + delta
        return newQty <= 0 ? null : { ...c, quantity: newQty }
      }).filter(Boolean) as CartItem[]
    )
  }

  function getQty(menuItemId: number) {
    return cart.find(c => c.menuItemId === menuItemId)?.quantity || 0
  }

  const totalPrice = cart.reduce((sum, c) => sum + c.price * c.quantity, 0)
  const totalItems  = cart.reduce((sum, c) => sum + c.quantity, 0)

  // ── Submit ───────────────────────────────────────────────────────
  async function submitOrder() {
    if (cart.length === 0) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/public/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableNumber: tableParam || null,
          note: note || null,
          items: cart.map(c => ({ menuItemId: c.menuItemId, quantity: c.quantity })),
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'เกิดข้อผิดพลาด')
        return
      }
      const order = await res.json()
      const newIds = [...sessionOrderIds, order.id]
      saveSession(tableParam, { orders: newIds })
      setSessionOrderIds(newIds)
      setOrderStatuses(prev => new Map(prev).set(order.id, order))
      setPhase('tracking')
      setCart([])
      setNote('')
      setSearch('')
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setSubmitting(false)
    }
  }

  // ── สั่งเพิ่ม ── go back to ordering (keep session orders)
  function orderMore() {
    setCart([])
    setNote('')
    setSearch('')
    setError('')
    setPhase('ordering')
  }

  // ── Start completely new session ─────────────────────────────────
  function startNewSession() {
    clearSession(tableParam)
    setSessionOrderIds([])
    setOrderStatuses(new Map())
    setPhase('ordering')
    setCart([])
    setNote('')
    setSearch('')
    setError('')
  }

  // ── Tracking screen ──────────────────────────────────────────────
  if (phase === 'tracking') {
    const latestId = sessionOrderIds[sessionOrderIds.length - 1]
    const latestOrder = latestId ? orderStatuses.get(latestId) : null
    const previousIds = sessionOrderIds.slice(0, -1)

    if (!latestOrder) {
      return (
        <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: 'var(--c-text-3)', fontSize: '0.88rem' }}>กำลังโหลดสถานะ…</p>
        </div>
      )
    }

    const info = STATUS_INFO[latestOrder.status] ?? STATUS_INFO.pending

    return (
      <div
        style={{ minHeight: '100dvh', maxWidth: '480px', margin: '0 auto', padding: '24px 16px 40px', display: 'flex', flexDirection: 'column' }}
        className="fade-in"
      >
        {/* Queue number */}
        <div style={{ textAlign: 'center', padding: '32px 0 24px' }}>
          <p style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--c-text-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>
            หมายเลขคิว
          </p>
          <p style={{ fontSize: '5rem', fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1, color: 'var(--c-text)' }}>
            {latestOrder.id}
          </p>
          {tableParam && (
            <p style={{ color: 'var(--c-text-3)', fontSize: '0.85rem', marginTop: '6px' }}>โต๊ะ {tableParam}</p>
          )}
        </div>

        {/* Status card */}
        <div
          className="glass-panel"
          style={{ padding: '20px', marginBottom: '16px', borderColor: `${info.color}40`, textAlign: 'center' }}
        >
          <p style={{ fontSize: '1.3rem', fontWeight: 700, color: info.color, marginBottom: '4px', letterSpacing: '-0.02em' }}>
            {info.label}
          </p>
          <p style={{ color: 'var(--c-text-2)', fontSize: '0.88rem' }}>{info.sub}</p>

          {!info.done && (
            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'center', gap: '6px' }}>
              {[0, 1, 2].map(i => (
                <span
                  key={i}
                  style={{
                    width: '6px', height: '6px', borderRadius: '50%',
                    background: info.color, opacity: 0.6, display: 'inline-block',
                    animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Latest order items */}
        <div className="glass-panel" style={{ overflow: 'hidden', marginBottom: '16px' }}>
          {latestOrder.items.map((item, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '11px 16px',
                borderBottom: idx < latestOrder.items.length - 1 ? '1px solid var(--c-border)' : 'none',
              }}
            >
              <div>
                <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{item.itemName || item.menuItem?.name || '(ลบแล้ว)'}</span>
                <span style={{ color: 'var(--c-text-3)', marginLeft: '8px', fontSize: '0.82rem' }}>×{item.quantity}</span>
              </div>
              <span className="price-tag">฿{(item.price * item.quantity).toLocaleString('th-TH')}</span>
            </div>
          ))}
          <div
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '13px 16px', background: 'var(--c-surface-2)', borderTop: '1px solid var(--c-border)',
            }}
          >
            <span style={{ fontWeight: 700 }}>รวม</span>
            <span className="price-tag-lg">฿{latestOrder.totalPrice.toLocaleString('th-TH')}</span>
          </div>
        </div>

        {/* Previous session orders */}
        {previousIds.length > 0 && (
          <div className="glass-panel" style={{ overflow: 'hidden', marginBottom: '16px' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--c-border)' }}>
              <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--c-text-2)' }}>ออเดอร์ก่อนหน้า</p>
            </div>
            {previousIds.map(id => {
              const order = orderStatuses.get(id)
              const prevInfo = order ? (STATUS_INFO[order.status] ?? STATUS_INFO.pending) : null
              return (
                <div
                  key={id}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 16px',
                    borderBottom: '1px solid var(--c-border)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--c-text-2)' }}>#{id}</span>
                    {prevInfo && (
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: prevInfo.color }}>{prevInfo.label}</span>
                    )}
                  </div>
                  {order && (
                    <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--c-text-2)' }}>
                      ฿{order.totalPrice.toLocaleString('th-TH')}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            className="btn btn-primary btn-full"
            onClick={orderMore}
            style={{ padding: '14px 20px', fontSize: '0.95rem', borderRadius: 'var(--radius)' }}
          >
            สั่งเพิ่ม
          </button>
          <button
            className="btn btn-ghost btn-full"
            onClick={startNewSession}
          >
            เริ่มออเดอร์ใหม่ทั้งหมด
          </button>
          {!info.done && (
            <p style={{ textAlign: 'center', color: 'var(--c-text-3)', fontSize: '0.75rem' }}>
              อัปเดตอัตโนมัติทุก 5 วินาที
            </p>
          )}
        </div>

        <style>{`
          @keyframes pulse {
            0%, 80%, 100% { transform: scale(0.8); opacity: 0.4; }
            40%            { transform: scale(1.2); opacity: 1; }
          }
        `}</style>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────
  // Ordering screen
  // ─────────────────────────────────────────────────────────────────
  const trimmedSearch = search.trim().toLowerCase()
  const isSearching = trimmedSearch.length > 0

  const searchResults = isSearching
    ? categories.flatMap(cat => cat.items.filter(i => i.name.toLowerCase().includes(trimmedSearch)))
    : []

  const activeCat = categories.find(c => c.id === activeCategory)
  const displayItems = isSearching ? searchResults : (activeCat?.items ?? [])

  if (menuLoading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--c-text-3)', fontSize: '0.88rem' }}>กำลังโหลดเมนู…</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '0 16px 120px', minHeight: '100dvh' }} className="fade-in">
      {/* Header */}
      <div style={{ padding: '20px 0 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 700, letterSpacing: '-0.02em' }}>สั่งอาหาร</h1>
            {tableParam && (
              <p style={{ color: 'var(--c-text-2)', fontSize: '0.85rem', marginTop: '2px' }}>โต๊ะ {tableParam}</p>
            )}
          </div>
          {/* Show "ดูออเดอร์" button if have previous orders */}
          {sessionOrderIds.length > 0 && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setPhase('tracking')}
              style={{ marginTop: '4px' }}
            >
              ดูออเดอร์ ({sessionOrderIds.length})
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '12px' }}>
        <svg
          width="16" height="16"
          viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
          style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--c-text-3)', pointerEvents: 'none' }}
        >
          <circle cx="8.5" cy="8.5" r="5.5"/>
          <line x1="13" y1="13" x2="17" y2="17"/>
        </svg>
        <input
          className="input"
          placeholder="ค้นหาเมนู…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ paddingLeft: '36px' }}
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-3)', fontSize: '1.1rem', lineHeight: 1 }}
            aria-label="ล้างการค้นหา"
          >
            ×
          </button>
        )}
      </div>

      {/* Category tabs — hide when searching */}
      {!isSearching && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', overflowX: 'auto', paddingBottom: '2px', scrollbarWidth: 'none' }}>
          {categories.map(cat => (
            <button
              key={cat.id}
              className={`btn btn-sm ${activeCategory === cat.id ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveCategory(cat.id)}
              style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {isSearching && (
        <p style={{ fontSize: '0.82rem', color: 'var(--c-text-3)', marginBottom: '10px' }}>
          {searchResults.length > 0 ? `พบ ${searchResults.length} รายการ` : 'ไม่พบเมนูที่ค้นหา'}
        </p>
      )}

      {/* Menu items grid */}
      {displayItems.length === 0 ? (
        <div className="glass-panel" style={{ marginBottom: '14px' }}>
          <p style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--c-text-3)', fontSize: '0.88rem' }}>
            {isSearching ? 'ไม่พบเมนูที่ค้นหา' : 'ไม่มีเมนูในหมวดนี้'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', gap: '10px', marginBottom: '14px' }}>
          {displayItems.map((item) => {
            const qty = getQty(item.id)
            return (
              <div
                key={item.id}
                style={{
                  borderRadius: 'var(--radius-sm)',
                  border: qty > 0 ? '2px solid var(--c-primary)' : '1px solid var(--c-border)',
                  overflow: 'hidden',
                  background: qty > 0 ? 'var(--c-primary-glow)' : 'var(--c-surface)',
                  transition: 'border-color 0.15s, background 0.15s',
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: 'pointer',
                }}
                onClick={() => addToCart(item)}
              >
                <div style={{ aspectRatio: '4 / 3', background: 'var(--c-primary-light)', overflow: 'hidden', flexShrink: 0 }}>
                  <ItemThumb imageUrl={item.imageUrl} name={item.name} cover />
                </div>
                <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                  <p style={{ fontWeight: 500, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.name}
                  </p>
                  <p className="price-tag" style={{ fontSize: '0.9rem' }}>฿{item.price.toLocaleString('th-TH')}</p>
                  {qty > 0 ? (
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}
                      onClick={e => e.stopPropagation()}
                    >
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => updateQty(item.id, -1)}
                        style={{ width: '28px', height: '28px', padding: 0, borderRadius: '50%', fontSize: '1rem' }}
                        aria-label="ลด"
                      >−</button>
                      <span style={{ fontWeight: 700, minWidth: '18px', textAlign: 'center', color: 'var(--c-primary)', fontSize: '0.9rem' }}>
                        {qty}
                      </span>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => addToCart(item)}
                        style={{ width: '28px', height: '28px', padding: 0, borderRadius: '50%', fontSize: '1rem' }}
                        aria-label="เพิ่ม"
                      >+</button>
                    </div>
                  ) : (
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ marginTop: '6px', fontSize: '0.78rem' }}
                    >
                      + เพิ่ม
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Note */}
      {cart.length > 0 && (
        <input
          className="input"
          placeholder="หมายเหตุ (เช่น ไม่ใส่ผัก, ไม่เผ็ด)"
          value={note}
          onChange={e => setNote(e.target.value)}
          style={{ marginBottom: '80px' }}
        />
      )}

      {categories.length === 0 && (
        <div className="glass-panel" style={{ padding: '48px 24px', textAlign: 'center' }}>
          <p style={{ color: 'var(--c-text-3)', fontSize: '0.88rem' }}>ยังไม่มีเมนูเปิดให้บริการ</p>
        </div>
      )}

      {/* Fixed cart bar */}
      {cart.length > 0 && (
        <div
          style={{
            position: 'fixed', bottom: 0, left: 0, right: 0,
            background: 'var(--c-surface)',
            borderTop: '1px solid var(--c-border)',
            padding: '12px 16px env(safe-area-inset-bottom, 12px)',
            zIndex: 100,
            boxShadow: '0 -2px 12px oklch(0 0 0 / 0.08)',
          }}
        >
          <div style={{ maxWidth: '480px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ color: 'var(--c-text-2)', fontSize: '0.82rem' }}>{totalItems} รายการ</span>
              <span className="price-tag">฿{totalPrice.toLocaleString('th-TH')}</span>
            </div>
            {error && (
              <p style={{ color: 'var(--c-danger)', fontSize: '0.82rem', marginBottom: '8px' }}>{error}</p>
            )}
            <button
              className="btn btn-primary btn-full"
              onClick={submitOrder}
              disabled={submitting}
              style={{ padding: '14px 20px', fontSize: '0.95rem', borderRadius: 'var(--radius)', justifyContent: 'space-between' }}
            >
              <span>{submitting ? 'กำลังส่งออเดอร์…' : 'ส่งออเดอร์'}</span>
              {!submitting && <span style={{ fontWeight: 700 }}>฿{totalPrice.toLocaleString('th-TH')}</span>}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: 'var(--c-text-3)', fontSize: '0.88rem' }}>กำลังโหลด…</p>
        </div>
      }
    >
      <QROrderPage />
    </Suspense>
  )
}
