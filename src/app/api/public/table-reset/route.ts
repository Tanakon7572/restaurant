import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Returns the latest "close table" timestamp for a table, so the customer page
// can detect a new seating and reset its local session.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const table = searchParams.get('table')
    if (!table) return NextResponse.json({ resetAt: null })
    const row = await prisma.tableReset.findUnique({ where: { tableNumber: table } })
    return NextResponse.json({ resetAt: row?.resetAt ?? null }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    return NextResponse.json({ error: 'Failed', detail: String(err) }, { status: 500 })
  }
}
