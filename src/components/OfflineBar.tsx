'use client'

import { useEffect, useState } from 'react'
import { flushQueue, onQueueChange, queuedOrders } from '@/lib/offlineQueue'

/**
 * Registers the service worker, and shows a strip when the device is offline
 * or has orders waiting to be sent. Silent when everything is normal.
 */
export default function OfflineBar() {
  const [online, setOnline] = useState(true)
  const [pending, setPending] = useState(0)
  const [flushing, setFlushing] = useState(false)
  const [justSent, setJustSent] = useState(0)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // The worker caches the app shell, which is exactly wrong while editing
    // it: an edited stylesheet or component keeps being served from
    // `pos-v1-shell` no matter what the dev server sends. Register it only
    // in production, and clear any copy left behind from an earlier run.
    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker.getRegistrations()
        .then(rs => Promise.all(rs.map(r => r.unregister())))
        .then(() => caches?.keys())
        .then(keys => Promise.all((keys ?? []).map(k => caches.delete(k))))
        .catch(() => {})
      return
    }

    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [])

  useEffect(() => {
    const sync = () => setPending(queuedOrders().length)
    sync()

    async function drain() {
      setFlushing(true)
      try {
        const { sent } = await flushQueue()
        if (sent > 0) {
          setJustSent(sent)
          setTimeout(() => setJustSent(0), 6000)
        }
      } finally {
        setFlushing(false)
        sync()
      }
    }

    const goOnline = () => { setOnline(true); drain() }
    const goOffline = () => setOnline(false)

    setOnline(navigator.onLine)
    if (navigator.onLine && queuedOrders().length > 0) drain()

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    const unsub = onQueueChange(sync)
    // Catches the case where the browser reports online but the server is
    // unreachable, so `online` never fires.
    const id = setInterval(() => { if (navigator.onLine && queuedOrders().length > 0) drain() }, 30_000)

    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      unsub()
      clearInterval(id)
    }
  }, [])

  if (online && pending === 0 && justSent === 0) return null

  const offline = !online
  const bg = offline ? 'var(--c-danger)' : pending > 0 ? 'var(--c-warning)' : 'var(--c-success)'

  return (
    <div
      role="status"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 2000,
        background: bg, color: '#fff',
        fontSize: 'var(--text-sm)', fontWeight: 600, textAlign: 'center',
        paddingTop: 'max(6px, env(safe-area-inset-top))',
        paddingBottom: '6px', paddingLeft: '12px', paddingRight: '12px',
      }}
    >
      {offline
        ? `ออฟไลน์${pending > 0 ? ` · มีออเดอร์รอส่ง ${pending} รายการ` : ' · บันทึกออเดอร์ได้ ระบบจะส่งให้เมื่อเน็ตกลับมา'}`
        : pending > 0
          ? `${flushing ? 'กำลังส่ง' : 'รอส่ง'}ออเดอร์ ${pending} รายการ`
          : `ส่งออเดอร์ที่ค้างไว้แล้ว ${justSent} รายการ`}
    </div>
  )
}
