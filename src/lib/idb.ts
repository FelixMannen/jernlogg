// Tiny IndexedDB key/value store for the offline cache (no 5 MB limit like localStorage).
// Falls back to localStorage when IndexedDB is unavailable (some private modes).
let dbp: Promise<IDBDatabase | null> | null = null
function open(): Promise<IDBDatabase | null> {
  if (dbp) return dbp
  dbp = new Promise((resolve) => {
    try {
      const req = indexedDB.open('jernlogg', 1)
      req.onupgradeneeded = () => req.result.createObjectStore('kv')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbp
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await open()
  if (!db) {
    try {
      const s = localStorage.getItem('jernlogg.kv.' + key)
      return s ? JSON.parse(s) : undefined
    } catch {
      return undefined
    }
  }
  return new Promise((resolve) => {
    try {
      const r = db.transaction('kv').objectStore('kv').get(key)
      r.onsuccess = () => resolve(r.result as T | undefined)
      r.onerror = () => resolve(undefined)
    } catch {
      resolve(undefined)
    }
  })
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const db = await open()
  if (!db) {
    try {
      localStorage.setItem('jernlogg.kv.' + key, JSON.stringify(value))
    } catch {}
    return
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction('kv', 'readwrite')
      tx.objectStore('kv').put(value, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}

export async function kvDelete(key: string): Promise<void> {
  const db = await open()
  if (!db) {
    try {
      localStorage.removeItem('jernlogg.kv.' + key)
    } catch {}
    return
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction('kv', 'readwrite')
      tx.objectStore('kv').delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}
