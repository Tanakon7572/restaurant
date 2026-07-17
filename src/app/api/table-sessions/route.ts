import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { newSessionToken } from '@/lib/tableSession'

// Active ordering links, newest first.
export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sessions = await prisma.tableSession.findMany({
    where: { active: true },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(sessions, { headers: { 'Cache-Control': 'no-store' } })
}

// Open a table: mint a fresh random link and retire any previous link
// for the same table.
export async function POST(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { tableNumber } = await request.json()
    if (!tableNumber || !String(tableNumber).trim()) {
      return NextResponse.json({ error: 'ต้องระบุเลขโต๊ะ' }, { status: 400 })
    }
    const table = String(tableNumber).trim()
    await prisma.tableSession.updateMany({ where: { tableNumber: table, active: true }, data: { active: false } })
    const session = await prisma.tableSession.create({
      data: { token: newSessionToken(), tableNumber: table },
    })
    return NextResponse.json(session, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to create session', detail: String(err) }, { status: 500 })
  }
}

// Manually close a link.
export async function PATCH(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { token } = await request.json()
    if (!token) return NextResponse.json({ error: 'ต้องระบุ token' }, { status: 400 })
    await prisma.tableSession.updateMany({ where: { token }, data: { active: false } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: 'Failed', detail: String(err) }, { status: 500 })
  }
}
