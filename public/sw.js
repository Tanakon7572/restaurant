/* Service worker for the POS.
 *
 * Goal is narrow and deliberate: when the shop's wi-fi drops mid-service the
 * staff device must still show the app and the menu, and orders taken in that
 * window must not be lost. It is NOT a general offline mode — anything that
 * needs live data (orders, kitchen, checkout) still says so.
 */

// Bump on every deploy that changes the shell. The activate handler deletes
// every cache whose name does not start with the current version, which is
// what stops a stale page referencing chunks the server no longer has.
const VERSION = 'pos-v2'
const SHELL = `${VERSION}-shell`
const DATA = `${VERSION}-data`

// Navigations fall back to this when the network is gone.
const OFFLINE_URL = '/offline.html'

// The screens a shift actually moves between. Fetched once at install so a
// freshly installed handheld already works before it has ever been online at
// the counter — without this, the first load of every screen needs the
// network no matter how good the cache is afterwards.
const STAFF_ROUTES = [
  '/orders/new',
  '/checkout',
  '/orders',
  '/menu',
  '/kitchen',
  '/dashboard',
  '/reports',
  '/settings',
  '/qr',
]

// How long a navigation waits for the network before showing what we already
// have. Long enough that a healthy connection always wins and the screen is
// fresh; short enough that a sulking one does not leave staff looking at a
// blank screen mid-service.
const NAV_TIMEOUT_MS = 1500

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL)
      .then(cache => Promise.all([
        cache.addAll([OFFLINE_URL, '/manifest.webmanifest', '/icon.svg']),
        // Individually, and failures ignored: one route 401ing on a device
        // that is not logged in yet must not throw away the whole install.
        ...STAFF_ROUTES.map(r =>
          fetch(r, { credentials: 'same-origin' })
            .then(res => (res.ok ? cache.put(r, res) : null))
            .catch(() => null)),
      ]))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  )
})

// Cache a copy, but always prefer the network so staff never act on stale
// prices or availability.
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  try {
    const response = await fetch(request)
    if (response.ok) cache.put(request, response.clone())
    return response
  } catch (err) {
    const cached = await cache.match(request)
    if (cached) return cached
    throw err
  }
}

/**
 * Whichever answers first: the network, or the cache after NAV_TIMEOUT_MS.
 * The network request is never cancelled — if it lands late it still updates
 * the cache, so the wait only ever happens once per stale screen.
 */
async function navigate(request) {
  const cache = await caches.open(SHELL)
  const cached = await cache.match(request)

  const fromNetwork = fetch(request)
    .then(response => {
      if (response.ok) cache.put(request, response.clone())
      return response
    })

  if (!cached) {
    return fromNetwork.catch(() => caches.match(OFFLINE_URL))
  }

  // Swallow the rejection here too, or a failed background fetch surfaces as
  // an unhandled rejection even though the cached page was served fine.
  fromNetwork.catch(() => null)

  return Promise.race([
    fromNetwork.catch(() => cached),
    new Promise(resolve => setTimeout(() => resolve(cached), NAV_TIMEOUT_MS)),
  ])
}

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Router payloads, not pages. They key off the same paths, so caching them
  // in the shell fills it with near-duplicates of every screen and risks a
  // payload being handed back where a document was asked for.
  if (url.searchParams.has('_rsc') || request.headers.get('RSC') === '1') return

  // Page loads: the network gets first refusal, but only briefly. Past that
  // the cached screen is shown immediately and the fetch is left running so
  // the cache is fresh for next time.
  if (request.mode === 'navigate') {
    event.respondWith(navigate(request))
    return
  }

  // The public menu is the one API response worth keeping — it is what an
  // order is built from.
  if (url.pathname === '/api/public/menu') {
    event.respondWith(networkFirst(request, DATA))
    return
  }

  // Everything else live: no stale order lists or takings.
  if (url.pathname.startsWith('/api/')) return

  // Build output and static files are content-hashed, so cache-first is safe.
  event.respondWith(
    caches.open(SHELL).then(async cache => {
      const cached = await cache.match(request)
      if (cached) return cached
      const response = await fetch(request)
      if (response.ok) cache.put(request, response.clone())
      return response
    }).catch(() => fetch(request)),
  )
})
