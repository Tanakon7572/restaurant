import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

/**
 * Delete all orders created within [from, to] (ISO timestamps supplied by the
 * client so day boundaries follow the device's local timezone).
 */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { from, to } = await request.json() as { from?: string; to?: string }
    const gte = from ? new Date(from) : null
    const lte = to ? new Date(to) : null
    if (!gte || !lte || isNaN(gte.getTime()) || isNaN(lte.getTime()) || gte > lte) {
      return NextResponse.json({ error: 'ช่วงเวลาไม่ถูกต้อง' }, { status: 400 })
    }

    const result = await prisma.order.deleteMany({
      where: { createdAt: { gte, lte } },
    })
    return NextResponse.json({ deleted: result.count })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to clear orders', detail: String(err) }, { status: 500 })
  }
}
