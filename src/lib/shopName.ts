'use client'

/**
 * The shop's name, fetched once per page load however many headers ask.
 *
 * Every staff screen shows it, so without sharing the promise a walk through
 * five screens is five identical requests for one string that never changes
 * during a shift.
 */
let inflight: Promise<string> | null = null

export function loadShopName(): Promise<string> {
  if (!inflight) {
    inflight = fetch('/api/settings')
      .then(r => (r.ok ? r.json() : null))
      .then(d => (typeof d?.shopName === 'string' ? d.shopName : ''))
      // A failed lookup must not be cached as "no shop", or the name stays
      // missing until reload; clear it so the next header retries.
      .catch(() => { inflight = null; return '' })
  }
  return inflight
}
