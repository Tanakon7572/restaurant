import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await request.json()
  const data: Record<string, unknown> = {}
  if (body.name !== undefined) data.name = String(body.name).trim()
  if (body.priceDelta !== undefined) data.priceDelta = Number(body.priceDelta) || 0
  if (body.available !== undefined) data.available = !!body.available
  if (body.order !== undefined) data.order = Number(body.order) || 0
  const choice = await prisma.optionChoice.update({ where: { id: Number(id) }, data })
  return NextResponse.json(choice)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await prisma.optionChoice.delete({ where: { id: Number(id) } })
  return NextResponse.json({ ok: true })
}
