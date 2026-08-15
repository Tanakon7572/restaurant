'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import BottomNav from './BottomNav'
import { useIncomingOrders } from '@/lib/useIncomingOrders'

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

// `short` is what the 86px rail shows — a label that wraps to two lines in
// that width reads as two separate items. `label` stays for the tooltip and
// for assistive tech, which get the unabbreviated name.
//
// Only the four screens used during service sit on the rail. Nine equally
// weighted buttons is nine decisions every time you look at it; the rest are
// setup and back-office, reached through one "เพิ่มเติม" menu.
const NAV = [
  { href: '/orders/new', label: 'ขายหน้าร้าน', short: 'ขาย',      Icon: IconPos },
  { href: '/checkout',   label: 'เก็บเงิน',    short: 'เก็บเงิน', Icon: IconCash },
  { href: '/orders',     label: 'ออเดอร์',     short: 'ออเดอร์',  Icon: IconReceipt, badge: true },
  { href: '/kitchen',    label: 'จอครัว',      short: 'ครัว',     Icon: IconKitchen, newTab: true },
]

const MORE = [
  { href: '/dashboard', label: 'หน้าหลัก',   Icon: IconGrid },
  { href: '/menu',      label: 'จัดการเมนู', Icon: IconMenu },
  { href: '/qr',        label: 'QR โต๊ะ',    Icon: IconQr },
  { href: '/reports',   label: 'ปิดรอบขาย',  Icon: IconReport },
  { href: '/settings',  label: 'ตั้งค่า',    Icon: IconSettings },
]

function IconMore() {
  return (
    <svg width="19" height="19" viewBox="0 0 22 22" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="11" r="1.7"/><circle cx="11" cy="11" r="1.7"/><circle cx="17" cy="11" r="1.7"/>
    </svg>
  )
}

/**
 * POS app shell: sidebar navigation on desktop (≥1024px), the existing
 * BottomNav on mobile. `cart` renders as the right-hand order panel.
 */
export default function PosShell({ children, cart }: { children: React.ReactNode; cart?: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const pendingCount = useIncomingOrders()
  const [moreOpen, setMoreOpen] = useState(false)

  // The menu closes from its own item handler on navigation; Escape and an
  // outside click cover the rest. Closing it from a pathname effect as well
  // would set state synchronously during render for no added coverage.
  useEffect(() => {
    if (!moreOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoreOpen(false) }
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.rail-more-wrap')) setMoreOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [moreOpen])

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
          <span className="pos-brand-name">Food Order POS</span>
        </div>
        {NAV.map(({ href, label, short, Icon, badge, newTab }) => {
          const isActive = href === '/orders' ? pathname === '/orders' : pathname.startsWith(href)
          return (
            <button
              key={href}
              className={`pos-nav-item${isActive ? ' active' : ''}`}
              onClick={() => (newTab ? window.open(href, '_blank') : router.push(href))}
              aria-current={isActive ? 'page' : undefined}
              title={label}
              aria-label={label}
            >
              <Icon />
              <span aria-hidden="true">{short}</span>
              {badge && pendingCount > 0 && (
                <span className="pos-nav-badge">{pendingCount > 9 ? '9+' : pendingCount}</span>
              )}
            </button>
          )
        })}

        <div className="rail-more-wrap">
          <button
            type="button"
            className={`pos-nav-item${MORE.some(m => pathname.startsWith(m.href)) ? ' active' : ''}`}
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen(o => !o)}
          >
            <IconMore />
            <span aria-hidden="true">เพิ่มเติม</span>
          </button>
          {moreOpen && (
            <div className="rail-more" role="menu">
              {MORE.map(({ href, label, Icon }) => (
                <button
                  key={href}
                  type="button"
                  role="menuitem"
                  className={`rail-more-item${pathname.startsWith(href) ? ' active' : ''}`}
                  onClick={() => { setMoreOpen(false); router.push(href) }}
                >
                  <Icon />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      <div className="pos-main">{children}</div>

      {cart && <aside className="pos-cart">{cart}</aside>}

      <BottomNav />
    </div>
  )
}
