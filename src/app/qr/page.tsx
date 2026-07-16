'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import BottomNav from '@/components/BottomNav'

const QRCode = dynamic(() => import('react-qr-code'), { ssr: false })

const PRESET_TABLES = Array.from({ length: 15 }, (_, i) => String(i + 1))

export default function QRPage() {
  const [selectedTable, setSelectedTable] = useState('1')
  const [customTable, setCustomTable] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    // Auth check
    fetch('/api/orders?today=true').then(res => {
      if (res.status === 401) router.push('/')
    })
    // Base URL detection
    setBaseUrl(window.location.origin)
  }, [router])

  const tableNumber = customTable.trim() || selectedTable
  const orderUrl = `${baseUrl}/q?table=${encodeURIComponent(tableNumber)}`

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(orderUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API not available
    }
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
    <div className="page-container fade-in">
      <div className="page-header">
        <h1 className="page-title">QR สั่งอาหาร</h1>
      </div>

      {/* Table selector */}
      <div className="glass-panel" style={{ padding: '16px', marginBottom: '12px' }}>
        <p style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--c-text-2)', marginBottom: '10px' }}>
          เลือกโต๊ะ
        </p>

        <div
          style={{
            display: 'flex',
            gap: '6px',
            flexWrap: 'wrap',
            marginBottom: '12px',
          }}
        >
          {PRESET_TABLES.map(t => (
            <button
              key={t}
              className={`btn btn-sm ${selectedTable === t && !customTable.trim() ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => { setSelectedTable(t); setCustomTable('') }}
              style={{ minWidth: '44px' }}
            >
              {t}
            </button>
          ))}
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

      {/* QR Code display */}
      <div
        className="glass-panel"
        style={{
          padding: '28px 20px 20px',
          marginBottom: '12px',
          textAlign: 'center',
        }}
      >
        <p style={{ color: 'var(--c-text-3)', fontSize: '0.75rem', marginBottom: '16px' }}>
          ลูกค้าสแกน QR เพื่อสั่งอาหาร
        </p>

        {/* The QR card printed */}
        <div ref={printRef}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '12px', color: 'white', display: 'none' }}>
            โต๊ะ {tableNumber}
          </h2>
          <div
            style={{
              display: 'inline-block',
              background: 'white',
              padding: '16px',
              borderRadius: '12px',
              marginBottom: '12px',
            }}
          >
            {baseUrl && (
              <QRCode
                value={orderUrl}
                size={200}
                bgColor="#ffffff"
                fgColor="#111111"
              />
            )}
          </div>
          <p style={{ color: 'var(--c-text-2)', fontSize: '0.82rem' }}>
            โต๊ะ {tableNumber}
          </p>
        </div>

        {/* URL display */}
        <div
          style={{
            marginTop: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <p
            style={{
              flex: 1,
              fontSize: '0.72rem',
              color: 'var(--c-text-3)',
              wordBreak: 'break-all',
              textAlign: 'left',
              background: 'var(--c-surface-2)',
              padding: '8px 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--c-border)',
            }}
          >
            {orderUrl}
          </p>
          <button
            className="btn btn-ghost btn-sm"
            onClick={copyUrl}
            style={{ flexShrink: 0 }}
          >
            {copied ? '✓ คัดลอก' : 'คัดลอก'}
          </button>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button
          className="btn btn-ghost"
          onClick={handlePrint}
          style={{ flex: 1 }}
        >
          พิมพ์ QR
        </button>
        <a
          href={orderUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary"
          style={{ flex: 1, textDecoration: 'none' }}
        >
          ทดสอบลิงก์
        </a>
      </div>

      {/* All table QR grid */}
      <div style={{ marginTop: '8px' }}>
        <p style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--c-text-2)', marginBottom: '10px' }}>
          ทุกโต๊ะ (คลิกเพื่อเลือก)
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
            gap: '8px',
          }}
        >
          {PRESET_TABLES.map(t => (
            <button
              key={t}
              onClick={() => { setSelectedTable(t); setCustomTable(''); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
              style={{
                background: selectedTable === t && !customTable.trim()
                  ? 'var(--c-primary-glow)'
                  : 'var(--c-surface)',
                border: `1.5px solid ${selectedTable === t && !customTable.trim() ? 'var(--c-primary)' : 'var(--c-border)'}`,
                borderRadius: 'var(--radius-sm)',
                padding: '12px 8px',
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              {baseUrl && (
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '6px' }}>
                  <div style={{ background: 'white', padding: '6px', borderRadius: '6px', display: 'inline-block' }}>
                    <QRCode
                      value={`${baseUrl}/q?table=${t}`}
                      size={72}
                      bgColor="#ffffff"
                      fgColor="#111111"
                    />
                  </div>
                </div>
              )}
              <p style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--c-text-2)' }}>
                โต๊ะ {t}
              </p>
            </button>
          ))}
        </div>
      </div>

      <BottomNav />
    </div>
  )
}
