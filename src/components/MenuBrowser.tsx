'use client'

import { useState } from 'react'
import type { MenuCategoryDTO, MenuItemDTO } from '@/lib/types'
import { buildDiyItem } from '@/lib/options'
import DiyEntryCard from './DiyEntryCard'
import EmptyState from './EmptyState'

function ItemThumb({ imageUrl, name }: { imageUrl?: string | null; name: string }) {
  const [imgError, setImgError] = useState(false)
  if (imageUrl && !imgError) {
    return <img src={imageUrl} alt={name} onError={() => setImgError(true)} />
  }
  return <div className="menu-card-fallback">{name.charAt(0)}</div>
}

type Props = {
  categories: MenuCategoryDTO[]
  /** Receives the tapped item — a DIY category yields its synthetic builder item. */
  onSelect: (item: MenuItemDTO) => void
  emptyText?: string
}

/**
 * Search + category tabs + the 3-column menu grid, shared by the customer
 * ordering screen, staff order taking and the staff order editor so all three
 * stay visually and behaviourally identical.
 */
export default function MenuBrowser({ categories, onSelect, emptyText = 'ยังไม่มีเมนู' }: Props) {
  const [pickedCategory, setPickedCategory] = useState<number | null>(null)
  const [search, setSearch] = useState('')

  // Derived, not synced: the first category stands in until one is tapped, and
  // a menu reload that drops the picked category falls back to the first.
  const activeCat = categories.find(c => c.id === pickedCategory) ?? categories[0]

  const trimmedSearch = search.trim().toLowerCase()
  const isSearching = trimmedSearch.length > 0
  const searchResults = isSearching
    ? categories.flatMap(cat => (cat.diy ? [] : cat.items.filter(i => i.name.toLowerCase().includes(trimmedSearch))))
    : []
  const isDiyView = !isSearching && !!activeCat?.diy
  const displayItems = isSearching ? searchResults : isDiyView ? [] : (activeCat?.items ?? [])

  return (
    <>
      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '12px' }}>
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
          style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--c-text-3)', pointerEvents: 'none' }}>
          <circle cx="8.5" cy="8.5" r="5.5"/><line x1="13" y1="13" x2="17" y2="17"/>
        </svg>
        <input className="input" placeholder="ค้นหาเมนู…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: '36px' }} />
        {search && (
          <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-3)', fontSize: 'var(--text-base)', lineHeight: 1 }} aria-label="ล้างการค้นหา">×</button>
        )}
      </div>

      {!isSearching && categories.length > 0 && (
        <div className="seg" style={{ marginBottom: '16px' }}>
          {categories.map(cat => (
            <button key={cat.id} className={`seg-item${activeCat?.id === cat.id ? ' active' : ''}`} onClick={() => setPickedCategory(cat.id)}>
              {cat.name}
              {/* A DIY category is a builder, not a list — a count there would
                  be counting ingredients, which is not what the tab means. */}
              {!cat.diy && cat.items.length > 0 && (
                <span className="seg-count">{cat.items.length}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Only the hit count. The empty case is the panel below saying so
          properly; two "not found" lines stacked was just noise. */}
      {isSearching && searchResults.length > 0 && (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--c-text-3)', marginBottom: '10px' }}>
          พบ {searchResults.length} รายการ
        </p>
      )}

      {isDiyView && activeCat ? (
        <DiyEntryCard category={activeCat} onStart={() => onSelect(buildDiyItem(activeCat))} />
      ) : displayItems.length === 0 ? (
        <div className="glass-panel" style={{ marginBottom: '14px' }}>
          {isSearching ? (
            <EmptyState
              title={`ไม่พบเมนูที่ตรงกับ “${search.trim()}”`}
              hint="ลองพิมพ์สั้นลง หรือแตะหมวดด้านบนเพื่อไล่ดูทั้งหมด"
            />
          ) : categories.length === 0 ? (
            <EmptyState title={emptyText} hint="เพิ่มหมวดหมู่และเมนูได้ที่หน้าจัดการเมนู" />
          ) : (
            <EmptyState
              title={`ยังไม่มีเมนูในหมวด “${activeCat?.name ?? ''}”`}
              hint="เลือกหมวดอื่นด้านบน หรือเพิ่มเมนูเข้าหมวดนี้ที่หน้าจัดการเมนู"
            />
          )}
        </div>
      ) : (
        <div className="menu-rows">
          {displayItems.map(item => {
            const soldOut = item.available === false
            return (
              <div
                key={item.id}
                className={`menu-row${soldOut ? ' is-sold' : ''}`}
                onClick={() => !soldOut && onSelect(item)}
              >
                <div className="menu-row-thumb">
                  <ItemThumb imageUrl={item.imageUrl} name={item.name} />
                  {soldOut && <span className="sold-veil">หมด</span>}
                </div>
                <div className="menu-row-body">
                  <p className="menu-row-name">{item.name}</p>
                  <p className="menu-row-price">฿{item.price.toLocaleString('th-TH')}</p>
                </div>
                {/* The row and the button do the same thing. Both are here
                    because a thumb aiming at a 52px square is surer than one
                    aiming at a row, and a row is easier to hit in a hurry. */}
                <button
                  type="button"
                  className="menu-row-add"
                  disabled={soldOut}
                  aria-label={`เพิ่ม ${item.name}`}
                  onClick={e => { e.stopPropagation(); if (!soldOut) onSelect(item) }}
                >
                  +
                </button>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
