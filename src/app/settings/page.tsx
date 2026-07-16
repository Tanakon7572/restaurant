'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import PosShell from '@/components/PosShell'
import ConfirmModal from '@/components/ConfirmModal'

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

  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    fetch('/api/settings')
      .then(res => {
        if (res.status === 401) { router.push('/'); return null }
        return res.json()
      })
      .then(data => {
        if (data?.shopName) setShopName(data.shopName)
      })
      .finally(() => setLoading(false))
  }, [router])

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
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '16px' }}>ข้อมูลร้าน</h2>
        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 500, color: 'var(--c-text-2)', marginBottom: '6px' }}>
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
          <p style={{ marginTop: '8px', fontSize: '0.82rem', color: 'var(--c-success)' }}>{shopNameMsg}</p>
        )}
      </div>

      {/* Change password */}
      <div className="glass-panel" style={{ padding: '20px', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '16px' }}>เปลี่ยนรหัสผ่าน</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 500, color: 'var(--c-text-2)', marginBottom: '6px' }}>
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
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 500, color: 'var(--c-text-2)', marginBottom: '6px' }}>
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
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 500, color: 'var(--c-text-2)', marginBottom: '6px' }}>
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
            <p style={{ fontSize: '0.82rem', color: 'var(--c-danger)' }}>{passwordError}</p>
          )}
          {passwordMsg && (
            <p style={{ fontSize: '0.82rem', color: 'var(--c-success)' }}>{passwordMsg}</p>
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

      {/* QR Ordering */}
      <div className="glass-panel" style={{ padding: '20px', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '4px' }}>QR สั่งอาหาร</h2>
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
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '4px' }}>จัดการข้อมูลออเดอร์</h2>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--c-text-3)', marginBottom: '16px' }}>
          ระบบเก็บข้อมูลออเดอร์ย้อนหลัง 7 วัน และลบข้อมูลที่เก่ากว่านั้นให้อัตโนมัติ
          หากต้องการเก็บถาวร ให้ Export CSV จากหน้าออเดอร์ก่อน
        </p>
        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 500, color: 'var(--c-text-2)', marginBottom: '6px' }}>
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
          <p style={{ marginTop: '8px', fontSize: '0.82rem', color: 'var(--c-success)' }}>{clearMsg}</p>
        )}
        {clearError && (
          <p style={{ marginTop: '8px', fontSize: '0.82rem', color: 'var(--c-danger)' }}>{clearError}</p>
        )}
      </div>

      {/* Kitchen Display */}
      <div className="glass-panel" style={{ padding: '20px', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '4px' }}>Kitchen Display</h2>
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
