// Local stand-in for Supabase (only with ?local=1, used by the automated tests).
// Mirrors the RPCs in supabase/auth.sql closely enough to exercise every screen without touching production.
import type { Doc } from './store'
import { owner, visibleTo, APP_ADMIN, LEGACY_IDS } from './access'

const DB_KEY = 'jernlogg.localdb.v1'
const AUTH_KEY = 'jernlogg.localauth'

export function readDb(): Doc[] {
  try {
    return JSON.parse(localStorage.getItem(DB_KEY) || '[]')
  } catch {
    return []
  }
}
export function writeDb(all: Doc[]) {
  localStorage.setItem(DB_KEY, JSON.stringify(all))
}
export function upsertDb(docs: Doc[]) {
  const map = new Map(readDb().map((d) => [d.id, d]))
  const ts = new Date().toISOString()
  for (const d of docs) map.set(d.id, { ...d, synced_at: ts } as any)
  writeDb([...map.values()])
}

function rand(n: number) {
  let s = ''
  while (s.length < n) s += Math.random().toString(16).slice(2)
  return s.slice(0, n)
}
function now() {
  return new Date().toISOString()
}
function put(id: string, collection: string, data: any) {
  const all = readDb()
  const cur = all.find((d) => d.id === id)
  const ts = now()
  upsertDb([{ id, collection, data, created_at: cur?.created_at ?? ts, updated_at: ts, deleted: false }])
}
function get(id: string): Doc | undefined {
  const d = readDb().find((x) => x.id === id)
  return d && !d.deleted ? d : undefined
}
function live(c: string) {
  return readDb().filter((d) => d.collection === c && !d.deleted)
}

/* ---------- local auth ---------- */
export type LocalSession = { authId: string; email: string }
export function localSession(): LocalSession | null {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) || 'null')
  } catch {
    return null
  }
}
export function localSignIn(email: string): LocalSession {
  const accounts = readDb().filter((d) => d.collection === 'auth_users')
  let u = accounts.find((a) => a.data.email === email.toLowerCase())
  if (!u) {
    const authId = 'a' + rand(15)
    put(`auth:${authId}`, 'auth_users', { email: email.toLowerCase(), authId })
    u = get(`auth:${authId}`)!
  }
  const s = { authId: u.data.authId, email: u.data.email }
  localStorage.setItem(AUTH_KEY, JSON.stringify(s))
  return s
}
export function localSignOut() {
  localStorage.removeItem(AUTH_KEY)
}

/** Dev shortcut kept for older tests: localStorage 'jernlogg.me' = user id. */
function devMe(): string | null {
  try {
    return localSession() ? null : localStorage.getItem('jernlogg.me')
  } catch {
    return null
  }
}

export function localMe(): string | null {
  const s = localSession()
  if (s) return (get(`account:${s.authId}`)?.data.userId as string) ?? null
  return devMe()
}

/** The original three are already in one group (seeded by auth.sql in production). */
export function ensureLocalSeed() {
  if (readDb().some((d) => d.id === 'g_jernlogg')) return
  put('g_jernlogg', 'groups', { name: 'Jernlogg-gjengen', emoji: '🏋️', adminId: 'felix', public: false, inviteCode: 'jern' + rand(4), inviteEnabled: true, createdAt: now(), createdBy: 'felix' })
  for (const u of LEGACY_IDS) put(`gm:g_jernlogg:${u}`, 'group_members', { groupId: 'g_jernlogg', userId: u, joinedAt: now() })
}

export function localLoad(since?: string): Doc[] {
  const me = localMe()
  if (!me) return []
  const all = readDb().filter((d) => d.collection !== 'auth_users' && d.collection !== 'claims')
  const vis = visibleTo(me, all, localSession()?.authId)
  if (since) return vis.filter((d: any) => (d.synced_at ?? '') > since)
  return vis.filter((d) => !d.deleted)
}

function isMember(gid: string, uid: string) {
  return !!get(`gm:${gid}:${uid}`)
}
function handover(gid: string, leaving: string) {
  const next = live('group_members')
    .filter((m) => m.data.groupId === gid && m.data.userId !== leaving)
    .sort((a, b) => (a.data.joinedAt || '').localeCompare(b.data.joinedAt || ''))[0]
  const g = get(gid)
  if (!g) return
  if (!next) upsertDb([{ ...g, deleted: true, updated_at: now() }])
  else if (g.data.adminId === leaving) put(gid, 'groups', { ...g.data, adminId: next.data.userId })
}
function fail(msg: string): never {
  throw new Error(msg)
}

