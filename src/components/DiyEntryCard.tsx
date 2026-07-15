'use client'

import type { MenuCategoryDTO } from '@/lib/types'
import { isCrust, CRUST_GROUP_ID } from '@/lib/options'

type Props = { category: MenuCategoryDTO; onStart: () => void }

/**
 * Single entry card shown in place of the ingredient grid for a DIY
 * category. Tapping it opens the same step sheet used by Signature items.
 */
export default function DiyEntryCard({ category, onStart }: Props) {
  // Multi-pool categories carry server-derived groups; legacy pools derive
  // the summary from their own items. Sold-out choices don't count.
  const groups = category.diyGroups ?? []
  const crustGroup = groups.find(g => g.id === CRUST_GROUP_ID)
  const crustPrices = crustGroup
    ? crustGroup.choices.filter(c => c.available).map(c => c.priceDelta)
    : category.items.filter(i => isCrust(i.name) && i.available !== false).map(i => i.price)
  const crustCount = crustPrices.length
  const extraGroups = groups.filter(g => g.id !== CRUST_GROUP_ID)
  const extraCount = extraGroups.length > 0
    ? extraGroups.reduce((s, g) => s + g.choices.filter(c => c.available).length, 0)
    : category.items.filter(i => !isCrust(i.name) && i.available !== false).length
  const minCrust = crustPrices.length > 0 ? Math.min(...crustPrices) : 0
  const stepNames = extraGroups.length > 1 ? extraGroups.map(g => g.name).join(' · ') : ''

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
          เลือกแป้ง {crustCount} แบบ · ท็อปปิ้ง {extraCount} อย่าง
          {minCrust > 0 && ` · เริ่ม ฿${minCrust.toLocaleString('th-TH')}`}
        </p>
        {stepNames && (
          <p style={{ fontSize: '0.75rem', color: 'var(--c-text-3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {stepNames}
          </p>
        )}
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
