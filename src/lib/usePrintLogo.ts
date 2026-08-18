'use client'

import { useEffect, useState } from 'react'
import { imageForPrinting } from './slipLogo'

/**
 * A printable picture, ready before anyone presses print.
 *
 * Converting one takes a canvas and an image load, and the moment a slip is
 * wanted is the worst moment to start: a cashier is holding a customer's
 * money. So it is prepared when the settings arrive and simply sits there.
 *
 * Null means no image, one that failed to load, or one still converting — all
 * three print the slip without it, which is what happened before.
 */
export function usePrintImage(url: string, dots: number): string | null {
  // The URL is stored alongside the result so a picture converted for the
  // previous one is never handed out while the new one is still loading.
  const [done, setDone] = useState<{ url: string; data: string | null } | null>(null)

  useEffect(() => {
    if (!url) return
    let alive = true
    imageForPrinting(url, dots).then(data => { if (alive) setDone({ url, data }) })
    return () => { alive = false }
  }, [url, dots])

  return url && done?.url === url ? done.data : null
}
