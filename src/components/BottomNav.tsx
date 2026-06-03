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

function IconSettings() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="3"/>
      <path d="M11 2.5v2M11 17.5v2M2.5 11h2M17.5 11h2M4.93 4.93l1.41 1.41M15.66 15.66l1.41 1.41M4.93 17.07l1.41-1.41M15.66 6.34l1.41-1.41"/>
    </svg>
  )
}

const NAV_ITEMS = [
  { href: '/dashboard',  label: 'หน้าหลัก',  Icon: IconDashboard },
  { href: '/menu',       label: 'เมนู',       Icon: IconMenu },
  { href: '/orders/new', label: 'สั่งอาหาร',  Icon: IconPlus },
  { href: '/orders',     label: 'ออเดอร์',    Icon: IconReceipt },
  { href: '/settings',   label: 'ตั้งค่า',    Icon: IconSettings },
]

export default function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [pendingCount, setPendingCount] = useState(0)

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
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'var(--c-surface)',
        borderTop: '1px solid var(--c-border)',
        display: 'flex',
        justifyContent: 'space-around',
        padding: '6px 0 env(safe-area-inset-bottom, 10px)',
        zIndex: 1000,
        boxShadow: '0 -1px 12px oklch(0.17 0.012 50 / 0.06)',
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
              padding: '4px 12px',
              minWidth: '52px',
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
    </nav>
  )
}
