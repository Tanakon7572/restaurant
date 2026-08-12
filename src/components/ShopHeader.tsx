'use client'

import { useEffect, useState } from 'react'

/**
 * The bar at the top of a working screen: whose till this is, and what screen
 * you are on. Replaces a bare page title.
 *
 * There was a shift marker here showing the current time. It was removed —
 * the POS has no shift record, so it was a clock dressed up as status, and a
 * status that is always green tells the staff nothing.
 */
export default function ShopHeader({ title, children }: { title?: string; children?: React.ReactNode }) {
  const [shopName, setShopName] = useState('')

  useEffect(() => {
    fetch('/api/settings')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.shopName) setShopName(d.shopName) })
      .catch(() => {})
  }, [])

  return (
    <header className="shop-header">
      <div className="shop-id">
        <div style={{ minWidth: 0 }}>
          <div className="shop-name">{shopName || title || 'หน้าร้าน'}</div>
          {shopName && title && <div className="shop-sub">{title}</div>}
        </div>
      </div>
      {children}
    </header>
  )
}
