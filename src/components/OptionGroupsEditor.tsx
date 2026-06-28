'use client'

import { useEffect, useState } from 'react'
import type { OptionGroupDTO, OptionChoiceDTO } from '@/lib/types'

type Group = OptionGroupDTO

export default function OptionGroupsEditor({ menuItemId }: { menuItemId: number }) {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  async function load() {
    const res = await fetch(`/api/option-groups?menuItemId=${menuItemId}`)
    if (res.ok) setGroups(await res.json())
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [menuItemId])

  async function addGroup() {
    setBusy(true)
    await fetch('/api/option-groups', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ menuItemId, name: 'กลุ่มตัวเลือกใหม่', required: false, minSelect: 0, maxSelect: 1, order: groups.length }),
    })
    await load(); setBusy(false)
  }

  async function patchGroup(id: number, data: Partial<Group>) {
    await fetch(`/api/option-groups/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    })
    await load()
  }

  async function deleteGroup(id: number) {
    if (!confirm('ลบกลุ่มตัวเลือกนี้และตัวเลือกทั้งหมดในกลุ่ม?')) return
    await fetch(`/api/option-groups/${id}`, { method: 'DELETE' })
    await load()
  }

  async function addChoice(groupId: number, count: number) {
    await fetch('/api/option-choices', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId, name: 'ตัวเลือกใหม่', priceDelta: 0, order: count }),
    })
    await load()
  }

  async function patchChoice(id: number, data: Partial<OptionChoiceDTO>) {
    await fetch(`/api/option-choices/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    })
    await load()
  }

  async function deleteChoice(id: number) {
    await fetch(`/api/option-choices/${id}`, { method: 'DELETE' })
    await load()
  }

  if (loading) return <p style={{ fontSize: 'var(--text-sm)', color: 'var(--c-text-3)', padding: '8px 0' }}>กำลังโหลดตัวเลือก…</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '8px 0 4px' }}>
      {groups.map(g => (
        <div key={g.id} className="glass-panel" style={{ padding: 12, background: 'var(--c-surface-2)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input className="input" defaultValue={g.name} onBlur={e => { if (e.target.value !== g.name) patchGroup(g.id, { name: e.target.value }) }} style={{ flex: 1, padding: '8px 10px' }} />
            <button className="btn btn-ghost btn-xs" onClick={() => deleteGroup(g.id)}>ลบกลุ่ม</button>
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', margin: '8px 0' }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 'var(--text-sm)' }}>
              <input type="checkbox" checked={g.required} onChange={e => patchGroup(g.id, { required: e.target.checked })} />
              ต้องระบุ
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 'var(--text-sm)' }}>
              เลือกสูงสุด
              <input className="input" type="number" min={1} defaultValue={g.maxSelect}
                onBlur={e => { const v = Math.max(1, Number(e.target.value) || 1); if (v !== g.maxSelect) patchGroup(g.id, { maxSelect: v }) }}
                style={{ width: 64, padding: '6px 8px' }} />
              ข้อ
            </label>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--c-text-3)' }}>
              {g.maxSelect === 1 ? 'เลือกเดียว (radio)' : 'เลือกหลายข้อ (checkbox)'}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {g.choices.map(c => (
              <div key={c.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input className="input" defaultValue={c.name} onBlur={e => { if (e.target.value !== c.name) patchChoice(c.id, { name: e.target.value }) }} style={{ flex: 1, padding: '7px 10px' }} />
                <div style={{ position: 'relative', flex: '0 0 92px' }}>
                  <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--c-text-3)', fontSize: 'var(--text-sm)' }}>+฿</span>
                  <input className="input" type="number" defaultValue={c.priceDelta}
                    onBlur={e => { const v = Number(e.target.value) || 0; if (v !== c.priceDelta) patchChoice(c.id, { priceDelta: v }) }}
                    style={{ padding: '7px 8px 7px 26px' }} />
                </div>
                <button className="btn btn-ghost btn-xs" onClick={() => patchChoice(c.id, { available: !c.available })} title="พร้อม/หมด"
                  style={{ color: c.available ? 'var(--c-success)' : 'var(--c-text-3)' }}>
                  {c.available ? 'พร้อม' : 'หมด'}
                </button>
                <button className="btn btn-ghost btn-xs" onClick={() => deleteChoice(c.id)} aria-label="ลบตัวเลือก">✕</button>
              </div>
            ))}
            <button className="btn btn-soft btn-xs" onClick={() => addChoice(g.id, g.choices.length)} style={{ alignSelf: 'flex-start' }}>+ เพิ่มตัวเลือก</button>
          </div>
        </div>
      ))}
      <button className="btn btn-ghost btn-sm" onClick={addGroup} disabled={busy} style={{ alignSelf: 'flex-start' }}>+ เพิ่มกลุ่มตัวเลือก</button>
    </div>
  )
}
