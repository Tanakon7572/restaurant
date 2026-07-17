import type { PrismaClient } from '@prisma/client'
import { randomUUID } from 'crypto'

export function newSessionToken(): string {
  return randomUUID().replace(/-/g, '')
}

/**
 * Kill the ordering link once its work is done: if every order created from
 * this session is completed or cancelled, deactivate the session so the QR
 * URL stops working.
 */
export async function deactivateSessionIfFinished(prisma: PrismaClient, sessionToken: string | null | undefined) {
  if (!sessionToken) return
  const open = await prisma.order.count({
    where: { sessionToken, status: { in: ['awaiting', 'pending', 'preparing'] } },
  })
  if (open === 0) {
    await prisma.tableSession.updateMany({ where: { token: sessionToken }, data: { active: false } })
  }
}
