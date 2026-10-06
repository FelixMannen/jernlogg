// Groups: actions (via server functions) and per-group stats computed from members' visible, non-private workouts.
import { put, getDoc, rpc, type Doc } from './store'
import type { Group, GroupGoal, GroupChallenge, Workout } from './domain'
import { groupMembers } from './users'
import { doneWorkouts, workoutVolume, sharedOnly, startOfWeek, exerciseById } from './stats'

export const GOAL_METRICS: { id: GroupGoal['metric']; label: string; unit: string }[] = [
  { id: 'km', label: 'Km løping', unit: 'km' },
  { id: 'sessions', label: 'Antall økter', unit: 'økter' },
  { id: 'kg', label: 'Kg løftet', unit: 'kg' },
]

export const CHALLENGES: { id: GroupChallenge['kind']; label: string; needsExercise?: boolean; unit: string }[] = [
  { id: 'reps', label: 'Flest reps i en øvelse', needsExercise: true, unit: 'reps' },
  { id: 'heaviest', label: 'Tyngste løft i en øvelse', needsExercise: true, unit: 'kg' },
  { id: 'sessions', label: 'Flest økter', unit: 'økter' },
  { id: 'km', label: 'Flest km løpt', unit: 'km' },
  { id: 'volume', label: 'Mest volum (kg løftet)', unit: 'kg' },
]

const pad = (n: number) => String(n).padStart(2, '0')
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const fromYmd = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function inviteUrl(g: Group) {
  return `${location.origin}/#/bli-med/${g.inviteCode}`
}

/* ---------- actions ---------- */
export async function createGroup(name: string, emoji?: string, isPublic = false, description?: string): Promise<string> {
  return rpc<string>('jl_create_group', { p_name: name, p_emoji: emoji || null, p_public: isPublic, p_description: description || null })
}
export const joinByCode = (code: string) => rpc<string>('jl_join_group', { p_code: code })
export const joinPublic = (id: string) => rpc<string>('jl_join_group', { p_id: id })
export const leaveGroup = (id: string) => rpc<boolean>('jl_leave_group', { p_group: id })
export const kickMember = (id: string, userId: string) => rpc<boolean>('jl_kick', { p_group: id, p_user: userId })

export type GroupPreview = { id: string; name: string; emoji: string | null; description: string | null; public: boolean; members: number; isMember: boolean }
export const previewByCode = (code: string) => rpc<GroupPreview | null>('jl_group_preview', { p_code: code })
export const previewPublic = (id: string) => rpc<GroupPreview | null>('jl_group_preview', { p_id: id })
export const publicGroups = () => rpc<(GroupPreview & { members: number })[]>('jl_public_groups')

export type BoardRow = { id: string; name: string; emoji: string | null; members: number; kg: number; km: number; sessions: number; isMember: boolean }
export const groupBoard = (from: Date, to: Date) => rpc<BoardRow[]>('jl_group_board', { p_from: from.toISOString(), p_to: to.toISOString() })

/** Admin edits (name, emoji, public, invite link, goal, challenge, admin role). */
export function updateGroup(id: string, fn: (g: Group) => Group) {
  const cur = getDoc<Group>(id)
  if (!cur) return
  put('groups', id, fn(structuredClone(cur.data)))
}

export function newInviteCode(): string {
  const a = new Uint8Array(4)
  crypto.getRandomValues(a)
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/* ---------- stats ---------- */
function memberWorkouts(groupId: string, from: Date, to: Date): Doc<Workout>[] {
  const ids = new Set(groupMembers(groupId).map((m) => m.userId))
  return sharedOnly(() => doneWorkouts()).filter((w) => {
    if (!ids.has(w.data.userId) || w.data.private) return false
    const t = Date.parse(w.data.startedAt)
    return t >= from.getTime() && t < to.getTime()
  })
}

function km(w: Workout) {
  return w.kind === 'run' ? w.run?.distanceKm || 0 : 0
}

export function goalRange(g: GroupGoal): { from: Date; to: Date } {
  const to = fromYmd(g.to)
  to.setDate(to.getDate() + 1) // inclusive end date
  return { from: fromYmd(g.from), to }
}

export function goalProgressFor(groupId: string, g: GroupGoal): { done: number; perUser: Map<string, number> } {
  const { from, to } = goalRange(g)
  const perUser = new Map<string, number>()
  for (const w of memberWorkouts(groupId, from, to)) {
    const v = g.metric === 'km' ? km(w.data) : g.metric === 'sessions' ? 1 : w.data.kind === 'run' ? 0 : workoutVolume(w.data)
    perUser.set(w.data.userId, (perUser.get(w.data.userId) || 0) + v)
  }
  const done = [...perUser.values()].reduce((a, b) => a + b, 0)
  return { done: Math.round(done * 10) / 10, perUser }
}

export function thisMonday(): string {
  return ymd(startOfWeek())
}

/** Is the challenge running this week? */
export function activeChallenge(g: Group): GroupChallenge | null {
  const c = g.challenge
  if (!c) return null
  const mon = thisMonday()
  if (c.weekOf === mon || (c.repeat && c.weekOf <= mon)) return c
  return null
}

export function challengeTitle(c: GroupChallenge): string {
  const ex = c.exerciseId ? exerciseById(c.exerciseId).name.toLowerCase() : ''
  switch (c.kind) {
    case 'reps':
      return `Flest reps i ${ex}`
    case 'heaviest':
      return `Tyngste ${ex}`
    case 'sessions':
      return 'Flest økter'
    case 'km':
      return 'Flest km løpt'
    case 'volume':
      return 'Mest volum'
  }
}

/** Values per member this week, highest first (everyone listed, also with 0). */
export function challengeBoard(groupId: string, c: GroupChallenge): { userId: string; value: number }[] {
  const from = startOfWeek()
  const to = new Date(from)
  to.setDate(to.getDate() + 7)
  const vals = new Map(groupMembers(groupId).map((m) => [m.userId, 0]))
  for (const w of memberWorkouts(groupId, from, to)) {
    const u = w.data.userId
    let v = vals.get(u) || 0
    if (c.kind === 'sessions') v += 1
    else if (c.kind === 'km') v += km(w.data)
    else if (c.kind === 'volume') v += w.data.kind === 'run' ? 0 : workoutVolume(w.data)
    else
      for (const ex of w.data.exercises)
        if (ex.exerciseId === c.exerciseId)
          for (const s of ex.sets)
            if (s.done && !s.warmup) {
              if (c.kind === 'reps') v += s.reps || 0
              else v = Math.max(v, s.weight || 0)
            }
    vals.set(u, v)
  }
  return [...vals.entries()].map(([userId, value]) => ({ userId, value: Math.round(value * 10) / 10 })).sort((a, b) => b.value - a.value)
}

/** This week per member: sessions, kg lifted, km run. */
export function weekStats(groupId: string): { userId: string; sessions: number; kg: number; km: number }[] {
  const from = startOfWeek()
  const to = new Date(from)
  to.setDate(to.getDate() + 7)
  const m = new Map(groupMembers(groupId).map((x) => [x.userId, { userId: x.userId, sessions: 0, kg: 0, km: 0 }]))
  for (const w of memberWorkouts(groupId, from, to)) {
    const r = m.get(w.data.userId)
    if (!r) continue
    r.sessions++
    if (w.data.kind === 'run') r.km += km(w.data)
    else r.kg += workoutVolume(w.data)
  }
  return [...m.values()].sort((a, b) => b.sessions - a.sessions || b.kg + b.km * 100 - (a.kg + a.km * 100))
}
