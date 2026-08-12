'use client'
import type { CartLine } from '@/lib/types'
import { cartTotal } from '@/lib/cart'
import EmptyState from './EmptyState'

type Props = {
  lines: CartLine[]
  onQty: (key: string, qty: number) => void
  onRemove: (key: string) => void
  // Reopen one line's options / note. Omitted where the screen has no menu
  // loaded to reconfigure against; `canEdit` hides the button for a line whose
  // menu item the caller can't resolve (deleted from the menu since).
  onEdit?: (line: CartLine) => void
  canEdit?: (line: CartLine) => boolean
}

export default function Cart({ lines, onQty, onRemove, onEdit, canEdit }: Props) {
  if (lines.length === 0)
    return (
      <EmptyState
        compact
        title="ตะกร้าว่าง"
        hint="แตะรูปเมนูเพื่อเพิ่มลงออเดอร์ กดที่ “ตัวเลือก” ถ้าต้องเลือกไส้หรือระดับความหวาน"
      />
    )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {lines.map(l => (
        <div key={l.key} className="glass-panel" style={{ padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontWeight: 600 }}>{l.name}</span>
            <span className="price-tag">฿{l.unitPrice * l.quantity}</span>
          </div>
          {l.choices.length > 0 && (
            <ul style={{ listStyle: 'none', margin: '4px 0 0', fontSize: 'var(--text-sm)', color: 'var(--c-text-3)' }}>
              {l.choices.map((c, i) => (
                <li key={i}>{c.choiceName}{c.priceDelta > 0 ? ` (+฿${c.priceDelta})` : ''}</li>
              ))}
            </ul>
          )}
          {l.note && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--c-text-3)', marginTop: 4 }}>📝 {l.note}</p>}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            <div className="qty-stepper">
              <button className="btn-icon btn-ghost" onClick={() => onQty(l.key, l.quantity - 1)} aria-label="ลด">−</button>
              <span className="qty-n">{l.quantity}</span>
              <button className="btn-icon btn-ghost" onClick={() => onQty(l.key, l.quantity + 1)} aria-label="เพิ่ม">+</button>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {onEdit && (!canEdit || canEdit(l)) && (
                <button className="btn btn-ghost btn-sm" onClick={() => onEdit(l)}>แก้ไข</button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => onRemove(l.key)}>ลบ</button>
            </div>
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 4px', fontWeight: 700 }}>
        <span>รวม</span><span className="price-tag-lg">฿{cartTotal(lines)}</span>
      </div>
    </div>
  )
}
