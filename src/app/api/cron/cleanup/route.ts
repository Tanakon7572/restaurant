import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { sweepExpiredOrders, RETENTION_DAYS } from '@/lib/retention'

/**
 * Scheduled cleanup (vercel.json cron): deletes orders older than the
 * retention window. Accepts either the Vercel cron bearer token
 * (CRON_SECRET) or an authenticated admin session for manual runs.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const bearerOk = !!secret && request.headers.get('authorization') === `Bearer ${secret}`
  if (!bearerOk) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const deleted = await sweepExpiredOrders(prisma)
    return NextResponse.json({ deleted, retentionDays: RETENTION_DAYS })
  } catch (err) {
    return NextResponse.json({ error: 'Cleanup failed', detail: String(err) }, { status: 500 })
  }
}
