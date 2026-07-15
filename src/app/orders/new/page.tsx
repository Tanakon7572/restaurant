'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import type { MenuItemDTO, MenuCategoryDTO, CartLine } from '@/lib/types'
import { addLine, setQuantity, removeLine, cartTotal, cartCount } from '@/lib/cart'
import { buildDiyItem, translateDiyLine } from '@/lib/options'
import ItemOptionSheet from '@/components/ItemOptionSheet'
import Cart from '@/components/Cart'
import DiyEntryCard from '@/components/DiyEntryCard'

function toMenuItem(raw: Record<string, unknown>): MenuItemDTO {
  return {
    id: raw.id as number,
    name: raw.name as string,
    price: raw.price as number,
    imageUrl: (raw.imageUrl as string | null) ?? null,
    optionGroups: Array.isArray(raw.optionGroups) ? (raw.optionGroups as MenuItemDTO['optionGroups']) : [],
  }
}

function ItemThumb({ imageUrl, name, cover = false }: { imageUrl?: string | null; name: string; cover?: boolean }) {
  const [imgError, setImgError] = useState(false)
  if (cover) {
    if (imageUrl && !imgError) {
      return <img src={imageUrl} alt={name} onError={() => setImgError(true)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
    }
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-primary)', fontWeight: 700, fontSize: '1.8rem' }}>
        {name.charAt(0)}
      </div>
    )
  }
  return null
}

