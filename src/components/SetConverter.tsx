'use client'
import { useEffect, useState } from 'react'

type TokenMatch = {
  token: string
  match: { id: number; name: string; price: number } | null
  how: 'exact' | 'prefix' | 'loose' | 'partial' | null
}

type Plan = {
  itemId: number
  name: string
  parts: TokenMatch[]
  complete: boolean
  price: number
  separate: number
}

type Props = {
  categoryId: number
  categoryName: string
  onClose: () => void
  onDone: () => void
}

// Only exact matches are certain; the rest bridged a spelling difference and
// deserve a second look before they become what the kitchen reads.
const HOW_LABEL: Record<string, string> = {
  prefix: 'ตัดคำว่า "แป้ง" ออกแล้วตรง',
  loose: 'สะกดต่างกันเล็กน้อย',
  partial: 'ชื่อใกล้เคียง',
}

/**
 * Turn menu items already named like sets ("a+b+c") into real sets.
 *
 * The matching is fuzzy because menus spell ingredients inconsistently, so
 * nothing is written until staff have seen what each part resolved to. Rows
 * that didn't fully resolve can't be selected at all — a set that quietly
 * lost an ingredient is worse than one that was never converted.
 */
export default function SetConverter({ categoryId, categoryName, onClose, onDone }: Props) {
  const [plans, setPlans] = useState<Plan[] | null>(null)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/sets/convert?categoryId=${categoryId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setPlans([]); return }
        const list: Plan[] = d.plans ?? []
        setPlans(list)
        // Pre-tick the ones that resolved cleanly; the rest are opt-in.
        setPicked(new Set(list.filter(p => p.complete).map(p => p.itemId)))
      })
      .catch(() => { setError('โหลดข้อมูลไม่สำเร็จ'); setPlans([]) })
  }, [categoryId])

  function toggle(id: number) {
    setPicked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function apply() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/sets/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId, itemIds: [...picked] }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'แปลงไม่สำเร็จ'); return }
      onDone()
      onClose()
    } catch {
      setError('แปลงไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setSaving(false)
    }
  }

  const convertible = plans?.filter(p => p.complete) ?? []
  const stuck = plans?.filter(p => !p.complete) ?? []

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet scale-in" onClick={e => e.stopPropagation()}>
        <div className="sheet-head">
          <button className="btn-icon btn-ghost" onClick={onClose} aria-label="ปิด">✕</button>
          <span className="page-title" style={{ fontSize: 'var(--text-lg)' }}>
            แปลงเป็นเซ็ต · {categoryName}
          </span>
        </div>

        <div className="sheet-body">
          {plans === null ? (
            <p style={{ color: 'var(--c-text-3)', fontSize: 'var(--text-sm)' }}>กำลังจับคู่รายการ…</p>
          ) : plans.length === 0 ? (
            <p style={{ color: 'var(--c-text-3)', fontSize: 'var(--text-sm)' }}>
              ไม่พบเมนูที่ชื่อมีเครื่องหมาย + ในหมวดนี้
            </p>
          ) : (
            <>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--c-text-2)', marginBottom: 10 }}>
                จับคู่ได้ครบ {convertible.length} รายการ
                {stuck.length > 0 && ` · จับคู่ไม่ครบ ${stuck.length} รายการ`}
                <br />
                <span style={{ color: 'var(--c-text-3)' }}>ราคาเดิมไม่ถูกแก้ — เปลี่ยนแค่ว่ามีอะไรอยู่ในเซ็ต</span>
              </p>

              {convertible.map(p => (
                <label key={p.itemId} className="opt-group" style={{ display: 'block', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <input type="checkbox" checked={picked.has(p.itemId)}
                      onChange={() => toggle(p.itemId)} style={{ marginTop: 3 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{p.name}</p>
                      {p.parts.map((t, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 'var(--text-xs)', color: 'var(--c-text-3)', padding: '1px 0' }}>
                          <span>
                            • {t.match?.name}
                            {t.how !== 'exact' && t.how && (
                              <span style={{ color: 'var(--c-warning)' }}> ({HOW_LABEL[t.how]})</span>
                            )}
                          </span>
                          <span style={{ flexShrink: 0 }}>฿{t.match?.price.toLocaleString('th-TH')}</span>
                        </div>
                      ))}
                      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--c-text-3)', marginTop: 3 }}>
                        ราคาขายตอนนี้ ฿{p.price.toLocaleString('th-TH')} · รวมรายการ ฿{p.separate.toLocaleString('th-TH')}
                      </p>
                    </div>
                  </div>
                </label>
              ))}

              {stuck.length > 0 && (
                <div className="opt-group">
                  <span className="section-label">จับคู่ไม่ครบ — ต้องจัดเองทีละรายการ</span>
                  {stuck.map(p => (
                    <div key={p.itemId} style={{ padding: '4px 0' }}>
                      <p style={{ fontSize: 'var(--text-sm)' }}>{p.name}</p>
                      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--c-danger)' }}>
                        ไม่พบในเมนู: {p.parts.filter(t => !t.match).map(t => t.token).join(', ')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="sheet-foot" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
          {error && <p style={{ color: 'var(--c-danger)', fontSize: 'var(--text-sm)' }}>{error}</p>}
          <button className="btn btn-primary" disabled={saving || picked.size === 0} onClick={apply}>
            {saving ? 'กำลังแปลง…' : `แปลง ${picked.size} รายการเป็นเซ็ต`}
          </button>
        </div>
      </div>
    </div>
  )
}
