'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import BottomNav from './BottomNav'

function IconGrid() {
  return (
    <svg width="19" height="19" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="2"/><rect x="12" y="3" width="7" height="7" rx="2"/>
      <rect x="3" y="12" width="7" height="7" rx="2"/><rect x="12" y="12" width="7" height="7" rx="2"/>
    </svg>
  )
}
function IconPos() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
      <line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>
    </svg>
  )
}
function IconReceipt() {
  return (
    <svg width="19" height="19" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5.5 3.5h11v15l-2.75-1.75L11 18.5l-2.75-1.75L5.5 18.5V3.5Z"/>
      <path d="M8.5 9h5M8.5 12.5h3.5"/>
    </svg>
  )
}
function IconMenu() {
  return (
    <svg width="19" height="19" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <path d="M4 7h14M4 11h14M4 15h8"/>
    </svg>
  )
}
function IconKitchen() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
    </svg>
  )
}
function IconQr() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <path d="M14 14h2v2h-2zM18 14h3M14 18v3M18 18h3v3h-3z"/>
    </svg>
  )
}
function IconCash() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>
      <path d="M6 12h.01M18 12h.01"/>
    </svg>
  )
}
function IconReport() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>
    </svg>
  )
}
function IconSettings() {
  return (
    <svg width="19" height="19" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="3"/>
      <path d="M11 2.5v2M11 17.5v2M2.5 11h2M17.5 11h2M4.93 4.93l1.41 1.41M15.66 15.66l1.41 1.41M4.93 17.07l1.41-1.41M15.66 6.34l1.41-1.41"/>
    </svg>
  )
}

const NAV = [
  { href: '/dashboard',  label: 'หน้าหลัก',    Icon: IconGrid },
  { href: '/orders/new', label: 'ขายหน้าร้าน', Icon: IconPos },
  { href: '/checkout',   label: 'เก็บเงิน',    Icon: IconCash },
  { href: '/reports',    label: 'ปิดรอบขาย',   Icon: IconReport },
  { href: '/orders',     label: 'ออเดอร์',     Icon: IconReceipt, badge: true },
  { href: '/menu',       label: 'จัดการเมนู',  Icon: IconMenu },
  { href: '/kitchen',    label: 'จอครัว',      Icon: IconKitchen, newTab: true },
  { href: '/qr',         label: 'QR โต๊ะ',     Icon: IconQr },
  { href: '/settings',   label: 'ตั้งค่า',     Icon: IconSettings },
]

/**
 * POS app shell: sidebar navigation on desktop (≥1024px), the existing
 * BottomNav on mobile. `cart` renders as the right-hand order panel.
 */
export default function PosShell({ children, cart }: { children: React.ReactNode; cart?: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    function fetchPending() {
      fetch('/api/orders?status=pending')
        .then(r => (r.ok ? r.json() : []))
        .then(data => (Array.isArray(data) ? setPendingCount(data.length) : null))
        .catch(() => {})
    }
    fetchPending()
    const id = setInterval(fetchPending, 30_000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="pos-shell">
      <aside className="pos-sidebar">
        <div className="pos-brand">
          <span className="pos-brand-dot" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
              <line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>
            </svg>
          </span>
          Food Order POS
        </div>
        {NAV.map(({ href, label, Icon, badge, newTab }) => {
          const isActive = href === '/orders' ? pathname === '/orders' : pathname.startsWith(href)
          return (
            <button
              key={href}
              className={`pos-nav-item${isActive ? ' active' : ''}`}
              onClick={() => (newTab ? window.open(href, '_blank') : router.push(href))}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon />
              {label}
              {badge && pendingCount > 0 && (
                <span className="pos-nav-badge">{pendingCount > 9 ? '9+' : pendingCount}</span>
              )}
            </button>
          )
        })}
      </aside>

      <div className="pos-main">{children}</div>

      {cart && <aside className="pos-cart">{cart}</aside>}

      <BottomNav />
    </div>
  )
}
