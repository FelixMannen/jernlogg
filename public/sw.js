// Jernlogg service worker
// - Pages and app code: network first, cache only as offline fallback, so new deploys show up immediately.
// - Hashed assets (/assets/*-HASH.js|css) are immutable, so cache-first is safe for them.
// - Push notifications + tap-to-open.
// Only registered in production builds (see src/main.tsx).
const VERSION = 'v2'
const CACHE = `jernlogg-${VERSION}`

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(['/', '/manifest.webmanifest', '/icon-192.png', '/apple-touch-icon.png', '/badge-96.png']))
      .catch(() => {}),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

async function networkFirst(req, cacheKey) {
  const cache = await caches.open(CACHE)
  try {
    const res = await fetch(req, { cache: 'no-store' })
    if (res.ok) cache.put(cacheKey || req, res.clone())
    return res
  } catch {
    const hit = await cache.match(cacheKey || req)
    if (hit) return hit
    throw new Error('offline and not cached')
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(req)
  if (hit) return hit
  const res = await fetch(req)
  if (res.ok) cache.put(req, res.clone())
  return res
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== location.origin) return
  if (url.pathname.startsWith('/api/')) return // never cache API calls
  if (req.mode === 'navigate') {
    e.respondWith(networkFirst(req, '/'))
    return
  }
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(cacheFirst(req))
    return
  }
  if (/\.(png|svg|webmanifest|woff2?)$/.test(url.pathname)) e.respondWith(networkFirst(req))
})

// ---------- push ----------
self.addEventListener('push', (e) => {
  let data = {}
  try {
    data = e.data ? e.data.json() : {}
  } catch {
    data = { body: e.data ? e.data.text() : '' }
  }
  const title = data.title || 'Jernlogg'
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/badge-96.png',
    tag: data.tag || 'jernlogg',
    renotify: !!data.tag,
    data: { url: data.url || '/#/feed' },
  }
  e.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const target = new URL(e.notification.data?.url || '/#/feed', self.location.origin).href
  e.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const c of all) {
        if (new URL(c.url).origin === self.location.origin) {
          await c.focus()
          try {
            await c.navigate(target)
          } catch {
            c.postMessage({ type: 'navigate', url: target })
          }
          return
        }
      }
      await self.clients.openWindow(target)
    })(),
  )
})

// Subscription rotated by the browser: tell an open client to re-save it.
self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((all) => all.forEach((c) => c.postMessage({ type: 'resubscribe' }))),
  )
})
