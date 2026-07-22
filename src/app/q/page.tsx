'use client'

import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import type { MenuItemDTO, MenuCategoryDTO, CartLine } from '@/lib/types'
import { addLine, setQuantity, removeLine, cartTotal, cartCount } from '@/lib/cart'
import { buildDiyItem, translateDiyLine } from '@/lib/options'
import ItemOptionSheet from '@/components/ItemOptionSheet'
import Cart from '@/components/Cart'
import DiyEntryCard from '@/components/DiyEntryCard'

interface OrderStatusItem {
  itemName?: string
  menuItem?: { name: string } | null
  quantity: number
  price: number
  note?: string | null
  options?: { groupName: string; choiceName: string; priceDelta: number }[]
}

interface OrderStatus {
  id: number
  dailyNumber?: number
  status: string
  totalPrice: number
  tableNumber: string | null
  customerName?: string | null
  updatedAt: string
  items: OrderStatusItem[]
}

const STATUS_INFO: Record<string, { label: string; sub: string; color: string; done?: boolean }> = {
  awaiting:  { label: 'ส่งคำขอแล้ว',       sub: 'รอร้านยืนยันออเดอร์…', color: 'var(--c-warning)' },
  pending:   { label: 'ร้านยืนยันแล้ว',    sub: 'รอเตรียมอาหาร…',      color: 'var(--c-info)' },
  preparing: { label: 'กำลังเตรียมอาหาร',  sub: 'โปรดรอสักครู่',        color: 'var(--c-info)' },
  completed: { label: 'พร้อมเสิร์ฟแล้ว!',  sub: 'เชิญรับอาหารได้เลย',  color: 'var(--c-success)', done: true },
  cancelled: { label: 'ออเดอร์ถูกยกเลิก',  sub: 'กรุณาติดต่อพนักงาน',  color: 'var(--c-danger)',  done: true },
}

interface SessionData {
  orders: number[]
}

function sessionKey(token: string) {
  return `food-order-session-${token || 'notab'}`
}
function cartKey(token: string) {
  return `food-order-cart-${token || 'notab'}`
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
  try { localStorage.setItem(sessionKey(table), JSON.stringify(data)) } catch { /* ignore */ }
}

function clearSession(table: string) {
  try { localStorage.removeItem(sessionKey(table)) } catch { /* ignore */ }
}

function loadCart(table: string): CartLine[] {
  try {
    const stored = localStorage.getItem(cartKey(table))
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) return parsed
    }
  } catch { /* ignore */ }
  return []
}

function saveCart(table: string, lines: CartLine[]) {
  try { localStorage.setItem(cartKey(table), JSON.stringify(lines)) } catch { /* ignore */ }
}

// Normalize raw menu JSON into MenuItemDTO (optionGroups always present)
function toMenuItem(raw: Record<string, unknown>): MenuItemDTO {
  return {
    id: raw.id as number,
    name: raw.name as string,
    price: raw.price as number,
    imageUrl: (raw.imageUrl as string | null) ?? null,
    available: raw.available !== false,
    optionGroups: Array.isArray(raw.optionGroups) ? (raw.optionGroups as MenuItemDTO['optionGroups']) : [],
  }
}

