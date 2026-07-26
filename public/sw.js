/* Service worker for the POS.
 *
 * Goal is narrow and deliberate: when the shop's wi-fi drops mid-service the
 * staff device must still show the app and the menu, and orders taken in that
 * window must not be lost. It is NOT a general offline mode — anything that
 * needs live data (orders, kitchen, checkout) still says so.
 */

const VERSION = 'pos-v1'
const SHELL = `${VERSION}-shell`
const DATA = `${VERSION}-data`

// Navigations fall back to this when the network is gone.
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL)
      .then(cache => cache.addAll([OFFLINE_URL, '/manifest.webmanifest', '/icon.svg']))
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

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Page loads: try the network, fall back to the cached shell, then to the
  // offline notice.
  if (request.mode === 'navigate') {
    event.respondWith(
      networkFirst(request, SHELL).catch(() => caches.match(OFFLINE_URL)),
    )
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
