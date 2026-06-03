'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import ConfirmModal from '@/components/ConfirmModal'
import { fetchWithCache, invalidateCache } from '@/lib/cache'

interface MenuItem {
  id: number
  name: string
  price: number
  available: boolean
  categoryId: number
  imageUrl?: string | null
}

interface Category {
  id: number
  name: string
  items: MenuItem[]
}

function ItemImage({ imageUrl, name, size = 48 }: { imageUrl?: string | null; name: string; size?: number }) {
  const [imgError, setImgError] = useState(false)
  if (imageUrl && !imgError) {
    return (
      <img
        src={imageUrl}
        alt={name}
        width={size}
        onError={() => setImgError(true)}
        style={{ width: size, height: 'auto', borderRadius: '8px', flexShrink: 0, display: 'block' }}
      />
    )
  }
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '8px',
        background: 'var(--c-primary-light)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--c-primary)', fontWeight: 700, fontSize: size * 0.35, flexShrink: 0,
      }}
    >
      {name.charAt(0)}
    </div>
  )
}

function ImageInput({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState(value)
  const [previewError, setPreviewError] = useState(false)

  function handleUrlChange(url: string) {
    onChange(url)
    setPreview(url)
    setPreviewError(false)
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/upload-image', { method: 'POST', body: form })
      const data = await res.json()
      if (res.ok && data.url) {
        onChange(data.url)
        setPreview(data.url)
        setPreviewError(false)
      } else {
        alert(data.error ?? 'Upload ไม่สำเร็จ')
      }
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
      {/* Preview */}
      <div
        style={{
          width: 130, borderRadius: '8px', flexShrink: 0,
          background: 'var(--c-primary-light)', border: '1px solid var(--c-border)',
          overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: 130,
        }}
      >
        {preview && !previewError ? (
          <img src={preview} alt="" style={{ width: '100%', height: 'auto', display: 'block' }} onError={() => setPreviewError(true)} />
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--c-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
        )}
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <input
          className="input"
          value={value}
          onChange={e => handleUrlChange(e.target.value)}
          style={{ padding: '7px 10px', fontSize: 'var(--text-sm)' }}
          placeholder="URL รูปภาพ (ไม่บังคับ)"
        />
        <label
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: uploading ? 'wait' : 'pointer',
            fontSize: 'var(--text-xs)', color: 'var(--c-text-3)',
            padding: '5px 10px', border: '1px dashed var(--c-border)', borderRadius: 'var(--radius-xs)',
            background: 'var(--c-surface-2)', userSelect: 'none', width: 'fit-content',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          {uploading ? 'กำลังอัปโหลด…' : 'อัปโหลดรูป'}
          <input type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} disabled={uploading} />
        </label>
      </div>
    </div>
  )
}