function ItemThumb({ imageUrl, name, size = 40, cover = false }: { imageUrl?: string | null; name: string; size?: number; cover?: boolean }) {
  const [imgError, setImgError] = useState(false)
  if (cover) {
    if (imageUrl && !imgError) {
      return (
        <img src={imageUrl} alt={name} onError={() => setImgError(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
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
      <img src={imageUrl} alt={name} width={size} onError={() => setImgError(true)}
        style={{ width: size, height: 'auto', borderRadius: '8px', flexShrink: 0, display: 'block' }} />
    )
  }
  return (
    <div style={{ width: size, height: size, borderRadius: '8px', background: 'var(--c-primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-primary)', fontWeight: 700, fontSize: size * 0.38, flexShrink: 0 }}>
      {name.charAt(0)}
    </div>
  )
}

function QROrderPage() {
  const searchParams = useSearchParams()
  // Single permanent shop link: /q?s=permanent (also the default when no token
  // is present). Customers identify their order by name, not by table.
  const sessionToken = searchParams.get('s') || 'permanent'

  const [categories, setCategories] = useState<MenuCategoryDTO[]>([])
  const [activeCategory, setActiveCategory] = useState<number | null>(null)
  const [cart, setCart] = useState<CartLine[]>([])
  const [sheetItem, setSheetItem] = useState<MenuItemDTO | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [linkState, setLinkState] = useState<'checking' | 'valid' | 'invalid'>('checking')
  const [linkActive, setLinkActive] = useState(true)
  const [toast, setToast] = useState('')
  const [menuLoading, setMenuLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const [phase, setPhase] = useState<'ordering' | 'cart' | 'tracking'>('ordering')
  const [sessionOrderIds, setSessionOrderIds] = useState<number[]>([])
  const [orderStatuses, setOrderStatuses] = useState<Map<number, OrderStatus>>(new Map())

  const pollRef = useRef<NodeJS.Timeout | null>(null)
  const toastRef = useRef<NodeJS.Timeout | null>(null)

  // ── Validate the link, then restore this device's session + cart ──
  useEffect(() => {
    let cancelled = false
    async function init() {
      if (!sessionToken) { setLinkState('invalid'); return }
      try {
        const r = await fetch(`/api/public/session?token=${encodeURIComponent(sessionToken)}`)
        const data = await r.json()
        if (cancelled) return
        if (!data.valid) { setLinkState('invalid'); return }
        setLinkState('valid')
      } catch {
        if (!cancelled) setLinkState('invalid')
        return
      }
      const session = loadSession(sessionToken)
      if (session.orders.length > 0) {
        setSessionOrderIds(session.orders)
        setPhase('tracking')
      }
      setCart(loadCart(sessionToken))
    }
    init()
    return () => { cancelled = true }
  }, [sessionToken])

  // ── Persist cart on change ───────────────────────────────────────
  useEffect(() => { saveCart(sessionToken, cart) }, [sessionToken, cart])

  // ── Fetch menu ───────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/public/menu')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          const cats: MenuCategoryDTO[] = data.map((c: Record<string, unknown>) => ({
            id: c.id as number,
            name: c.name as string,
            order: (c.order as number) ?? 0,
            diy: !!c.diy,
            diyGroups: Array.isArray(c.diyGroups) ? (c.diyGroups as MenuCategoryDTO['diyGroups']) : [],
            items: Array.isArray(c.items) ? (c.items as Record<string, unknown>[]).map(toMenuItem) : [],
          }))
          setCategories(cats)
          if (cats.length > 0) setActiveCategory(cats[0].id)
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
            setSessionOrderIds(prev => {
              const next = prev.filter(x => x !== id)
              if (next.length === 0) { clearSession(sessionToken); setPhase('ordering') }
              else saveSession(sessionToken, { orders: next })
              return next
            })
            return null
          }
          return r.json()
        })
        .then(data => { if (data?.id) setOrderStatuses(prev => new Map(prev).set(data.id, data)) })
    })
  }, [sessionToken])

  // The link dies when the kitchen finishes — stop offering "order more".
  const checkLink = useCallback(async () => {
    try {
      const r = await fetch(`/api/public/session?token=${encodeURIComponent(sessionToken)}`)
      if (!r.ok) return
      const data = await r.json()
      setLinkActive(!!data.valid)
    } catch { /* ignore */ }
  }, [sessionToken])

  useEffect(() => {
    if (phase !== 'tracking' || sessionOrderIds.length === 0) return
    pollAll(sessionOrderIds)
    pollRef.current = setInterval(() => { pollAll(sessionOrderIds); checkLink() }, 5000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [phase, sessionOrderIds, pollAll, checkLink])

  function showToast(msg: string) {
    setToast(msg)
    if (toastRef.current) clearTimeout(toastRef.current)
    toastRef.current = setTimeout(() => setToast(''), 1600)
  }

  // ── Add an item: open sheet if it has options, else add directly ──
  function openItem(item: MenuItemDTO) {
    if (item.available === false) { showToast('เมนูนี้หมดแล้ว'); return }
    if (item.optionGroups.length > 0) { setSheetItem(item); return }
    setCart(prev => addLine(prev, {
      key: '', menuItemId: item.id, name: item.name, basePrice: item.price,
      quantity: 1, note: null, optionChoiceIds: [], choices: [], unitPrice: item.price,
    }))
    showToast('เพิ่มลงตะกร้าแล้ว')
  }

  function handleAdd(line: CartLine) {
    // Lines from the synthetic DIY item carry a negative id; remap the chosen
    // crust to be the real base menu item before the line enters the cart.
    if (line.menuItemId < 0 && sheetItem) {
      const translated = translateDiyLine(line, sheetItem)
      if (!translated) return
      line = translated
    }
    setCart(prev => addLine(prev, line))
    showToast('เพิ่มลงตะกร้าแล้ว')
  }

  const totalPrice = cartTotal(cart)
  const totalItems = cartCount(cart)

  // ── Submit ───────────────────────────────────────────────────────
  async function submitOrder() {
    if (cart.length === 0) return
    if (!customerName.trim()) {
      setError('กรุณากรอกชื่อผู้สั่ง')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/public/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionToken,
          customerName: customerName.trim(),
          items: cart.map(l => ({
            menuItemId: l.menuItemId, quantity: l.quantity,
            note: l.note, optionChoiceIds: l.optionChoiceIds,
          })),
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'เกิดข้อผิดพลาด')
        if (res.status === 403) setLinkState('invalid')
        return
      }
      const order = await res.json()
      const newIds = [...sessionOrderIds, order.id]
      saveSession(sessionToken, { orders: newIds })
      setSessionOrderIds(newIds)
      setOrderStatuses(prev => new Map(prev).set(order.id, order))
      setPhase('tracking')
      setCart([])
      saveCart(sessionToken, [])
      setSearch('')
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setSubmitting(false)
    }
  }

  function orderMore() {
    setCart([])
    saveCart(sessionToken, [])
    setSearch('')
    setError('')
    setPhase('ordering')
  }

  // ── Invalid / expired link ───────────────────────────────────────
  if (linkState === 'invalid') {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div className="glass-panel" style={{ maxWidth: '360px', width: '100%', padding: '36px 24px', textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--c-danger-bg)', color: 'var(--c-danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: '1.6rem' }} aria-hidden>
            ✕
          </div>
          <h1 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '8px' }}>ลิงก์นี้ใช้ไม่ได้แล้ว</h1>
          <p style={{ color: 'var(--c-text-2)', fontSize: '0.9rem', lineHeight: 1.6 }}>
            ลิงก์สั่งอาหารหมดอายุหรือถูกปิดแล้ว<br />กรุณาติดต่อพนักงานเพื่อขอ QR ใหม่
          </p>
        </div>
      </div>
    )
  }

  if (linkState === 'checking') {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--c-text-3)', fontSize: '0.88rem' }}>กำลังตรวจสอบลิงก์…</p>
      </div>
    )
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
      <div style={{ minHeight: '100dvh', maxWidth: '480px', margin: '0 auto', padding: '24px 16px 40px', display: 'flex', flexDirection: 'column' }} className="fade-in">
        <div style={{ textAlign: 'center', padding: '32px 0 24px' }}>
          <p style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--c-text-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>
            หมายเลขคิว
          </p>
          <p style={{ fontSize: '5rem', fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1, color: 'var(--c-text)' }}>
            {latestOrder.dailyNumber ?? latestOrder.id}
          </p>
          {latestOrder.customerName && (
            <p style={{ color: 'var(--c-text-3)', fontSize: '0.85rem', marginTop: '6px' }}>
              {latestOrder.customerName}
            </p>
          )}
          {!linkActive && (
            <p style={{ color: 'var(--c-text-3)', fontSize: '0.8rem', marginTop: '6px' }}>
              ลิงก์นี้ปิดการสั่งแล้ว หากต้องการสั่งเพิ่มกรุณาติดต่อพนักงาน
            </p>
          )}
        </div>

        <div className="glass-panel" style={{ padding: '20px', marginBottom: '16px', borderColor: `${info.color}40`, textAlign: 'center' }}>
          <p style={{ fontSize: '1.3rem', fontWeight: 700, color: info.color, marginBottom: '4px', letterSpacing: '-0.02em' }}>{info.label}</p>
          <p style={{ color: 'var(--c-text-2)', fontSize: '0.88rem' }}>{info.sub}</p>
          {!info.done && (
            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'center', gap: '6px' }}>
              {[0, 1, 2].map(i => (
                <span key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: info.color, opacity: 0.6, display: 'inline-block', animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite` }} />
              ))}
            </div>
          )}
        </div>

        <div className="glass-panel" style={{ overflow: 'hidden', marginBottom: '16px' }}>
          {latestOrder.items.map((item, idx) => (
            <div key={idx} style={{ padding: '11px 16px', borderBottom: idx < latestOrder.items.length - 1 ? '1px solid var(--c-border)' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{item.itemName || item.menuItem?.name || '(ลบแล้ว)'}</span>
                  <span style={{ color: 'var(--c-text-3)', marginLeft: '8px', fontSize: '0.82rem' }}>×{item.quantity}</span>
                </div>
                <span className="price-tag">฿{(item.price * item.quantity).toLocaleString('th-TH')}</span>
              </div>
              {item.options && item.options.length > 0 && (
                <ul style={{ listStyle: 'none', margin: '3px 0 0', paddingLeft: 2, fontSize: '0.78rem', color: 'var(--c-text-3)' }}>
                  {item.options.map((o, i) => (
                    <li key={i}>• {o.choiceName}{o.priceDelta > 0 ? ` (+฿${o.priceDelta})` : ''}</li>
                  ))}
                </ul>
              )}
              {item.note && <p style={{ fontSize: '0.78rem', color: 'var(--c-text-3)', marginTop: 2 }}>📝 {item.note}</p>}
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 16px', background: 'var(--c-surface-2)', borderTop: '1px solid var(--c-border)' }}>
            <span style={{ fontWeight: 700 }}>รวม</span>
            <span className="price-tag-lg">฿{latestOrder.totalPrice.toLocaleString('th-TH')}</span>
          </div>
        </div>

        {previousIds.length > 0 && (
          <div className="glass-panel" style={{ overflow: 'hidden', marginBottom: '16px' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--c-border)' }}>
              <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--c-text-2)' }}>ออเดอร์ก่อนหน้า</p>
            </div>
            {previousIds.map(id => {
              const order = orderStatuses.get(id)
              const prevInfo = order ? (STATUS_INFO[order.status] ?? STATUS_INFO.pending) : null
              return (
                <div key={id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--c-border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--c-text-2)' }}>#{order?.dailyNumber ?? id}</span>
                    {prevInfo && <span style={{ fontSize: '0.75rem', fontWeight: 600, color: prevInfo.color }}>{prevInfo.label}</span>}
                  </div>
                  {order && <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--c-text-2)' }}>฿{order.totalPrice.toLocaleString('th-TH')}</span>}
                </div>
              )
            })}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {linkActive && (
            <button className="btn btn-primary btn-full" onClick={orderMore} style={{ padding: '14px 20px', fontSize: '0.95rem', borderRadius: 'var(--radius)' }}>สั่งเพิ่ม</button>
          )}
          {!info.done && <p style={{ textAlign: 'center', color: 'var(--c-text-3)', fontSize: '0.75rem' }}>อัปเดตอัตโนมัติทุก 5 วินาที</p>}
        </div>

        <style>{`@keyframes pulse { 0%, 80%, 100% { transform: scale(0.8); opacity: 0.4; } 40% { transform: scale(1.2); opacity: 1; } }`}</style>
      </div>
    )
  }

  // ── Cart screen ──────────────────────────────────────────────────
  if (phase === 'cart') {
    return (
      <div style={{ maxWidth: '480px', margin: '0 auto', padding: '0 16px 120px', minHeight: '100dvh' }} className="fade-in">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0 12px' }}>
          <button className="btn-icon btn-ghost" onClick={() => setPhase('ordering')} aria-label="กลับ">←</button>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 700, letterSpacing: '-0.02em' }}>ตะกร้า</h1>
        </div>
        {cart.length > 0 && (
          <div className="glass-panel" style={{ padding: 12, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <label style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--c-text-2)' }}>ชื่อผู้สั่ง <span style={{ color: 'var(--c-danger)' }}>*</span></label>
              <input className="input" placeholder="เช่น คุณเอ" value={customerName} onChange={e => setCustomerName(e.target.value)} style={{ marginTop: 4 }} />
            </div>
          </div>
        )}
        <Cart
          lines={cart}
          onQty={(key, q) => setCart(prev => setQuantity(prev, key, q))}
          onRemove={key => setCart(prev => removeLine(prev, key))}
        />
        {cart.length > 0 && (
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--c-surface)', borderTop: '1px solid var(--c-border)', padding: '12px 16px env(safe-area-inset-bottom, 12px)', zIndex: 100, boxShadow: '0 -2px 12px oklch(0 0 0 / 0.08)' }}>
            <div style={{ maxWidth: '480px', margin: '0 auto' }}>
              {error && <p style={{ color: 'var(--c-danger)', fontSize: '0.82rem', marginBottom: '8px' }}>{error}</p>}
              <button className="btn btn-primary btn-full" onClick={submitOrder} disabled={submitting || !customerName.trim()}
                style={{ padding: '14px 20px', fontSize: '0.95rem', borderRadius: 'var(--radius)', justifyContent: 'space-between' }}>
                <span>{submitting ? 'กำลังส่งออเดอร์…' : 'ยืนยันสั่ง'}</span>
                {!submitting && <span style={{ fontWeight: 700 }}>฿{totalPrice.toLocaleString('th-TH')}</span>}
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Ordering screen ──────────────────────────────────────────────
  const trimmedSearch = search.trim().toLowerCase()
  const isSearching = trimmedSearch.length > 0
  const searchResults = isSearching
    ? categories.flatMap(cat => (cat.diy ? [] : cat.items.filter(i => i.name.toLowerCase().includes(trimmedSearch))))
    : []
  const activeCat = categories.find(c => c.id === activeCategory)
  const isDiyView = !isSearching && !!activeCat?.diy
  const displayItems = isSearching ? searchResults : isDiyView ? [] : (activeCat?.items ?? [])

  if (menuLoading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--c-text-3)', fontSize: '0.88rem' }}>กำลังโหลดเมนู…</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '0 16px 120px', minHeight: '100dvh' }} className="fade-in">
      <div style={{ padding: '20px 0 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 700, letterSpacing: '-0.02em' }}>สั่งอาหาร</h1>
          </div>
          {sessionOrderIds.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => setPhase('tracking')} style={{ marginTop: '4px' }}>
              ดูออเดอร์ ({sessionOrderIds.length})
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '12px' }}>
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
          style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--c-text-3)', pointerEvents: 'none' }}>
          <circle cx="8.5" cy="8.5" r="5.5"/><line x1="13" y1="13" x2="17" y2="17"/>
        </svg>
        <input className="input" placeholder="ค้นหาเมนู…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: '36px' }} />
        {search && (
          <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-3)', fontSize: '1.1rem', lineHeight: 1 }} aria-label="ล้างการค้นหา">×</button>
        )}
      </div>

      {!isSearching && (
        <div className="seg" style={{ marginBottom: '16px' }}>
          {categories.map(cat => (
            <button key={cat.id} className={`seg-item${activeCategory === cat.id ? ' active' : ''}`} onClick={() => setActiveCategory(cat.id)}>
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

      {/* DIY category → single entry card opening the step sheet */}
      {isDiyView && activeCat ? (
        <DiyEntryCard category={activeCat} onStart={() => setSheetItem(buildDiyItem(activeCat))} />
      ) : displayItems.length === 0 ? (
        <div className="glass-panel" style={{ marginBottom: '14px' }}>
          <p style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--c-text-3)', fontSize: '0.88rem' }}>
            {isSearching ? 'ไม่พบเมนูที่ค้นหา' : 'ไม่มีเมนูในหมวดนี้'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px', marginBottom: '14px' }}>
          {displayItems.map(item => {
            const soldOut = item.available === false
            return (
              <div key={item.id}
                style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--c-border)', overflow: 'hidden', background: 'var(--c-surface)', transition: 'border-color 0.15s', display: 'flex', flexDirection: 'column', cursor: soldOut ? 'not-allowed' : 'pointer', minWidth: 0, position: 'relative', opacity: soldOut ? 0.6 : 1 }}
                onClick={() => openItem(item)}>
                {soldOut && (
                  <span style={{ position: 'absolute', top: 6, left: 6, zIndex: 2, background: 'var(--c-danger)', color: '#fff', fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-full)' }}>
                    หมด
                  </span>
                )}
                <div style={{ aspectRatio: '4 / 3', background: 'var(--c-primary-light)', overflow: 'hidden', flexShrink: 0, filter: soldOut ? 'grayscale(1)' : 'none' }}>
                  <ItemThumb imageUrl={item.imageUrl} name={item.name} cover />
                </div>
                <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 500, fontSize: '0.85rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word', lineHeight: 1.3, textDecoration: soldOut ? 'line-through' : 'none', color: soldOut ? 'var(--c-text-3)' : 'inherit' }}>{item.name}</p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
                    <p className="price-tag" style={{ fontSize: '0.9rem', textDecoration: soldOut ? 'line-through' : 'none' }}>฿{item.price.toLocaleString('th-TH')}</p>
                    {!soldOut && <span className="btn btn-primary" style={{ width: 28, height: 28, padding: 0, borderRadius: '50%', fontSize: '1.1rem', lineHeight: 1 }} aria-hidden>+</span>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {categories.length === 0 && (
        <div className="glass-panel" style={{ padding: '48px 24px', textAlign: 'center' }}>
          <p style={{ color: 'var(--c-text-3)', fontSize: '0.88rem' }}>ยังไม่มีเมนูเปิดให้บริการ</p>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="toast toast-success scale-in" style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 120 }}>
          {toast}
        </div>
      )}

      {/* Option sheet */}
      <ItemOptionSheet item={sheetItem} onClose={() => setSheetItem(null)} onAdd={handleAdd} />

      {/* Fixed cart bar */}
      {cart.length > 0 && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--c-surface)', borderTop: '1px solid var(--c-border)', padding: '12px 16px env(safe-area-inset-bottom, 12px)', zIndex: 100, boxShadow: '0 -2px 12px oklch(0 0 0 / 0.08)' }}>
          <div style={{ maxWidth: '480px', margin: '0 auto' }}>
            <button className="btn btn-primary btn-full" onClick={() => setPhase('cart')}
              style={{ padding: '14px 20px', fontSize: '0.95rem', borderRadius: 'var(--radius)', justifyContent: 'space-between' }}>
              <span>ดูตะกร้า · {totalItems} รายการ</span>
              <span style={{ fontWeight: 700 }}>฿{totalPrice.toLocaleString('th-TH')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Page() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--c-text-3)', fontSize: '0.88rem' }}>กำลังโหลด…</p>
      </div>
    }>
      <QROrderPage />
    </Suspense>
  )
}
