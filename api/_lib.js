// Shared helpers for the push API functions (files starting with "_" are not routes on Vercel).
import webpush from 'web-push'

export const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rrksgwfgdixgpamrmayc.supabase.co'
// Public anon key (same as in the app); access is governed by RLS.
export const SUPABASE_KEY =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJya3Nnd2ZnZGl4Z3BhbXJtYXljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwODk5MTEsImV4cCI6MjEwNjY2NTkxMX0.i4CZeolOpipNBqFFIVHIo8HQCt-ANO3h6epPvOkdpQ4'
export const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BLeYGQPOsNmakehmAI5jKv543898K69sVo0mFrRfyEBhil-zUJL71viQQh2k1NEhnEO9H8YvGZzpiWiPckzlEOk'
export const APP_URL = 'https://jernlogg.vercel.app'

const H = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' }

export const USERS = { felix: 'Felix', david: 'David', erik: 'Erik' }

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
export async function loadDocs(collections) {
  const out = []
  const list = collections.map((c) => `"${c}"`).join(',')
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/docs?collection=in.(${encodeURIComponent(list)})&deleted=eq.false&order=created_at.asc`, {
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

async function softDelete(id) {
  await fetch(`${SUPABASE_URL}/rest/v1/docs?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({ deleted: true, updated_at: new Date().toISOString() }),
  })
}

/** Send a payload to every subscription of a user. Expired subscriptions are soft-deleted. */
export async function sendToUser(subs, userId, payload) {
  configure()
  const mine = subs.filter((s) => s.data.userId === userId)
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
