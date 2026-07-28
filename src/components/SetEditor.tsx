'use client'
import { useState } from 'react'
import { setDisplayName, partsTotal, setSaving } from '@/lib/setMenu'

export type PickableItem = { id: number; name: string; price: number; isSet?: boolean }
export type PickableCategory = { id: number; name: string; items: PickableItem[] }

export type SetEditorItem = {
  id: number
  name: string
  price: number
  parts: { itemId: number; quantity: number }[]
}

type Props = {
  item: SetEditorItem
  categories: PickableCategory[]
  onClose: () => void
  onSaved: () => void
}

/**
 * Build a fixed set by ticking real menu items.
 *
 * Staff pick the parts and set a price; the customer-facing name is generated
 * from the parts, so the preview here is what will actually appear on the
 * menu. Sets can't contain sets — nesting would make both the price and the
 * generated name recursive — so those are left out of the list entirely.
 */
export default function SetEditor({ item, categories, onClose, onSaved }: Props) {
  const [parts, setParts] = useState(item.parts)
  const [search, setSearch] = useState('')
  const [saving, setSaving_] = useState(false)
  const [error, setError] = useState('')

  const byId = new Map<number, PickableItem>()
  for (const c of categories) for (const i of c.items) byId.set(i.id, i)

  const chosen = parts.flatMap(p => {
    const found = byId.get(p.itemId)
    return found ? [{ name: found.name, price: found.price, quantity: p.quantity }] : []
  })
  const separate = partsTotal(chosen)
  const saved = setSaving(chosen, item.price)

  const term = search.trim().toLowerCase()
  const visible = categories
    .map(c => ({
      ...c,
      items: c.items.filter(i =>
        i.id !== item.id && !i.isSet && (!term || i.name.toLowerCase().includes(term))),
    }))
    .filter(c => c.items.length > 0)

  function toggle(id: number) {
    setParts(prev => prev.some(p => p.itemId === id)
      ? prev.filter(p => p.itemId !== id)
      : [...prev, { itemId: id, quantity: 1 }])
  }

  function setQty(id: number, qty: number) {
    if (qty < 1) return
    setParts(prev => prev.map(p => (p.itemId === id ? { ...p, quantity: qty } : p)))
  }

  async function save() {
    setSaving_(true)
    setError('')
    try {
      const res = await fetch(`/api/menu-items/${item.id}/set`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parts }),
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
      setSaving_(false)
    }
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet scale-in" onClick={e => e.stopPropagation()}>
        <div className="sheet-head">
          <button className="btn-icon btn-ghost" onClick={onClose} aria-label="ปิด">✕</button>
          <span className="page-title" style={{ fontSize: 'var(--text-lg)' }}>จัดเซ็ต · {item.name}</span>
        </div>

        <div className="sheet-body">
          {/* What the customer will see, updating as parts are ticked. */}
          <div className="opt-group">
            <span className="section-label">ลูกค้าจะเห็นเป็น</span>
            {parts.length === 0 ? (
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--c-text-3)' }}>
                ยังไม่ได้เลือกรายการ — ตอนนี้ยังเป็นเมนูเดี่ยวชื่อ “{item.name}”
              </p>
            ) : (
              <>
                <p style={{ fontWeight: 600 }}>{setDisplayName(chosen, item.name)}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 'var(--text-sm)', color: 'var(--c-text-3)' }}>
                  <span>ซื้อแยกทั้งหมด</span>
                  <span>฿{separate.toLocaleString('th-TH')}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                  <span>ราคาเซ็ต</span>
                  <span className="price-tag">฿{item.price.toLocaleString('th-TH')}</span>
                </div>
                <p style={{ fontSize: 'var(--text-sm)', marginTop: 4, color: saved > 0 ? 'var(--c-success)' : 'var(--c-warning)' }}>
                  {saved > 0
                    ? `ลูกค้าประหยัด ฿${saved.toLocaleString('th-TH')}`
                    : 'เซ็ตนี้ไม่ถูกกว่าซื้อแยก — แก้ราคาเซ็ตได้ที่ปุ่มแก้ไขของเมนูนี้'}
                </p>
              </>
            )}
          </div>

          {/* Chosen parts, with quantity. Kept above the picker so a long menu
              doesn't push the current selection out of sight. */}
          {parts.length > 0 && (
            <div className="opt-group">
              <span className="section-label">รายการในเซ็ต</span>
              {parts.map(p => {
                const found = byId.get(p.itemId)
                return (
                  <div key={p.itemId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 0' }}>
                    <span style={{ fontSize: 'var(--text-sm)', minWidth: 0 }}>
                      {found?.name ?? '(ถูกลบแล้ว)'}
                      {found && <span style={{ color: 'var(--c-text-3)' }}> ฿{found.price.toLocaleString('th-TH')}</span>}
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
                      <span style={{ color: 'var(--c-text-3)', flexShrink: 0 }}>฿{i.price.toLocaleString('th-TH')}</span>
                    </label>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="sheet-foot" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
          {error && <p style={{ color: 'var(--c-danger)', fontSize: 'var(--text-sm)' }}>{error}</p>}
          <button className="btn btn-primary" disabled={saving} onClick={save}>
            {saving ? 'กำลังบันทึก…' : parts.length === 0 ? 'บันทึก (ยกเลิกการเป็นเซ็ต)' : `บันทึกเซ็ต ${parts.length} รายการ`}
          </button>
        </div>
      </div>
    </div>
  )
}
