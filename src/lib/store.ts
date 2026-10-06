// Local-first document store.
// - Instant start from the offline cache (IndexedDB), writes are queued in localStorage and synced in the background.
// - Only the signed-in user's own data and data from people in their groups is loaded (enforced by the database).
// - After the first full load only changes are fetched (synced_at cursor); a full reload runs at most every 12 hours
//   and whenever group memberships change (so new friends' history shows up and old ones disappear).
import { useSyncExternalStore } from 'react'
import { supabase, isLocal } from './supabase'
import { kvGet, kvSet } from './idb'
import { writeByUpdate } from './access'
import { localLoad, upsertDb, localRpc, ensureLocalSeed } from './localServer'

export type Doc<T = any> = {
  id: string
  collection: string
  data: T
  created_at: string
  updated_at: string
  deleted: boolean
  synced_at?: string
}

class NoSession extends Error {}

interface Backend {
  name: 'supabase' | 'local'
  load(since?: string): Promise<Doc[]>
  upsert(docs: Doc[], me: string | null): Promise<Doc[]> // returns docs the server refused
  subscribe(cb: (doc: Doc) => void): () => void
  rpc(name: string, args?: Record<string, any>): Promise<any>
}

const clean = (d: Doc) => ({ id: d.id, collection: d.collection, data: d.data, created_at: d.created_at, updated_at: d.updated_at, deleted: d.deleted })
const isRefused = (e: any) => e?.code === '42501' || /row-level security/i.test(e?.message ?? '')

/* ---------- local backend (tests) ---------- */
const localBackend: Backend = {
  name: 'local',
  async load(since) {
    ensureLocalSeed()
    return localLoad(since)
  },
  async upsert(docs) {
    upsertDb(docs.map(clean) as Doc[])
    return []
  },
  subscribe() {
    return () => {}
  },
  rpc: localRpc,
}

/* ---------- supabase backend ---------- */
function supabaseBackend(): Backend {
  const client = supabase!
  return {
    name: 'supabase',
    async load(since) {
      const out: Doc[] = []
      const page = 1000
      for (let from = 0; ; from += page) {
        let q = client.from('docs').select('*')
        q = since ? q.gt('synced_at', since).order('synced_at', { ascending: true }) : q.eq('deleted', false).order('id', { ascending: true })
        const { data, error } = await q.range(from, from + page - 1)
        if (error) throw error
        out.push(...(data as Doc[]))
        if (!data || data.length < page) break
      }
      return out
    },
    async upsert(docs, me) {
      const { data: s } = await client.auth.getSession()
      if (!s.session || !me) throw new NoSession('ikke logget inn')
      const refused: Doc[] = []
      const viaUpdate = docs.filter((d) => writeByUpdate(d, me))
      const normal = docs.filter((d) => !viaUpdate.includes(d))
      if (normal.length) {
        const { error } = await client.from('docs').upsert(normal.map(clean), { onConflict: 'id' })
        if (error) {
          if (!isRefused(error)) throw error
          // find the offending doc(s); the rest still gets saved
          for (const d of normal) {
            const { error: e } = await client.from('docs').upsert([clean(d)], { onConflict: 'id' })
            if (e) {
              if (isRefused(e)) refused.push(d)
              else throw e
            }
          }
        }
      }
      for (const d of viaUpdate) {
        const { data, error } = await client.from('docs').update({ data: d.data, deleted: d.deleted, updated_at: d.updated_at }).eq('id', d.id).select('id')
        if (error && !isRefused(error)) throw error
        if (error || !data?.length) refused.push(d)
      }
      return refused
    },
    subscribe(cb) {
      const ch = client
        .channel('docs-' + uid())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, (payload: any) => {
          if (payload.new && payload.new.id) cb(payload.new as Doc)
        })
        .subscribe()
      return () => {
        client.removeChannel(ch)
      }
    },
    async rpc(name, args = {}) {
      const { data, error } = await client.rpc(name, args)
      if (error) throw new Error(error.message)
      return data
    },
  }
}

/* ---------- store state ---------- */
const backend: Backend = isLocal ? localBackend : supabaseBackend()
const FULL_EVERY_MS = 12 * 3600e3

let user: string | null = null
const docs = new Map<string, Doc>()
const byCollection = new Map<string, Map<string, Doc>>()
let version = 0
let status: 'loading' | 'ready' | 'offline' = 'loading'
let pending: Doc[] = []
let cursor = '' // highest synced_at seen from the server
let lastFull = 0
let unsubscribe: (() => void) | null = null
const listeners = new Set<() => void>()

const queueKey = (u: string | null) => `jernlogg.queue.${backend.name}.${u ?? 'anon'}.v2`
const cacheKey = (u: string) => `cache:${backend.name}:${u}:v2`