export default function MenuPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [newCatName, setNewCatName] = useState('')
  const [editingCat, setEditingCat] = useState<number | null>(null)
  const [editCatName, setEditCatName] = useState('')
  const [addingItemCat, setAddingItemCat] = useState<number | null>(null)
  const [newItemName, setNewItemName] = useState('')
  const [newItemPrice, setNewItemPrice] = useState('')
  const [newItemImageUrl, setNewItemImageUrl] = useState('')
  const [editingItem, setEditingItem] = useState<number | null>(null)
  const [editItemName, setEditItemName] = useState('')
  const [editItemPrice, setEditItemPrice] = useState('')
  const [editItemImageUrl, setEditItemImageUrl] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'category' | 'item'; id: number; name: string } | null>(null)
  const router = useRouter()

  function fetchCategories(bust = false) {
    if (bust) invalidateCache('menu:categories')
    fetchWithCache<Category[]>('menu:categories', '/api/menu-categories', 60_000)
      .then(data => {
        if (data === null) {
          fetch('/api/menu-categories').then(r => { if (r.status === 401) router.push('/') })
          return
        }
        setCategories(data)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchCategories() }, [])

  async function addCategory() {
    if (!newCatName.trim()) return
    await fetch('/api/menu-categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newCatName.trim() }),
    })
    setNewCatName('')
    fetchCategories()
  }

  async function updateCategory(id: number) {
    if (!editCatName.trim()) return
    await fetch(`/api/menu-categories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editCatName.trim() }),
    })
    setEditingCat(null)
    fetchCategories(true)
  }

  async function addItem(categoryId: number) {
    if (!newItemName.trim() || !newItemPrice) return
    await fetch('/api/menu-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newItemName.trim(),
        price: newItemPrice,
        categoryId,
        imageUrl: newItemImageUrl.trim() || null,
      }),
    })
    setAddingItemCat(null)
    setNewItemName('')
    setNewItemPrice('')
    setNewItemImageUrl('')
    fetchCategories()
  }

  async function updateItem(id: number) {
    if (!editItemName.trim() || !editItemPrice) return
    await fetch(`/api/menu-items/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editItemName.trim(),
        price: editItemPrice,
        imageUrl: editItemImageUrl.trim() || null,
      }),
    })
    setEditingItem(null)
    fetchCategories()
  }

  async function toggleAvailable(item: MenuItem) {
    await fetch(`/api/menu-items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ available: !item.available }),
    })
    fetchCategories()
  }

  async function handleDelete() {
    if (!deleteTarget) return
    const url = deleteTarget.type === 'category'
      ? `/api/menu-categories/${deleteTarget.id}`
      : `/api/menu-items/${deleteTarget.id}`
    await fetch(url, { method: 'DELETE' })
    setDeleteTarget(null)
    fetchCategories()
  }

  if (loading) {
    return (
      <div className="page-container">
        <div className="page-header">
          <div style={{ height: '28px', width: '120px', background: 'var(--c-surface-2)', borderRadius: '6px' }} />
        </div>
        <BottomNav />
      </div>
    )
  }

  return (
    <div className="page-container fade-in">
      <div className="page-header">
        <h1 className="page-title">จัดการเมนู</h1>
      </div>

      {/* Add category */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <input
          className="input"
          placeholder="ชื่อหมวดหมู่ใหม่"
          value={newCatName}
          onChange={e => setNewCatName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addCategory()}
        />
        <button className="btn btn-primary" onClick={addCategory} style={{ whiteSpace: 'nowrap' }}>
          เพิ่ม
        </button>
      </div>

      {categories.map(cat => (
        <div key={cat.id} className="glass-panel" style={{ marginBottom: '12px', overflow: 'hidden' }}>
          {/* Category header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 16px',
              borderBottom: cat.items.length > 0 || addingItemCat === cat.id ? '1px solid var(--c-border)' : 'none',
            }}
          >
            {editingCat === cat.id ? (
              <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
                <input
                  className="input"
                  value={editCatName}
                  onChange={e => setEditCatName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && updateCategory(cat.id)}
                  autoFocus
                  style={{ padding: '8px 12px' }}
                />
                <button className="btn btn-primary btn-sm" onClick={() => updateCategory(cat.id)}>บันทึก</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditingCat(null)}>ยกเลิก</button>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>{cat.name}</h3>
                  <span style={{ fontSize: '0.72rem', color: 'var(--c-text-3)', fontWeight: 500 }}>
                    {cat.items.length} รายการ
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => { setEditingCat(cat.id); setEditCatName(cat.name) }}
                  >
                    แก้ไข
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ color: 'var(--c-danger)' }}
                    onClick={() => setDeleteTarget({ type: 'category', id: cat.id, name: cat.name })}
                  >
                    ลบ
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Menu items */}
          {cat.items.map((item, idx) => (
            <div
              key={item.id}
              style={{
                padding: '12px 16px',
                borderBottom: idx < cat.items.length - 1 ? '1px solid var(--c-border)' : 'none',
                opacity: item.available ? 1 : 0.5,
                transition: 'opacity 0.15s',
              }}
            >
              {editingItem === item.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <input
                      className="input"
                      value={editItemName}
                      onChange={e => setEditItemName(e.target.value)}
                      style={{ flex: 1, minWidth: '120px', padding: '8px 12px' }}
                      placeholder="ชื่อเมนู"
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>
                      <span style={{ color: 'var(--c-text-3)', fontSize: '0.9rem' }}>฿</span>
                      <input
                        className="input"
                        type="number"
                        value={editItemPrice}
                        onChange={e => setEditItemPrice(e.target.value)}
                        style={{ width: '80px', padding: '0', background: 'transparent', border: 'none', boxShadow: 'none' }}
                        placeholder="ราคา"
                      />
                    </div>
                  </div>
                  <ImageInput value={editItemImageUrl} onChange={setEditItemImageUrl} />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-primary btn-sm" onClick={() => updateItem(item.id)}>บันทึก</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditingItem(null)}>ยกเลิก</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                    <ItemImage imageUrl={item.imageUrl} name={item.name} size={130} />
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontWeight: 500, fontSize: '0.92rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.name}
                      </p>
                      <p className="price-tag" style={{ fontSize: '1.05rem', marginTop: '1px' }}>
                        ฿{item.price.toLocaleString('th-TH')}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0, marginLeft: '12px' }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => toggleAvailable(item)}
                      style={{ fontSize: '0.72rem', color: item.available ? 'var(--c-success)' : 'var(--c-danger)', minWidth: '42px' }}
                    >
                      {item.available ? 'เปิด' : 'ปิด'}
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setEditingItem(item.id)
                        setEditItemName(item.name)
                        setEditItemPrice(String(item.price))
                        setEditItemImageUrl(item.imageUrl || '')
                      }}
                    >
                      แก้ไข
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--c-danger)' }}
                      onClick={() => setDeleteTarget({ type: 'item', id: item.id, name: item.name })}
                    >
                      ลบ
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Add item row */}
          {addingItemCat === cat.id ? (
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--c-border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  className="input"
                  placeholder="ชื่อเมนู"
                  value={newItemName}
                  onChange={e => setNewItemName(e.target.value)}
                  style={{ flex: 1, minWidth: '120px', padding: '8px 12px' }}
                  autoFocus
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>
                  <span style={{ color: 'var(--c-text-3)', fontSize: '0.9rem' }}>฿</span>
                  <input
                    className="input"
                    type="number"
                    placeholder="ราคา"
                    value={newItemPrice}
                    onChange={e => setNewItemPrice(e.target.value)}
                    style={{ width: '80px', padding: '0', background: 'transparent', border: 'none', boxShadow: 'none' }}
                  />
                </div>
              </div>
              <ImageInput value={newItemImageUrl} onChange={setNewItemImageUrl} />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-primary btn-sm" onClick={() => addItem(cat.id)}>เพิ่ม</button>
                <button className="btn btn-ghost btn-sm" onClick={() => { setAddingItemCat(null); setNewItemName(''); setNewItemPrice(''); setNewItemImageUrl('') }}>ยกเลิก</button>
              </div>
            </div>
          ) : (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { setAddingItemCat(cat.id); setNewItemName(''); setNewItemPrice(''); setNewItemImageUrl('') }}
              style={{ width: 'calc(100% - 32px)', margin: '10px 16px', border: '1px dashed var(--c-border)', color: 'var(--c-text-3)' }}
            >
              + เพิ่มเมนู
            </button>
          )}
        </div>
      ))}

      {categories.length === 0 && (
        <div className="glass-panel" style={{ padding: '48px 24px', textAlign: 'center' }}>
          <p style={{ color: 'var(--c-text-3)', fontSize: '0.88rem' }}>
            ยังไม่มีหมวดหมู่ เพิ่มหมวดหมู่แรกด้านบน
          </p>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="ยืนยันการลบ"
        message={`ต้องการลบ "${deleteTarget?.name}" ใช่หรือไม่?${deleteTarget?.type === 'category' ? ' เมนูทั้งหมดในหมวดหมู่นี้จะถูกลบด้วย' : ''}`}
        confirmText="ลบ"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        isDanger
      />

      <BottomNav />
    </div>
  )
}
