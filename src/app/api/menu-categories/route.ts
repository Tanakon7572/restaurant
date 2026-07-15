import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

export async function GET() {
  try {
    const categories = await prisma.menuCategory.findMany({
      orderBy: { order: 'asc' },
      include: { items: { orderBy: { order: 'asc' } } },
    })
    return NextResponse.json(categories)
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch categories', detail: String(err) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { name, parentId } = await request.json()
    if (!name?.trim()) {
      return NextResponse.json({ error: 'ชื่อหมวดหมู่ห้ามว่าง' }, { status: 400 })
    }
    const maxOrder = await prisma.menuCategory.aggregate({ _max: { order: true } })
    const category = await prisma.menuCategory.create({
      data: {
        name: name.trim(),
        order: (maxOrder._max.order ?? -1) + 1,
        parentId: parentId ? parseInt(parentId) : null,
      },
    })
    return NextResponse.json(category, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to create category', detail: String(err) }, { status: 500 })
  }
}
