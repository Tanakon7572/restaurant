'use client'
import { useState } from 'react'
import ImageUploadField from './ImageUploadField'
import { setDisplayName, partsTotal } from '@/lib/setMenu'

export type PickableItem = { id: number; name: string; price: number; isSet?: boolean }
export type PickableCategory = { id: number; name: string; items: PickableItem[] }

export type SetEditorItem = {
  // Absent = a set being created; the category it will land in is `categoryId`.
  id?: number
  categoryId: number
  name: string
  imageUrl: string
  price: string
  discount: string
  parts: { itemId: number; quantity: number }[]
}

type Props = {
  item: SetEditorItem
  categories: PickableCategory[]
  onClose: () => void
  onSaved: () => void
}

function money(n: number) {
  return n.toLocaleString('th-TH')
}

/**
 * Create or edit a fixed set in one pass — name, photo, price, discount and
 * contents together, so a half-made set never reaches the live menu.
 *
 * Sets can't contain sets: nesting would make both the price and the
 * generated name recursive, so other sets are left out of the picker.
 */
export default function SetEditor({ item, categories, onClose, onSaved }: Props) {
  const [name, setName] = useState(item.name)
  const [imageUrl, setImageUrl] = useState(item.imageUrl)
  const [price, setPrice] = useState(item.price)
  // An existing set already has a price staff chose; a new one doesn't.
  const [priceTouched, setPriceTouched] = useState(!!item.id)
  const [discount, setDiscount] = useState(item.discount)
  const [parts, setParts] = useState(item.parts)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const byId = new Map<number, PickableItem>()
  for (const c of categories) for (const i of c.items) byId.set(i.id, i)

  const chosen = parts.flatMap(p => {
    const found = byId.get(p.itemId)
    return found ? [{ name: found.name, price: found.price, quantity: p.quantity }] : []
  })
  const separate = partsTotal(chosen)
  const generated = setDisplayName(chosen, '')

  const priceNum = Number(price) || 0
  const discountNum = Math.max(0, Number(discount) || 0)
  // What the customer is actually charged. Stored this way too, so nothing at
  // checkout has to redo the subtraction and risk disagreeing with the menu.
  const finalPrice = Math.max(0, priceNum - discountNum)

  const term = search.trim().toLowerCase()
  const visible = categories
    .map(c => ({
      ...c,
      items: c.items.filter(i =>
        i.id !== item.id && !i.isSet && (!term || i.name.toLowerCase().includes(term))),
    }))
    .filter(c => c.items.length > 0)

  // Until staff type a price of their own, it tracks what the parts add up to
  // — the usual case is a set that costs its contents less a discount, which
  // then needs no typing at all.
  function applyParts(next: { itemId: number; quantity: number }[]) {
    setParts(next)
    if (priceTouched) return
    setPrice(String(partsTotal(next.flatMap(p => {
      const f = byId.get(p.itemId)
      return f ? [{ name: f.name, price: f.price, quantity: p.quantity }] : []
    }))))
  }

  function toggle(id: number) {
    applyParts(parts.some(p => p.itemId === id)
      ? parts.filter(p => p.itemId !== id)
      : [...parts, { itemId: id, quantity: 1 }])
  }

  function setQty(id: number, qty: number) {
    if (qty < 1) return
    applyParts(parts.map(p => (p.itemId === id ? { ...p, quantity: qty } : p)))
  }

  async function save() {
    if (parts.length === 0) {
      setError('กรุณาเลือกรายการในเซ็ตอย่างน้อย 1 รายการ')
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = {
        categoryId: item.categoryId,
        name: name.trim(),
        imageUrl: imageUrl.trim(),
        price: finalPrice,
        discount: discountNum,
        parts,
      }
      const res = item.id
        ? await fetch(`/api/menu-items/${item.id}/set`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/sets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error || 'บันทึกไม่สำเร็จ')
        return
      }
      onSaved()
      onClose()
    } catch {
      setError('บันทึกไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet scale-in" onClick={e => e.stopPropagation()}>
        <div className="sheet-head">
          <button className="btn-icon btn-ghost" onClick={onClose} aria-label="ปิด">✕</button>
          <span className="page-title" style={{ fontSize: 'var(--text-lg)' }}>
            {item.id ? 'แก้ไขเซ็ต' : 'สร้างเซ็ตใหม่'}
          </span>
        </div>

        <div className="sheet-body">
          <div className="opt-group">
            <span className="section-label">ชื่อเซ็ต</span>
            <input className="input" value={name} onChange={e => setName(e.target.value)}
              placeholder={generated || 'เว้นว่างเพื่อใช้ชื่อรายการในเซ็ต'} />
            {!name.trim() && generated && (
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--c-text-3)', marginTop: 4 }}>
                ลูกค้าจะเห็นเป็น “{generated}”
              </p>
            )}
          </div>

          <div className="opt-group">
            <span className="section-label">รูปเซ็ต</span>
            <ImageUploadField value={imageUrl} onChange={setImageUrl} />
          </div>

          <div className="opt-group">
            <span className="section-label">ราคา</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--c-text-3)' }}>ราคาเต็ม</label>
                <input className="input" type="number" min="0" inputMode="decimal"
                  value={price}
                  onChange={e => { setPriceTouched(true); setPrice(e.target.value) }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--c-text-3)' }}>ส่วนลด</label>
                <input className="input" type="number" min="0" inputMode="decimal"
                  value={discount} onChange={e => setDiscount(e.target.value)} />
              </div>
            </div>

            {parts.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--c-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', color: 'var(--c-text-3)' }}>
                  <span>รวมราคารายการในเซ็ต</span>
                  <span>฿{money(separate)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginTop: 2 }}>
                  <span>ลูกค้าจ่าย</span>
                  <span className="price-tag">฿{money(finalPrice)}</span>
                </div>
                {discountNum > 0 && (
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--c-success)', textAlign: 'right', marginTop: 2 }}>
                    ลด ฿{money(discountNum)} จาก ฿{money(priceNum)}
                  </p>
                )}
                {finalPrice > separate && (
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--c-warning)', marginTop: 4 }}>
                    เซ็ตนี้แพงกว่าซื้อแยก (฿{money(separate)})
                  </p>
                )}
              </div>
            )}
          </div>

          {parts.length > 0 && (
            <div className="opt-group">
              <span className="section-label">รายการในเซ็ต</span>
              {parts.map(p => {
                const found = byId.get(p.itemId)
                return (
                  <div key={p.itemId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 0' }}>
                    <span style={{ fontSize: 'var(--text-sm)', minWidth: 0 }}>
                      {found?.name ?? '(ถูกลบแล้ว)'}
                      {found && <span style={{ color: 'var(--c-text-3)' }}> ฿{money(found.price)}</span>}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <div className="qty-stepper">
                        <button className="btn-icon btn-ghost" onClick={() => setQty(p.itemId, p.quantity - 1)} aria-label="ลด">−</button>
                        <span className="qty-n">{p.quantity}</span>
                        <button className="btn-icon btn-ghost" onClick={() => setQty(p.itemId, p.quantity + 1)} aria-label="เพิ่ม">+</button>
                      </div>
                      <button className="btn btn-ghost btn-sm" onClick={() => toggle(p.itemId)}>ลบ</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="opt-group">
            <span className="section-label">เลือกรายการ</span>
            <input className="input" placeholder="ค้นหาเมนู…" value={search}
              onChange={e => setSearch(e.target.value)} style={{ marginBottom: 8 }} />
            {visible.length === 0 ? (
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--c-text-3)' }}>ไม่พบเมนูที่ค้นหา</p>
            ) : visible.map(c => (
              <div key={c.id} style={{ marginBottom: 10 }}>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--c-text-3)', marginBottom: 4 }}>{c.name}</p>
                {c.items.map(i => {
                  const picked = parts.some(p => p.itemId === i.id)
                  return (
                    <label key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', cursor: 'pointer', fontSize: 'var(--text-sm)' }}>
                      <input type="checkbox" checked={picked} onChange={() => toggle(i.id)} />
                      <span style={{ flex: 1, minWidth: 0 }}>{i.name}</span>
                      <span style={{ color: 'var(--c-text-3)', flexShrink: 0 }}>฿{money(i.price)}</span>
                    </label>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="sheet-foot" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
          {error && <p style={{ color: 'var(--c-danger)', fontSize: 'var(--text-sm)' }}>{error}</p>}
          <button className="btn btn-primary" disabled={saving || parts.length === 0} onClick={save}>
            {saving ? 'กำลังบันทึก…'
              : parts.length === 0 ? 'เลือกรายการในเซ็ตก่อน'
              : `บันทึกเซ็ต ${parts.length} รายการ · ฿${money(finalPrice)}`}
          </button>
        </div>
      </div>
    </div>
  )
}
