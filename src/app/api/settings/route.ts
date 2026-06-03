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
    })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch settings', detail: String(err) }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { shopName, currentPassword, newPassword } = await request.json()

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
    const data: Record<string, string> = {}
    if (shopName !== undefined) data.shopName = shopName.trim()
    if (newPassword !== undefined) data.adminPassword = newPassword.trim()

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
