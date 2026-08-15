import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

/**
 * How many customer requests are waiting for a yes.
 *
 * Deliberately separate from `GET /api/orders?status=…`, which returns every
 * matching order with its items joined. Every till polls this every fifteen
 * seconds all through service, so it has to stay a single COUNT.
 */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const awaiting = await prisma.order.count({ where: { status: 'awaiting' } })
    return NextResponse.json({ awaiting })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to count incoming orders', detail: String(err) },
      { status: 500 },
    )
  }
}
