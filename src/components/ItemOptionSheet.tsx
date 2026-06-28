'use client'
import { useEffect, useState } from 'react'
import type { MenuItemDTO, CartLine } from '@/lib/types'
import { lineKey } from '@/lib/cart'

type Props = { item: MenuItemDTO | null; onClose: () => void; onAdd: (line: CartLine) => void }

export default function ItemOptionSheet({ item, onClose, onAdd }: Props) {
  const [selected, setSelected] = useState<Record<number, number[]>>({})
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')

  useEffect(() => { setSelected({}); setQty(1); setNote('') }, [item?.id])

  if (!item) return null

  const toggle = (g: MenuItemDTO['optionGroups'][number], choiceId: number) => {
    setSelected(prev => {
      const cur = prev[g.id] ?? []
      if (g.maxSelect === 1) return { ...prev, [g.id]: [choiceId] }
      if (cur.includes(choiceId)) return { ...prev, [g.id]: cur.filter(id => id !== choiceId) }
      if (cur.length >= g.maxSelect) return prev
      return { ...prev, [g.id]: [...cur, choiceId] }
    })
  }

  const allChosen = item.optionGroups.flatMap(g =>
    (selected[g.id] ?? []).map(id => {
      const c = g.choices.find(x => x.id === id)!
      return { groupName: g.name, choiceName: c.name, priceDelta: c.priceDelta }
    }))
  const delta = allChosen.reduce((s, c) => s + c.priceDelta, 0)
  const unitPrice = item.price + delta
  const requiredOk = item.optionGroups.every(g => {
    const n = (selected[g.id] ?? []).length
    const min = g.required ? Math.max(1, g.minSelect) : g.minSelect
    return n >= min && n <= g.maxSelect
  })

  const add = () => {
    const choiceIds = Object.values(selected).flat()
    const trimmed = note.trim() || null
    onAdd({
      key: lineKey(item.id, choiceIds, trimmed),
      menuItemId: item.id, name: item.name, basePrice: item.price,
      quantity: qty, note: trimmed, optionChoiceIds: choiceIds,
      choices: allChosen, unitPrice,
    })
    onClose()
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet scale-in" onClick={e => e.stopPropagation()}>
        <div className="sheet-head">
          <button className="btn-icon btn-ghost" onClick={onClose} aria-label="ปิด">✕</button>
          <span className="page-title" style={{ fontSize: 'var(--text-lg)' }}>{item.name}</span>
        </div>
        <div className="sheet-body">
          {item.optionGroups.map(g => {
            const picks = selected[g.id] ?? []
            return (
              <div key={g.id} className="opt-group">
                <div className="opt-group-head">
                  <span className="section-label" style={{ margin: 0 }}>{g.name}</span>
                  {g.required && <span className="badge badge-pending">ต้องระบุ</span>}
                </div>
                <p className="opt-hint">
                  {g.maxSelect === 1 ? 'กรุณาเลือก 1 ข้อ' : `เลือกสูงสุด ${g.maxSelect} ข้อ`}
                </p>
                {g.choices.map(c => {
                  const checked = picks.includes(c.id)
                  const blocked = !checked && g.maxSelect > 1 && picks.length >= g.maxSelect
                  return (
                    <label key={c.id} className={`opt-row${!c.available ? ' opt-row-off' : ''}`}>
                      <input
                        type={g.maxSelect === 1 ? 'radio' : 'checkbox'}
                        name={`g${g.id}`} checked={checked}
                        disabled={!c.available || blocked}
                        onChange={() => toggle(g, c.id)} />
                      <span className="opt-name">{c.name}</span>
                      <span className="opt-price">{c.priceDelta > 0 ? `+฿${c.priceDelta}` : '฿0'}</span>
                    </label>
                  )
                })}
              </div>
            )
          })}
          <div className="opt-group">
            <span className="section-label">รายละเอียดเพิ่มเติม</span>
            <textarea className="input" rows={2} placeholder="เช่น ไม่เอาผัก"
              value={note} onChange={e => setNote(e.target.value)} />
          </div>
        </div>
        <div className="sheet-foot">
          <div className="qty-stepper">
            <button className="btn-icon btn-ghost" onClick={() => setQty(q => Math.max(1, q - 1))} aria-label="ลด">−</button>
            <span className="qty-n">{qty}</span>
            <button className="btn-icon btn-ghost" onClick={() => setQty(q => q + 1)} aria-label="เพิ่ม">+</button>
          </div>
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={!requiredOk} onClick={add}>
            ใส่ตะกร้า ฿{unitPrice * qty}
          </button>
        </div>
      </div>
    </div>
  )
}
