import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

const prismaClientSingleton = () => {
  // ใช้ DIRECT_URL สำหรับ Prisma เพื่อหลีกเลี่ยง double pooling กับ pgbouncer
  const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL
  const pool = new Pool({
    connectionString,
    // pgbouncer จัดการ pool อยู่แล้ว จึงเปิด connection น้อยๆ ก็พอ
    max: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    // อย่าให้ pool หยุดเองเพราะจะทำให้ hot-reload สร้างใหม่ทุกครั้ง
    allowExitOnIdle: false,
    ssl: { rejectUnauthorized: false },
  })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })
}

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>
}

export const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma
