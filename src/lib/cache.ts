type CacheEntry<T> = { data: T; ts: number }

const store = new Map<string, CacheEntry<unknown>>()

export function getCache<T>(key: string, ttlMs: number): T | null {
  const entry = store.get(key) as CacheEntry<T> | undefined
  if (!entry) return null
  if (Date.now() - entry.ts > ttlMs) { store.delete(key); return null }
  return entry.data
}

export function setCache<T>(key: string, data: T): void {
  store.set(key, { data, ts: Date.now() })
}

export function invalidateCache(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key)
  }
}

export async function fetchWithCache<T>(
  key: string,
  url: string,
  ttlMs: number,
): Promise<T | null> {
  const cached = getCache<T>(key, ttlMs)
  if (cached !== null) return cached
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const data: T = await res.json()
    setCache(key, data)
    return data
  } catch {
    return null
  }
}
