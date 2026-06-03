'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'เข้าสู่ระบบไม่สำเร็จ')
        return
      }
      router.push('/dashboard')
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        className="glass-panel fade-in"
        style={{ width: '100%', maxWidth: '360px', padding: '40px 28px' }}
      >
        <div style={{ marginBottom: '32px' }}>
          <p
            style={{
              fontSize: '0.72rem',
              fontWeight: 600,
              color: 'var(--c-primary)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: '8px',
            }}
          >
            Restaurant
          </p>
          <h1
            style={{
              fontSize: '1.6rem',
              fontWeight: 700,
              letterSpacing: '-0.03em',
              lineHeight: 1.2,
            }}
          >
            Food Order
          </h1>
          <p style={{ color: 'var(--c-text-2)', fontSize: '0.88rem', marginTop: '6px' }}>
            ระบบจัดการออเดอร์
          </p>
        </div>

        <form onSubmit={handleLogin}>
          <label
            htmlFor="password"
            style={{
              display: 'block',
              fontSize: '0.8rem',
              fontWeight: 500,
              color: 'var(--c-text-2)',
              marginBottom: '6px',
            }}
          >
            รหัสผ่าน
          </label>
          <input
            id="password"
            type="password"
            className="input"
            placeholder="ใส่รหัสผ่าน"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoFocus
            style={{ marginBottom: error ? '8px' : '16px' }}
          />
          {error && (
            <p
              style={{
                color: 'var(--c-danger)',
                fontSize: '0.82rem',
                marginBottom: '14px',
              }}
            >
              {error}
            </p>
          )}
          <button
            type="submit"
            className="btn btn-primary btn-full"
            disabled={loading || !password}
            style={{ padding: '13px', fontSize: '0.95rem' }}
          >
            {loading ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
          </button>
        </form>
      </div>
    </div>
  )
}
