import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    const data = await request.json()
    const category = await prisma.menuCategory.update({
      where: { id: parseInt(id) },
      data,
    })
    return NextResponse.json(category)
  } catch (err) {
    return NextResponse.json({ error: 'Failed to update category', detail: String(err) }, { status: 500 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    // Deleting a parent promotes its sub-categories to top level so their
    // items are not cascaded away silently.
    await prisma.menuCategory.updateMany({ where: { parentId: parseInt(id) }, data: { parentId: null } })
    await prisma.menuCategory.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to delete category', detail: String(err) }, { status: 500 })
  }
}
