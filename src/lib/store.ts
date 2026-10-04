import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'
import { SUPABASE_URL, SUPABASE_KEY } from '../config'

export type Doc<T = any> = {
  id: string
  collection: string
  data: T
  created_at: string
  updated_at: string
  deleted: boolean
}

interface Backend {
  name: 'supabase' | 'local'
  loadAll(): Promise<Doc[]>
  upsert(docs: Doc[]): Promise<void>
  subscribe(cb: (doc: Doc) => void): () => void
}

/* ---------- local backend (testing / offline demo) ---------- */
const LOCAL_DB_KEY = 'jernlogg.localdb.v1'
const localBackend: Backend = {
  name: 'local',
  async loadAll() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_DB_KEY) || '[]')
    } catch {
      return []
    }
  },
  async upsert(docs) {
    let all: Doc[] = []
    try {
      all = JSON.parse(localStorage.getItem(LOCAL_DB_KEY) || '[]')
    } catch {}
    const map = new Map(all.map((d) => [d.id, d]))
    for (const d of docs) map.set(d.id, d)
    localStorage.setItem(LOCAL_DB_KEY, JSON.stringify([...map.values()]))
  },
  subscribe() {
    return () => {}
  },
}

/* ---------- supabase backend ---------- */
function supabaseBackend(client: SupabaseClient): Backend {
  return {
    name: 'supabase',
    async loadAll() {
      const out: Doc[] = []
      const page = 1000
      for (let from = 0; ; from += page) {
        const { data, error } = await client
          .from('docs')
          .select('*')
          .order('created_at', { ascending: true })
          .range(from, from + page - 1)
        if (error) throw error
        out.push(...(data as Doc[]))
        if (!data || data.length < page) break
      }
      return out
    },
    async upsert(docs) {
      const { error } = await client.from('docs').upsert(docs, { onConflict: 'id' })
      if (error) throw error
    },
    subscribe(cb) {
      const ch = client
        .channel('docs-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, (payload: any) => {
          if (payload.new && payload.new.id) cb(payload.new as Doc)
        })
        .subscribe()
      return () => {
        client.removeChannel(ch)
      }
    },
  }
}

function pickBackend(): Backend {
  const params = new URLSearchParams(location.search)
  if (params.get('local') === '1') sessionStorage.setItem('jernlogg.local', '1')
  if (params.get('local') === '0') sessionStorage.removeItem('jernlogg.local')
  const forceLocal = sessionStorage.getItem('jernlogg.local') === '1'
  if (!forceLocal && SUPABASE_URL && SUPABASE_KEY) {
    return supabaseBackend(createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } }))
  }
  return localBackend
}

/* ---------- store ---------- */
const backend = pickBackend()
const CACHE_KEY = `jernlogg.cache.${backend.name}.v1`
const QUEUE_KEY = `jernlogg.queue.${backend.name}.v1`

const docs = new Map<string, Doc>()
let version = 0
let status: 'loading' | 'ready' | 'offline' = 'loading'
let pending: Doc[] = []
const listeners = new Set<() => void>()

function emit() {
  version++
  listeners.forEach((l) => l())
}

function saveCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify([...docs.values()]))
    localStorage.setItem(QUEUE_KEY, JSON.stringify(pending))
  } catch {}
}

let cacheTimer: any
function scheduleCache() {
  clearTimeout(cacheTimer)
  cacheTimer = setTimeout(saveCache, 300)
}

function applyRemote(d: Doc) {
  const cur = docs.get(d.id)
  // ignore remote echoes older than what we have locally
  if (cur && cur.updated_at > d.updated_at) return
  // ignore if we have a pending local write for this doc
  if (pending.some((p) => p.id === d.id)) return
  docs.set(d.id, d)
  scheduleCache()
  emit()
}

let flushing = false
let flushTimer: any
async function flush() {
  if (flushing || pending.length === 0) return
  flushing = true
  const batch = dedupe(pending)
  try {
    await backend.upsert(batch)
    pending = pending.filter((p) => !batch.some((b) => b.id === p.id && b.updated_at === p.updated_at))
    if (status === 'offline') status = 'ready'
    saveCache()
    emit()
  } catch (e) {
    console.warn('[jernlogg] sync failed, retrying', e)
    status = 'offline'
    emit()
    clearTimeout(flushTimer)
    flushTimer = setTimeout(flush, 4000)
  } finally {
    flushing = false
    if (pending.length && status !== 'offline') {
      clearTimeout(flushTimer)
      flushTimer = setTimeout(flush, 50)
    }
  }
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
  docs.set(id, d)
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
  for (const d of docs.values()) if (d.collection === collection && !d.deleted) out.push(d as Doc<T>)
  return out
}

export function allDocs(): Doc[] {
  return [...docs.values()]
}

export function getStatus() {
  return { status, backend: backend.name, pending: pending.length }
}

export async function init() {
  // 1. instant start from cache
  try {
    const cached: Doc[] = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]')
    cached.forEach((d) => docs.set(d.id, d))
    pending = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]')
    pending.forEach((d) => docs.set(d.id, d))
  } catch {}
  if (docs.size) {
    status = 'ready'
    emit()
  }
  // 2. load fresh
  try {
    const remote = await backend.loadAll()
    for (const d of remote) {
      const cur = docs.get(d.id)
      if (pending.some((p) => p.id === d.id)) continue
      if (!cur || cur.updated_at <= d.updated_at) docs.set(d.id, d)
    }
    status = 'ready'
    saveCache()
    emit()
  } catch (e) {
    console.warn('[jernlogg] load failed', e)
    status = docs.size ? 'offline' : 'offline'
    emit()
  }
  backend.subscribe(applyRemote)
  flush()
  window.addEventListener('online', () => flush())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      flush()
      // refresh in case realtime dropped while backgrounded
      backend
        .loadAll()
        .then((remote) => remote.forEach(applyRemote))
        .catch(() => {})
    }
  })
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

// test helper
;(window as any).__jernlogg = { allDocs, put, getStatus }
