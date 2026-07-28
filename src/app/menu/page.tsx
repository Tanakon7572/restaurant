'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Cropper from 'react-easy-crop'
import PosShell from '@/components/PosShell'
import ConfirmModal from '@/components/ConfirmModal'
import SetEditor, { type SetEditorItem } from '@/components/SetEditor'
import { fetchWithCache, invalidateCache } from '@/lib/cache'
import { isCrust, isCrustCategory } from '@/lib/options'
import { setDisplayName } from '@/lib/setMenu'

async function resizeToDataUrl(dataUrl: string, maxPx = 1400): Promise<string> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', 0.92))
    }
    img.src = dataUrl
  })
}

async function getCroppedImg(imageSrc: string, pixelCrop: { x: number; y: number; width: number; height: number }): Promise<Blob> {
  const image = new Image()
  image.src = imageSrc
  await new Promise<void>(resolve => { image.onload = () => resolve() })
  const canvas = document.createElement('canvas')
  canvas.width = pixelCrop.width
  canvas.height = pixelCrop.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, pixelCrop.width, pixelCrop.height)
  return new Promise(resolve => canvas.toBlob(blob => resolve(blob!), 'image/jpeg', 0.92))
}

interface MenuItem {
  id: number
  name: string
  price: number
  available: boolean
  categoryId: number
  imageUrl?: string | null
  // Non-empty = this item is a fixed set built from other menu items.
  isSet?: boolean
  setDiscount?: number
  setComponents?: { itemId: number; quantity: number; item: { name: string; price: number } }[]
}

interface Category {
  id: number
  name: string
  hidden?: boolean
  parentId?: number | null
  ingredientCategoryId?: number | null
  ingredientCategoryIds?: number[]
  showCrustStep?: boolean
  hiddenPoolCategoryIds?: number[]
  // Set category: gets a "create set" button, and its cards edit as sets.
  isSetCategory?: boolean
  items: MenuItem[]
}

// Effective pool links: multi-link list wins over the legacy single link.
function linksOf(cat: Category): number[] {
  if (cat.ingredientCategoryIds && cat.ingredientCategoryIds.length > 0) return cat.ingredientCategoryIds
  return cat.ingredientCategoryId ? [cat.ingredientCategoryId] : []
}

