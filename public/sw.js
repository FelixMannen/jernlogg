// Jernlogg service worker
// - Pages and app code: network first, cache only as offline fallback, so new deploys show up immediately.
// - Hashed assets (/assets/*-HASH.js|css) are immutable, so cache-first is safe for them.
// - Push notifications + tap-to-open.
// Only registered in production builds (see src/main.tsx).
const VERSION = 'v5'
const CACHE = `jernlogg-${VERSION}`

// Pre-cache the app shell *and* the hashed JS/CSS it references, so the app can start offline
// even if the very first visit happened before the service worker was in control.
async function precache() {
  const c = await caches.open(CACHE)
  await c.addAll(['/manifest.webmanifest', '/icon-192.png', '/apple-touch-icon.png', '/badge-96.png']).catch(() => {})
  const res = await fetch('/', { cache: 'no-store' })
  if (!res.ok) return
  const html = await res.clone().text()
  await c.put('/', res)
  const assets = [...new Set(html.match(/\/assets\/[^"' )]+/g) || [])]
  await c.addAll(assets).catch(() => {})
}

self.addEventListener('install', (e) => {
  e.waitUntil(precache().catch(() => {}))
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
    const hit = await cache.match(cacheKey || req, { ignoreVary: true })
    if (hit) return hit
    throw new Error('offline and not cached')
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(req, { ignoreVary: true })
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
    data: { url: data.url || '/#/feed', take: data.take || [], userId: data.userId, token: data.token },
    // «Tatt ✓» on Android/desktop. iPhone shows no buttons – tapping opens the app instead.
    actions: Array.isArray(data.actions) ? data.actions.slice(0, 2) : [],
  }
  e.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const d = e.notification.data || {}
  if (e.action === 'take' && d.take && d.take.length) {
    e.waitUntil(
      fetch('/api/supp-take', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: d.userId, items: d.take, token: d.token }) })
        .then((r) => (r.ok ? self.registration.showNotification('Krysset av ✓', { body: 'Bra! Streaken lever.', icon: '/icon-192.png', badge: '/badge-96.png', tag: 'supp-ok' }) : Promise.reject()))
        .then(() => setTimeout(() => self.registration.getNotifications({ tag: 'supp-ok' }).then((ns) => ns.forEach((n) => n.close())), 4000))
        .catch(() => self.clients.openWindow('/#/supplementer')),
    )
    return
  }
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
