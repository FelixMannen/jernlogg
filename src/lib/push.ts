// Web Push + PWA install helpers (client side).
import { useEffect, useState } from 'react'
import { VAPID_PUBLIC_KEY } from '../config'
import { put, remove, getDoc, getStatus, list } from './store'
import type { UserId, Profile } from './domain'
import { profile } from './stats'
import { setProfile } from './actions'
import { supabase } from './supabase'

export type PushSub = { userId: UserId; endpoint: string; keys: { p256dh: string; auth: string }; ua: string; platform: string; tz: string; createdAt: string; seenAt?: string }
export type NotifyPrefs = NonNullable<Profile['notify']>

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
export const swEnabled = () => import.meta.env.PROD && !location.search.includes('local=1')

export function defaultPrefs(): NotifyPrefs {
  return { reminders: true, days: 2, hour: 18, friends: true, tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Oslo' }
}

export function notifyPrefs(userId: string): NotifyPrefs {
  return { ...defaultPrefs(), ...(profile(userId).notify ?? {}) }
}

export function setNotifyPrefs(userId: string, p: Partial<NotifyPrefs>) {
  setProfile(userId, { notify: { ...notifyPrefs(userId), ...p } })
}

function b64ToBytes(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

/** One doc per device and user (a shared device can't take over someone else's doc; the server sends to the newest). */
async function subId(endpoint: string, userId: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint))
  const base = 'push:' + [...new Uint8Array(hash)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('')
  const legacy = getDoc<PushSub>(base)
  return legacy && legacy.data.userId === userId ? base : `${base}:${userId}`
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported() || !swEnabled()) return null
  const existing = await navigator.serviceWorker.getRegistration()
  if (existing) return existing
  try {
    await navigator.serviceWorker.register('/sw.js')
    return await navigator.serviceWorker.ready
  } catch {
    return null
  }
}

export type PushState =
  | 'unsupported' // browser cannot do push
  | 'needs-install' // iPhone/iPad: must be opened from the home screen
  | 'dev' // local development / test mode
  | 'denied'
  | 'off'
  | 'on'

export async function pushState(): Promise<PushState> {
  if (!swEnabled()) return 'dev'
  if (isIOS() && !isStandalone()) return 'needs-install'
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await registration()
  const sub = await reg?.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

async function saveSub(userId: UserId, sub: PushSubscription) {
  const json = sub.toJSON() as any
  const id = await subId(sub.endpoint, userId)
  const cur = getDoc<PushSub>(id)?.data
  // refresh at most daily so the server knows which user used this device last
  if (cur && cur.userId === userId && cur.keys?.auth === json.keys?.auth && Date.now() - Date.parse(cur.seenAt ?? cur.createdAt) < 86400e3) return
  put('push_subscriptions', id, {
    userId,
    endpoint: sub.endpoint,
    keys: json.keys,
    ua: navigator.userAgent.slice(0, 160),
    platform: isIOS() ? 'ios' : /android/i.test(navigator.userAgent) ? 'android' : 'desktop',
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Oslo',
    createdAt: cur?.createdAt ?? new Date().toISOString(),
    seenAt: new Date().toISOString(),
  } as PushSub)
}

/** Must be called from a tap (iOS requires a user gesture for the permission prompt). */
export async function enablePush(userId: UserId): Promise<PushState> {
  const reg = await registration()
  if (!reg) return pushState()
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off'
  let sub = await reg.pushManager.getSubscription()
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC_KEY) })
  await saveSub(userId, sub)
  // store the timezone so reminders arrive at local time
  setNotifyPrefs(userId, { tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Oslo' })
  await waitForSync()
  return 'on'
}

export async function disablePush(userId: string): Promise<void> {
  const reg = await registration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  remove(await subId(sub.endpoint, userId))
  await sub.unsubscribe().catch(() => {})
  await waitForSync()
}

/** On sign-out: stop this device from getting the signed-out user's notifications (keeps the browser subscription). */
export async function forgetDevice(userId: string): Promise<void> {
  try {
    const reg = await registration()
    const sub = await reg?.pushManager.getSubscription()
    if (!sub) return
    const id = await subId(sub.endpoint, userId)
    if (getDoc(id)) remove(id)
    await waitForSync(4000)
  } catch {}
}

/** Keep this device's subscription linked to the current user (e.g. after switching user). */
export async function syncSubscription(userId: UserId) {
  if (!swEnabled() || !pushSupported() || Notification.permission !== 'granted') return
  const reg = await registration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) await saveSub(userId, sub)
}

export function deviceCount(userId: string) {
  return list<PushSub>('push_subscriptions').filter((d) => d.data.userId === userId).length
}

async function waitForSync(maxMs = 8000) {
  const t0 = Date.now()
  while (getStatus().pending > 0 && Date.now() - t0 < maxMs) await new Promise((r) => setTimeout(r, 200))
}

async function api(path: string, body: unknown) {
  const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : undefined
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) })
  let j: any = {}
  try {
    j = await r.json()
  } catch {}
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
  return j
}

export async function sendTestPush(_userId: UserId): Promise<{ sent: number; devices: number; errors: string[] }> {
  await waitForSync()
  return api('/api/push-test', {})
}

/** Tell the others that a workout was just finished (fire and forget). */
export async function notifyFinished(workoutId: string) {
  if (!swEnabled()) return
  await waitForSync()
  api('/api/notify', { workoutId }).catch(() => {})
}

/* ---------- Android/desktop install prompt ---------- */
let deferredPrompt: any = null
const installListeners = new Set<() => void>()
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferredPrompt = e
  installListeners.forEach((l) => l())
})
window.addEventListener('appinstalled', () => {
  deferredPrompt = null
  installListeners.forEach((l) => l())
})
export function useInstallPrompt() {
  const [, setN] = useState(0)
  useEffect(() => {
    const l = () => setN((n) => n + 1)
    installListeners.add(l)
    return () => {
      installListeners.delete(l)
    }
  }, [])
  return deferredPrompt
    ? async () => {
        deferredPrompt.prompt()
        await deferredPrompt.userChoice.catch(() => null)
        deferredPrompt = null
        installListeners.forEach((l) => l())
      }
    : null
}

/* ---------- messages from the service worker ---------- */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener?.('message', (e: MessageEvent) => {
    if (e.data?.type === 'navigate' && typeof e.data.url === 'string') {
      const u = new URL(e.data.url)
      location.hash = u.hash
    }
    if (e.data?.type === 'resubscribe') {
      const me = localStorage.getItem('jernlogg.me') as UserId | null
      if (me) syncSubscription(me)
    }
  })
}
