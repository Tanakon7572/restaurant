import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

export async function GET(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const menuItemId = Number(searchParams.get('menuItemId'))
  if (!menuItemId) return NextResponse.json({ error: 'ต้องระบุ menuItemId' }, { status: 400 })
  const groups = await prisma.optionGroup.findMany({
    where: { menuItemId },
    orderBy: { order: 'asc' },
    include: { choices: { orderBy: { order: 'asc' } } },
  })
  return NextResponse.json(groups)
}

export async function POST(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { menuItemId, name, required, minSelect, maxSelect, order } = await request.json()
  if (!menuItemId || !name?.trim())
    return NextResponse.json({ error: 'ต้องระบุเมนูและชื่อกลุ่มตัวเลือก' }, { status: 400 })
  const group = await prisma.optionGroup.create({
    data: {
      menuItemId: Number(menuItemId),
      name: name.trim(),
      required: !!required,
      minSelect: Number(minSelect) || 0,
      maxSelect: Math.max(1, Number(maxSelect) || 1),
      order: Number(order) || 0,
    },
    include: { choices: { orderBy: { order: 'asc' } } },
  })
  return NextResponse.json(group, { status: 201 })
}
