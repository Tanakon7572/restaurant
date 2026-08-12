'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import PosShell from '@/components/PosShell'
import ConfirmModal from '@/components/ConfirmModal'
import ImageUploadField from '@/components/ImageUploadField'

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--c-text-2)', marginBottom: '6px' }}>
      {children}
    </label>
  )
}

function todayStr() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function SettingsPage() {
  const [shopName, setShopName] = useState('')
  const [shopNameSaving, setShopNameSaving] = useState(false)
  const [shopNameMsg, setShopNameMsg] = useState('')

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState('')
  const [passwordError, setPasswordError] = useState('')

  const [clearDate, setClearDate] = useState(todayStr())
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [clearMsg, setClearMsg] = useState('')
  const [clearError, setClearError] = useState('')

  // Receipt / tax block. Kept as strings so a half-typed number doesn't fight
  // the input; they're coerced on save and clamped again server-side.
  const [billing, setBilling] = useState({
    vatMode: 'none', vatRate: '7', serviceChargeRate: '0',
    promptPayId: '', paymentQrUrl: '', receiptHeader: '', receiptFooter: '', receiptWidth: '58',
  })
  const [billingSaving, setBillingSaving] = useState(false)
  const [billingMsg, setBillingMsg] = useState('')

  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    fetch('/api/settings')
      .then(res => {
        if (res.status === 401) { router.push('/'); return null }
        return res.json()
      })
      .then(data => {
        if (!data) return
        if (data.shopName) setShopName(data.shopName)
        setBilling({
          vatMode: data.vatMode ?? 'none',
          vatRate: String(data.vatRate ?? 7),
          serviceChargeRate: String(data.serviceChargeRate ?? 0),
          promptPayId: data.promptPayId ?? '',
          paymentQrUrl: data.paymentQrUrl ?? '',
          receiptHeader: data.receiptHeader ?? '',
          receiptFooter: data.receiptFooter ?? '',
          receiptWidth: String(data.receiptWidth ?? 58),
        })
      })
      .finally(() => setLoading(false))
  }, [router])

  async function saveBilling() {
    setBillingSaving(true)
    setBillingMsg('')
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vatMode: billing.vatMode,
          vatRate: Number(billing.vatRate) || 0,
          serviceChargeRate: Number(billing.serviceChargeRate) || 0,
          promptPayId: billing.promptPayId,
          paymentQrUrl: billing.paymentQrUrl,
          receiptHeader: billing.receiptHeader,
          receiptFooter: billing.receiptFooter,
          receiptWidth: Number(billing.receiptWidth),
        }),
      })
      const data = await res.json()
      setBillingMsg(res.ok ? 'บันทึกสำเร็จ' : (data.error || 'เกิดข้อผิดพลาด'))
      if (res.ok) setTimeout(() => setBillingMsg(''), 3000)
    } finally {
      setBillingSaving(false)
    }
  }

  async function saveShopName() {
    if (!shopName.trim()) return
    setShopNameSaving(true)
    setShopNameMsg('')
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopName }),
      })
      if (res.ok) {
        setShopNameMsg('บันทึกสำเร็จ')
        setTimeout(() => setShopNameMsg(''), 3000)
      } else {
        const d = await res.json()
        setShopNameMsg(d.error || 'เกิดข้อผิดพลาด')
      }
    } finally {
      setShopNameSaving(false)
    }
  }

  async function changePassword() {
    setPasswordError('')
    setPasswordMsg('')
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('กรุณากรอกข้อมูลให้ครบ')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('รหัสผ่านใหม่ไม่ตรงกัน')
      return
    }
    setPasswordSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      if (res.ok) {
        setPasswordMsg('เปลี่ยนรหัสผ่านสำเร็จ')
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        setTimeout(() => setPasswordMsg(''), 3000)
      } else {
        const d = await res.json()
        setPasswordError(d.error || 'เกิดข้อผิดพลาด')
      }
    } finally {
      setPasswordSaving(false)
    }
  }

  async function clearOrdersForDay() {
    setClearing(true)
    setClearMsg('')
    setClearError('')
    try {
      // Local-day boundaries so "one day" means the staff's day, not UTC's.
      const from = new Date(`${clearDate}T00:00:00`)
      const to = new Date(`${clearDate}T23:59:59.999`)
      const res = await fetch('/api/orders/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: from.toISOString(), to: to.toISOString() }),
      })
      if (res.status === 401) { router.push('/'); return }
      const data = await res.json()
      if (res.ok) {
        setClearMsg(`ลบออเดอร์ของวันที่เลือกแล้ว ${data.deleted} รายการ`)
        setTimeout(() => setClearMsg(''), 5000)
      } else {
        setClearError(data.error || 'เกิดข้อผิดพลาด')
      }
    } catch {
      setClearError('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setClearing(false)
    }
  }

  if (loading) {
    return (
      <PosShell>
        <div className="page-container">
          <div className="page-header">
            <div style={{ height: '28px', width: '120px', background: 'var(--c-surface-2)', borderRadius: '6px' }} />
          </div>
        </div>
      </PosShell>
    )
  }

  return (
    <PosShell>
    <div className="page-container fade-in">
      <div className="page-header">
        <h1 className="page-title">ตั้งค่า</h1>
      </div>

      {/* Shop name */}
      <div className="glass-panel" style={{ padding: '20px', marginBottom: '16px' }}>
        <h2 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: '16px' }}>ข้อมูลร้าน</h2>
        <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--c-text-2)', marginBottom: '6px' }}>
          ชื่อร้าน
        </label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            className="input"
            value={shopName}
            onChange={e => setShopName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && saveShopName()}
            placeholder="ชื่อร้านอาหาร"
          />
          <button
            className="btn btn-primary"
            onClick={saveShopName}
            disabled={shopNameSaving || !shopName.trim()}
            style={{ whiteSpace: 'nowrap' }}
          >
            {shopNameSaving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
        {shopNameMsg && (
          <p style={{ marginTop: '8px', fontSize: 'var(--text-xs)', color: 'var(--c-success)' }}>{shopNameMsg}</p>
        )}
      </div>

      {/* Change password */}
      <div className="glass-panel" style={{ padding: '20px', marginBottom: '16px' }}>
        <h2 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: '16px' }}>เปลี่ยนรหัสผ่าน</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--c-text-2)', marginBottom: '6px' }}>
              รหัสผ่านปัจจุบัน
            </label>
            <input
              className="input"
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              placeholder="รหัสผ่านปัจจุบัน"
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--c-text-2)', marginBottom: '6px' }}>
              รหัสผ่านใหม่
            </label>
            <input
              className="input"
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="รหัสผ่านใหม่"
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--c-text-2)', marginBottom: '6px' }}>
              ยืนยันรหัสผ่านใหม่
            </label>
            <input
              className="input"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="ยืนยันรหัสผ่านใหม่"
              onKeyDown={e => e.key === 'Enter' && changePassword()}
            />
          </div>

          {passwordError && (
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--c-danger)' }}>{passwordError}</p>
          )}
          {passwordMsg && (
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--c-success)' }}>{passwordMsg}</p>
          )}

          <button
            className="btn btn-primary"
            onClick={changePassword}
            disabled={passwordSaving}
          >
            {passwordSaving ? 'กำลังเปลี่ยน…' : 'เปลี่ยนรหัสผ่าน'}
          </button>
        </div>
      </div>

      {/* Receipt & tax */}
      <div className="glass-panel" style={{ padding: '20px', marginBottom: '16px' }}>
        <h2 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: '4px' }}>ใบเสร็จ ภาษี และการชำระเงิน</h2>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--c-text-3)', marginBottom: '16px' }}>
          ใช้ตอนเก็บเงินและพิมพ์ใบเสร็จ ร้านที่ไม่ได้จด VAT ให้เลือก &quot;ไม่คิด VAT&quot;
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <Label>รูปแบบ VAT</Label>
            <select className="input" value={billing.vatMode}
              onChange={e => setBilling(b => ({ ...b, vatMode: e.target.value }))}>
              <option value="none">ไม่คิด VAT</option>
              <option value="included">ราคาเมนูรวม VAT แล้ว (แยกให้ดูในใบเสร็จ)</option>
              <option value="added">บวก VAT เพิ่มจากยอด</option>
            </select>
          </div>

          {billing.vatMode !== 'none' && (
            <div>
              <Label>อัตรา VAT (%)</Label>
              <input className="input" type="number" min="0" max="100" step="0.1"
                value={billing.vatRate}
                onChange={e => setBilling(b => ({ ...b, vatRate: e.target.value }))} />
            </div>
          )}

          <div>
            <Label>ค่าบริการ (%)</Label>
            <input className="input" type="number" min="0" max="100" step="0.1"
              value={billing.serviceChargeRate}
              onChange={e => setBilling(b => ({ ...b, serviceChargeRate: e.target.value }))} />
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--c-text-3)', marginTop: '4px' }}>
              ใส่ 0 ถ้าไม่เก็บ
            </p>
          </div>

          <div>
            <Label>พร้อมเพย์ (เบอร์โทร หรือ เลขประจำตัวผู้เสียภาษี 13 หลัก)</Label>
            <input className="input" inputMode="numeric" placeholder="0812345678"
              value={billing.promptPayId}
              onChange={e => setBilling(b => ({ ...b, promptPayId: e.target.value }))} />
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--c-text-3)', marginTop: '4px' }}>
              ใส่แล้วหน้าเก็บเงินจะสร้าง QR พร้อมยอดให้อัตโนมัติ เว้นว่าง = ปิดการใช้งาน
            </p>
          </div>

          <div>
            <Label>QR รับเงิน (ใช้เมื่อไม่มีพร้อมเพย์)</Label>
            <ImageUploadField
              value={billing.paymentQrUrl}
              onChange={url => setBilling(b => ({ ...b, paymentQrUrl: url }))}
              label="อัปโหลด QR"
              hint={billing.promptPayId.trim()
                ? 'ตอนนี้ใช้พร้อมเพย์อยู่ รูปนี้จะถูกใช้ก็ต่อเมื่อลบเบอร์พร้อมเพย์ออก'
                : 'บันทึกรูป QR จากแอปธนาคารของร้าน ลูกค้าต้องกรอกยอดเองเพราะรูปไม่มียอดฝังอยู่'}
            />
          </div>

          <div>
            <Label>ขนาดกระดาษใบเสร็จ</Label>
            <select className="input" value={billing.receiptWidth}
              onChange={e => setBilling(b => ({ ...b, receiptWidth: e.target.value }))}>
              <option value="58">58 มม. (เครื่องพิมพ์เล็ก)</option>
              <option value="80">80 มม.</option>
            </select>
          </div>

          <div>
            <Label>ข้อความหัวใบเสร็จ</Label>
            <textarea className="input" rows={2} placeholder="ที่อยู่ / เลขประจำตัวผู้เสียภาษี / เบอร์โทร"
              value={billing.receiptHeader}
              onChange={e => setBilling(b => ({ ...b, receiptHeader: e.target.value }))} />
          </div>

          <div>
            <Label>ข้อความท้ายใบเสร็จ</Label>
            <textarea className="input" rows={2} placeholder="ขอบคุณที่ใช้บริการ"
              value={billing.receiptFooter}
              onChange={e => setBilling(b => ({ ...b, receiptFooter: e.target.value }))} />
          </div>

          {billingMsg && (
            <p style={{ fontSize: 'var(--text-xs)', color: billingMsg.startsWith('บันทึก') ? 'var(--c-success)' : 'var(--c-danger)' }}>
              {billingMsg}
            </p>
          )}
          <button className="btn btn-primary" onClick={saveBilling} disabled={billingSaving}>
            {billingSaving ? 'กำลังบันทึก…' : 'บันทึกการตั้งค่าใบเสร็จ'}
          </button>
        </div>
      </div>

      {/* QR Ordering */}
      <div className="glass-panel" style={{ padding: '20px', marginBottom: '16px' }}>
        <h2 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: '4px' }}>QR สั่งอาหาร</h2>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--c-text-3)', marginBottom: '16px' }}>
          สร้าง QR code สำหรับแต่ละโต๊ะ ให้ลูกค้าสแกนสั่งอาหารเอง
        </p>
        <a
          href="/qr"
          className="btn btn-ghost btn-full"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', textDecoration: 'none' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/>
            <path d="M14 14h2v2h-2zM18 14h3M14 18v3M18 18h3v3h-3z"/>
          </svg>
          จัดการ QR Code
        </a>
      </div>

      {/* Order data management */}
      <div className="glass-panel" style={{ padding: '20px', marginBottom: '16px' }}>
        <h2 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: '4px' }}>จัดการข้อมูลออเดอร์</h2>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--c-text-3)', marginBottom: '16px' }}>
          ระบบเก็บข้อมูลออเดอร์ย้อนหลัง 7 วัน และลบข้อมูลที่เก่ากว่านั้นให้อัตโนมัติ
          หากต้องการเก็บถาวร ให้ Export CSV จากหน้าออเดอร์ก่อน
        </p>
        <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--c-text-2)', marginBottom: '6px' }}>
          ล้างออเดอร์ของวันที่
        </label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input
            className="input"
            type="date"
            value={clearDate}
            max={todayStr()}
            onChange={e => setClearDate(e.target.value)}
            style={{ flex: 1, minWidth: '150px' }}
          />
          <button
            className="btn btn-danger"
            onClick={() => setClearConfirmOpen(true)}
            disabled={clearing || !clearDate}
            style={{ whiteSpace: 'nowrap' }}
          >
            {clearing ? 'กำลังลบ…' : 'ล้างข้อมูลวันที่เลือก'}
          </button>
        </div>
        {clearMsg && (
          <p style={{ marginTop: '8px', fontSize: 'var(--text-xs)', color: 'var(--c-success)' }}>{clearMsg}</p>
        )}
        {clearError && (
          <p style={{ marginTop: '8px', fontSize: 'var(--text-xs)', color: 'var(--c-danger)' }}>{clearError}</p>
        )}
      </div>

      {/* Kitchen Display */}
      <div className="glass-panel" style={{ padding: '20px', marginBottom: '16px' }}>
        <h2 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: '4px' }}>Kitchen Display</h2>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--c-text-3)', marginBottom: '16px' }}>
          หน้าจอสำหรับครัว แสดงออเดอร์ที่กำลังรอและกำลังทำ
        </p>
        <a
          href="/kitchen"
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost btn-full"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', textDecoration: 'none' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
          </svg>
          เปิด Kitchen Display
        </a>
      </div>

      <ConfirmModal
        isOpen={clearConfirmOpen}
        title="ล้างข้อมูลออเดอร์"
        message={`ต้องการลบออเดอร์ทั้งหมดของวันที่ ${new Date(`${clearDate}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })} ใช่ไหม? ข้อมูลที่ลบแล้วไม่สามารถกู้คืนได้`}
        confirmText="ลบข้อมูล"
        isDanger
        onConfirm={clearOrdersForDay}
        onCancel={() => setClearConfirmOpen(false)}
      />

    </div>
    </PosShell>
  )
}
