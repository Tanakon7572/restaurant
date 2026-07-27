import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { loadShopSettings } from '@/lib/shopSettings'
import { computeBill, changeFor, isPaymentMethod } from '@/lib/billing'
import { bangkokDayStart } from '@/lib/orderNumber'
import { BILL_INCLUDE } from '@/lib/billQuery'

// Bills for one Bangkok day (defaults to today). Voided ones are included so
// the day's list matches what was actually rung up.
export async function GET(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')
    const anchor = date ? new Date(`${date}T12:00:00+07:00`) : new Date()
    const start = bangkokDayStart(anchor)
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)

    const bills = await prisma.bill.findMany({
      where: { createdAt: { gte: start, lt: end } },
      orderBy: { createdAt: 'desc' },
      include: BILL_INCLUDE,
    })
    return NextResponse.json(bills)
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch bills', detail: String(err) }, { status: 500 })
  }
}

/**
 * Close out a set of orders with one payment. The server re-reads the orders
 * and re-computes every figure — the client's numbers are only ever a preview,
 * so a stale checkout screen can't undercharge.
 */
export async function POST(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const orderIds: number[] = Array.isArray(body.orderIds) ? body.orderIds.map(Number) : []
    if (orderIds.length === 0) {
      return NextResponse.json({ error: 'ต้องเลือกออเดอร์อย่างน้อย 1 รายการ' }, { status: 400 })
    }
    if (!isPaymentMethod(body.method)) {
      return NextResponse.json({ error: 'วิธีชำระเงินไม่ถูกต้อง' }, { status: 400 })
    }

    const orders = await prisma.order.findMany({ where: { id: { in: orderIds } } })
    if (orders.length !== orderIds.length) {
      return NextResponse.json({ error: 'ไม่พบออเดอร์บางรายการ' }, { status: 404 })
    }
    const alreadyPaid = orders.filter(o => o.billId !== null)
    if (alreadyPaid.length > 0) {
      return NextResponse.json(
        { error: `ออเดอร์ #${alreadyPaid[0].id} ถูกชำระเงินไปแล้ว` }, { status: 409 })
    }
    const cancelled = orders.filter(o => o.status === 'cancelled')
    if (cancelled.length > 0) {
      return NextResponse.json({ error: 'มีออเดอร์ที่ยกเลิกแล้วอยู่ในบิล' }, { status: 400 })
    }

    const settings = await loadShopSettings(prisma)
    const subtotal = orders.reduce((s, o) => s + o.totalPrice, 0)
    const totals = computeBill({ subtotal, discount: Number(body.discount) || 0 }, settings)

    // Cash must cover the bill; anything else is settled outside the till.
    let received: number | null = null
    let changeDue: number | null = null
    if (body.method === 'cash') {
      received = Number(body.received)
      if (!isFinite(received)) {
        return NextResponse.json({ error: 'กรุณากรอกจำนวนเงินที่รับมา' }, { status: 400 })
      }
      changeDue = changeFor(totals.total, received)
      if (changeDue < 0) {
        return NextResponse.json({ error: 'เงินที่รับมาน้อยกว่ายอดที่ต้องชำระ' }, { status: 400 })
      }
    }

    // One table per bill: take it from the orders so the receipt shows it even
    // when the checkout screen didn't send one.
    const tableNumber = orders.find(o => o.tableNumber)?.tableNumber ?? null

    const bill = await prisma.$transaction(async tx => {
      const created = await tx.bill.create({
        data: {
          tableNumber,
          subtotal: totals.subtotal,
          discount: totals.discount,
          discountNote: body.discountNote?.trim() || null,
          serviceCharge: totals.serviceCharge,
          vat: totals.vat,
          total: totals.total,
          method: body.method,
          received,
          changeDue,
          note: body.note?.trim() || null,
        },
      })
      // Paying also finishes the order — a bill can't be settled for food the
      // kitchen never sent out.
      await tx.order.updateMany({
        where: { id: { in: orderIds } },
        data: { billId: created.id, status: 'completed' },
      })
      return created
    })

    // The table is now free: bump its reset stamp so the next QR scan on a
    // shared device starts a fresh customer session.
    if (tableNumber) {
      const now = new Date()
      await prisma.tableReset.upsert({
        where: { tableNumber },
        create: { tableNumber, resetAt: now },
        update: { resetAt: now },
      })
      await prisma.tableSession.updateMany({ where: { tableNumber }, data: { active: false } })
    }

    // Re-read with the orders attached: this response is what gets printed.
    const full = await prisma.bill.findUniqueOrThrow({ where: { id: bill.id }, include: BILL_INCLUDE })
    return NextResponse.json(full, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to create bill', detail: String(err) }, { status: 500 })
  }
}
