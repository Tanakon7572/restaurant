import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    const data = await request.json()
    if (data.price != null) data.price = parseFloat(data.price)
    if (data.categoryId != null) data.categoryId = parseInt(data.categoryId)
    const item = await prisma.menuItem.update({
      where: { id: parseInt(id) },
      data,
      include: { category: true },
    })
    return NextResponse.json(item)
  } catch (err) {
    return NextResponse.json({ error: 'Failed to update item', detail: String(err) }, { status: 500 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    await prisma.menuItem.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to delete item', detail: String(err) }, { status: 500 })
  }
}
