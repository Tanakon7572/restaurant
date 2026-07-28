'use client'
import { useState } from 'react'
import type { MenuItemDTO, CartLine } from '@/lib/types'
import { lineKey } from '@/lib/cart'

type Props = {
  item: MenuItemDTO | null
  onClose: () => void
  onAdd: (line: CartLine) => void
  // Present when reopening a line that is already in the cart or the order:
  // the sheet starts from what was chosen and saves over it instead of adding.
  initial?: { optionChoiceIds: number[]; quantity: number; note: string | null } | null
}

function ChoiceThumb({ imageUrl, name }: { imageUrl?: string | null; name: string }) {
  const [imgError, setImgError] = useState(false)
  if (imageUrl && !imgError) {
    return <img src={imageUrl} alt="" onError={() => setImgError(true)} />
  }
  return <div className="opt-tile-fallback">{name.charAt(0)}</div>
}

/**
 * Choices already on a line arrive as one flat list of ids; sort them back
 * into their groups so the tiles come up ticked. A choice that no longer
 * exists on the menu matches nothing and is dropped — which is what saving
 * would do with it anyway.
 */
function seedSelection(item: MenuItemDTO | null, initial: Props['initial']): Record<number, number[]> {
  const seed: Record<number, number[]> = {}
  if (!item || !initial) return seed
  for (const g of item.optionGroups) {
    const picks = g.choices.filter(c => initial.optionChoiceIds.includes(c.id)).map(c => c.id)
    if (picks.length > 0) seed[g.id] = picks
  }
  return seed
}

export default function ItemOptionSheet({ item, onClose, onAdd, initial }: Props) {
  const [selected, setSelected] = useState<Record<number, number[]>>(() => seedSelection(item, initial))
  const [qty, setQty] = useState(initial?.quantity ?? 1)
  const [note, setNote] = useState(initial?.note ?? '')

  // Pointing the sheet at a different item starts it over. Adjusted during
  // render rather than in an effect, so the pickers are never briefly showing
  // the previous item's choices.
  const [shownFor, setShownFor] = useState(item?.id ?? null)
  if ((item?.id ?? null) !== shownFor) {
    setShownFor(item?.id ?? null)
    setSelected(seedSelection(item, initial))
    setQty(initial?.quantity ?? 1)
    setNote(initial?.note ?? '')
  }

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
                <div className="opt-grid">
                  {g.choices.map(c => {
                    const checked = picks.includes(c.id)
                    const blocked = !checked && g.maxSelect > 1 && picks.length >= g.maxSelect
                    const state = !c.available ? ' is-off' : blocked ? ' is-blocked' : ''
                    return (
                      <label key={c.id} className={`opt-tile${checked ? ' selected' : ''}${state}`}>
                        <input
                          type={g.maxSelect === 1 ? 'radio' : 'checkbox'}
                          name={`g${g.id}`} checked={checked}
                          disabled={!c.available || blocked}
                          onChange={() => toggle(g, c.id)} />
                        {!c.available && <span className="opt-tile-off-badge">หมด</span>}
                        {checked && <span className="opt-tile-check" aria-hidden>✓</span>}
                        <div className="opt-tile-media">
                          <ChoiceThumb imageUrl={c.imageUrl} name={c.name} />
                        </div>
                        <div className="opt-tile-body">
                          <span className="opt-tile-name">{c.name}</span>
                          <span className="opt-tile-price">
                            {c.priceDelta > 0 ? `+฿${c.priceDelta.toLocaleString('th-TH')}` : '฿0'}
                          </span>
                        </div>
                      </label>
                    )
                  })}
                </div>
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
            {initial ? 'บันทึกรายการ' : 'ใส่ตะกร้า'} ฿{unitPrice * qty}
          </button>
        </div>
      </div>
    </div>
  )
}
