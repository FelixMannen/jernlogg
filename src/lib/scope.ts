// Which people the feed and leaderboards show: everyone I can see ('alle') or one of my groups.
// Shared between pages and remembered on the device.
import { useSyncExternalStore } from 'react'
import { myGroups, usersInScope, userById, type UserInfo } from './users'
import type { Doc } from './store'
import type { Workout } from './domain'

const KEY = 'jernlogg.scope'
let scope: string = (() => {
  try {
    return localStorage.getItem(KEY) || 'alle'
  } catch {
    return 'alle'
  }
})()
const listeners = new Set<() => void>()

export function setScope(s: string) {
  scope = s
  try {
    localStorage.setItem(KEY, s)
  } catch {}
  listeners.forEach((l) => l())
}

/** Current scope, falling back to 'alle' if I'm no longer in that group. */
export function useScope(me: string): [string, (s: string) => void] {
  const s = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => scope,
  )
  const valid = s === 'alle' || myGroups(me).some((g) => g.id === s)
  return [valid ? s : 'alle', setScope]
}

export function scopeUsers(me: string, s: string): UserInfo[] {
  return usersInScope(me, s).map(userById)
}

/** Does this workout belong in the scope? Private workouts only show in my own 'alle' view. */
export function inScope(w: Doc<Workout>, ids: Set<string>, s: string): boolean {
  if (!ids.has(w.data.userId)) return false
  if (w.data.private && s !== 'alle') return false
  return true
}
