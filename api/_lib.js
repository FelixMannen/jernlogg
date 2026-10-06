// Shared helpers for the API functions (files starting with "_" are not routes on Vercel).
import webpush from 'web-push'
import crypto from 'crypto'

export const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rrksgwfgdixgpamrmayc.supabase.co'
// Public anon key (same as in the app); access is governed by RLS.
export const SUPABASE_KEY =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJya3Nnd2ZnZGl4Z3BhbXJtYXljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwODk5MTEsImV4cCI6MjEwNjY2NTkxMX0.i4CZeolOpipNBqFFIVHIo8HQCt-ANO3h6epPvOkdpQ4'
export const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BLeYGQPOsNmakehmAI5jKv543898K69sVo0mFrRfyEBhil-zUJL71viQQh2k1NEhnEO9H8YvGZzpiWiPckzlEOk'
export const APP_URL = 'https://jernlogg.vercel.app'

// Server key (Vercel env only, never in the repo). Bypasses RLS so the server can read every user's reminders.
// Accepts both the legacy service_role JWT and the new sb_secret_… key. Falls back to the anon key until it's set.
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || ''
const KEY = SERVICE_KEY || SUPABASE_KEY
const H = KEY.startsWith('sb_') ? { apikey: KEY, 'Content-Type': 'application/json' } : { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
export const hasServiceKey = () => !!SERVICE_KEY

/** Names of the original three (profiles may not have a name stored). */
export const USERS = { felix: 'Felix', david: 'David', erik: 'Erik' }

/** {userId: display name} for everyone with a profile or a push subscription. */
export function userNames(docs) {
  const out = { ...USERS }
  for (const d of docs) {
    if (d.collection === 'profiles' && d.id.startsWith('profile:')) {
      const id = d.id.slice(8)
      out[id] = (d.data && d.data.name) || out[id] || 'En kompis'
    }
    if (d.collection === 'push_subscriptions' && d.data && d.data.userId && !out[d.data.userId]) out[d.data.userId] = 'En kompis'
  }
  return out
}

/** {userId: Set(peer ids)} – people who share at least one group (from group_members docs). */
export function peersFrom(members) {
  const byGroup = {}
  for (const m of members) (byGroup[m.data.groupId] ||= new Set()).add(m.data.userId)
  const out = {}
  for (const ids of Object.values(byGroup)) for (const a of ids) for (const b of ids) if (a !== b) (out[a] ||= new Set()).add(b)
  return out
}

/** The signed-in app user behind a request (Authorization: Bearer <supabase access token>), or null. */
export async function authUser(req) {
  const h = (req.headers && (req.headers.authorization || req.headers.Authorization)) || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : ''
  if (!token) return null
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` } })
  if (!r.ok) return null
  const u = await r.json()
  if (!u || !u.id) return null
  const acc = await getDoc(`account:${u.id}`)
  return acc && acc.data && acc.data.userId ? { authId: u.id, userId: acc.data.userId } : null
}

/* «Tatt ✓» in a notification has no login – the cron signs exactly which doses it may check off. */
function hmacKey() {
  return 'jernlogg-take:' + (SERVICE_KEY || process.env.VAPID_PRIVATE_KEY || '')
}
export function signTake(userId, items) {
  const msg = userId + '|' + items.map((i) => `${i.supId}:${i.date}:${i.dose}`).sort().join(',')
  return crypto.createHmac('sha256', hmacKey()).update(msg).digest('base64url')
}
export function verifyTake(userId, items, token) {
  if (typeof token !== 'string' || !token) return false
  const want = Buffer.from(signTake(userId, items))
  const got = Buffer.from(token)
  return want.length === got.length && crypto.timingSafeEqual(want, got)
}

/** True when VAPID keys are present and valid (checked before any notification is claimed as sent). */
export function pushReady() {
  if (!process.env.VAPID_PRIVATE_KEY) return false
  try {
    configure()
    return true
  } catch {
    return false
  }
}

let configured = false
function configure() {
  if (configured) return
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || APP_URL, VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY)
  configured = true
}

/** Read live (not soft-deleted) docs of the given collections. */
export async function loadDocs(collections, extra = '') {
  const out = []
  const list = collections.map((c) => `"${c}"`).join(',')
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/docs?collection=in.(${encodeURIComponent(list)})&deleted=eq.false&order=created_at.asc${extra}`, {
      headers: { ...H, Range: `${from}-${from + 999}`, 'Range-Unit': 'items' },
    })
    if (!r.ok) throw new Error(`supabase ${r.status}: ${await r.text()}`)
    const rows = await r.json()
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

export async function getDoc(id) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/docs?id=eq.${encodeURIComponent(id)}&deleted=eq.false`, { headers: H })
  if (!r.ok) throw new Error(`supabase ${r.status}`)
  return (await r.json())[0]
}

/** Insert a log doc. Returns false if it already exists (used to send each notification only once). */
export async function claimLog(id, data) {
  const now = new Date().toISOString()
  const r = await fetch(`${SUPABASE_URL}/rest/v1/docs`, {
    method: 'POST',
    headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({ id, collection: 'push_log', data, created_at: now, updated_at: now, deleted: false }),
  })
  if (r.status === 409) return false
  if (!r.ok) throw new Error(`supabase ${r.status}: ${await r.text()}`)
  return true
}

/** Create or overwrite a doc (also un-deletes it). */
export async function upsertDoc(id, collection, data) {
  const now = new Date().toISOString()
  const r = await fetch(`${SUPABASE_URL}/rest/v1/docs?on_conflict=id`, {
    method: 'POST',
    headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id, collection, data, updated_at: now, deleted: false }),
  })
  if (!r.ok) throw new Error(`supabase ${r.status}: ${await r.text()}`)
}

async function softDelete(id) {
  await fetch(`${SUPABASE_URL}/rest/v1/docs?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({ deleted: true, updated_at: new Date().toISOString() }),
  })
}

/** Subscriptions to use for a user: if several users used the same device, only the most recent one gets notifications. */
export function devicesFor(subs, userId) {
  const latest = new Map()
  const seen = (s) => (s.data && (s.data.seenAt || s.data.createdAt)) || s.updated_at || ''
  for (const s of subs) {
    const cur = latest.get(s.data.endpoint)
    if (!cur || seen(s) > seen(cur)) latest.set(s.data.endpoint, s)
  }
  const out = []
  const endpoints = new Set()
  for (const s of subs) {
    if (s.data.userId !== userId || endpoints.has(s.data.endpoint)) continue
    if (latest.get(s.data.endpoint).data.userId !== userId) continue
    endpoints.add(s.data.endpoint)
    out.push(s)
  }
  return out
}

/** Send a payload to every device of a user. Expired subscriptions are soft-deleted. */
export async function sendToUser(subs, userId, payload) {
  configure()
  const mine = devicesFor(subs, userId)
  let sent = 0
  const errors = []
  for (const s of mine) {
    try {
      await webpush.sendNotification({ endpoint: s.data.endpoint, keys: s.data.keys }, JSON.stringify(payload), { TTL: 60 * 60 * 6, urgency: 'normal' })
      sent++
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) await softDelete(s.id)
      else errors.push(`${e.statusCode || ''} ${e.body || e.message}`.trim())
    }
  }
  return { sent, devices: mine.length, errors }
}

export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body)
    } catch {
      return {}
    }
  }
  return {}
}
