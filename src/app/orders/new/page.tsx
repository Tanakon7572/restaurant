'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'

interface MenuItem {
  id: number
  name: string
  price: number
  available: boolean
  categoryId: number
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
  note: string
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

export default function NewOrderPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [tableNumber, setTableNumber] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [activeCategory, setActiveCategory] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const router = useRouter()

  useEffect(() => {
    fetch('/api/menu-categories')
      .then(res => {
        if (res.status === 401) { router.push('/'); return null }
        return res.json()
      })
      .then(data => {
        if (Array.isArray(data)) {
          setCategories(data)
          if (data.length > 0) setActiveCategory(data[0].id)
        }
      })
      .finally(() => setLoading(false))
  }, [router])

  function addToCart(item: MenuItem) {
    setCart(prev => {
      const existing = prev.find(c => c.menuItemId === item.id)
      if (existing) {
        return prev.map(c => c.menuItemId === item.id ? { ...c, quantity: c.quantity + 1 } : c)
      }
      return [...prev, { menuItemId: item.id, name: item.name, price: item.price, quantity: 1, note: '' }]
    })
  }

  function updateQuantity(menuItemId: number, delta: number) {
    setCart(prev =>
      prev.map(c => {
        if (c.menuItemId !== menuItemId) return c
        const newQty = c.quantity + delta
        return newQty <= 0 ? null : { ...c, quantity: newQty }
      }).filter(Boolean) as CartItem[]
    )
  }

  function getCartQty(menuItemId: number) {
    return cart.find(c => c.menuItemId === menuItemId)?.quantity || 0
  }

  const totalPrice = cart.reduce((sum, c) => sum + c.price * c.quantity, 0)
  const totalItems = cart.reduce((sum, c) => sum + c.quantity, 0)

  async function submitOrder() {
    if (cart.length === 0) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableNumber: tableNumber || null,
          note: note || null,
          items: cart.map(c => ({ menuItemId: c.menuItemId, quantity: c.quantity, note: c.note || null })),
        }),
      })
      if (res.ok) {
        const order = await res.json()
        router.push(`/orders/${order.id}`)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="page-container">
        <div className="page-header">
          <div style={{ height: '28px', width: '100px', background: 'var(--c-surface-2)', borderRadius: '6px' }} />
        </div>
        <BottomNav />
      </div>
    )
  }

  const trimmedSearch = search.trim().toLowerCase()
  const isSearching = trimmedSearch.length > 0

  // When searching: show all available items across categories that match
  const searchResults = isSearching
    ? categories.flatMap(cat => cat.items.filter(i => i.available && i.name.toLowerCase().includes(trimmedSearch)))
    : []

  const activeCat = categories.find(c => c.id === activeCategory)
  const availableItems = isSearching ? searchResults : (activeCat?.items.filter(i => i.available) ?? [])

  return (
    <div className="page-container fade-in">
      <div className="page-header">
        <h1 className="page-title">สั่งอาหาร</h1>
      </div>

      {/* Table / note */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <input
          className="input"
          placeholder="เลขโต๊ะ"
          value={tableNumber}
          onChange={e => setTableNumber(e.target.value)}
          style={{ flex: '0 0 90px', padding: '10px 12px' }}
        />
        <input
          className="input"
          placeholder="หมายเหตุ"
          value={note}
          onChange={e => setNote(e.target.value)}
          style={{ flex: 1, padding: '10px 12px' }}
        />
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
      {availableItems.length === 0 ? (
        <div className="glass-panel" style={{ marginBottom: '16px' }}>
          <p style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--c-text-3)', fontSize: '0.88rem' }}>
            {isSearching ? 'ไม่พบเมนูที่ค้นหา' : 'ไม่มีเมนูในหมวดนี้'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px', marginBottom: '16px' }}>
          {availableItems.map((item) => {
            const qty = getCartQty(item.id)
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
                  <p style={{ fontWeight: 500, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
                        onClick={() => updateQuantity(item.id, -1)}
                        style={{ width: '28px', height: '28px', padding: 0, borderRadius: '50%', fontSize: '1rem' }}
                        aria-label="ลดจำนวน"
                      >−</button>
                      <span style={{ fontWeight: 700, minWidth: '18px', textAlign: 'center', fontSize: '0.9rem', color: 'var(--c-primary)' }}>
                        {qty}
                      </span>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => updateQuantity(item.id, 1)}
                        style={{ width: '28px', height: '28px', padding: 0, borderRadius: '50%', fontSize: '1rem' }}
                        aria-label="เพิ่มจำนวน"
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

      {categories.length === 0 && (
        <div className="glass-panel" style={{ padding: '48px 24px', textAlign: 'center' }}>
          <p style={{ color: 'var(--c-text-3)', fontSize: '0.88rem' }}>
            ยังไม่มีเมนู กรุณาเพิ่มเมนูก่อน
          </p>
        </div>
      )}

      {/* Cart summary — fixed at bottom */}
      {cart.length > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: '64px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'calc(100% - 32px)',
            maxWidth: '568px',
            zIndex: 100,
          }}
        >
          <button
            className="btn btn-primary btn-full"
            onClick={submitOrder}
            disabled={submitting}
            style={{ padding: '14px 20px', fontSize: '0.95rem', borderRadius: 'var(--radius)', justifyContent: 'space-between' }}
          >
            <span>
              {submitting ? 'กำลังบันทึก…' : `สั่งอาหาร (${totalItems} รายการ)`}
            </span>
            {!submitting && (
              <span style={{ fontWeight: 700, fontSize: '1rem' }}>
                ฿{totalPrice.toLocaleString('th-TH')}
              </span>
            )}
          </button>
        </div>
      )}

      <BottomNav />
    </div>
  )
}
