'use client'

import { useEffect, useState, useRef } from 'react'
import dynamic from 'next/dynamic'
import PosShell from '@/components/PosShell'
import { PERMANENT_SESSION_TOKEN } from '@/lib/tableSession'

const QRCode = dynamic(() => import('react-qr-code'), { ssr: false })

export default function QRPage() {
  const [baseUrl, setBaseUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setBaseUrl(window.location.origin)
  }, [])

  // One permanent link for the whole shop. Customers scan the same QR every
  // time and identify their order by name — no per-table links.
  const orderUrl = baseUrl ? `${baseUrl}/q?s=${PERMANENT_SESSION_TOKEN}` : ''

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(orderUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
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
          <title>QR สั่งอาหาร</title>
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
        <h1 className="page-title">QR สั่งอาหาร</h1>
      </div>

      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--c-text-3)', margin: '-6px 0 14px' }}>
        QR เดียวใช้ได้ทุกโต๊ะตลอดเวลา — พิมพ์แล้ววางไว้ที่ร้านได้เลย ลูกค้าสแกนแล้วกรอกชื่อเพื่อสั่งอาหาร
      </p>

      <div className="glass-panel" style={{ padding: '24px 20px', marginBottom: '12px', textAlign: 'center' }}>
        <div ref={printRef}>
          <div style={{ display: 'inline-block', background: 'white', padding: '16px', borderRadius: '12px', marginBottom: '12px' }}>
            {baseUrl && <QRCode value={orderUrl} size={220} bgColor="#ffffff" fgColor="#111111" />}
          </div>
          <p style={{ color: 'var(--c-text-2)', fontSize: '0.9rem' }}>สแกนเพื่อสั่งอาหาร</p>
        </div>

        <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <p style={{ flex: 1, fontSize: '0.7rem', color: 'var(--c-text-3)', wordBreak: 'break-all', textAlign: 'left', background: 'var(--c-surface-2)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--c-border)' }}>
            {orderUrl}
          </p>
          <button className="btn btn-ghost btn-sm" onClick={copyUrl} style={{ flexShrink: 0 }}>
            {copied ? '✓ คัดลอก' : 'คัดลอก'}
          </button>
        </div>

        <div style={{ marginTop: '14px' }}>
          <button className="btn btn-primary" onClick={handlePrint} style={{ padding: '13px 32px' }}>พิมพ์ QR</button>
        </div>
      </div>
    </div>
    </PosShell>
  )
}
