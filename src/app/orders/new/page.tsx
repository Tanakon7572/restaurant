'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import PosShell from '@/components/PosShell'
import type { MenuItemDTO, MenuCategoryDTO, CartLine } from '@/lib/types'
import { addLine, setQuantity, removeLine, cartTotal, cartCount } from '@/lib/cart'
import { translateDiyLine } from '@/lib/options'
import { needsSheet } from '@/lib/needsSheet'
import { submitOrder as submitOrderOrQueue } from '@/lib/offlineQueue'
import ItemOptionSheet from '@/components/ItemOptionSheet'
import Cart from '@/components/Cart'
import MenuBrowser from '@/components/MenuBrowser'

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
  const [queuedNotice, setQueuedNotice] = useState(false)
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
            diyGroups: Array.isArray(c.diyGroups) ? (c.diyGroups as MenuCategoryDTO['diyGroups']) : [],
            items: Array.isArray(c.items) ? (c.items as Record<string, unknown>[]).map(toMenuItem) : [],
          }))
          setCategories(cats)
        }
      })
      .finally(() => setLoading(false))
  }, [router])

  function openItem(item: MenuItemDTO) {
    if (item.available === false) return
    if (needsSheet(item)) { setSheetItem(item); return }
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
    const payload = {
      tableNumber: tableNumber || null,
      customerName: customerName || null,
      note: note || null,
      items: cart.map(l => ({
        menuItemId: l.menuItemId, quantity: l.quantity,
        note: l.note, optionChoiceIds: l.optionChoiceIds,
      })),
    }
    try {
      const result = await submitOrderOrQueue(payload)
      // No connection: the ticket is parked and sent automatically later, so
      // the till clears and staff carry on serving.
      if (result.queued) {
        setCart([])
        setTableNumber(''); setCustomerName(''); setNote('')
        setQueuedNotice(true)
        setTimeout(() => setQueuedNotice(false), 6000)
        return
      }
      const data = result.data as { id?: number; error?: string }
      if (!result.ok) {
        setError(data.error || 'เกิดข้อผิดพลาด')
        return
      }
      router.push(`/orders/${data.id}`)
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setSubmitting(false)
    }
  }

  // Right-hand "current order" panel (desktop POS layout)
  const cartPanel = (
    <>
      <div className="pos-cart-head">ออเดอร์ปัจจุบัน</div>
      <div className="pos-cart-body">
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <input className="input" placeholder="เลขโต๊ะ" value={tableNumber} onChange={e => setTableNumber(e.target.value)} style={{ flex: '0 0 84px', padding: '9px 10px' }} />
          <input className="input" placeholder="ชื่อลูกค้า" value={customerName} onChange={e => setCustomerName(e.target.value)} style={{ flex: 1, padding: '9px 10px' }} />
        </div>
        <input className="input" placeholder="หมายเหตุรวม" value={note} onChange={e => setNote(e.target.value)} style={{ marginBottom: '12px', padding: '9px 10px' }} />
        {cart.length === 0 ? (
          <p style={{ color: 'var(--c-text-4)', textAlign: 'center', padding: '40px 0', fontSize: '0.88rem' }}>ยังไม่มีรายการ</p>
        ) : (
          <Cart
            lines={cart}
            onQty={(key, q) => setCart(prev => setQuantity(prev, key, q))}
            onRemove={key => setCart(prev => removeLine(prev, key))}
          />
        )}
      </div>
      <div className="pos-cart-foot">
        <div className="pos-cart-row">
          <span>{totalItems} รายการ</span>
        </div>
        <div className="pos-cart-total">
          <span>รวม</span>
          <span className="price-tag-lg">฿{totalPrice.toLocaleString('th-TH')}</span>
        </div>
        {error && <p style={{ color: 'var(--c-danger)', fontSize: '0.82rem' }}>{error}</p>}
        {queuedNotice && (
          <p style={{ color: 'var(--c-warning)', fontSize: '0.82rem' }}>
            บันทึกออเดอร์ไว้แล้ว — จะส่งเข้าระบบให้เองเมื่อเน็ตกลับมา
          </p>
        )}
        <button
          className="btn btn-primary btn-full"
          onClick={submitOrder}
          disabled={submitting || cart.length === 0}
          style={{ padding: '14px', fontSize: '1rem' }}
        >
          {submitting ? 'กำลังบันทึก…' : 'บันทึกออเดอร์'}
        </button>
      </div>
    </>
  )

  if (loading) {
    return (
      <PosShell>
        <div className="page-container">
          <div className="page-header">
            <div style={{ height: '28px', width: '100px', background: 'var(--c-surface-2)', borderRadius: '6px' }} />
          </div>
        </div>
      </PosShell>
    )
  }

  // ── Cart phase ───────────────────────────────────────────────────
  if (phase === 'cart') {
    return (
      <PosShell cart={cartPanel}>
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
          <div className="hide-desktop" style={{ position: 'fixed', bottom: '64px', left: '50%', transform: 'translateX(-50%)', width: 'calc(100% - 32px)', maxWidth: '568px', zIndex: 100 }}>
            {error && <p style={{ color: 'var(--c-danger)', fontSize: '0.82rem', marginBottom: '8px', textAlign: 'center' }}>{error}</p>}
            {queuedNotice && (
              <p style={{ color: 'var(--c-warning)', fontSize: '0.82rem', marginBottom: '8px', textAlign: 'center' }}>
                บันทึกออเดอร์ไว้แล้ว — จะส่งเข้าระบบให้เองเมื่อเน็ตกลับมา
              </p>
            )}
            <button className="btn btn-primary btn-full" onClick={submitOrder} disabled={submitting}
              style={{ padding: '14px 20px', fontSize: '0.95rem', borderRadius: 'var(--radius)', justifyContent: 'space-between' }}>
              <span>{submitting ? 'กำลังบันทึก…' : 'บันทึกออเดอร์'}</span>
              {!submitting && <span style={{ fontWeight: 700, fontSize: '1rem' }}>฿{totalPrice.toLocaleString('th-TH')}</span>}
            </button>
          </div>
        )}
      </div>
      </PosShell>
    )
  }

  // ── Ordering phase ───────────────────────────────────────────────
  return (
    <PosShell cart={cartPanel}>
    <div className="page-container fade-in">
      <div className="page-header">
        <h1 className="page-title">สั่งอาหาร</h1>
      </div>

      <MenuBrowser categories={categories} onSelect={openItem} emptyText="ยังไม่มีเมนู กรุณาเพิ่มเมนูก่อน" />

      <ItemOptionSheet item={sheetItem} onClose={() => setSheetItem(null)} onAdd={handleAdd} />

      {cart.length > 0 && (
        <div className="hide-desktop" style={{ position: 'fixed', bottom: '64px', left: '50%', transform: 'translateX(-50%)', width: 'calc(100% - 32px)', maxWidth: '568px', zIndex: 100 }}>
          <button className="btn btn-primary btn-full" onClick={() => setPhase('cart')}
            style={{ padding: '14px 20px', fontSize: '0.95rem', borderRadius: 'var(--radius)', justifyContent: 'space-between' }}>
            <span>ดูตะกร้า · {totalItems} รายการ</span>
            <span style={{ fontWeight: 700, fontSize: '1rem' }}>฿{totalPrice.toLocaleString('th-TH')}</span>
          </button>
        </div>
      )}
    </div>
    </PosShell>
  )
}
