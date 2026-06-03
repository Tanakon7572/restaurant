import { NextResponse } from 'next/server'
import { checkPassword, createSession } from '@/lib/session'
import { cookies } from 'next/headers'

export async function POST(request: Request) {
  try {
    const { password } = await request.json()
    const valid = await checkPassword(password)
    if (!valid) {
      return NextResponse.json({ error: 'รหัสผ่านไม่ถูกต้อง' }, { status: 401 })
    }
    const token = await createSession()
    const cookieStore = await cookies()
    cookieStore.set('food-order-session', token, {
      httpOnly: true,
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
      sameSite: 'lax',
    })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}

export async function DELETE() {
  const cookieStore = await cookies()
  cookieStore.delete('food-order-session')
  return NextResponse.json({ success: true })
}
