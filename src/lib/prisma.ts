import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

const prismaClientSingleton = () => {
  // ใช้ DIRECT_URL สำหรับ Prisma เพื่อหลีกเลี่ยง double pooling กับ pgbouncer
  const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL

  // Supabase requires TLS; a Postgres running on this machine has none, and
  // forcing it there fails the connection outright ("server does not support
  // SSL connections"). Anything not on loopback still gets TLS.
  const isLoopback = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(connectionString ?? '')

  const pool = new Pool({
    connectionString,
    // pgbouncer จัดการ pool อยู่แล้ว จึงเปิด connection น้อยๆ ก็พอ
    max: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    // อย่าให้ pool หยุดเองเพราะจะทำให้ hot-reload สร้างใหม่ทุกครั้ง
    allowExitOnIdle: false,
    ssl: isLoopback ? undefined : { rejectUnauthorized: false },
  })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })
}

/**
 * Which connection the server actually resolved, with the password removed.
 *
 * Environment variables on Vercel can be marked Sensitive, which makes them
 * unreadable after they are set. When one of them is wrong there is no way to
 * look — so the server reports the host and user it ended up with, and a
 * connection failure stops being a guessing game. Never include the password.
 */
export function connectionSummary(): {
  source: 'DATABASE_URL' | 'DIRECT_URL' | 'none'
  user: string
  host: string
} {
  const fromDatabaseUrl = !!process.env.DATABASE_URL
  const raw = process.env.DATABASE_URL || process.env.DIRECT_URL
  if (!raw) return { source: 'none', user: '-', host: '-' }
  try {
    const u = new URL(raw)
    return {
      source: fromDatabaseUrl ? 'DATABASE_URL' : 'DIRECT_URL',
      user: decodeURIComponent(u.username) || '(ไม่ระบุ)',
      host: `${u.hostname}:${u.port || '5432'}`,
    }
  } catch {
    return { source: fromDatabaseUrl ? 'DATABASE_URL' : 'DIRECT_URL', user: '(อ่านไม่ออก)', host: '(อ่านไม่ออก)' }
  }
}

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>
}

export const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma
