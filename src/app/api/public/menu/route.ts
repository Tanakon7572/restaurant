import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const categories = await prisma.menuCategory.findMany({
      orderBy: { order: 'asc' },
      include: {
        items: {
          where: { available: true },
          orderBy: { order: 'asc' },
          select: { id: true, name: true, price: true, imageUrl: true },
        },
      },
    })
    return NextResponse.json(categories.filter(c => c.items.length > 0))
  } catch {
    return NextResponse.json({ error: 'Failed to fetch menu' }, { status: 500 })
  }
}
