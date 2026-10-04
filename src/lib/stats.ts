import { list, getDoc, getVersion, type Doc } from './store'
import {
  BUILTIN_EXERCISES,
  type Exercise,
  type Workout,
  type SetEntry,
  type UserId,
  type Template,
  type Profile,
  type BodyweightEntry,
} from './domain'

/* ---------- memo (invalidated whenever the store changes) ---------- */
let memoVersion = -1
const memoMap = new Map<string, any>()
function memo<T>(key: string, fn: () => T): T {
  const v = getVersion()
  if (v !== memoVersion) {
    memoMap.clear()
    memoVersion = v
  }
  if (memoMap.has(key)) return memoMap.get(key)
  const r = fn()
  memoMap.set(key, r)
  return r
}

/* ---------- basic math ---------- */
export function e1rm(weight: number | null | undefined, reps: number | null | undefined): number {
  if (!weight || !reps || reps <= 0) return 0
  if (reps === 1) return weight
  return weight * (1 + Math.min(reps, 15) / 30)
}

export function setVolume(s: SetEntry) {
  if (!s.done || s.warmup) return 0
  return (s.weight || 0) * (s.reps || 0)
}

export function workoutVolume(w: Workout) {
  let v = 0
  for (const ex of w.exercises) for (const s of ex.sets) v += setVolume(s)
  return v
}

export function workoutSetCount(w: Workout) {
  let n = 0
  for (const ex of w.exercises) for (const s of ex.sets) if (s.done && !s.warmup) n++
  return n
}

export function fmtKg(n: number | null | undefined, digits = 1): string {
  if (n == null || isNaN(n)) return '–'
  const r = Math.round(n * 10 ** digits) / 10 ** digits
  return r.toLocaleString('nb-NO', { maximumFractionDigits: digits })
}

export function fmtVolume(n: number): string {
  if (n >= 10000) return `${(n / 1000).toLocaleString('nb-NO', { maximumFractionDigits: 1 })} t`
  return `${Math.round(n).toLocaleString('nb-NO')} kg`
}

export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

export function fmtDurationShort(ms: number): string {
  const m = Math.round(ms / 60000)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} t ${m % 60} min`
}

const DAYS = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør']
export function fmtRelDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((startOf(now) - startOf(d)) / 86400000)
  const time = d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })
  if (diff === 0) return `i dag ${time}`
  if (diff === 1) return `i går ${time}`
  if (diff < 7) return `${DAYS[d.getDay()]} ${time}`
  return d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' })
}

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })
}

/* ---------- ISO week helpers ---------- */
export function weekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${t.getUTCFullYear()}-${String(week).padStart(2, '0')}`
}

export function startOfWeek(d = new Date()): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = x.getDay() || 7
  x.setDate(x.getDate() - day + 1)
  return x
}

/* ---------- selectors ---------- */
export function exercises(): Exercise[] {
  const custom = list<Exercise>('exercises').map((d) => ({ ...d.data, id: d.id, custom: true }))
  return [...BUILTIN_EXERCISES, ...custom]
}

const exCache = new Map<string, Exercise>()
export function exerciseById(id: string): Exercise {
  const b = BUILTIN_EXERCISES.find((e) => e.id === id)
  if (b) return b
  const d = getDoc<Exercise>(id)
  if (d) return { ...d.data, id, custom: true }
  return exCache.get(id) ?? { id, name: 'Ukjent øvelse', group: 'Annet', equipment: 'Annet' }
}

export function workouts(): Doc<Workout>[] {
  return memo('workouts', () => list<Workout>('workouts').sort((a, b) => b.data.startedAt.localeCompare(a.data.startedAt)))
}

export function doneWorkouts(userId?: string): Doc<Workout>[] {
  return memo('done:' + (userId ?? ''), () => workouts().filter((w) => w.data.status === 'done' && (!userId || w.data.userId === userId)))
}

export function activeWorkout(userId: string): Doc<Workout> | undefined {
  return workouts().find((w) => w.data.status === 'active' && w.data.userId === userId)
}

export function activeWorkouts(): Doc<Workout>[] {
  // ignore stale sessions older than 6 hours
  const cutoff = Date.now() - 6 * 3600 * 1000
  return workouts().filter((w) => w.data.status === 'active' && !w.data.reopenedFrom && Date.parse(w.data.startedAt) > cutoff)
}

