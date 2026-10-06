// Mirror of the access rules in supabase/auth.sql. The database is the real gatekeeper;
// this copy is only used by the local test backend (?local=1) and to pick the right write method.
import type { Doc } from './store'

export const LEGACY_IDS = ['felix', 'david', 'erik'] as const
export const APP_ADMIN = 'felix'

export function owner(c: string, id: string, d: any): string | null {
  if (c === 'profiles') return id.startsWith('profile:') ? id.slice(8) : null
  if (c === 'templates' || c === 'exercises' || c === 'routes') return d?.createdBy ?? null
  if (['groups', 'accounts', 'claims', 'push_log', 'feedback_review', 'healthcheck'].includes(c)) return null
  return d?.userId ?? null
}

/** Collections the client writes by update (never insert) – an upsert would be refused for these. */
export function writeByUpdate(d: Doc, me: string): boolean {
  if (d.collection === 'groups') return true
  if (d.collection === 'feedback' && owner(d.collection, d.id, d.data) !== me) return true
  return false
}

export function isPrivate(d: Doc): boolean {
  return d.collection === 'workouts' && d.data?.private === true
}

/** Which docs may `me` read? (same rules as the "jl read" policy) */
export function visibleTo(me: string, all: Doc[], authId?: string): Doc[] {
  const live = (d: Doc) => !d.deleted
  const myGroups = new Set(all.filter((d) => live(d) && d.collection === 'group_members' && d.data.userId === me).map((d) => d.data.groupId))
  const peers = new Set(all.filter((d) => live(d) && d.collection === 'group_members' && myGroups.has(d.data.groupId)).map((d) => d.data.userId))
  peers.add(me)
  const workoutOwner = new Map(all.filter((d) => d.collection === 'workouts').map((d) => [d.id, d.data.userId]))
  return all.filter((d) => {
    const o = owner(d.collection, d.id, d.data)
    switch (d.collection) {
      case 'accounts':
        return authId ? d.id === `account:${authId}` : false
      case 'workouts':
        return o === me || (!!o && peers.has(o) && !isPrivate(d))
      case 'profiles':
      case 'templates':
      case 'routes':
        return !!o && (o === me || peers.has(o))
      case 'reactions':
      case 'comments':
        return !!o && (o === me || peers.has(o) || workoutOwner.get(d.data.workoutId) === me)
      case 'exercises':
      case 'feedback':
      case 'feedback_complaints':
      case 'feedback_review':
        return true
      case 'groups':
        return myGroups.has(d.id)
      case 'group_members':
        return myGroups.has(d.data.groupId)
      case 'bodyweight':
      case 'supplements':
      case 'supplement_logs':
      case 'push_subscriptions':
        return o === me
      default:
        return false
    }
  })
}
