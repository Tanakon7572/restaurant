'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import PosShell from '@/components/PosShell'

const QRCode = dynamic(() => import('react-qr-code'), { ssr: false })

const PRESET_TABLES = Array.from({ length: 15 }, (_, i) => String(i + 1))

interface TableSession {
  token: string
  tableNumber: string
  active: boolean
  createdAt: string
}

export default function QRPage() {
  const [selectedTable, setSelectedTable] = useState('1')
  const [customTable, setCustomTable] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [sessions, setSessions] = useState<TableSession[]>([])
  const [creating, setCreating] = useState(false)
  const [closing, setClosing] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const printRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const fetchSessions = useCallback(() => {
    fetch('/api/table-sessions')
      .then(res => {
        if (res.status === 401) { router.push('/'); return null }
        return res.json()
      })
      .then(data => { if (Array.isArray(data)) setSessions(data) })
      .catch(() => {})
  }, [router])

  useEffect(() => {
    setBaseUrl(window.location.origin)
    fetchSessions()
  }, [fetchSessions])

  const tableNumber = customTable.trim() || selectedTable
  const activeSession = sessions.find(s => s.tableNumber === tableNumber)
  const orderUrl = activeSession ? `${baseUrl}/q?s=${activeSession.token}` : ''

  async function openTable() {
    setCreating(true)
    try {
      const res = await fetch('/api/table-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableNumber }),
      })
      if (res.status === 401) { router.push('/'); return }
      if (res.ok) fetchSessions()
    } finally {
      setCreating(false)
    }
  }

  async function closeLink(token: string) {
    setClosing(token)
    try {
      await fetch('/api/table-sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      fetchSessions()
    } finally {
      setClosing(null)
    }
  }

  async function copyUrl(url: string, token: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(token)
      setTimeout(() => setCopied(null), 2000)
    } catch { /* clipboard unavailable */ }
  }

  function handlePrint() {
    if (!printRef.current) return
    const content = printRef.current.innerHTML
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>QR โต๊ะ ${tableNumber}</title>
          <style>
            body { display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; font-family: sans-serif; background: white; }
            .wrap { text-align: center; padding: 40px; }
            svg { display: block; margin: 0 auto; }
            p { margin-top: 16px; font-size: 14px; color: #333; }
            h2 { margin: 0 0 16px; font-size: 22px; font-weight: 700; }
          </style>
        </head>
        <body><div class="wrap">${content}</div></body>
      </html>
    `)
    win.document.close()
    win.print()
  }

  return (
    <PosShell>
    <div className="page-container fade-in">
      <div className="page-header">
        <h1 className="page-title">ลิงก์สั่งอาหาร</h1>
      </div>

      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--c-text-3)', margin: '-6px 0 14px' }}>
        แต่ละโต๊ะใช้ลิงก์แบบสุ่ม เดา URL ไม่ได้ — ลิงก์จะปิดอัตโนมัติเมื่ออาหารของโต๊ะนั้นเสร็จหมด
        หรือกดปิดเองได้ ลูกค้าที่ถือลิงก์เก่าจะสั่งไม่ได้อีก
      </p>

      {/* Table selector */}
      <div className="glass-panel" style={{ padding: '16px', marginBottom: '12px' }}>
        <p style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--c-text-2)', marginBottom: '10px' }}>
          เลือกโต๊ะ
        </p>

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
          {PRESET_TABLES.map(t => {
            const hasLink = sessions.some(s => s.tableNumber === t)
            const isSel = selectedTable === t && !customTable.trim()
            return (
              <button
                key={t}
                className={`btn btn-sm ${isSel ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => { setSelectedTable(t); setCustomTable('') }}
                style={{ minWidth: '44px', position: 'relative' }}
              >
                {t}
                {hasLink && (
                  <span style={{ position: 'absolute', top: 4, right: 4, width: 7, height: 7, borderRadius: '50%', background: 'var(--c-success)' }} aria-label="มีลิงก์เปิดอยู่" />
                )}
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            className="input"
            placeholder="หมายเลขโต๊ะอื่น…"
            value={customTable}
            onChange={e => setCustomTable(e.target.value)}
            style={{ padding: '9px 12px' }}
          />
          {customTable.trim() && (
            <button className="btn btn-ghost btn-sm" onClick={() => setCustomTable('')}>
              ล้าง
            </button>
          )}
        </div>
      </div>

      {/* Session for the selected table */}
      <div className="glass-panel" style={{ padding: '24px 20px', marginBottom: '12px', textAlign: 'center' }}>
        {activeSession ? (
          <>
            <p style={{ color: 'var(--c-text-3)', fontSize: '0.75rem', marginBottom: '14px' }}>
              ลิงก์เปิดอยู่ · สร้างเมื่อ {new Date(activeSession.createdAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
            </p>
            <div ref={printRef}>
              <div style={{ display: 'inline-block', background: 'white', padding: '16px', borderRadius: '12px', marginBottom: '12px' }}>
                {baseUrl && <QRCode value={orderUrl} size={200} bgColor="#ffffff" fgColor="#111111" />}
              </div>
              <p style={{ color: 'var(--c-text-2)', fontSize: '0.82rem' }}>โต๊ะ {tableNumber}</p>
            </div>

            <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <p style={{ flex: 1, fontSize: '0.7rem', color: 'var(--c-text-3)', wordBreak: 'break-all', textAlign: 'left', background: 'var(--c-surface-2)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--c-border)' }}>
                {orderUrl}
              </p>
              <button className="btn btn-ghost btn-sm" onClick={() => copyUrl(orderUrl, activeSession.token)} style={{ flexShrink: 0 }}>
                {copied === activeSession.token ? '✓ คัดลอก' : 'คัดลอก'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
              <button className="btn btn-ghost" onClick={handlePrint} style={{ flex: 1 }}>พิมพ์ QR</button>
              <button className="btn btn-ghost" onClick={openTable} disabled={creating} style={{ flex: 1 }}>
                {creating ? 'กำลังสร้าง…' : 'สร้างลิงก์ใหม่'}
              </button>
              <button
                className="btn btn-danger"
                onClick={() => closeLink(activeSession.token)}
                disabled={closing === activeSession.token}
                style={{ flex: 1 }}
              >
                {closing === activeSession.token ? 'กำลังปิด…' : 'ปิดลิงก์'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ color: 'var(--c-text-2)', fontSize: '0.9rem', marginBottom: '16px' }}>
              โต๊ะ <strong>{tableNumber}</strong> ยังไม่มีลิงก์สั่งอาหาร
            </p>
            <button className="btn btn-primary" onClick={openTable} disabled={creating} style={{ padding: '13px 32px' }}>
              {creating ? 'กำลังสร้าง…' : `เปิดโต๊ะ ${tableNumber} (สร้าง QR)`}
            </button>
          </>
        )}
      </div>

      {/* Active links overview */}
      {sessions.length > 0 && (
        <div className="glass-panel" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--c-border)' }}>
            <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--c-text-2)' }}>ลิงก์ที่เปิดอยู่ ({sessions.length})</p>
          </div>
          {sessions.map(s => (
            <div key={s.token} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', borderBottom: '1px solid var(--c-border)' }}>
              <span style={{ fontWeight: 700, minWidth: '64px' }}>โต๊ะ {s.tableNumber}</span>
              <span style={{ flex: 1, fontSize: '0.72rem', color: 'var(--c-text-3)' }}>
                {new Date(s.createdAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedTable(s.tableNumber); setCustomTable('') }}>
                ดู QR
              </button>
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--c-danger)' }}
                onClick={() => closeLink(s.token)}
                disabled={closing === s.token}
              >
                ปิด
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
    </PosShell>
  )
}
