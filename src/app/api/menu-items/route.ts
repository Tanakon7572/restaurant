import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

export async function GET() {
  try {
    const items = await prisma.menuItem.findMany({
      orderBy: { order: 'asc' },
      include: {
        category: true,
        setComponents: {
          orderBy: { order: 'asc' },
          select: { itemId: true, quantity: true, item: { select: { name: true, price: true } } },
        },
      },
    })
    return NextResponse.json(items)
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch items', detail: String(err) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { name, price, categoryId, imageUrl } = await request.json()
    if (!name?.trim()) {
      return NextResponse.json({ error: 'ชื่อเมนูห้ามว่าง' }, { status: 400 })
    }
    if (price == null || price < 0) {
      return NextResponse.json({ error: 'ราคาไม่ถูกต้อง' }, { status: 400 })
    }
    const maxOrder = await prisma.menuItem.aggregate({
      where: { categoryId },
      _max: { order: true },
    })
    const item = await prisma.menuItem.create({
      data: {
        name: name.trim(),
        price: parseFloat(price),
        categoryId: parseInt(categoryId),
        order: (maxOrder._max.order ?? -1) + 1,
        imageUrl: imageUrl?.trim() || null,
      },
      include: { category: true },
    })
    return NextResponse.json(item, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to create item', detail: String(err) }, { status: 500 })
  }
}
