import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, checkPassword } from '@/lib/session'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const settings = await prisma.appSettings.findFirst()
    return NextResponse.json({
      shopName: settings?.shopName ?? 'ร้านอาหาร',
      hasDbPassword: !!settings?.adminPassword,
      vatMode: settings?.vatMode ?? 'none',
      vatRate: settings?.vatRate ?? 7,
      serviceChargeRate: settings?.serviceChargeRate ?? 0,
      promptPayId: settings?.promptPayId ?? '',
      paymentQrUrl: settings?.paymentQrUrl ?? '',
      receiptHeader: settings?.receiptHeader ?? '',
      receiptFooter: settings?.receiptFooter ?? '',
      receiptWidth: settings?.receiptWidth ?? 58,
      logoUrl: settings?.logoUrl ?? '',
    })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch settings', detail: String(err) }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const { shopName, currentPassword, newPassword } = body

    if (newPassword !== undefined) {
      if (!currentPassword) {
        return NextResponse.json({ error: 'กรุณากรอกรหัสผ่านปัจจุบัน' }, { status: 400 })
      }
      const valid = await checkPassword(currentPassword)
      if (!valid) {
        return NextResponse.json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' }, { status: 400 })
      }
      if (!newPassword?.trim()) {
        return NextResponse.json({ error: 'รหัสผ่านใหม่ห้ามว่าง' }, { status: 400 })
      }
    }

    const existing = await prisma.appSettings.findFirst()
    const data: Record<string, string | number> = {}
    if (shopName !== undefined) data.shopName = shopName.trim()
    if (newPassword !== undefined) data.adminPassword = newPassword.trim()

    // Receipt / tax configuration. Rates are clamped here rather than trusted
    // from the form, since every bill is priced off them.
    if (body.vatMode !== undefined) {
      if (!['none', 'included', 'added'].includes(body.vatMode)) {
        return NextResponse.json({ error: 'รูปแบบ VAT ไม่ถูกต้อง' }, { status: 400 })
      }
      data.vatMode = body.vatMode
    }
    if (body.vatRate !== undefined) data.vatRate = Math.min(100, Math.max(0, Number(body.vatRate) || 0))
    if (body.serviceChargeRate !== undefined) {
      data.serviceChargeRate = Math.min(100, Math.max(0, Number(body.serviceChargeRate) || 0))
    }
    if (body.promptPayId !== undefined) data.promptPayId = String(body.promptPayId).trim()
    if (body.paymentQrUrl !== undefined) data.paymentQrUrl = String(body.paymentQrUrl).trim()
    if (body.receiptHeader !== undefined) data.receiptHeader = String(body.receiptHeader).trim()
    if (body.receiptFooter !== undefined) data.receiptFooter = String(body.receiptFooter).trim()
    if (body.receiptWidth !== undefined) data.receiptWidth = Number(body.receiptWidth) === 80 ? 80 : 58
    if (body.logoUrl !== undefined) data.logoUrl = String(body.logoUrl)

    if (existing) {
      await prisma.appSettings.update({ where: { id: existing.id }, data })
    } else {
      await prisma.appSettings.create({ data: { shopName: shopName ?? 'ร้านอาหาร', ...data } })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to update settings', detail: String(err) }, { status: 500 })
  }
}