export async function localRpc(name: string, args: Record<string, any> = {}): Promise<any> {
  await new Promise((r) => setTimeout(r, 30))
  const s = localSession()
  const me = localMe()
  switch (name) {
    case 'jl_whoami': {
      if (!s) return devMe()
      if (me) return me
      if (s.email.startsWith('felix@') && !live('accounts').some((a) => a.data.userId === 'felix')) {
        put(`account:${s.authId}`, 'accounts', { userId: 'felix', linkedAt: now() })
        return 'felix'
      }
      return null
    }
    case 'jl_register': {
      if (!s) fail('Ikke logget inn')
      const nm = String(args.p_name ?? '').trim()
      if (nm.length < 1 || nm.length > 30) fail('Navnet må være 1–30 tegn')
      let id = await localRpc('jl_whoami')
      if (!id) {
        id = 'u' + rand(11)
        put(`account:${s.authId}`, 'accounts', { userId: id, createdAt: now() })
      }
      const prof = get(`profile:${id}`)?.data ?? {}
      put(`profile:${id}`, 'profiles', { ...prof, name: nm, ...(args.p_color ? { color: args.p_color } : {}), ...(args.p_emoji ? { emoji: args.p_emoji } : {}) })
      return id
    }
    case 'jl_claim': {
      if (!s) fail('Ikke logget inn')
      const c = readDb().find((d) => d.id === `claim:${args.p_legacy}` && !d.deleted)
      if (!c || c.data.code !== args.p_code || c.data.used) fail('Koblingslenken er ugyldig eller allerede brukt')
      if (live('accounts').some((a) => a.data.userId === args.p_legacy && a.id !== `account:${s.authId}`)) fail('Den brukeren er allerede koblet til en annen konto')
      put(`account:${s.authId}`, 'accounts', { userId: args.p_legacy, linkedAt: now() })
      put(c.id, 'claims', { ...c.data, used: true, usedAt: now() })
      return args.p_legacy
    }
    case 'jl_create_claim': {
      if (me !== APP_ADMIN) fail('Bare Felix kan lage koblingslenker')
      const code = rand(10)
      put(`claim:${args.p_legacy}`, 'claims', { code, createdAt: now(), used: false })
      return code
    }
    case 'jl_legacy_status':
      return Object.fromEntries(LEGACY_IDS.map((u) => [u, live('accounts').some((a) => a.data.userId === u)]))
    case 'jl_delete_account': {
      if (!me) fail('Ingen konto')
      for (const g of live('groups').filter((g) => g.data.adminId === me)) handover(g.id, me)
      writeDb(readDb().filter((d) => owner(d.collection, d.id, d.data) !== me && d.id !== `account:${s?.authId}` && d.id !== `auth:${s?.authId}`))
      return true
    }
    case 'jl_create_group': {
      if (!me) fail('Ikke logget inn')
      const nm = String(args.p_name ?? '').trim()
      if (nm.length < 1 || nm.length > 40) fail('Gruppenavnet må være 1–40 tegn')
      const gid = 'g' + rand(12)
      const data: any = { name: nm, adminId: me, public: !!args.p_public, inviteCode: rand(8), inviteEnabled: true, createdAt: now(), createdBy: me }
      if (args.p_emoji) data.emoji = args.p_emoji
      if (args.p_description) data.description = String(args.p_description).trim()
      put(gid, 'groups', data)
      put(`gm:${gid}:${me}`, 'group_members', { groupId: gid, userId: me, joinedAt: now() })
      return gid
    }
    case 'jl_group_preview': {
      const g = args.p_code
        ? live('groups').find((g) => String(g.data.inviteCode).toLowerCase() === String(args.p_code).toLowerCase() && g.data.inviteEnabled !== false)
        : live('groups').find((g) => g.id === args.p_id && g.data.public)
      if (!g) return null
      return {
        id: g.id,
        name: g.data.name,
        emoji: g.data.emoji ?? null,
        description: g.data.description ?? null,
        public: !!g.data.public,
        members: live('group_members').filter((m) => m.data.groupId === g.id).length,
        isMember: !!me && isMember(g.id, me),
      }
    }
    case 'jl_join_group': {
      if (!me) fail('Ikke logget inn')
      const p = await localRpc('jl_group_preview', args)
      if (!p) fail('Fant ingen gruppe – lenken kan være utløpt')
      if (!isMember(p.id, me)) put(`gm:${p.id}:${me}`, 'group_members', { groupId: p.id, userId: me, joinedAt: now() })
      return p.id
    }
    case 'jl_leave_group': {
      if (!me || !isMember(args.p_group, me)) fail('Du er ikke med i gruppa')
      upsertDb([{ ...get(`gm:${args.p_group}:${me}`)!, deleted: true, updated_at: now() }])
      handover(args.p_group, me)
      return true
    }
    case 'jl_kick': {
      const g = get(args.p_group)
      if (!me || g?.data.adminId !== me) fail('Bare admin kan fjerne medlemmer')
      if (args.p_user === me) fail('Bruk «Forlat gruppa» for å gå ut selv')
      const m = get(`gm:${args.p_group}:${args.p_user}`)
      if (m) upsertDb([{ ...m, deleted: true, updated_at: now() }])
      return !!m
    }
    case 'jl_public_groups':
      return live('groups')
        .filter((g) => g.data.public)
        .map((g) => ({ id: g.id, name: g.data.name, emoji: g.data.emoji ?? null, description: g.data.description ?? null, members: live('group_members').filter((m) => m.data.groupId === g.id).length, isMember: !!me && isMember(g.id, me) }))
        .sort((a, b) => b.members - a.members || a.name.localeCompare(b.name))
    case 'jl_group_board': {
      const pub = live('groups').filter((g) => g.data.public)
      const members = live('group_members')
      const ws = live('workouts').filter((w) => w.data.status === 'done' && w.data.private !== true && w.data.startedAt >= args.p_from && w.data.startedAt < args.p_to)
      return pub
        .map((g) => {
          const uids = members.filter((m) => m.data.groupId === g.id).map((m) => m.data.userId)
          let kg = 0,
            km = 0,
            sessions = 0
          for (const w of ws) {
            if (!uids.includes(w.data.userId)) continue
            sessions++
            if (w.data.kind === 'run') km += w.data.run?.distanceKm || 0
            else for (const ex of w.data.exercises || []) for (const st of ex.sets || []) if (st.done && !st.warmup) kg += (st.weight || 0) * (st.reps || 0)
          }
          return { id: g.id, name: g.data.name, emoji: g.data.emoji ?? null, members: uids.length, kg: Math.round(kg), km: Math.round(km * 10) / 10, sessions, isMember: !!me && uids.includes(me) }
        })
        .filter((r) => r.members > 0)
        .sort((a, b) => b.kg - a.kg)
    }
    default:
      fail('Ukjent funksjon ' + name)
  }
}
