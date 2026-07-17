import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Resolve an ordering link token → table number + validity.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')
    if (!token) return NextResponse.json({ valid: false }, { headers: { 'Cache-Control': 'no-store' } })
    const session = await prisma.tableSession.findUnique({ where: { token } })
    if (!session || !session.active) {
      return NextResponse.json({ valid: false }, { headers: { 'Cache-Control': 'no-store' } })
    }
    return NextResponse.json(
      { valid: true, tableNumber: session.tableNumber },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (err) {
    return NextResponse.json({ error: 'Failed', detail: String(err) }, { status: 500 })
  }
}
