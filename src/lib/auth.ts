// Sign-in with a 6-digit code sent by e-mail (Supabase Auth). The session is kept on the device
// (refreshed automatically), so people only sign in once per phone.
import { useSyncExternalStore } from 'react'
import { supabase, isLocal } from './supabase'
import { init as initStore, reset as resetStore, rpc } from './store'
import { localSession, localSignIn, localSignOut, localMe, localRpc } from './localServer'
import { forgetDevice } from './push'

export type AuthState =
  | { phase: 'loading' }
  | { phase: 'signedOut' }
  | { phase: 'onboarding'; email: string }
  | { phase: 'ready'; userId: string; email: string }
  | { phase: 'error'; message: string }

let state: AuthState = { phase: 'loading' }
const listeners = new Set<() => void>()
function setState(s: AuthState) {
  state = s
  listeners.forEach((l) => l())
}
export function getAuth() {
  return state
}
export function useAuth(): AuthState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
  )
}

const ACCOUNT_CACHE = (authId: string) => `jernlogg.account.${authId}`
async function callRpc(name: string, args: Record<string, any> = {}): Promise<any> {
  if (isLocal) return localRpc(name, args)
  const { data, error } = await supabase!.rpc(name, args)
  if (error) throw new Error(error.message)
  return data
}

async function becomeReady(userId: string, email: string, authId: string | null) {
  if (state.phase === 'ready' && state.userId === userId && state.email === email) return
  if (authId) {
    try {
      localStorage.setItem(ACCOUNT_CACHE(authId), userId)
      localStorage.setItem('jernlogg.me', userId) // used by the service worker / notifications
    } catch {}
  }
  setState({ phase: 'ready', userId, email })
  await initStore(userId)
}

let resolving: string | null = null
async function resolve(authId: string, email: string) {
  if (resolving === authId) return
  resolving = authId
  try {
    // offline-first: we already know who this is on this device
    const cached = localStorage.getItem(ACCOUNT_CACHE(authId))
    if (cached) {
      becomeReady(cached, email, authId)
      callRpc('jl_whoami')
        .then((id) => {
          if (id && id !== cached) becomeReady(id, email, authId)
          if (id === null) {
            // the account was deleted (e.g. from another phone): start over
            localStorage.removeItem(ACCOUNT_CACHE(authId))
            resetStore()
            setState({ phase: 'onboarding', email })
          }
        })
        .catch(() => {})
      return
    }
    const id = (await callRpc('jl_whoami')) as string | null
    if (id) await becomeReady(id, email, authId)
    else setState({ phase: 'onboarding', email })
  } catch (e: any) {
    setState({ phase: 'error', message: navigator.onLine ? `Klarte ikke å hente kontoen: ${e?.message ?? e}` : 'Du må være på nett første gang du logger inn.' })
  } finally {
    resolving = null
  }
}

export function startAuth() {
  if (isLocal) {
    const s = localSession()
    if (s) resolve(s.authId, s.email)
    else {
      const dev = localMe() // test shortcut: localStorage 'jernlogg.me'
      if (dev) becomeReady(dev, `${dev}@local`, null)
      else setState({ phase: 'signedOut' })
    }
    return
  }
  const client = supabase!
  client.auth.onAuthStateChange((event, session) => {
    // don't call supabase from inside the callback (can deadlock) – defer
    setTimeout(() => {
      if (event === 'SIGNED_OUT' || !session) {
        if (state.phase !== 'signedOut') {
          resetStore()
          setState({ phase: 'signedOut' })
        }
        return
      }
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || (event === 'TOKEN_REFRESHED' && state.phase === 'loading')) {
        if (state.phase === 'ready' && event !== 'INITIAL_SESSION') return
        resolve(session.user.id, session.user.email ?? '')
      }
    }, 0)
  })
}

export function retryAuth() {
  setState({ phase: 'loading' })
  if (isLocal) return startAuth()
  supabase!.auth.getSession().then(({ data }) => {
    if (data.session) resolve(data.session.user.id, data.session.user.email ?? '')
    else setState({ phase: 'signedOut' })
  })
}

export async function requestCode(email: string): Promise<void> {
  if (isLocal) return
  const { error } = await supabase!.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
  if (error) throw new Error(friendly(error.message))
}

export async function verifyCode(email: string, code: string): Promise<void> {
  if (isLocal) {
    if (code !== '123456') throw new Error('Feil kode. Sjekk e-posten og prøv igjen.')
    const s = localSignIn(email)
    await resolve(s.authId, s.email)
    return
  }
  const { error } = await supabase!.auth.verifyOtp({ email, token: code, type: 'email' })
  if (error) throw new Error(friendly(error.message))
}

function friendly(msg: string): string {
  if (/expired|invalid/i.test(msg)) return 'Koden er feil eller utløpt. Be om en ny kode.'
  if (/rate|security purposes|seconds/i.test(msg)) return 'Vent litt før du ber om en ny kode.'
  if (/fetch|network/i.test(msg)) return 'Ingen nettforbindelse.'
  return msg
}

export async function register(name: string, color: string, emoji?: string): Promise<string> {
  const id = (await callRpc('jl_register', { p_name: name, p_color: color, p_emoji: emoji || null })) as string
  const authId = isLocal ? localSession()?.authId ?? null : (await supabase!.auth.getSession()).data.session?.user.id ?? null
  await becomeReady(id, state.phase === 'onboarding' ? state.email : '', authId)
  return id
}

/** Link this login to one of the original users (David/Erik) with a code Felix made. */
export async function claimLegacy(legacy: string, code: string): Promise<string> {
  const id = (await callRpc('jl_claim', { p_legacy: legacy, p_code: code })) as string
  const authId = isLocal ? localSession()?.authId ?? null : (await supabase!.auth.getSession()).data.session?.user.id ?? null
  const email = state.phase === 'onboarding' || state.phase === 'ready' ? state.email : ''
  await becomeReady(id, email, authId)
  return id
}

export async function signOut() {
  if (state.phase === 'ready') await forgetDevice(state.userId)
  resetStore()
  try {
    localStorage.removeItem('jernlogg.me')
  } catch {}
  if (isLocal) {
    localSignOut()
    setState({ phase: 'signedOut' })
    return
  }
  const authId = (await supabase!.auth.getSession()).data.session?.user.id
  if (authId) localStorage.removeItem(ACCOUNT_CACHE(authId))
  await supabase!.auth.signOut({ scope: 'local' }).catch(() => {})
  setState({ phase: 'signedOut' })
}

export async function deleteAccount() {
  await rpc('jl_delete_account')
  await signOut()
}

/* ---------- links that need a login first (claim / group invite) ---------- */
const PENDING = 'jernlogg.pendingLink'
export function rememberLink(hash: string) {
  try {
    localStorage.setItem(PENDING, hash)
  } catch {}
}
export function takeLink(): string | null {
  try {
    const h = localStorage.getItem(PENDING)
    localStorage.removeItem(PENDING)
    return h
  } catch {
    return null
  }
}
export function peekLink(): string | null {
  try {
    return localStorage.getItem(PENDING)
  } catch {
    return null
  }
}
