import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { BILL_INCLUDE, withBillDailyNumbersOne } from '@/lib/billQuery'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    const bill = await prisma.bill.findUnique({ where: { id: parseInt(id) }, include: BILL_INCLUDE })
    if (!bill) return NextResponse.json({ error: 'ไม่พบบิล' }, { status: 404 })
    return NextResponse.json(await withBillDailyNumbersOne(prisma, bill))
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch bill', detail: String(err) }, { status: 500 })
  }
}

/**
 * Void a bill: the orders go back to being unpaid so they can be rung up
 * again, but the row itself stays. A till that can silently delete takings
 * is a till nobody can reconcile.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    const billId = parseInt(id)
    const bill = await prisma.bill.findUnique({ where: { id: billId } })
    if (!bill) return NextResponse.json({ error: 'ไม่พบบิล' }, { status: 404 })
    if (bill.voidedAt) return NextResponse.json({ error: 'บิลนี้ถูกยกเลิกไปแล้ว' }, { status: 409 })

    let reason = ''
    try {
      reason = String((await request.json())?.reason ?? '').trim()
    } catch {
      // No body sent — voiding without a stated reason is allowed.
    }

    await prisma.$transaction([
      prisma.order.updateMany({ where: { billId }, data: { billId: null } }),
      prisma.bill.update({
        where: { id: billId },
        data: { voidedAt: new Date(), voidReason: reason || null },
      }),
    ])
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to void bill', detail: String(err) }, { status: 500 })
  }
}
