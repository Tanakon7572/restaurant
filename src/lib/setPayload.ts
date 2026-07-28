import type { PrismaClient } from '@prisma/client'

export type SetPartInput = { itemId: number; quantity: number }

export type ParsedSet = {
  name: string
  imageUrl: string | null
  price: number
  discount: number
  parts: SetPartInput[]
}

export const SET_INCLUDE = {
  setComponents: {
    orderBy: { order: 'asc' as const },
    select: { itemId: true, quantity: true, item: { select: { name: true, price: true } } },
  },
}

/**
 * Read a set out of a request body, coercing everything the form can send.
 *
 * `price` is what the customer is charged, so it is stored already discounted
 * — one number to charge from, no arithmetic at checkout that could disagree
 * with what was shown. The discount rides along only so the menu can show the
 * struck-through original.
 */
export function parseSetBody(body: Record<string, unknown>): ParsedSet | { error: string } {
  const rawParts = Array.isArray(body.parts) ? (body.parts as Record<string, unknown>[]) : []
  const parts = rawParts
    .map(p => ({
      itemId: Number(p.itemId),
      quantity: Math.max(1, Math.floor(Number(p.quantity) || 1)),
    }))
    .filter(p => Number.isInteger(p.itemId))

  const price = Number(body.price)
  if (!isFinite(price) || price < 0) return { error: 'ราคาไม่ถูกต้อง' }

  const discount = Math.max(0, Number(body.discount) || 0)

  return {
    name: String(body.name ?? '').trim(),
    imageUrl: String(body.imageUrl ?? '').trim() || null,
    price,
    discount,
    parts,
  }
}

/**
 * Reject parts that can't legally be in a set: ones that no longer exist, and
 * other sets. Nesting would make both the price and the generated name
 * recursive, so it's refused rather than flattened.
 */
export async function checkParts(
  prisma: PrismaClient,
  parts: SetPartInput[],
  selfId?: number,
): Promise<string | null> {
  if (parts.length === 0) return null
  if (selfId != null && parts.some(p => p.itemId === selfId)) {
    return 'เซ็ตใส่ตัวเองเป็นส่วนประกอบไม่ได้'
  }
  const found = await prisma.menuItem.findMany({
    where: { id: { in: parts.map(p => p.itemId) } },
    select: { id: true, name: true, isSet: true },
  })
  const ids = new Set(found.map(f => f.id))
  if (parts.some(p => !ids.has(p.itemId))) return 'มีรายการที่ไม่มีอยู่ในเมนูแล้ว'
  const nested = found.find(f => f.isSet)
  return nested ? `"${nested.name}" เป็นเซ็ตอยู่แล้ว ใส่ซ้อนกันไม่ได้` : null
}