export function templates(): Doc<Template>[] {
  return list<Template>('templates').sort((a, b) => a.data.name.localeCompare(b.data.name, 'nb'))
}

export function profile(userId: string): Profile {
  return getDoc<Profile>(`profile:${userId}`)?.data ?? {}
}

export function bodyweights(userId: string): BodyweightEntry[] {
  return list<BodyweightEntry>('bodyweight')
    .map((d) => d.data)
    .filter((b) => b.userId === userId)
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function latestBodyweight(userId: string): number | undefined {
  const bw = bodyweights(userId)
  return bw.length ? bw[bw.length - 1].weight : profile(userId).bodyweight
}

/* ---------- per-exercise history ---------- */
export type ExerciseSession = {
  workoutId: string
  date: string
  sets: SetEntry[]
  topWeight: number
  bestE1rm: number
  bestSet?: SetEntry
  volume: number
  totalReps: number
}

export function exerciseHistory(userId: string, exerciseId: string, excludeWorkoutId?: string): ExerciseSession[] {
  return memo(`hist:${userId}:${exerciseId}:${excludeWorkoutId ?? ''}`, () => exerciseHistoryRaw(userId, exerciseId, excludeWorkoutId))
}
function exerciseHistoryRaw(userId: string, exerciseId: string, excludeWorkoutId?: string): ExerciseSession[] {
  const out: ExerciseSession[] = []
  for (const w of doneWorkouts(userId)) {
    if (w.id === excludeWorkoutId) continue
    const sets: SetEntry[] = []
    for (const ex of w.data.exercises) if (ex.exerciseId === exerciseId) sets.push(...ex.sets.filter((s) => s.done))
    if (!sets.length) continue
    const work = sets.filter((s) => !s.warmup)
    let top = 0,
      best = 0,
      vol = 0,
      reps = 0
    let bestSet: SetEntry | undefined
    for (const s of work) {
      top = Math.max(top, s.weight || 0)
      const e = e1rm(s.weight, s.reps)
      if (e > best) {
        best = e
        bestSet = s
      }
      vol += (s.weight || 0) * (s.reps || 0)
      reps += s.reps || 0
    }
    out.push({ workoutId: w.id, date: w.data.startedAt, sets, topWeight: top, bestE1rm: best, bestSet, volume: vol, totalReps: reps })
  }
  return out // newest first
}

export type Records = { maxWeight: number; maxE1rm: number; maxVolume: number; maxReps: number; repsAtWeight: Map<number, number> }

export function recordsFrom(history: ExerciseSession[]): Records {
  const r: Records = { maxWeight: 0, maxE1rm: 0, maxVolume: 0, maxReps: 0, repsAtWeight: new Map() }
  for (const h of history) {
    r.maxWeight = Math.max(r.maxWeight, h.topWeight)
    r.maxE1rm = Math.max(r.maxE1rm, h.bestE1rm)
    r.maxVolume = Math.max(r.maxVolume, h.volume)
    for (const s of h.sets) {
      if (s.warmup) continue
      r.maxReps = Math.max(r.maxReps, s.reps || 0)
      const w = s.weight || 0
      r.repsAtWeight.set(w, Math.max(r.repsAtWeight.get(w) || 0, s.reps || 0))
    }
  }
  return r
}

export type PRKind = 'weight' | 'e1rm' | 'reps' | 'volume'
export const PR_LABEL: Record<PRKind, string> = {
  weight: 'Tyngste vekt',
  e1rm: 'Beste 1RM (est.)',
  reps: 'Flest reps',
  volume: 'Mest volum',
}

export type PR = { kind: PRKind; exerciseId: string; value: number; prev: number; setUid?: string }

/** PRs set in workout `w` compared to all earlier workouts by the same user. */
export function prsForWorkout(workoutId: string, w: Workout): PR[] {
  const prs: PR[] = []
  const earlierAll = doneWorkouts(w.userId).filter((x) => x.id !== workoutId && x.data.startedAt < w.startedAt)
  const earlierIds = new Set(earlierAll.map((x) => x.id))
  const seen = new Set<string>()
  for (const ex of w.exercises) {
    if (seen.has(ex.exerciseId)) continue
    seen.add(ex.exerciseId)
    const hist = exerciseHistory(w.userId, ex.exerciseId).filter((h) => earlierIds.has(h.workoutId))
    if (!hist.length) continue
    const rec = recordsFrom(hist)
    const sets = w.exercises.filter((e) => e.exerciseId === ex.exerciseId).flatMap((e) => e.sets.filter((s) => s.done && !s.warmup))
    if (!sets.length) continue
    let bestW: SetEntry | undefined, bestE: SetEntry | undefined
    let vol = 0
    for (const s of sets) {
      if (!bestW || (s.weight || 0) > (bestW.weight || 0)) bestW = s
      if (!bestE || e1rm(s.weight, s.reps) > e1rm(bestE.weight, bestE.reps)) bestE = s
      vol += (s.weight || 0) * (s.reps || 0)
    }
    if (bestW && (bestW.weight || 0) > rec.maxWeight && rec.maxWeight > 0)
      prs.push({ kind: 'weight', exerciseId: ex.exerciseId, value: bestW.weight || 0, prev: rec.maxWeight, setUid: bestW.uid })
    const be = bestE ? e1rm(bestE.weight, bestE.reps) : 0
    if (bestE && be > rec.maxE1rm + 0.01 && rec.maxE1rm > 0 && !(bestW && bestE.uid === bestW.uid && prs.some((p) => p.kind === 'weight' && p.exerciseId === ex.exerciseId && bestE!.reps === 1)))
      prs.push({ kind: 'e1rm', exerciseId: ex.exerciseId, value: be, prev: rec.maxE1rm, setUid: bestE.uid })
    if (vol > rec.maxVolume && rec.maxVolume > 0 && hist.length >= 2) prs.push({ kind: 'volume', exerciseId: ex.exerciseId, value: vol, prev: rec.maxVolume })
  }
  return prs
}

/** Check a single set live against history (excluding current workout). */
export function livePRCheck(userId: string, exerciseId: string, s: SetEntry, workoutId: string, otherSetsInWorkout: SetEntry[]): PRKind[] {
  if (!s.weight || !s.reps || s.warmup) return []
  const hist = exerciseHistory(userId, exerciseId, workoutId)
  if (!hist.length) return []
  const rec = recordsFrom(hist)
  const prior = otherSetsInWorkout.filter((o) => o.uid !== s.uid && o.done && !o.warmup)
  const maxW = Math.max(rec.maxWeight, ...prior.map((p) => p.weight || 0))
  const maxE = Math.max(rec.maxE1rm, ...prior.map((p) => e1rm(p.weight, p.reps)))
  const kinds: PRKind[] = []
  if (s.weight > maxW) kinds.push('weight')
  else if (e1rm(s.weight, s.reps) > maxE + 0.01) kinds.push('e1rm')
  const atW = rec.repsAtWeight.get(s.weight)
  if (!kinds.length && atW != null && s.reps > atW && !prior.some((p) => p.weight === s.weight && (p.reps || 0) >= s.reps!)) kinds.push('reps')
  return kinds
}

/** Last performed sets for an exercise (for "Forrige" column + prefill). */
export function lastSession(userId: string, exerciseId: string, excludeWorkoutId?: string): ExerciseSession | undefined {
  return exerciseHistory(userId, exerciseId, excludeWorkoutId)[0]
}

/* ---------- user-level stats ---------- */
export function weeklyVolume(userId: string, weeks = 12): { key: string; label: string; volume: number; count: number }[] {
  const out: { key: string; label: string; volume: number; count: number }[] = []
  const start = startOfWeek()
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(start)
    d.setDate(d.getDate() - i * 7)
    out.push({ key: weekKey(d), label: `u${weekKey(d).slice(5).replace(/^0/, '')}`, volume: 0, count: 0 })
  }
  for (const w of doneWorkouts(userId)) {
    const k = weekKey(new Date(w.data.startedAt))
    const slot = out.find((o) => o.key === k)
    if (slot) {
      slot.volume += workoutVolume(w.data)
      slot.count++
    }
  }
  return out
}

