'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import ConfirmModal from '@/components/ConfirmModal'

interface OrderItemData {
  id: number
  menuItemId: number | null
  itemName: string
  menuItem?: { id: number; name: string; price: number } | null
  quantity: number
  price: number
  note: string | null
}

interface Order {
  id: number
  status: string
  totalPrice: number
  tableNumber: string | null
  note: string | null
  createdAt: string
  updatedAt: string
  items: OrderItemData[]
}

interface Category {
  id: number
  name: string
  items: { id: number; name: string; price: number; available: boolean }[]
}

const STATUS_LABELS: Record<string, string> = {
  pending:   'รอรับ',
  preparing: 'กำลังทำ',
  completed: 'เสร็จแล้ว',
  cancelled: 'ยกเลิก',
}

const STATUS_FLOW: Record<string, string[]> = {
  pending:   ['preparing', 'cancelled'],
  preparing: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

export default function OrderDetailPage() {
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [editItems, setEditItems] = useState<{ menuItemId: number; name: string; price: number; quantity: number }[]>([])
  const [editTable, setEditTable] = useState('')
  const [editNote, setEditNote] = useState('')
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const params = useParams()

  function fetchOrder() {
    fetch(`/api/orders/${params.id}`)
      .then(res => {
        if (res.status === 401) { router.push('/'); return null }
        if (res.status === 404) { router.push('/orders'); return null }
        return res.json()
      })
      .then(data => { if (data) setOrder(data) })
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchOrder() }, [params.id])

  function startEditing() {
    if (!order) return
    setEditItems(order.items.filter(i => i.menuItemId != null).map(i => ({
      menuItemId: i.menuItemId as number,
      name: i.itemName || i.menuItem?.name || '(ลบแล้ว)',
      price: i.menuItem?.price ?? i.price,
      quantity: i.quantity,
    })))
    setEditTable(order.tableNumber || '')
    setEditNote(order.note || '')
    fetch('/api/menu-categories').then(r => r.json()).then(setCategories)
    setEditing(true)
  }

  function addEditItem(item: { id: number; name: string; price: number }) {
    setEditItems(prev => {
      const existing = prev.find(e => e.menuItemId === item.id)
      if (existing) return prev.map(e => e.menuItemId === item.id ? { ...e, quantity: e.quantity + 1 } : e)
      return [...prev, { menuItemId: item.id, name: item.name, price: item.price, quantity: 1 }]
    })
  }

  function updateEditQty(menuItemId: number, delta: number) {
    setEditItems(prev =>
      prev.map(e => {
        if (e.menuItemId !== menuItemId) return e
        const newQty = e.quantity + delta
        return newQty <= 0 ? null : { ...e, quantity: newQty }
      }).filter(Boolean) as typeof prev
    )
  }

  const editTotal = editItems.reduce((sum, i) => sum + i.price * i.quantity, 0)

  async function saveEdit() {
    if (editItems.length === 0) return
    setSaving(true)
    try {
      await fetch(`/api/orders/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: editItems.map(i => ({ menuItemId: i.menuItemId, quantity: i.quantity })),
          tableNumber: editTable || null,
          note: editNote || null,
        }),
      })
      setEditing(false)
      fetchOrder()
    } finally {
      setSaving(false)
    }
  }

  async function updateStatus(status: string) {
    await fetch(`/api/orders/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    fetchOrder()
  }

  if (loading || !order) {
    return (
      <div className="page-container">
        <div className="page-header">
          <div style={{ height: '28px', width: '140px', background: 'var(--c-surface-2)', borderRadius: '6px' }} />
        </div>
        <BottomNav />
      </div>
    )
  }

  if (editing) {
    return (
      <div className="page-container fade-in">
        <div className="page-header">
          <h1 className="page-title">แก้ไขออเดอร์ #{order.id}</h1>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
            ยกเลิก
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <input
            className="input"
            placeholder="เลขโต๊ะ"
            value={editTable}
            onChange={e => setEditTable(e.target.value)}
            style={{ flex: '0 0 90px', padding: '10px 12px' }}
          />
          <input
            className="input"
            placeholder="หมายเหตุ"
            value={editNote}
            onChange={e => setEditNote(e.target.value)}
            style={{ flex: 1, padding: '10px 12px' }}
          />
        </div>

        {editItems.length > 0 && (
          <>
            <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--c-text-2)', marginBottom: '8px' }}>
              รายการปัจจุบัน
            </p>
            <div className="glass-panel" style={{ marginBottom: '16px', overflow: 'hidden' }}>
              {editItems.map((item, idx) => (
                <div
                  key={item.menuItemId}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 16px',
                    borderBottom: idx < editItems.length - 1 ? '1px solid var(--c-border)' : 'none',
                    background: 'var(--c-primary-glow)',
                  }}
                >
                  <div>
                    <p style={{ fontWeight: 500, fontSize: '0.9rem' }}>{item.name}</p>
                    <p className="price-tag" style={{ marginTop: '1px' }}>฿{item.price.toLocaleString('th-TH')}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => updateEditQty(item.menuItemId, -1)}
                      style={{ width: '30px', height: '30px', padding: 0, borderRadius: '50%' }}
                    >
                      −
                    </button>
                    <span style={{ fontWeight: 700, minWidth: '20px', textAlign: 'center' }}>
                      {item.quantity}
                    </span>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => updateEditQty(item.menuItemId, 1)}
                      style={{ width: '30px', height: '30px', padding: 0, borderRadius: '50%' }}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--c-text-2)', marginBottom: '8px' }}>
          เพิ่มรายการ
        </p>
        {categories.map(cat => (
          <div key={cat.id} style={{ marginBottom: '12px' }}>
            <p
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'var(--c-text-3)',
                marginBottom: '6px',
                letterSpacing: '0.03em',
                textTransform: 'uppercase',
              }}
            >
              {cat.name}
            </p>
            <div className="glass-panel" style={{ overflow: 'hidden' }}>
              {cat.items.filter(i => i.available).map((item, idx, arr) => (
                <div
                  key={item.id}
                  onClick={() => addEditItem(item)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '11px 16px',
                    borderBottom: idx < arr.length - 1 ? '1px solid var(--c-border)' : 'none',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: '0.9rem' }}>{item.name}</span>
                  <span className="price-tag">฿{item.price.toLocaleString('th-TH')}</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div
          style={{
            position: 'fixed',
            bottom: '64px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'calc(100% - 32px)',
            maxWidth: '568px',
            zIndex: 100,
          }}
        >
          <button
            className="btn btn-primary btn-full"
            onClick={saveEdit}
            disabled={saving || editItems.length === 0}
            style={{
              padding: '14px 20px',
              fontSize: '0.95rem',
              borderRadius: 'var(--radius)',
              justifyContent: 'space-between',
            }}
          >
            <span>{saving ? 'กำลังบันทึก…' : 'บันทึก'}</span>
            {!saving && (
              <span style={{ fontWeight: 700 }}>฿{editTotal.toLocaleString('th-TH')}</span>
            )}
          </button>
        </div>

        <BottomNav />
      </div>
    )
  }

  const nextStatuses = STATUS_FLOW[order.status] || []
  const canEdit = order.status === 'pending' || order.status === 'preparing'

  function printReceipt() {
    if (!order) return
    const dt = new Date(order.createdAt).toLocaleString('th-TH', {
      day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
    const lines = order.items.map(i =>
      `<tr><td>${i.itemName || i.menuItem?.name || '(ลบแล้ว)'} ×${i.quantity}</td><td style="text-align:right">฿${(i.price * i.quantity).toLocaleString('th-TH')}</td></tr>`
    ).join('')
    const html = `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8">
<title>ใบเสร็จ #${order.id}</title>
<style>
  body{font-family:'IBM Plex Sans Thai',sans-serif;max-width:320px;margin:0 auto;padding:20px;font-size:13px;color:#111}
  h2{text-align:center;font-size:1rem;margin-bottom:4px}
  .meta{text-align:center;color:#666;font-size:11px;margin-bottom:12px;border-bottom:1px dashed #ccc;padding-bottom:10px}
  table{width:100%;border-collapse:collapse}
  td{padding:5px 0;vertical-align:top}
  .total{border-top:2px solid #111;font-weight:700;font-size:14px;margin-top:4px}
  .total td{padding:8px 0}
  .footer{text-align:center;margin-top:16px;font-size:11px;color:#999;border-top:1px dashed #ccc;padding-top:10px}
</style></head><body>
<h2>ใบเสร็จรับเงิน</h2>
<div class="meta">
  ออเดอร์ #${order.id}${order.tableNumber ? ` · โต๊ะ ${order.tableNumber}` : ''}<br>
  ${dt}
</div>
<table>
  ${lines}
  <tr class="total"><td>รวมทั้งสิ้น</td><td style="text-align:right">฿${order.totalPrice.toLocaleString('th-TH')}</td></tr>
</table>
${order.note ? `<p style="margin-top:12px;font-size:11px;color:#666">หมายเหตุ: ${order.note}</p>` : ''}
<div class="footer">ขอบคุณที่ใช้บริการ</div>
</body></html>`

    const win = window.open('', '_blank', 'width=400,height=600')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.focus()
    win.print()
  }

  return (
    <div className="page-container fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => router.push('/orders')}
            style={{ width: '34px', height: '34px', padding: 0, fontSize: '1.1rem' }}
            aria-label="กลับ"
          >
            ←
          </button>
          <h1 className="page-title">ออเดอร์ #{order.id}</h1>
        </div>
        <span className={`badge badge-${order.status}`}>{STATUS_LABELS[order.status]}</span>
      </div>

      {/* Order meta */}
      <div className="glass-panel" style={{ padding: '16px', marginBottom: '10px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px 16px',
          }}
        >
          <div>
            <p style={{ color: 'var(--c-text-3)', fontSize: '0.75rem', marginBottom: '3px' }}>โต๊ะ</p>
            <p style={{ fontWeight: 500, fontSize: '0.9rem' }}>{order.tableNumber || '—'}</p>
          </div>
          <div>
            <p style={{ color: 'var(--c-text-3)', fontSize: '0.75rem', marginBottom: '3px' }}>เวลา</p>
            <p style={{ fontWeight: 500, fontSize: '0.9rem' }}>
              {new Date(order.createdAt).toLocaleString('th-TH', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
          {order.note && (
            <div style={{ gridColumn: '1 / -1' }}>
              <p style={{ color: 'var(--c-text-3)', fontSize: '0.75rem', marginBottom: '3px' }}>หมายเหตุ</p>
              <p style={{ fontWeight: 500, fontSize: '0.9rem' }}>{order.note}</p>
            </div>
          )}
        </div>
      </div>

      {/* Order items */}
      <div className="glass-panel" style={{ marginBottom: '12px', overflow: 'hidden' }}>
        {order.items.map((item, idx) => (
          <div
            key={item.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              borderBottom: idx < order.items.length - 1 ? '1px solid var(--c-border)' : 'none',
            }}
          >
            <div>
              <p style={{ fontWeight: 500, fontSize: '0.9rem' }}>{item.itemName || item.menuItem?.name || '(ลบแล้ว)'}</p>
              <p style={{ color: 'var(--c-text-3)', fontSize: '0.78rem', marginTop: '1px' }}>
                ฿{(item.menuItem?.price ?? item.price).toLocaleString('th-TH')} × {item.quantity}
              </p>
            </div>
            <span className="price-tag">
              ฿{(item.price * item.quantity).toLocaleString('th-TH')}
            </span>
          </div>
        ))}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 16px',
            borderTop: '1px solid var(--c-border)',
            background: 'var(--c-surface-2)',
          }}
        >
          <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>รวม</span>
          <span className="price-tag-lg">฿{order.totalPrice.toLocaleString('th-TH')}</span>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
        {/* Print receipt — always visible */}
        <button
          className="btn btn-ghost"
          onClick={printReceipt}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          title="พิมพ์ใบเสร็จ"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
            <rect x="6" y="14" width="12" height="8"/>
          </svg>
          ใบเสร็จ
        </button>

        {canEdit && (
          <button className="btn btn-ghost" onClick={startEditing} style={{ flex: 1 }}>
            แก้ไขรายการ
          </button>
        )}
        {nextStatuses.map(s =>
          s === 'cancelled' ? (
            <button
              key={s}
              className="btn btn-danger"
              onClick={() => setCancelConfirm(true)}
              style={{ flex: 1 }}
            >
              ยกเลิกออเดอร์
            </button>
          ) : (
            <button
              key={s}
              className={`btn ${s === 'completed' ? 'btn-success' : 'btn-primary'}`}
              onClick={() => updateStatus(s)}
              style={{ flex: 1 }}
            >
              {STATUS_LABELS[s]}
            </button>
          )
        )}
      </div>

      <ConfirmModal
        isOpen={cancelConfirm}
        title="ยกเลิกออเดอร์"
        message={`ต้องการยกเลิกออเดอร์ #${order.id} ใช่หรือไม่?`}
        confirmText="ยกเลิกออเดอร์"
        onConfirm={() => updateStatus('cancelled')}
        onCancel={() => setCancelConfirm(false)}
        isDanger
      />

      <BottomNav />
    </div>
  )
}
