'use client'
import { useState } from 'react'

type Props = {
  value: string
  onChange: (url: string) => void
  label?: string
  hint?: string
}

/**
 * Pick a file, upload it, hand back the public URL. Deliberately without the
 * crop step the menu's image input has: this exists for payment QR codes,
 * and cropping one risks clipping a corner marker, which stops phones
 * recognising the code at all.
 */
export default function ImageUploadField({ value, onChange, label = 'อัปโหลดรูป', hint }: Props) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [broken, setBroken] = useState(false)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', file, file.name)
      const res = await fetch('/api/upload-image', { method: 'POST', body: form })
      const data = await res.json()
      if (res.ok && data.url) {
        onChange(data.url)
        setBroken(false)
      } else {
        setError(data.error ?? 'อัปโหลดไม่สำเร็จ')
      }
    } catch {
      setError('อัปโหลดไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div
        style={{
          width: 110, minHeight: 110, flexShrink: 0, borderRadius: 8,
          border: '1px solid var(--c-border)', background: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        }}
      >
        {value && !broken ? (
          <img src={value} alt="" style={{ width: '100%', height: 'auto', display: 'block' }}
            onError={() => setBroken(true)} />
        ) : (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--c-text-3)' }}>
            {broken ? 'เปิดรูปไม่ได้' : 'ยังไม่มีรูป'}
          </span>
        )}
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, width: 'fit-content',
            cursor: uploading ? 'wait' : 'pointer', userSelect: 'none',
            fontSize: 'var(--text-xs)', color: 'var(--c-text-2)',
            padding: '6px 12px', borderRadius: 'var(--radius-xs)',
            border: '1px dashed var(--c-border)', background: 'var(--c-surface-2)',
          }}
        >
          {uploading ? 'กำลังอัปโหลด…' : label}
          <input type="file" accept="image/*" onChange={handleFile}
            style={{ display: 'none' }} disabled={uploading} />
        </label>

        {value && (
          <button className="btn btn-ghost btn-sm" style={{ width: 'fit-content' }}
            onClick={() => { onChange(''); setBroken(false) }}>
            ลบรูป
          </button>
        )}
        {hint && <p style={{ fontSize: 'var(--text-xs)', color: 'var(--c-text-3)' }}>{hint}</p>}
        {error && <p style={{ fontSize: 'var(--text-xs)', color: 'var(--c-danger)' }}>{error}</p>}
      </div>
    </div>
  )
}
