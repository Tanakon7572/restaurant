'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

function IconDashboard() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="2"/>
      <rect x="12" y="3" width="7" height="7" rx="2"/>
      <rect x="3" y="12" width="7" height="7" rx="2"/>
      <rect x="12" y="12" width="7" height="7" rx="2"/>
    </svg>
  )
}

function IconMenu() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <path d="M4 7h14M4 11h14M4 15h8"/>
    </svg>
  )
}

function IconPlus() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8"/>
      <path d="M11 7.5v7M7.5 11h7"/>
    </svg>
  )
}

function IconReceipt() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5.5 3.5h11v15l-2.75-1.75L11 18.5l-2.75-1.75L5.5 18.5V3.5Z"/>
      <path d="M8.5 9h5M8.5 12.5h3.5"/>
    </svg>
  )
}

function IconCash() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>
      <path d="M6 12h.01M18 12h.01"/>
    </svg>
  )
}

function IconSettings() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="3"/>
      <path d="M11 2.5v2M11 17.5v2M2.5 11h2M17.5 11h2M4.93 4.93l1.41 1.41M15.66 15.66l1.41 1.41M4.93 17.07l1.41-1.41M15.66 6.34l1.41-1.41"/>
    </svg>
  )
}

// Four during service, the rest behind one button. On a 6" handheld six
// equal targets leave each one about 60px wide — under a thumb that is a
// coin toss. The desktop rail is grouped the same way.
const NAV_ITEMS = [
  { href: '/orders/new', label: 'สั่งอาหาร',  Icon: IconPlus },
  { href: '/checkout',   label: 'เก็บเงิน',   Icon: IconCash },
  { href: '/orders',     label: 'ออเดอร์',    Icon: IconReceipt },
  { href: '/menu',       label: 'เมนู',       Icon: IconMenu },
]

const MORE_ITEMS = [
  { href: '/dashboard', label: 'หน้าหลัก',  Icon: IconDashboard },
  { href: '/kitchen',   label: 'จอครัว',    Icon: IconKitchen },
  { href: '/qr',        label: 'QR โต๊ะ',   Icon: IconQr },
  { href: '/reports',   label: 'ปิดรอบขาย', Icon: IconReport },
  { href: '/settings',  label: 'ตั้งค่า',   Icon: IconSettings },
]

function IconKitchen() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
    </svg>
  )
}

function IconQr() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <path d="M14 14h2v2h-2zM18 14h3M14 18v3M18 18h3v3h-3z"/>
    </svg>
  )
}

function IconReport() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>
    </svg>
  )
}

function IconMoreDots() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="11" r="1.8"/><circle cx="11" cy="11" r="1.8"/><circle cx="17" cy="11" r="1.8"/>
    </svg>
  )
}

export default function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [pendingCount, setPendingCount] = useState(0)
  const [moreOpen, setMoreOpen] = useState(false)

  // Prefetch all nav pages upfront so navigation feels instant
  useEffect(() => {
    NAV_ITEMS.forEach(({ href }) => router.prefetch(href))
  }, [router])

  useEffect(() => {
    if (!moreOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoreOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [moreOpen])

  useEffect(() => {
    function fetchPending() {
      fetch('/api/orders?status=pending')
        .then(r => r.ok ? r.json() : [])
        .then(data => Array.isArray(data) ? setPendingCount(data.length) : null)
        .catch(() => {})
    }
    fetchPending()
    const id = setInterval(fetchPending, 30_000)
    return () => clearInterval(id)
  }, [])

  return (
    <nav
      className="bottom-nav"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'var(--c-surface)',
        borderTop: '1px solid var(--c-border)',
        display: 'flex',
        justifyContent: 'stretch',
        padding: '6px 0 env(safe-area-inset-bottom, 10px)',
        zIndex: 1000,
        boxShadow: '0 -1px 12px rgb(26 23 20 / 0.06)',
      }}
      aria-label="การนำทาง"
    >
      {NAV_ITEMS.map(({ href, label, Icon }) => {
        const isActive = href === '/orders'
          ? pathname === '/orders'
          : pathname.startsWith(href)
        const showBadge = href === '/orders' && pendingCount > 0

        return (
          <button
            key={href}
            onClick={() => router.push(href)}
            aria-current={isActive ? 'page' : undefined}
            aria-label={label}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '3px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px 4px',
              flex: '1 1 0',
              minWidth: 0,
              minHeight: '44px',
              justifyContent: 'center',
              position: 'relative',
              borderRadius: 'var(--radius-sm)',
              transition: 'background var(--t-fast)',
            }}
          >
            {/* Active indicator */}
            {isActive && (
              <span
                style={{
                  position: 'absolute',
                  top: 0,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '24px',
                  height: '3px',
                  background: 'var(--c-primary)',
                  borderRadius: '0 0 3px 3px',
                }}
              />
            )}

            {/* Icon + badge wrapper */}
            <span style={{ position: 'relative' }}>
              <span style={{ color: isActive ? 'var(--c-primary)' : 'var(--c-text-3)', display: 'flex', transition: 'color var(--t-fast)' }}>
                <Icon />
              </span>
              {showBadge && (
                <span
                  style={{
                    position: 'absolute',
                    top: '-4px',
                    right: '-6px',
                    minWidth: '16px',
                    height: '16px',
                    background: 'var(--c-danger)',
                    color: '#fff',
                    borderRadius: '99px',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 4px',
                    border: '2px solid var(--c-surface)',
                    lineHeight: 1,
                  }}
                  aria-label={`${pendingCount} ออเดอร์รอรับ`}
                >
                  {pendingCount > 9 ? '9+' : pendingCount}
                </span>
              )}
            </span>

            {/* Label */}
            <span
              style={{
                fontSize: '0.64rem',
                fontFamily: 'var(--font)',
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--c-primary)' : 'var(--c-text-3)',
                transition: 'color var(--t-fast)',
              }}
            >
              {label}
            </span>
          </button>
        )
      })}

      <button
        type="button"
        className="bottom-nav-more"
        aria-haspopup="menu"
        aria-expanded={moreOpen}
        onClick={() => setMoreOpen(o => !o)}
      >
        <IconMoreDots />
        <span>เพิ่มเติม</span>
      </button>

      {moreOpen && (
        <>
          {/* Tapping anywhere else closes it — on a handheld that is the
              gesture people reach for before they look for a close button. */}
          <div className="more-sheet-veil" onClick={() => setMoreOpen(false)} />
          <div className="more-sheet" role="menu">
            {MORE_ITEMS.map(({ href, label, Icon }) => (
              <button
                key={href}
                type="button"
                role="menuitem"
                className={`more-sheet-item${pathname.startsWith(href) ? ' active' : ''}`}
                onClick={() => { setMoreOpen(false); router.push(href) }}
              >
                <Icon />
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </nav>
  )
}
