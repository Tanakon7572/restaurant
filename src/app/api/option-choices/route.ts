import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

export async function POST(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { groupId, name, priceDelta, order } = await request.json()
  if (!groupId || !name?.trim())
    return NextResponse.json({ error: 'ต้องระบุกลุ่มและชื่อตัวเลือก' }, { status: 400 })
  const choice = await prisma.optionChoice.create({
    data: {
      groupId: Number(groupId),
      name: name.trim(),
      priceDelta: Number(priceDelta) || 0,
      order: Number(order) || 0,
    },
  })
  return NextResponse.json(choice, { status: 201 })
}
