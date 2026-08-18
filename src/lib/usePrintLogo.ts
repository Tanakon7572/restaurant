'use client'

import { useEffect, useState } from 'react'
import { logoForPrinting } from './slipLogo'

/**
 * The printable logo, ready before anyone presses print.
 *
 * Converting it takes a canvas and an image load, and the moment a slip is
 * wanted is the worst moment to start: a cashier is holding a customer's
 * money. So it is prepared when the settings arrive and simply sits there.
 *
 * Null means no logo, a logo that failed to load, or one still converting —
 * all three print the shop name alone, which is what happened before there
 * was a logo at all.
 */
export function usePrintLogo(logoUrl: string, widthMm: number): string | null {
  // The URL is stored alongside the result so a logo converted for the
  // previous one is never handed out while the new one is still loading.
  const [done, setDone] = useState<{ url: string; data: string | null } | null>(null)

  useEffect(() => {
    if (!logoUrl) return
    let alive = true
    logoForPrinting(logoUrl, widthMm)
      .then(data => { if (alive) setDone({ url: logoUrl, data }) })
    return () => { alive = false }
  }, [logoUrl, widthMm])

  return logoUrl && done?.url === logoUrl ? done.data : null
}