export default function NewOrderPage() {
  const [categories, setCategories] = useState<MenuCategoryDTO[]>([])
  const [cart, setCart] = useState<CartLine[]>([])
  const [sheetItem, setSheetItem] = useState<MenuItemDTO | null>(null)
  const [tableNumber, setTableNumber] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [activeCategory, setActiveCategory] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [phase, setPhase] = useState<'ordering' | 'cart'>('ordering')
  const router = useRouter()

  useEffect(() => {
    // Auth check (redirect to login on 401); menu data with options comes from public menu
    fetch('/api/menu-categories').then(res => { if (res.status === 401) router.push('/') })
    fetch('/api/public/menu')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          const cats: MenuCategoryDTO[] = data.map((c: Record<string, unknown>) => ({
            id: c.id as number,
            name: c.name as string,
            order: (c.order as number) ?? 0,
            diy: !!c.diy,
            items: Array.isArray(c.items) ? (c.items as Record<string, unknown>[]).map(toMenuItem) : [],
          }))
          setCategories(cats)
          if (cats.length > 0) setActiveCategory(cats[0].id)
        }
      })
      .finally(() => setLoading(false))
  }, [router])

  function openItem(item: MenuItemDTO) {
    if (item.optionGroups.length > 0) { setSheetItem(item); return }
    setCart(prev => addLine(prev, {
      key: '', menuItemId: item.id, name: item.name, basePrice: item.price,
      quantity: 1, note: null, optionChoiceIds: [], choices: [], unitPrice: item.price,
    }))
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
  }

  const totalPrice = cartTotal(cart)
  const totalItems = cartCount(cart)

  async function submitOrder() {
    if (cart.length === 0) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableNumber: tableNumber || null,
          customerName: customerName || null,
          note: note || null,
          items: cart.map(l => ({
            menuItemId: l.menuItemId, quantity: l.quantity,
            note: l.note, optionChoiceIds: l.optionChoiceIds,
          })),
        }),
      })
      if (res.status === 401) { router.push('/'); return }
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'เกิดข้อผิดพลาด')
        return
      }
      const order = await res.json()
      router.push(`/orders/${order.id}`)
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่')
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

  // ── Cart phase ───────────────────────────────────────────────────
  if (phase === 'cart') {
    return (
      <div className="page-container fade-in">
        <div className="page-header" style={{ gap: 10, justifyContent: 'flex-start' }}>
          <button className="btn-icon btn-ghost" onClick={() => setPhase('ordering')} aria-label="กลับ">←</button>
          <h1 className="page-title">ตะกร้า</h1>
        </div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <input className="input" placeholder="เลขโต๊ะ" value={tableNumber} onChange={e => setTableNumber(e.target.value)} style={{ flex: '0 0 90px', padding: '10px 12px' }} />
          <input className="input" placeholder="ชื่อลูกค้า" value={customerName} onChange={e => setCustomerName(e.target.value)} style={{ flex: 1, padding: '10px 12px' }} />
        </div>
        <div style={{ marginBottom: '12px' }}>
          <input className="input" placeholder="หมายเหตุรวม" value={note} onChange={e => setNote(e.target.value)} style={{ width: '100%', padding: '10px 12px' }} />
        </div>
        <Cart
          lines={cart}
          onQty={(key, q) => setCart(prev => setQuantity(prev, key, q))}
          onRemove={key => setCart(prev => removeLine(prev, key))}
        />
        {cart.length > 0 && (
          <div style={{ position: 'fixed', bottom: '64px', left: '50%', transform: 'translateX(-50%)', width: 'calc(100% - 32px)', maxWidth: '568px', zIndex: 100 }}>
            {error && <p style={{ color: 'var(--c-danger)', fontSize: '0.82rem', marginBottom: '8px', textAlign: 'center' }}>{error}</p>}
            <button className="btn btn-primary btn-full" onClick={submitOrder} disabled={submitting}
              style={{ padding: '14px 20px', fontSize: '0.95rem', borderRadius: 'var(--radius)', justifyContent: 'space-between' }}>
              <span>{submitting ? 'กำลังบันทึก…' : 'บันทึกออเดอร์'}</span>
              {!submitting && <span style={{ fontWeight: 700, fontSize: '1rem' }}>฿{totalPrice.toLocaleString('th-TH')}</span>}
            </button>
          </div>
        )}
        <BottomNav />
      </div>
    )
  }

  // ── Ordering phase ───────────────────────────────────────────────
  const trimmedSearch = search.trim().toLowerCase()
  const isSearching = trimmedSearch.length > 0
  const searchResults = isSearching
    ? categories.flatMap(cat => (cat.diy ? [] : cat.items.filter(i => i.name.toLowerCase().includes(trimmedSearch))))
    : []
  const activeCat = categories.find(c => c.id === activeCategory)
  const isDiyView = !isSearching && !!activeCat?.diy
  const availableItems = isSearching ? searchResults : isDiyView ? [] : (activeCat?.items ?? [])

  return (
    <div className="page-container fade-in">
      <div className="page-header">
        <h1 className="page-title">สั่งอาหาร</h1>
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
        <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', overflowX: 'auto', paddingBottom: '2px', scrollbarWidth: 'none' }}>
          {categories.map(cat => (
            <button key={cat.id} className={`btn btn-sm ${activeCategory === cat.id ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setActiveCategory(cat.id)} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
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

      {isDiyView && activeCat ? (
        <DiyEntryCard category={activeCat} onStart={() => setSheetItem(buildDiyItem(activeCat))} />
      ) : availableItems.length === 0 ? (
        <div className="glass-panel" style={{ marginBottom: '16px' }}>
          <p style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--c-text-3)', fontSize: '0.88rem' }}>
            {isSearching ? 'ไม่พบเมนูที่ค้นหา' : 'ไม่มีเมนูในหมวดนี้'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px', marginBottom: '16px' }}>
          {availableItems.map(item => (
            <div key={item.id}
              style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--c-border)', overflow: 'hidden', background: 'var(--c-surface)', display: 'flex', flexDirection: 'column', cursor: 'pointer', minWidth: 0 }}
              onClick={() => openItem(item)}>
              <div style={{ aspectRatio: '4 / 3', background: 'var(--c-primary-light)', overflow: 'hidden', flexShrink: 0 }}>
                <ItemThumb imageUrl={item.imageUrl} name={item.name} cover />
              </div>
              <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 500, fontSize: '0.85rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word', lineHeight: 1.3 }}>{item.name}</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
                  <p className="price-tag" style={{ fontSize: '0.9rem' }}>฿{item.price.toLocaleString('th-TH')}</p>
                  <span className="btn btn-primary" style={{ width: 28, height: 28, padding: 0, borderRadius: '50%', fontSize: '1.1rem', lineHeight: 1 }} aria-hidden>+</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {categories.length === 0 && (
        <div className="glass-panel" style={{ padding: '48px 24px', textAlign: 'center' }}>
          <p style={{ color: 'var(--c-text-3)', fontSize: '0.88rem' }}>ยังไม่มีเมนู กรุณาเพิ่มเมนูก่อน</p>
        </div>
      )}

      <ItemOptionSheet item={sheetItem} onClose={() => setSheetItem(null)} onAdd={handleAdd} />

      {cart.length > 0 && (
        <div style={{ position: 'fixed', bottom: '64px', left: '50%', transform: 'translateX(-50%)', width: 'calc(100% - 32px)', maxWidth: '568px', zIndex: 100 }}>
          <button className="btn btn-primary btn-full" onClick={() => setPhase('cart')}
            style={{ padding: '14px 20px', fontSize: '0.95rem', borderRadius: 'var(--radius)', justifyContent: 'space-between' }}>
            <span>ดูตะกร้า · {totalItems} รายการ</span>
            <span style={{ fontWeight: 700, fontSize: '1rem' }}>฿{totalPrice.toLocaleString('th-TH')}</span>
          </button>
        </div>
      )}

      <BottomNav />
    </div>
  )
}
