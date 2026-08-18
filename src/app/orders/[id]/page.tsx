'use client'

import { useEffect, useState } from 'react'
import { usePrintImage } from '@/lib/usePrintLogo'
import { logoDots } from '@/lib/slipLogo'
import { useRouter, useParams } from 'next/navigation'
import PosShell from '@/components/PosShell'
import ConfirmModal from '@/components/ConfirmModal'
import Cart from '@/components/Cart'
import MenuBrowser from '@/components/MenuBrowser'
import ItemOptionSheet from '@/components/ItemOptionSheet'
import { addLine, setQuantity, removeLine, replaceLine, cartTotal, lineKey } from '@/lib/cart'
import { translateDiyLine } from '@/lib/options'
import { resolveEditTarget, type EditTarget } from '@/lib/editLine'
import { needsSheet } from '@/lib/needsSheet'
import { printSlipJob } from '@/lib/printBridge'
import { kitchenTicketJob } from '@/lib/printJob'
import { kitchenTicketHtml } from '@/lib/receipt'
import type { CartLine, MenuCategoryDTO, MenuItemDTO, OptionGroupDTO } from '@/lib/types'

interface OrderItemData {
  id: number
  menuItemId: number | null
  itemName: string
  menuItem?: { id: number; name: string; price: number } | null
  quantity: number
  price: number
  note: string | null
  options?: { groupName: string; choiceName: string; priceDelta: number; unitPrice?: number | null }[]
  // Added by GET /api/orders/[id]: the stored option snapshots mapped back to
  // live choice ids so an edit can re-submit them, plus the live option groups
  // and price needed to reopen the line in the option sheet.
  optionChoiceIds?: number[]
  optionsResolved?: boolean
  optionGroups?: OptionGroupDTO[]
  menuPrice?: number | null
}

interface Order {
  id: number
  dailyNumber?: number
  status: string
  totalPrice: number
  tableNumber: string | null
  customerName: string | null
  note: string | null
  createdAt: string
  updatedAt: string
  items: OrderItemData[]
}

const STATUS_LABELS: Record<string, string> = {
  awaiting:  'รอยืนยัน',
  pending:   'รอรับ',
  preparing: 'กำลังทำ',
  completed: 'เสร็จแล้ว',
  cancelled: 'ยกเลิก',
}

// Same tints as the order list and the kitchen. A status that looks blue on
// one screen and amber on another is a status nobody trusts.
const STATUS_TINT: Record<string, string> = {
  awaiting:  's-billing',
  pending:   's-seated',
  preparing: 's-preparing',
  completed: 's-free',
  cancelled: '',
}

const LATE_AFTER_MIN = 20

function minutesSince(iso: string) {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
}

