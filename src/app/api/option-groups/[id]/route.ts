import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await request.json()
  const data: Record<string, unknown> = {}
  if (body.name !== undefined) data.name = String(body.name).trim()
  if (body.required !== undefined) data.required = !!body.required
  if (body.minSelect !== undefined) data.minSelect = Number(body.minSelect) || 0
  if (body.maxSelect !== undefined) data.maxSelect = Math.max(1, Number(body.maxSelect) || 1)
  if (body.order !== undefined) data.order = Number(body.order) || 0
  const group = await prisma.optionGroup.update({
    where: { id: Number(id) }, data,
    include: { choices: { orderBy: { order: 'asc' } } },
  })
  return NextResponse.json(group)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await prisma.optionGroup.delete({ where: { id: Number(id) } })
  return NextResponse.json({ ok: true })
}