function setDoc(d: Doc) {
  const prev = docs.get(d.id)
  if (prev && prev.collection !== d.collection) byCollection.get(prev.collection)?.delete(d.id)
  docs.set(d.id, d)
  let m = byCollection.get(d.collection)
  if (!m) byCollection.set(d.collection, (m = new Map()))
  m.set(d.id, d)
  if (d.synced_at && d.synced_at > cursor) cursor = d.synced_at
}
function clearDocs() {
  docs.clear()
  byCollection.clear()
}

function emit() {
  version++
  listeners.forEach((l) => l())
}

function saveQueue() {
  try {
    localStorage.setItem(queueKey(user), JSON.stringify(pending))
  } catch {}
}
let cacheTimer: any
function saveCacheNow() {
  clearTimeout(cacheTimer)
  saveQueue()
  if (!user) return
  kvSet(cacheKey(user), { docs: [...docs.values()], cursor, lastFull, v: 2 })
}
function scheduleCache() {
  saveQueue()
  clearTimeout(cacheTimer)
  cacheTimer = setTimeout(saveCacheNow, 800)
}

let resyncTimer: any
function applyRemote(d: Doc) {
  const cur = docs.get(d.id)
  if (d.synced_at && d.synced_at > cursor) cursor = d.synced_at
  if (cur && cur.updated_at > d.updated_at) return // older echo
  if (pending.some((p) => p.id === d.id)) return // we have an unsynced local change
  if (d.collection === 'group_members' && (!cur || cur.deleted !== d.deleted)) {
    // someone joined/left one of my groups: reload so their history appears/disappears
    clearTimeout(resyncTimer)
    resyncTimer = setTimeout(() => resync(), 600)
  }
  setDoc(d)
  scheduleCache()
  emit()
}

/* ---------- sync ---------- */
let flushing = false
let flushTimer: any
async function flush() {
  if (flushing || pending.length === 0) return
  flushing = true
  const batch = dedupe(pending)
  try {
    const refused = await backend.upsert(batch, user)
    if (refused.length) quarantine(refused)
    pending = pending.filter((p) => !batch.some((b) => b.id === p.id && b.updated_at === p.updated_at))
    if (status === 'offline') status = 'ready'
    saveQueue()
    emit()
  } catch (e) {
    if (!(e instanceof NoSession)) console.warn('[jernlogg] sync failed, retrying', e)
    status = 'offline'
    emit()
    clearTimeout(flushTimer)
    flushTimer = setTimeout(flush, e instanceof NoSession ? 15000 : 4000)
  } finally {
    flushing = false
    if (pending.length && status !== 'offline') {
      clearTimeout(flushTimer)
      flushTimer = setTimeout(flush, 50)
    }
  }
}

/** Writes the server refused (not allowed for this user) – kept aside so the queue never gets stuck, never thrown away silently. */
function quarantine(list: Doc[]) {
  console.warn('[jernlogg] server refused', list.map((d) => d.id))
  try {
    const cur = JSON.parse(localStorage.getItem('jernlogg.refused') || '[]')
    localStorage.setItem('jernlogg.refused', JSON.stringify([...cur, ...list.map((d) => ({ ...d, refusedAt: nowIso(), user }))].slice(-200)))
  } catch {}
}

function dedupe(list: Doc[]): Doc[] {
  const m = new Map<string, Doc>()
  for (const d of list) m.set(d.id, d)
  return [...m.values()]
}

function scheduleFlush() {
  clearTimeout(flushTimer)
  flushTimer = setTimeout(flush, 250)
}

async function pull(full: boolean) {
  const since = full || !cursor ? undefined : new Date(Date.parse(cursor) - 2000).toISOString()
  const remote = await backend.load(since)
  if (!since) {
    // full reload: replace everything (drops docs we are no longer allowed to see), keep unsynced local changes
    const keep = new Map(pending.map((p) => [p.id, p]))
    clearDocs()
    for (const d of remote) if (!keep.has(d.id)) setDoc(d)
    for (const p of keep.values()) setDoc(p)
    lastFull = Date.now()
  } else {
    for (const d of remote) {
      if (pending.some((p) => p.id === d.id)) continue
      const cur = docs.get(d.id)
      if (d.collection === 'group_members' && (!cur || cur.deleted !== d.deleted)) full = true
      if (!cur || cur.updated_at <= d.updated_at || (d.synced_at ?? '') > (cur.synced_at ?? '')) setDoc(d)
      else if (d.synced_at && d.synced_at > cursor) cursor = d.synced_at
    }
    if (full) return pull(true)
  }
}

export async function resync() {
  if (!user) return
  try {
    await pull(true)
    status = 'ready'
    saveCacheNow()
    emit()
  } catch (e) {
    console.warn('[jernlogg] reload failed', e)
  }
}

let globalHandlers = false
function installGlobalHandlers() {
  if (globalHandlers) return
  globalHandlers = true
  window.addEventListener('online', () => flush())
  // never lose a just-made change if the tab is closed or backgrounded right away
  window.addEventListener('pagehide', () => {
    saveCacheNow()
    flush()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      saveCacheNow()
      flush()
    }
    if (document.visibilityState === 'visible' && user) {
      flush()
      // catch up in case realtime dropped while backgrounded
      pull(Date.now() - lastFull > FULL_EVERY_MS)
        .then(() => (scheduleCache(), emit()))
        .catch(() => {})
    }
  })
}

