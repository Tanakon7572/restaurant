/**
 * Orders taken while the connection is down.
 *
 * A dropped wi-fi mid-rush must not cost the shop a ticket, so a failed POST
 * is parked in localStorage and replayed once the network returns. Only order
 * creation is queued — money, edits and cancellations are never replayed
 * blindly, because a stale one of those does real damage.
 */

const KEY = 'pos:queued-orders'

export type QueuedOrder = {
  // Stable across retries so a replay that half-succeeded can be spotted.
  id: string
  createdAt: number
  body: unknown
}

function read(): QueuedOrder[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function write(list: QueuedOrder[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // Private mode or a full quota: nothing useful to do, and throwing here
    // would lose the order the caller is mid-way through saving.
  }
}

export function queuedOrders(): QueuedOrder[] {
  return read()
}

export function queueOrder(body: unknown): QueuedOrder {
  const entry: QueuedOrder = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    body,
  }
  write([...read(), entry])
  notify()
  return entry
}

export function dropQueued(id: string): void {
  write(read().filter(e => e.id !== id))
  notify()
}

// Components subscribe to this to show the pending badge.
const CHANGED = 'pos:queue-changed'

function notify() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGED))
}

export function onQueueChange(fn: () => void): () => void {
  window.addEventListener(CHANGED, fn)
  return () => window.removeEventListener(CHANGED, fn)
}

/**
 * Replay everything queued, oldest first. Stops at the first network failure
 * so order of service is preserved; a rejection from the server (bad price,
 * deleted menu item) drops that entry rather than blocking the queue forever.
 *
 * Returns how many were sent and how many the server refused.
 */
export async function flushQueue(): Promise<{ sent: number; rejected: number }> {
  let sent = 0
  let rejected = 0
  for (const entry of read()) {
    let res: Response
    try {
      res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry.body),
      })
    } catch {
      break // still offline — keep the rest for the next attempt
    }
    if (res.ok) { dropQueued(entry.id); sent++ }
    else if (res.status >= 400 && res.status < 500) { dropQueued(entry.id); rejected++ }
    else break // server trouble: retry later rather than discard
  }
  return { sent, rejected }
}

/**
 * POST an order, falling back to the queue when the network is unreachable.
 * `queued: true` means the caller should tell staff it will be sent later.
 */
export async function submitOrder(body: unknown): Promise<
  { queued: false; ok: boolean; data: unknown } | { queued: true }
> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    queueOrder(body)
    return { queued: true }
  }
  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { queued: false, ok: res.ok, data: await res.json() }
  } catch {
    queueOrder(body)
    return { queued: true }
  }
}