const STATUS_FLOW: Record<string, string[]> = {
  awaiting:  [],
  pending:   ['preparing', 'cancelled'],
  preparing: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

export default function OrderDetailPage() {
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [categories, setCategories] = useState<MenuCategoryDTO[]>([])
  const [editLines, setEditLines] = useState<CartLine[]>([])
  const [sheetItem, setSheetItem] = useState<MenuItemDTO | null>(null)
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null)
  // Last-resort pickers for lines the customer menu doesn't browse, seeded
  // from the order itself. The menu is preferred: only it carries the photos.
  const [itemsById, setItemsById] = useState<Record<number, MenuItemDTO>>({})
  const [editTable, setEditTable] = useState('')
  const [editCustomer, setEditCustomer] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editWarning, setEditWarning] = useState('')
  const [saveError, setSaveError] = useState('')
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  // Printed on the kitchen ticket header; falls back to the generic name so a
  // failed settings fetch never blocks printing.
  const [shopName, setShopName] = useState('ร้านอาหาร')
  const [receiptWidth, setReceiptWidth] = useState(58)
  const [logoUrl, setLogoUrl] = useState('')
  const printLogo = usePrintImage(logoUrl, logoDots(receiptWidth))
  const router = useRouter()
  const params = useParams()

  useEffect(() => {
    fetch('/api/settings')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (d?.shopName) setShopName(d.shopName)
        if (d?.receiptWidth) setReceiptWidth(d.receiptWidth)
        if (d?.logoUrl) setLogoUrl(d.logoUrl)
      })
      .catch(() => {})
    // Loaded up front, not when editing starts: reopening a line resolves
    // against this, and staff shouldn't have to wait for a fetch to see the
    // option photos or the แป้ง step.
    fetch('/api/public/menu?staff=1')
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (Array.isArray(data)) setCategories(data as MenuCategoryDTO[]) })
      .catch(() => {})
  }, [])

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
    // Rebuild each stored line as a cart line so options and per-item notes
    // ride along through the edit instead of being dropped on save.
    const lines = order.items
      .filter(i => i.menuItemId != null)
      .reduce<CartLine[]>((acc, i) => {
        const choices = (i.options ?? []).map(o => ({
          groupName: o.groupName, choiceName: o.choiceName, priceDelta: o.priceDelta,
        }))
        const delta = choices.reduce((s, c) => s + c.priceDelta, 0)
        const ids = i.optionChoiceIds ?? []
        return addLine(acc, {
          key: lineKey(i.menuItemId as number, ids, i.note),
          menuItemId: i.menuItemId as number,
          name: i.itemName || i.menuItem?.name || '(ลบแล้ว)',
          basePrice: i.price - delta,
          quantity: i.quantity,
          note: i.note,
          optionChoiceIds: ids,
          choices,
          unitPrice: i.price,
        })
      }, [])

    // The order carries each item's live option groups, so a line can be
    // reopened without waiting for (or finding it in) the menu fetch below —
    // which matters for ingredient items that no category browses directly.
    const known: Record<number, MenuItemDTO> = {}
    for (const i of order.items) {
      if (i.menuItemId == null || !i.optionGroups) continue
      const delta = (i.options ?? []).reduce((s, o) => s + o.priceDelta, 0)
      known[i.menuItemId] = {
        id: i.menuItemId,
        name: i.itemName || i.menuItem?.name || '',
        price: i.menuPrice ?? i.price - delta,
        imageUrl: null,
        optionGroups: i.optionGroups,
      }
    }
    setItemsById(known)

    const deleted = order.items.filter(i => i.menuItemId == null).length
    const unmatched = order.items.filter(i => i.optionsResolved === false).length
    setEditWarning([
      deleted > 0 ? `${deleted} รายการถูกลบออกจากเมนูแล้ว จะหายไปเมื่อบันทึก` : '',
      unmatched > 0 ? `${unmatched} รายการมีตัวเลือกที่ไม่มีในเมนูปัจจุบันแล้ว กรุณาตรวจสอบก่อนบันทึก` : '',
    ].filter(Boolean).join(' · '))

    setEditLines(lines)
    // A sheet left open from a previous edit must not reopen over the new one.
    setSheetItem(null)
    setEditTarget(null)
    setEditTable(order.tableNumber || '')
    setEditCustomer(order.customerName || '')
    setEditNote(order.note || '')
    setSaveError('')
    setEditing(true)
  }

  function openEditItem(item: MenuItemDTO) {
    if (item.available === false) return
    if (needsSheet(item)) { setSheetItem(item); return }
    setEditLines(prev => addLine(prev, {
      key: '', menuItemId: item.id, name: item.name, basePrice: item.price,
      quantity: 1, note: null, optionChoiceIds: [], choices: [], unitPrice: item.price,
    }))
  }

  // Reopen an existing line with what was chosen already ticked.
  function openEditLine(line: CartLine) {
    const target = resolveEditTarget(line, categories, itemsById)
    if (target) setEditTarget(target)
  }

  function closeSheet() {
    setSheetItem(null)
    setEditTarget(null)
  }

  function handleSheetSubmit(line: CartLine) {
    // Synthetic DIY lines carry a negative id; the chosen crust becomes the
    // real menu item. Editing a DIY line reopens the builder, so this applies
    // whether the line is new or being reconfigured.
    const source = editTarget?.item ?? sheetItem
    if (line.menuItemId < 0 && source) {
      const translated = translateDiyLine(line, source)
      if (!translated) return
      line = translated
    }

    // Reconfiguring replaces the line it came from; the key changes with the
    // options, so it can't be an in-place update.
    if (editTarget) {
      setEditLines(prev => replaceLine(prev, editTarget.key, line))
      closeSheet()
      return
    }
    setEditLines(prev => addLine(prev, line))
  }

  const editTotal = cartTotal(editLines)

  async function saveEdit() {
    if (editLines.length === 0) return
    setSaving(true)
    setSaveError('')
    try {
      const res = await fetch(`/api/orders/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: editLines.map(l => ({
            menuItemId: l.menuItemId,
            quantity: l.quantity,
            note: l.note,
            optionChoiceIds: l.optionChoiceIds,
          })),
          tableNumber: editTable || null,
          customerName: editCustomer || null,
          note: editNote || null,
        }),
      })
      if (res.status === 401) { router.push('/'); return }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setSaveError(data.error || 'บันทึกไม่สำเร็จ')
        return
      }
      setEditing(false)
      fetchOrder()
    } catch {
      setSaveError('เกิดข้อผิดพลาด กรุณาลองใหม่')
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

  const [closing, setClosing] = useState(false)
  const [closed, setClosed] = useState(false)
  async function closeTable() {
    if (!order?.tableNumber) return
    if (!confirm(`เคลียร์โต๊ะ ${order.tableNumber}? เครื่องที่ลูกค้าสแกน QR โต๊ะนี้จะเริ่มสั่งใหม่`)) return
    setClosing(true)
    try {
      const res = await fetch('/api/orders/close-table', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableNumber: order.tableNumber }),
      })
      if (res.ok) setClosed(true)
    } finally { setClosing(false) }
  }

  if (loading || !order) {
    return (
      <PosShell>
        <div className="page-container">
          <div className="page-header">
            <div className="skeleton" style={{ height: '28px', width: '130px' }} />
          </div>
        </div>
      </PosShell>
    )
  }

  if (editing) {
    return (
      <PosShell>
      <div className="page-container fade-in">
        <div className="page-header">
          <h1 className="page-title">แก้ไขออเดอร์ #{order.dailyNumber ?? order.id}</h1>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
            ยกเลิก
          </button>
        </div>

        {editWarning && (
          <div className="glass-panel" style={{ padding: '10px 14px', marginBottom: '12px', borderColor: 'var(--c-warning)', background: 'var(--c-warning-bg)' }}>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--c-warning)', fontWeight: 600 }}>⚠ {editWarning}</p>
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <input
            className="input"
            placeholder="เลขโต๊ะ"
            value={editTable}
            onChange={e => setEditTable(e.target.value)}
            style={{ flex: '0 0 90px', padding: '10px 12px' }}
          />
          <input
            className="input"
            placeholder="ชื่อลูกค้า"
            value={editCustomer}
            onChange={e => setEditCustomer(e.target.value)}
            style={{ flex: 1, padding: '10px 12px' }}
          />
        </div>
        <input
          className="input"
          placeholder="หมายเหตุรวม"
          value={editNote}
          onChange={e => setEditNote(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', marginBottom: '16px' }}
        />

        <p style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--c-text-2)', marginBottom: '8px' }}>
          รายการปัจจุบัน
        </p>
        <div style={{ marginBottom: '16px' }}>
          <Cart
            lines={editLines}
            onQty={(key, q) => setEditLines(prev => setQuantity(prev, key, q))}
            onRemove={key => setEditLines(prev => removeLine(prev, key))}
            onEdit={openEditLine}
            canEdit={l => resolveEditTarget(l, categories, itemsById) !== null}
          />
        </div>

        <p style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--c-text-2)', marginBottom: '8px' }}>
          เพิ่มรายการ
        </p>
        <MenuBrowser categories={categories} onSelect={openEditItem} emptyText="ยังไม่มีเมนู" />

        {/* One sheet, two jobs: adding a new line, or reconfiguring an
            existing one. The key remounts it so the pickers reset between
            targets instead of carrying the previous line's ticks over. */}
        <ItemOptionSheet
          key={editTarget ? `edit:${editTarget.key}` : `add:${sheetItem?.id ?? ''}`}
          item={editTarget?.item ?? sheetItem}
          initial={editTarget?.initial}
          onClose={closeSheet}
          onAdd={handleSheetSubmit}
        />

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
          {saveError && (
            <p style={{ color: 'var(--c-danger)', fontSize: 'var(--text-xs)', marginBottom: '8px', textAlign: 'center' }}>{saveError}</p>
          )}
          <button
            className="btn btn-primary btn-full"
            onClick={saveEdit}
            disabled={saving || editLines.length === 0}
            style={{
              padding: '14px 20px',
              fontSize: 'var(--text-sm)',
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

      </div>
      </PosShell>
    )
  }

  const nextStatuses = STATUS_FLOW[order.status] || []

  // The money receipt now comes from the bill at checkout; what this page
  // prints is the ticket the kitchen works off — items, options and notes,
  // no prices.
  function printKitchenTicket() {
    if (!order) return
    const slip = {
      id: order.id,
      dailyNumber: order.dailyNumber,
      tableNumber: order.tableNumber,
      customerName: order.customerName,
      note: order.note,
      createdAt: order.createdAt,
      items: order.items.map(i => ({
        itemName: i.itemName || i.menuItem?.name || '(ลบแล้ว)',
        quantity: i.quantity,
        price: i.price,
        note: i.note,
        options: i.options,
      })),
    }
    printSlipJob(
      kitchenTicketJob(slip, shopName, receiptWidth, printLogo),
      () => kitchenTicketHtml(slip, shopName, logoUrl),
    )
  }

  return (
    <PosShell>
    <div className="page-container fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => router.push('/orders')}
            style={{ width: '34px', height: '34px', padding: 0, fontSize: 'var(--text-base)' }}
            aria-label="กลับ"
          >
            ←
          </button>
          <h1 className="page-title">ออเดอร์ #{order.dailyNumber ?? order.id}</h1>
        </div>
      </div>

      {/* Where this order stands, and how long it has stood there. On the
          list these two are what staff scan for; opening one should not make
          them hunt for the same two facts. */}
      {(() => {
        const open = order.status !== 'completed' && order.status !== 'cancelled'
        const mins = minutesSince(order.createdAt)
        const late = open && mins >= LATE_AFTER_MIN
        return (
          <div
            className={`status-card ${late ? 's-late is-urgent' : STATUS_TINT[order.status] ?? ''}`}
            style={{ marginBottom: '10px' }}
          >
            <div className="status-card-head">
              <span className="status-card-title">{STATUS_LABELS[order.status]}</span>
              {open && (
                <span className={`status-elapsed${late ? ' is-late' : ''}`}>
                  {mins} นาที
                </span>
              )}
            </div>
          </div>
        )
      })()}

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
            <p style={{ color: 'var(--c-text-3)', fontSize: 'var(--text-xs)', marginBottom: '3px' }}>โต๊ะ</p>
            <p style={{ fontWeight: 600, fontSize: 'var(--text-base)' }}>{order.tableNumber || '—'}</p>
          </div>
          <div>
            <p style={{ color: 'var(--c-text-3)', fontSize: 'var(--text-xs)', marginBottom: '3px' }}>ชื่อลูกค้า</p>
            <p style={{ fontWeight: 600, fontSize: 'var(--text-base)' }}>{order.customerName || '—'}</p>
          </div>
          <div>
            <p style={{ color: 'var(--c-text-3)', fontSize: 'var(--text-xs)', marginBottom: '3px' }}>เวลา</p>
            <p style={{ fontWeight: 600, fontSize: 'var(--text-base)' }}>
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
              <p style={{ color: 'var(--c-text-3)', fontSize: 'var(--text-xs)', marginBottom: '3px' }}>หมายเหตุ</p>
              <p style={{ fontWeight: 600, fontSize: 'var(--text-base)' }}>{order.note}</p>
            </div>
          )}
        </div>
        {order.tableNumber && (
          <button className="btn btn-ghost btn-sm btn-full" onClick={closeTable} disabled={closing || closed}
            style={{ marginTop: 12, color: closed ? 'var(--c-success)' : 'var(--c-text-2)' }}>
            {closed ? `✓ เคลียร์โต๊ะ ${order.tableNumber} แล้ว` : closing ? 'กำลังเคลียร์…' : `เคลียร์โต๊ะ ${order.tableNumber} (เริ่มลูกค้าใหม่)`}
          </button>
        )}
      </div>

      {/* Order items */}
      <div className="glass-panel" style={{ marginBottom: '12px', overflow: 'hidden' }}>
        {order.items.map((item, idx) => (
          <div
            key={item.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 8,
              padding: '12px 16px',
              borderBottom: idx < order.items.length - 1 ? '1px solid var(--c-border)' : 'none',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <p style={{ fontWeight: 600, fontSize: 'var(--text-base)' }}>{item.itemName || item.menuItem?.name || '(ลบแล้ว)'}</p>
              <p style={{ color: 'var(--c-text-3)', fontSize: 'var(--text-xs)', marginTop: '1px' }}>
                ฿{item.price.toLocaleString('th-TH')} × {item.quantity}
              </p>
              {item.options && item.options.length > 0 && (
                <ul style={{ listStyle: 'none', margin: '3px 0 0', paddingLeft: 2, fontSize: 'var(--text-xs)', color: 'var(--c-text-3)' }}>
                  {item.options.map((o, i) => (
                    <li key={i}>• {o.choiceName}{o.unitPrice != null
                      ? ` ฿${o.unitPrice.toLocaleString('th-TH')}`
                      : o.priceDelta > 0 ? ` (+฿${o.priceDelta})` : ''}</li>
                  ))}
                </ul>
              )}
              {item.note && <p style={{ fontSize: 'var(--text-xs)', color: 'var(--c-text-3)', marginTop: 2 }}>📝 {item.note}</p>}
            </div>
            <span className="price-tag" style={{ flexShrink: 0 }}>
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
          <span style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>รวม</span>
          <span className="price-tag-lg">฿{order.totalPrice.toLocaleString('th-TH')}</span>
        </div>
      </div>

      {/* Awaiting confirmation — customer request needs approval */}
      {order.status === 'awaiting' && (
        <div className="glass-panel" style={{ padding: '14px 16px', marginBottom: '10px', borderColor: 'var(--c-warning)', background: 'var(--c-warning-bg)' }}>
          <p style={{ fontWeight: 700, color: 'var(--c-warning)', marginBottom: '2px' }}>คำขอจากลูกค้า · รอยืนยัน</p>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--c-text-2)', marginBottom: '12px' }}>กดยืนยันเพื่อส่งเข้าครัว หรือปฏิเสธเพื่อยกเลิกคำขอ</p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-success" style={{ flex: 1 }} onClick={() => updateStatus('pending')}>ยืนยันออเดอร์</button>
            <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => setCancelConfirm(true)}>ปฏิเสธ</button>
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
        {/* Kitchen ticket — always visible */}
        <button
          className="btn btn-ghost"
          onClick={printKitchenTicket}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          title="พิมพ์สลิปครัว"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
            <rect x="6" y="14" width="12" height="8"/>
          </svg>
          สลิปครัว
        </button>

        {/* Editable at any status — staff correct closed and cancelled tickets too */}
        <button className="btn btn-ghost" onClick={startEditing} style={{ flex: 1 }}>
          แก้ไขรายการ
        </button>
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
        message={`ต้องการยกเลิกออเดอร์ #${order.dailyNumber ?? order.id} ใช่หรือไม่?`}
        confirmText="ยกเลิกออเดอร์"
        onConfirm={() => updateStatus('cancelled')}
        onCancel={() => setCancelConfirm(false)}
        isDanger
      />

    </div>
    </PosShell>
  )
}