/** Start the store for a signed-in user. Safe to call again for another user (switches completely). */
export async function init(userId: string) {
  if (user === userId) return // already running (or starting) for this user
  reset()
  user = userId
  status = 'loading'
  emit()
  installGlobalHandlers()
  // 1. queued writes (incl. those made before login existed, or before this user was known)
  try {
    const own: Doc[] = JSON.parse(localStorage.getItem(queueKey(userId)) || '[]')
    const anon: Doc[] = JSON.parse(localStorage.getItem(queueKey(null)) || '[]')
    const legacyKey = `jernlogg.queue.${backend.name}.v1`
    const legacy: Doc[] = JSON.parse(localStorage.getItem(legacyKey) || '[]')
    pending = dedupe([...legacy, ...anon, ...own, ...pending])
    saveQueue()
    localStorage.removeItem(legacyKey)
    localStorage.removeItem(queueKey(null))
    localStorage.removeItem(`jernlogg.cache.${backend.name}.v1`) // old cache format (everyone's data)
  } catch {}
  // 2. instant start from cache
  const cached = await kvGet<{ docs: Doc[]; cursor: string; lastFull: number }>(cacheKey(userId))
  if (user !== userId) return
  if (cached?.docs?.length) {
    for (const d of cached.docs) if (!docs.has(d.id)) setDoc(d)
    cursor = cached.cursor || cursor
    lastFull = cached.lastFull || 0
  }
  for (const p of pending) setDoc(p)
  if (docs.size) {
    status = 'ready'
    emit()
  }
  // 3. fresh data
  try {
    await pull(!cached || Date.now() - lastFull > FULL_EVERY_MS)
    if (user !== userId) return
    status = 'ready'
    saveCacheNow()
    emit()
  } catch (e) {
    console.warn('[jernlogg] load failed', e)
    status = 'offline'
    emit()
  }
  if (user !== userId) return
  unsubscribe?.()
  unsubscribe = backend.subscribe(applyRemote)
  flush()
}

/** Forget the current user (sign out). Unsynced writes stay queued for that user. */
export function reset() {
  if (user || pending.length) saveCacheNow() // never overwrite a queue with an empty one
  unsubscribe?.()
  unsubscribe = null
  clearTimeout(flushTimer)
  clearTimeout(resyncTimer)
  user = null
  clearDocs()
  pending = []
  cursor = ''
  lastFull = 0
  status = 'loading'
  emit()
}

/** Call a server function (groups, accounts…). Group changes trigger a full reload. */
export async function rpc<T = any>(name: string, args: Record<string, any> = {}): Promise<T> {
  const r = await backend.rpc(name, args)
  if (/group|kick|claim|register/.test(name) && !/preview|public_groups|board/.test(name)) await resync()
  return r as T
}

export function currentUser() {
  return user
}

export function uid(prefix = ''): string {
  const r = (crypto as any).randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)
  return prefix + r.replace(/-/g, '').slice(0, 16)
}

export function nowIso() {
  return new Date().toISOString()
}

export function put<T>(collection: string, id: string, data: T, opts: { deleted?: boolean } = {}): Doc<T> {
  const cur = docs.get(id)
  const ts = nowIso()
  const d: Doc<T> = {
    id,
    collection,
    data,
    created_at: cur?.created_at ?? ts,
    updated_at: ts > (cur?.updated_at ?? '') ? ts : new Date(Date.parse(cur!.updated_at) + 1).toISOString(),
    deleted: opts.deleted ?? false,
  }
  setDoc(d)
  pending.push(d)
  scheduleCache()
  scheduleFlush()
  emit()
  return d
}

export function patch<T>(id: string, fn: (cur: T) => T) {
  const cur = docs.get(id)
  if (!cur) return
  put(cur.collection, id, fn(structuredClone(cur.data)))
}

export function remove(id: string) {
  const cur = docs.get(id)
  if (!cur) return
  put(cur.collection, id, cur.data, { deleted: true })
}

export function getDoc<T = any>(id: string): Doc<T> | undefined {
  const d = docs.get(id)
  return d && !d.deleted ? (d as Doc<T>) : undefined
}

export function list<T = any>(collection: string): Doc<T>[] {
  const out: Doc<T>[] = []
  const m = byCollection.get(collection)
  if (m) for (const d of m.values()) if (!d.deleted) out.push(d as Doc<T>)
  return out
}

export function allDocs(): Doc[] {
  return [...docs.values()]
}

export function getVersion() {
  return version
}

export function getStatus() {
  return { status, backend: backend.name, pending: pending.length, user }
}

export function useStoreVersion() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => version,
  )
}

installGlobalHandlers()

// test helper
;(window as any).__jernlogg = { allDocs, put, getStatus, rpc, resync }
