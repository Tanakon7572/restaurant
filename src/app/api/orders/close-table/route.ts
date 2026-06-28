import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

// Staff closes a table → bumps the table's reset timestamp so the next QR scan
// on a shared device starts a fresh customer session.
export async function POST(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { tableNumber } = await request.json()
  if (!tableNumber) return NextResponse.json({ error: 'ต้องระบุเลขโต๊ะ' }, { status: 400 })
  const now = new Date()
  const row = await prisma.tableReset.upsert({
    where: { tableNumber: String(tableNumber) },
    create: { tableNumber: String(tableNumber), resetAt: now },
    update: { resetAt: now },
  })
  return NextResponse.json({ ok: true, resetAt: row.resetAt })
}