function ItemImage({ imageUrl, name, size = 48, cover = false }: { imageUrl?: string | null; name: string; size?: number; cover?: boolean }) {
  const [imgError, setImgError] = useState(false)
  if (cover) {
    if (imageUrl && !imgError) {
      return (
        <img
          src={imageUrl}
          alt={name}
          onError={() => setImgError(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      )
    }
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-primary)', fontWeight: 700, fontSize: '1.8rem' }}>
        {name.charAt(0)}
      </div>
    )
  }
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
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [pendingFileName, setPendingFileName] = useState('image.jpg')

  function handleUrlChange(url: string) {
    onChange(url)
    setPreview(url)
    setPreviewError(false)
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingFileName(file.name)
    const reader = new FileReader()
    reader.onload = async () => {
      const resized = await resizeToDataUrl(reader.result as string)
      setCropSrc(resized)
      setCrop({ x: 0, y: 0 })
      setZoom(1)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const onCropComplete = useCallback((_: unknown, pixels: { x: number; y: number; width: number; height: number }) => {
    setCroppedAreaPixels(pixels)
  }, [])

  async function handleCropConfirm() {
    if (!cropSrc || !croppedAreaPixels) return
    setUploading(true)
    setCropSrc(null)
    try {
      const blob = await getCroppedImg(cropSrc, croppedAreaPixels)
      const form = new FormData()
      form.append('file', blob, pendingFileName)
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
    }
  }

  return (
    <>
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

      {/* Crop Modal — centered bounded card (robust on iOS) */}
      {cropSrc && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1100,
            background: 'oklch(0 0 0 / 0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px',
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)',
          }}
          onClick={() => setCropSrc(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: '420px', maxHeight: '90svh',
              background: 'var(--c-surface)', borderRadius: 'var(--radius-lg)',
              overflow: 'hidden', display: 'flex', flexDirection: 'column',
              boxShadow: '0 12px 40px oklch(0 0 0 / 0.4)',
            }}
          >
            {/* Crop area — fixed reasonable height */}
            <div style={{ position: 'relative', width: '100%', height: 'min(48vh, 320px)', background: 'oklch(0.15 0.01 165)', flexShrink: 0 }}>
              <Cropper
                image={cropSrc}
                crop={crop}
                zoom={zoom}
                aspect={4 / 3}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>
            {/* Controls */}
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--c-text-3)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input
                  type="range" min={1} max={3} step={0.01} value={zoom}
                  onChange={e => setZoom(Number(e.target.value))}
                  style={{ flex: 1, accentColor: 'var(--c-primary)' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleCropConfirm}>
                  ยืนยัน &amp; อัปโหลด
                </button>
                <button className="btn btn-ghost" onClick={() => setCropSrc(null)}>
                  ยกเลิก
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
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
  const [setEditing, setSetEditing] = useState<SetEditorItem | null>(null)

  function openSetEditor(item: MenuItem) {
    setSetEditing({
      id: item.id,
      categoryId: item.categoryId,
      name: item.name,
      imageUrl: item.imageUrl || '',
      // `price` is stored already discounted, so the full price it was marked
      // down from has to be added back for the form.
      price: String(item.price + (item.setDiscount ?? 0)),
      discount: String(item.setDiscount ?? 0),
      parts: (item.setComponents ?? []).map(c => ({ itemId: c.itemId, quantity: c.quantity })),
    })
  }
  const [editingItem, setEditingItem] = useState<number | null>(null)
  const [editItemName, setEditItemName] = useState('')
  const [editItemPrice, setEditItemPrice] = useState('')
  const [editItemImageUrl, setEditItemImageUrl] = useState('')
  const [editItemCategoryId, setEditItemCategoryId] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'category' | 'item'; id: number; name: string } | null>(null)
  // Sub-category creation
  const [addingSubCat, setAddingSubCat] = useState<number | null>(null)
  const [newSubCatName, setNewSubCatName] = useState('')
  // Multi-select mode (long-press a card or the เลือกหลายรายการ button)
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [moveTarget, setMoveTarget] = useState<number | ''>('')
  const [moving, setMoving] = useState(false)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router = useRouter()

  const topLevelCats = categories.filter(c => !c.parentId)
  const childCats = (parentId: number) => categories.filter(c => c.parentId === parentId)

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
    fetchCategories(true)
  }

  async function addSubCategory(parentId: number) {
    if (!newSubCatName.trim()) return
    await fetch('/api/menu-categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newSubCatName.trim(), parentId }),
    })
    setAddingSubCat(null)
    setNewSubCatName('')
    fetchCategories(true)
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

  async function updateCategoryField(id: number, data: Record<string, unknown>) {
    await fetch(`/api/menu-categories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
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
    fetchCategories(true)
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
        ...(editItemCategoryId != null ? { categoryId: editItemCategoryId } : {}),
      }),
    })
    setEditingItem(null)
    fetchCategories(true)
  }

  async function toggleAvailable(item: MenuItem) {
    await fetch(`/api/menu-items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ available: !item.available }),
    })
    fetchCategories(true)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    const url = deleteTarget.type === 'category'
      ? `/api/menu-categories/${deleteTarget.id}`
      : `/api/menu-items/${deleteTarget.id}`
    await fetch(url, { method: 'DELETE' })
    setDeleteTarget(null)
    fetchCategories(true)
  }

  // ── Multi-select helpers ─────────────────────────────────────────
  function startPress(itemId: number) {
    cancelPress()
    pressTimer.current = setTimeout(() => {
      setSelecting(true)
      setSelectedIds(prev => (prev.includes(itemId) ? prev : [...prev, itemId]))
    }, 450)
  }

  function cancelPress() {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }

  function toggleSelect(itemId: number) {
    setSelectedIds(prev => (prev.includes(itemId) ? prev.filter(x => x !== itemId) : [...prev, itemId]))
  }

  function exitSelecting() {
    setSelecting(false)
    setSelectedIds([])
    setMoveTarget('')
  }

  async function moveSelected() {
    if (moveTarget === '' || selectedIds.length === 0) return
    setMoving(true)
    try {
      await Promise.all(selectedIds.map(id =>
        fetch(`/api/menu-items/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ categoryId: moveTarget }),
        }),
      ))
      exitSelecting()
      fetchCategories(true)
    } finally {
      setMoving(false)
    }
  }

  // Options for category selects: top-level first, children indented.
  function categoryOptions(excludeId?: number) {
    return topLevelCats.flatMap(o => [
      ...(o.id !== excludeId
        ? [<option key={o.id} value={o.id}>{o.name}{o.hidden ? ' (ซ่อน)' : ''}</option>]
        : []),
      ...childCats(o.id)
        .filter(ch => ch.id !== excludeId)
        .map(ch => <option key={ch.id} value={ch.id}>{'  — '}{ch.name}</option>),
    ])
  }

  // Steps a Signature category can switch off: every linked pool (and its
  // sub-pools) that actually contributes one. แป้ง pools are left out — that
  // step is spread across pools and has its own toggle.
  function hideablePools(cat: Category): Category[] {
    const seen = new Set<number>()
    return linksOf(cat)
      .flatMap(id => [id, ...childCats(id).map(c => c.id)])
      .flatMap(id => {
        if (seen.has(id)) return []
        seen.add(id)
        const pool = categories.find(c => c.id === id)
        if (!pool || isCrustCategory(pool.name)) return []
        return pool.items.some(i => !isCrust(i.name)) ? [pool] : []
      })
  }

  function togglePoolStep(cat: Category, poolId: number, show: boolean) {
    const hidden = cat.hiddenPoolCategoryIds ?? []
    updateCategoryField(cat.id, {
      hiddenPoolCategoryIds: show ? hidden.filter(id => id !== poolId) : [...hidden, poolId],
    })
  }

  function renderItemGrid(items: MenuItem[], setCat = false) {
    if (items.length === 0) return null
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px', padding: '12px' }}>
        {items.map(item => (
          editingItem === item.id ? (
            <div key={item.id} style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '8px', padding: '4px 0' }}>
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
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm)', color: 'var(--c-text-2)' }}>
                หมวดหมู่
                <select
                  className="input"
                  value={editItemCategoryId ?? item.categoryId}
                  onChange={e => setEditItemCategoryId(Number(e.target.value))}
                  style={{ width: 'auto', padding: '6px 10px' }}
                >
                  {categoryOptions()}
                </select>
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-primary btn-sm" onClick={() => updateItem(item.id)}>บันทึก</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditingItem(null)}>ยกเลิก</button>
              </div>
            </div>
          ) : (
            <div
              key={item.id}
              onPointerDown={() => !selecting && startPress(item.id)}
              onPointerUp={cancelPress}
              onPointerLeave={cancelPress}
              onPointerMove={cancelPress}
              onContextMenu={e => e.preventDefault()}
              onClick={() => selecting && toggleSelect(item.id)}
              style={{
                borderRadius: 'var(--radius-sm)',
                border: selectedIds.includes(item.id) ? '2px solid var(--c-primary)' : '1px solid var(--c-border)',
                overflow: 'hidden',
                opacity: item.available ? 1 : 0.5,
                transition: 'opacity 0.15s, border-color 0.15s',
                background: selectedIds.includes(item.id) ? 'var(--c-primary-glow)' : 'var(--c-surface)',
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0,
                position: 'relative',
                cursor: selecting ? 'pointer' : 'default',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                WebkitTouchCallout: 'none',
              } as React.CSSProperties}
            >
              {selecting && (
                <span
                  aria-hidden
                  style={{
                    position: 'absolute', top: 6, right: 6, zIndex: 2,
                    width: 22, height: 22, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.8rem', fontWeight: 700,
                    background: selectedIds.includes(item.id) ? 'var(--c-primary)' : 'var(--c-surface)',
                    color: selectedIds.includes(item.id) ? 'var(--c-on-primary)' : 'var(--c-text-3)',
                    border: '1px solid var(--c-border)',
                  }}
                >
                  ✓
                </span>
              )}
              {!item.available && (
                <span style={{ position: 'absolute', top: 6, left: 6, zIndex: 2, background: 'var(--c-danger)', color: '#fff', fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-full)' }}>
                  หมด
                </span>
              )}
              <div style={{ aspectRatio: '4 / 3', background: 'var(--c-primary-light)', overflow: 'hidden', flexShrink: 0, filter: item.available ? 'none' : 'grayscale(1)' }}>
                <ItemImage imageUrl={item.imageUrl} name={item.name} cover />
              </div>
              <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: 0 }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontWeight: 500, fontSize: '0.85rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word', lineHeight: 1.3, textDecoration: item.available ? 'none' : 'line-through', color: item.available ? 'inherit' : 'var(--c-text-3)' }}>
                    {item.name}
                  </p>
                  <p className="price-tag" style={{ fontSize: '0.95rem', marginTop: '2px', textDecoration: item.available ? 'none' : 'line-through' }}>
                    ฿{item.price.toLocaleString('th-TH')}
                    {!!item.setDiscount && item.setDiscount > 0 && (
                      <span style={{ fontSize: '0.72rem', color: 'var(--c-text-3)', textDecoration: 'line-through', marginLeft: 5, fontWeight: 400 }}>
                        ฿{(item.price + item.setDiscount).toLocaleString('th-TH')}
                      </span>
                    )}
                  </p>
                  {/* Sets show what they contain — the customer-facing name is
                      generated from it, so staff can check it at a glance. */}
                  {item.isSet && item.setComponents && item.setComponents.length > 0 && (
                    <p style={{ fontSize: '0.68rem', color: 'var(--c-text-3)', marginTop: '3px', lineHeight: 1.4 }}>
                      🎁 {setDisplayName(
                        item.setComponents.map(c => ({ name: c.item.name, price: c.item.price, quantity: c.quantity })),
                        item.name,
                      )}
                    </p>
                  )}
                </div>
                {!selecting && (
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: 'auto', paddingTop: '4px' }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => toggleAvailable(item)}
                      style={{ fontSize: '0.7rem', color: item.available ? 'var(--c-success)' : 'var(--c-danger)', padding: '3px 8px' }}
                    >
                      {item.available ? 'มีของ' : 'หมด'}
                    </button>
                    {/* In a set category the set editor IS the editor — it
                        covers name, photo and price too, so offering both
                        would be two ways to change the same fields. */}
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => (setCat || item.isSet)
                        ? openSetEditor(item)
                        : (() => { setEditingItem(item.id); setEditItemName(item.name); setEditItemPrice(String(item.price)); setEditItemImageUrl(item.imageUrl || ''); setEditItemCategoryId(item.categoryId) })()}
                      style={{ fontSize: '0.7rem', padding: '3px 8px' }}
                    >
                      แก้ไข
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: '0.7rem', color: 'var(--c-danger)', padding: '3px 8px' }}
                      onClick={() => setDeleteTarget({ type: 'item', id: item.id, name: item.name })}
                    >
                      ลบ
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        ))}
      </div>
    )
  }

  function renderAddItemRow(catId: number, label: string) {
    return addingItemCat === catId ? (
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
          <button className="btn btn-primary btn-sm" onClick={() => addItem(catId)}>เพิ่ม</button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setAddingItemCat(null); setNewItemName(''); setNewItemPrice(''); setNewItemImageUrl('') }}>ยกเลิก</button>
        </div>
      </div>
    ) : (
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => { setAddingItemCat(catId); setNewItemName(''); setNewItemPrice(''); setNewItemImageUrl('') }}
        style={{ width: 'calc(100% - 32px)', margin: '10px 16px', border: '1px dashed var(--c-border)', color: 'var(--c-text-3)' }}
      >
        + เพิ่มเมนูใน “{label}”
      </button>
    )
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
        <h1 className="page-title">จัดการเมนู</h1>
        <button
          className={`btn btn-sm ${selecting ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => (selecting ? exitSelecting() : setSelecting(true))}
        >
          {selecting ? 'เสร็จสิ้น' : 'เลือกหลายรายการ'}
        </button>
      </div>

      {selecting && (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--c-text-3)', margin: '-8px 0 12px' }}>
          แตะการ์ดเมนูเพื่อเลือก แล้วเลือกหมวดปลายทางที่แถบด้านล่าง (กดค้างที่การ์ดก็เข้าโหมดนี้ได้)
        </p>
      )}

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

      {topLevelCats.map(cat => {
        const subs = childCats(cat.id)
        const totalItems = cat.items.length + subs.reduce((s, x) => s + x.items.length, 0)
        return (
          <div key={cat.id} className="glass-panel" style={{ marginBottom: '12px', overflow: 'hidden' }}>
            {/* Category header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '14px 16px',
                borderBottom: totalItems > 0 || addingItemCat === cat.id ? '1px solid var(--c-border)' : 'none',
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
                      {totalItems} รายการ{subs.length > 0 ? ` · ${subs.length} หมวดย่อย` : ''}
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

            {/* Category options config */}
            {editingCat !== cat.id && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 16px', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--c-border)', background: 'var(--c-surface-2)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm)', color: 'var(--c-text-2)' }}>
                  ดึงตัวเลือกอัตโนมัติจาก
                  <select
                    className="input"
                    value={linksOf(cat)[0] ?? ''}
                    onChange={e => updateCategoryField(cat.id, {
                      ingredientCategoryId: e.target.value ? Number(e.target.value) : null,
                      ingredientCategoryIds: [],
                    })}
                    style={{ width: 'auto', padding: '6px 10px' }}
                  >
                    <option value="">— ไม่ใช้ —</option>
                    {categoryOptions(cat.id)}
                  </select>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm)', color: 'var(--c-text-2)' }}>
                  <input type="checkbox" checked={!!cat.hidden} onChange={e => updateCategoryField(cat.id, { hidden: e.target.checked })} />
                  ซ่อนจากลูกค้า (ใช้เป็นวัตถุดิบ)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm)', color: 'var(--c-text-2)' }}>
                  <input type="checkbox" checked={!!cat.isSetCategory}
                    onChange={e => updateCategoryField(cat.id, { isSetCategory: e.target.checked })} />
                  หมวดนี้เป็นเมนูเซ็ต
                </label>
                {/* Only meaningful for Signature categories, i.e. ones that pull
                    their options from an ingredient pool. */}
                {linksOf(cat).length > 0 && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm)', color: 'var(--c-text-2)' }}>
                    <input
                      type="checkbox"
                      checked={cat.showCrustStep !== false}
                      onChange={e => updateCategoryField(cat.id, { showCrustStep: e.target.checked })}
                    />
                    แสดงขั้นตอน &quot;เลือกแป้ง&quot;
                    <span style={{ color: 'var(--c-text-3)', fontSize: 'var(--text-xs)' }}>
                      (ปิด = เมนู Signature ในหมวดนี้ไม่ต้องเลือกแป้ง)
                    </span>
                  </label>
                )}
                {/* One toggle per remaining step. Unticking hides the step from
                    customers but keeps the pool linked, so it can come back
                    without re-configuring anything. */}
                {hideablePools(cat).map(pool => (
                  <label key={pool.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm)', color: 'var(--c-text-2)' }}>
                    <input
                      type="checkbox"
                      checked={!(cat.hiddenPoolCategoryIds ?? []).includes(pool.id)}
                      onChange={e => togglePoolStep(cat, pool.id, e.target.checked)}
                    />
                    แสดงขั้นตอน &quot;{pool.name}&quot;
                  </label>
                ))}
              </div>
            )}

            {/* Own items */}
            {renderItemGrid(cat.items, !!cat.isSetCategory)}
            {cat.isSetCategory ? (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setSetEditing({
                  categoryId: cat.id, name: '', imageUrl: '', price: '', discount: '0', parts: [],
                })}
                style={{ width: 'calc(100% - 32px)', margin: '10px 16px', border: '1px dashed var(--c-border)', color: 'var(--c-text-3)' }}
              >
                + สร้างเซ็ตใน “{cat.name}”
              </button>
            ) : renderAddItemRow(cat.id, cat.name)}

            {/* Sub-categories */}
            {subs.map(sub => (
              <div key={sub.id} style={{ borderTop: '1px solid var(--c-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: 'var(--c-surface-2)' }}>
                  {editingCat === sub.id ? (
                    <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
                      <input
                        className="input"
                        value={editCatName}
                        onChange={e => setEditCatName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && updateCategory(sub.id)}
                        autoFocus
                        style={{ padding: '6px 10px' }}
                      />
                      <button className="btn btn-primary btn-sm" onClick={() => updateCategory(sub.id)}>บันทึก</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditingCat(null)}>ยกเลิก</button>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--c-text-2)' }}>▸ {sub.name}</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--c-text-3)' }}>{sub.items.length} รายการ</span>
                      </div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: '0.7rem', padding: '3px 8px' }}
                          onClick={() => { setEditingCat(sub.id); setEditCatName(sub.name) }}
                        >
                          แก้ไข
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: '0.7rem', color: 'var(--c-danger)', padding: '3px 8px' }}
                          onClick={() => setDeleteTarget({ type: 'category', id: sub.id, name: sub.name })}
                        >
                          ลบ
                        </button>
                      </div>
                    </>
                  )}
                </div>
                {renderItemGrid(sub.items)}
                {renderAddItemRow(sub.id, sub.name)}
              </div>
            ))}

            {/* Add sub-category */}
            {addingSubCat === cat.id ? (
              <div style={{ display: 'flex', gap: '8px', padding: '0 16px 12px' }}>
                <input
                  className="input"
                  placeholder="ชื่อหมวดย่อย เช่น แยม"
                  value={newSubCatName}
                  onChange={e => setNewSubCatName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addSubCategory(cat.id)}
                  autoFocus
                  style={{ padding: '8px 12px' }}
                />
                <button className="btn btn-primary btn-sm" onClick={() => addSubCategory(cat.id)}>เพิ่ม</button>
                <button className="btn btn-ghost btn-sm" onClick={() => { setAddingSubCat(null); setNewSubCatName('') }}>ยกเลิก</button>
              </div>
            ) : (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => { setAddingSubCat(cat.id); setNewSubCatName('') }}
                style={{ width: 'calc(100% - 32px)', margin: '0 16px 12px', border: '1px dashed var(--c-primary-light)', color: 'var(--c-primary)' }}
              >
                + เพิ่มหมวดย่อย
              </button>
            )}
          </div>
        )
      })}

      {categories.length === 0 && (
        <div className="glass-panel" style={{ padding: '48px 24px', textAlign: 'center' }}>
          <p style={{ color: 'var(--c-text-3)', fontSize: '0.88rem' }}>
            ยังไม่มีหมวดหมู่ เพิ่มหมวดหมู่แรกด้านบน
          </p>
        </div>
      )}

      {/* Multi-select action bar */}
      {selecting && (
        <div
          style={{
            position: 'fixed', bottom: '64px', left: '50%', transform: 'translateX(-50%)',
            width: 'calc(100% - 32px)', maxWidth: '568px', zIndex: 200,
            background: 'var(--c-surface)', border: '1px solid var(--c-border)',
            borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)',
            padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, flexShrink: 0 }}>
            เลือกแล้ว {selectedIds.length}
          </span>
          <select
            className="input"
            value={moveTarget}
            onChange={e => setMoveTarget(e.target.value ? Number(e.target.value) : '')}
            style={{ flex: 1, minWidth: '120px', padding: '7px 10px' }}
          >
            <option value="">ย้ายไปหมวด…</option>
            {categoryOptions()}
          </select>
          <button
            className="btn btn-primary btn-sm"
            onClick={moveSelected}
            disabled={moving || moveTarget === '' || selectedIds.length === 0}
          >
            {moving ? 'กำลังย้าย…' : 'ย้าย'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={exitSelecting}>✕</button>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="ยืนยันการลบ"
        message={`ต้องการลบ "${deleteTarget?.name}" ใช่หรือไม่?${deleteTarget?.type === 'category' ? ' เมนูทั้งหมดในหมวดหมู่นี้จะถูกลบด้วย (หมวดย่อยจะถูกย้ายขึ้นเป็นหมวดหลักแทน)' : ''}`}
        confirmText="ลบ"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        isDanger
      />

      {setEditing && (
        <SetEditor
          item={setEditing}
          // Hidden ingredient categories included on purpose: a set is often
          // exactly a crust plus a few fillings, which live in those pools.
          categories={categories.map(c => ({
            id: c.id,
            name: c.name,
            items: c.items.map(i => ({ id: i.id, name: i.name, price: i.price, isSet: i.isSet })),
          })).filter(c => c.items.length > 0)}
          onClose={() => setSetEditing(null)}
          onSaved={() => fetchCategories(true)}
        />
      )}

    </div>
    </PosShell>
  )
}
