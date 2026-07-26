import type { PrismaClient } from '@prisma/client'
import type { BillSettings, VatMode } from './billing'

export type ShopSettings = BillSettings & {
  shopName: string
  promptPayId: string
  receiptHeader: string
  receiptFooter: string
  receiptWidth: number
}

export const DEFAULT_SHOP_SETTINGS: ShopSettings = {
  shopName: 'ร้านอาหาร',
  vatMode: 'none',
  vatRate: 7,
  serviceChargeRate: 0,
  promptPayId: '',
  receiptHeader: '',
  receiptFooter: '',
  receiptWidth: 58,
}

// The single AppSettings row, with every field defaulted. Bills are priced
// from this, so a missing row must never mean "crash mid-checkout".
export async function loadShopSettings(prisma: PrismaClient): Promise<ShopSettings> {
  const row = await prisma.appSettings.findFirst()
  if (!row) return DEFAULT_SHOP_SETTINGS
  return {
    shopName: row.shopName ?? DEFAULT_SHOP_SETTINGS.shopName,
    vatMode: (row.vatMode as VatMode) ?? 'none',
    vatRate: row.vatRate ?? 7,
    serviceChargeRate: row.serviceChargeRate ?? 0,
    promptPayId: row.promptPayId ?? '',
    receiptHeader: row.receiptHeader ?? '',
    receiptFooter: row.receiptFooter ?? '',
    receiptWidth: row.receiptWidth ?? 58,
  }
}