/** Consecutive ISO weeks with ≥1 workout, counting back from this week (this week may be empty without breaking). */
export function streakWeeks(userId: string): number {
  const keys = new Set(doneWorkouts(userId).map((w) => weekKey(new Date(w.data.startedAt))))
  let n = 0
  const d = startOfWeek()
  if (!keys.has(weekKey(d))) d.setDate(d.getDate() - 7)
  while (keys.has(weekKey(d))) {
    n++
    d.setDate(d.getDate() - 7)
  }
  return n
}

export function bestE1rm(userId: string, exerciseId: string): { value: number; date?: string; set?: SetEntry } {
  let best = { value: 0 } as { value: number; date?: string; set?: SetEntry }
  for (const h of exerciseHistory(userId, exerciseId)) if (h.bestE1rm > best.value) best = { value: h.bestE1rm, date: h.date, set: h.bestSet }
  return best
}

export function favoriteExercises(userId: string, n = 5): { exerciseId: string; count: number }[] {
  const m = new Map<string, number>()
  for (const w of doneWorkouts(userId)) {
    const seen = new Set<string>()
    for (const ex of w.data.exercises) {
      if (seen.has(ex.exerciseId) || !ex.sets.some((s) => s.done)) continue
      seen.add(ex.exerciseId)
      m.set(ex.exerciseId, (m.get(ex.exerciseId) || 0) + 1)
    }
  }
  return [...m.entries()]
    .map(([exerciseId, count]) => ({ exerciseId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n)
}

export function usedExerciseIds(userId?: string): string[] {
  const m = new Map<string, string>()
  for (const w of doneWorkouts(userId)) for (const ex of w.data.exercises) if (ex.sets.some((s) => s.done)) {
    const prev = m.get(ex.exerciseId)
    if (!prev || w.data.startedAt > prev) m.set(ex.exerciseId, w.data.startedAt)
  }
  return [...m.entries()].sort((a, b) => b[1].localeCompare(a[1])).map(([id]) => id)
}

export function workoutsInRange(userId: string, from: Date, to = new Date()) {
  return doneWorkouts(userId).filter((w) => {
    const t = Date.parse(w.data.startedAt)
    return t >= from.getTime() && t <= to.getTime()
  })
}

export function userIdsOrdered(): UserId[] {
  return ['felix', 'david', 'erik']
}

/** Progression hint: if every work set last time hit the same reps at the same weight (and >= 5 reps), suggest a small jump. */
export function progressionHint(userId: string, exerciseId: string, excludeWorkoutId?: string): string | null {
  const last = lastSession(userId, exerciseId, excludeWorkoutId)
  if (!last) return null
  const work = last.sets.filter((s) => !s.warmup && s.weight && s.reps)
  if (work.length < 2) return null
  const w = work[0].weight!
  const r = work[0].reps!
  const allSame = work.every((s) => s.weight === w && (s.reps || 0) >= r)
  if (!allSame) return null
  const ex = exerciseById(exerciseId)
  const step = ex.group === 'Bein' || exerciseId === 'markloft' || exerciseId === 'rumensk-markloft' ? 5 : 2.5
  if (ex.equipment === 'Manualer' || ex.equipment === 'Kabel' || ex.equipment === 'Maskin') return `Klarte ${work.length}×${r} @ ${fmtKg(w)} sist – prøv ${fmtKg(w + (ex.equipment === 'Manualer' ? 2 : 2.5))} kg eller +1 rep`
  return `Klarte ${work.length}×${r} @ ${fmtKg(w)} sist – prøv ${fmtKg(w + step)} kg`
}

export function weeklyGoal(userId: string) {
  return profile(userId).weeklyGoal ?? 3
}

export function workoutsThisWeek(userId: string) {
  return workoutsInRange(userId, startOfWeek()).length
}

/** Days (yyyy-mm-dd) with at least one finished workout. */
export function trainingDays(userId: string): Map<string, number> {
  const m = new Map<string, number>()
  for (const w of doneWorkouts(userId)) {
    const d = new Date(w.data.startedAt)
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    m.set(k, (m.get(k) || 0) + workoutVolume(w.data))
  }
  return m
}

/** Work sets per muscle group in a date range. */
export function setsPerGroup(userId: string, from: Date): { group: string; sets: number }[] {
  const m = new Map<string, number>()
  for (const w of workoutsInRange(userId, from))
    for (const ex of w.data.exercises) {
      const g = exerciseById(ex.exerciseId).group
      m.set(g, (m.get(g) || 0) + ex.sets.filter((s) => s.done && !s.warmup).length)
    }
  return [...m.entries()].map(([group, sets]) => ({ group, sets })).sort((a, b) => b.sets - a.sets)
}

/* ---------- milestones ---------- */
export type Badge = { id: string; icon: string; label: string; earned: boolean; progress?: string; ratio: number }

export function badges(userId: string): Badge[] {
  return memo('badges:' + userId, () => {
    const out: Badge[] = []
    const lift = (exId: string, name: string, steps: number[]) => {
      const max = recordsFrom(exerciseHistory(userId, exId)).maxWeight
      for (const s of steps) {
        out.push({
          id: `${exId}-${s}`,
          icon: '🏋️',
          label: `${s} kg ${name}`,
          earned: max >= s,
          progress: max >= s ? undefined : max ? `mangler ${fmtKg(s - max)} kg` : 'ikke logget ennå',
          ratio: Math.min(1, max / s),
        })
      }
    }
    lift('benkpress', 'benk', [60, 80, 100, 120, 140])
    lift('kneboy', 'knebøy', [80, 100, 140, 180, 220])
    lift('markloft', 'markløft', [100, 140, 180, 220, 260])
    const n = doneWorkouts(userId).length
    for (const s of [1, 10, 25, 50, 100, 250])
      out.push({ id: `w-${s}`, icon: '📅', label: s === 1 ? 'Første økt' : `${s} økter`, earned: n >= s, progress: n >= s ? undefined : `${n}/${s}`, ratio: Math.min(1, n / s) })
    const st = streakWeeks(userId)
    for (const s of [4, 8, 12, 26])
      out.push({ id: `s-${s}`, icon: '🔥', label: `${s} uker på rad`, earned: st >= s, progress: st >= s ? undefined : `${st}/${s}`, ratio: Math.min(1, st / s) })
    const tot = doneWorkouts(userId).reduce((a, w) => a + workoutVolume(w.data), 0)
    for (const s of [10000, 100000, 1000000])
      out.push({
        id: `v-${s}`,
        icon: '⚖️',
        label: `${fmtVolume(s)} totalt`,
        earned: tot >= s,
        progress: tot >= s ? undefined : `${fmtVolume(tot)} av ${fmtVolume(s)}`,
        ratio: Math.min(1, tot / s),
      })
    const hours = doneWorkouts(userId).map((w) => new Date(w.data.startedAt).getHours())
    out.push({ id: 'early', icon: '🌅', label: 'Morgenfugl (før 07)', earned: hours.some((h) => h < 7), ratio: hours.some((h) => h < 7) ? 1 : 0 })
    out.push({ id: 'late', icon: '🌙', label: 'Nattugle (etter 22)', earned: hours.some((h) => h >= 22), ratio: hours.some((h) => h >= 22) ? 1 : 0 })
    return out
  })
}

export function recentPRs(userId: string, n = 8): { workoutId: string; date: string; pr: PR }[] {
  return memo(`recentprs:${userId}:${n}`, () => {
    const out: { workoutId: string; date: string; pr: PR }[] = []
    for (const w of doneWorkouts(userId)) {
      for (const pr of prsForWorkout(w.id, w.data)) if (pr.kind !== 'volume') out.push({ workoutId: w.id, date: w.data.startedAt, pr })
      if (out.length >= n) break
    }
    return out.slice(0, n)
  })
}

/** Comparable "best" per exercise: e1RM in kg, or max reps in one set for bodyweight exercises. */
export function bestScore(userId: string, exerciseId: string): { value: number; unit: 'kg' | 'reps'; date?: string; set?: SetEntry } {
  const ex = exerciseById(exerciseId)
  if (!ex.bodyweight) {
    const b = bestE1rm(userId, exerciseId)
    return { ...b, unit: 'kg' }
  }
  let best: { value: number; unit: 'reps'; date?: string; set?: SetEntry } = { value: 0, unit: 'reps' }
  for (const h of exerciseHistory(userId, exerciseId))
    for (const s of h.sets) if (!s.warmup && (s.reps || 0) > best.value) best = { value: s.reps || 0, unit: 'reps', date: h.date, set: s }
  return best
}

export function fmtScore(v: number, unit: 'kg' | 'reps') {
  return unit === 'reps' ? `${v} reps` : fmtKg(v, 0)
}
