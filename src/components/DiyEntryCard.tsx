'use client'

import type { MenuCategoryDTO } from '@/lib/types'
import { isCrust } from '@/lib/options'

type Props = { category: MenuCategoryDTO; onStart: () => void }

/**
 * Single entry card shown in place of the ingredient grid for a DIY
 * category. Tapping it opens the same step sheet used by Signature items.
 */
export default function DiyEntryCard({ category, onStart }: Props) {
  const crusts = category.items.filter(i => isCrust(i.name))
  const extras = category.items.filter(i => !isCrust(i.name))
  const minCrust = crusts.length > 0 ? Math.min(...crusts.map(c => c.price)) : 0

  return (
    <button
      onClick={onStart}
      className="glass-panel"
      style={{
        width: '100%', textAlign: 'left', cursor: 'pointer',
        padding: '20px', marginBottom: '14px',
        border: '1.5px dashed var(--c-primary)',
        background: 'var(--c-primary-glow, var(--c-primary-light))',
        display: 'flex', alignItems: 'center', gap: '14px',
        fontFamily: 'inherit',
      }}
    >
      <div
        aria-hidden
        style={{
          width: 52, height: 52, borderRadius: '14px', flexShrink: 0,
          background: 'var(--c-primary)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.5rem',
        }}
      >
        ✚
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontWeight: 700, fontSize: '1rem', letterSpacing: '-0.01em', color: 'var(--c-text)' }}>
          จัดเองตามใจ ({category.name})
        </p>
        <p style={{ fontSize: '0.82rem', color: 'var(--c-text-2)', marginTop: 2 }}>
          เลือกแป้ง {crusts.length} แบบ · ท็อปปิ้ง {extras.length} อย่าง
          {minCrust > 0 && ` · เริ่ม ฿${minCrust.toLocaleString('th-TH')}`}
        </p>
      </div>
      <span
        className="btn btn-primary btn-sm"
        style={{ flexShrink: 0, pointerEvents: 'none' }}
        aria-hidden
      >
        เริ่มเลือก →
      </span>
    </button>
  )
}
