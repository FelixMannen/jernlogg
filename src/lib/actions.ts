import { put, patch, remove, uid, getDoc, nowIso, list } from './store'
import type { Workout, WorkoutExercise, SetEntry, Template, Exercise, UserId, Reaction, Profile, BodyweightEntry, Comment } from './domain'
import { lastSession, activeWorkout, profile } from './stats'

export function newSet(prev?: Partial<SetEntry>): SetEntry {
  return { uid: uid('s'), weight: prev?.weight ?? null, reps: prev?.reps ?? null, done: false, warmup: false }
}

function exerciseFromHistory(userId: string, exerciseId: string, count?: number, reps?: number): WorkoutExercise {
  const last = lastSession(userId, exerciseId)
  const work = last?.sets.filter((s) => !s.warmup) ?? []
  const n = count ?? (work.length || 3)
  const sets: SetEntry[] = []
  for (let i = 0; i < n; i++) {
    const ref = work[i] ?? work[work.length - 1]
    sets.push(newSet({ weight: ref?.weight ?? null, reps: reps ?? ref?.reps ?? null }))
  }
  return { uid: uid('x'), exerciseId, sets }
}

export function startWorkout(userId: UserId, templateId?: string): string {
  const existing = activeWorkout(userId)
  if (existing) return existing.id
  const id = uid('w')
  const t = templateId ? getDoc<Template>(templateId)?.data : undefined
  const h = new Date().getHours()
  const fallbackTitle = h < 11 ? 'Morgenøkt' : h < 17 ? 'Dagsøkt' : 'Kveldsøkt'
  const w: Workout = {
    userId,
    title: t?.name ?? fallbackTitle,
    startedAt: nowIso(),
    endedAt: null,
    status: 'active',
    templateId,
    exercises: t ? t.items.map((it) => exerciseFromHistory(userId, it.exerciseId, it.sets, it.reps)) : [],
  }
  put('workouts', id, w)
  return id
}

export function updateWorkout(id: string, fn: (w: Workout) => Workout | void) {
  patch<Workout>(id, (w) => fn(w) ?? w)
}

export function addExercises(workoutId: string, userId: string, exerciseIds: string[], counts?: Record<string, { sets: number; reps?: number }>) {
  updateWorkout(workoutId, (w) => {
    for (const exId of exerciseIds) w.exercises.push(exerciseFromHistory(userId, exId, counts?.[exId]?.sets, counts?.[exId]?.reps))
  })
}

export function finishWorkout(id: string) {
  updateWorkout(id, (w) => {
    // drop empty sets & exercises
    w.exercises = w.exercises
      .map((ex) => ({ ...ex, sets: ex.sets.filter((s) => s.done) }))
      .filter((ex) => ex.sets.length > 0)
    w.status = 'done'
    w.endedAt = w.reopenedFrom ?? nowIso()
    delete w.reopenedFrom
  })
  stopRest()
}

export function discardWorkout(id: string) {
  remove(id)
  stopRest()
}

export function deleteWorkout(id: string) {
  remove(id)
}

export function saveTemplate(t: Template, id = uid('t')) {
  put('templates', id, t)
  return id
}

export function templateFromWorkout(w: Workout, name: string, userId: UserId): string {
  return saveTemplate({
    name,
    createdBy: userId,
    items: w.exercises.map((ex) => ({
      exerciseId: ex.exerciseId,
      sets: Math.max(1, ex.sets.filter((s) => !s.warmup).length),
      reps: ex.sets.find((s) => !s.warmup)?.reps ?? 8,
    })),
  })
}

export function deleteTemplate(id: string) {
  remove(id)
}

export function addCustomExercise(e: Omit<Exercise, 'id'>): string {
  const id = uid('e')
  put('exercises', id, { ...e, custom: true })
  return id
}

export function toggleReaction(workoutId: string, userId: UserId, emoji: string) {
  const id = `r:${workoutId}:${userId}:${emoji}`
  const cur = getDoc<Reaction>(id)
  if (cur) remove(id)
  else put('reactions', id, { workoutId, userId, emoji })
}

export function reactionsFor(workoutId: string): Reaction[] {
  return list<Reaction>('reactions')
    .map((d) => d.data)
    .filter((r) => r.workoutId === workoutId)
}

export function addComment(workoutId: string, userId: UserId, text: string) {
  put('comments', uid('c'), { workoutId, userId, text, at: nowIso() } as Comment)
}

export function commentsFor(workoutId: string) {
  return list<Comment>('comments')
    .filter((d) => d.data.workoutId === workoutId)
    .sort((a, b) => a.data.at.localeCompare(b.data.at))
}

export function setProfile(userId: string, p: Partial<Profile>) {
  put('profiles', `profile:${userId}`, { ...profile(userId), ...p })
}

export function addBodyweight(userId: UserId, weight: number, date = new Date().toISOString().slice(0, 10)) {
  // one entry per user per day
  put('bodyweight', `bw:${userId}:${date}`, { userId, date, weight } as BodyweightEntry)
}

/* ---------- rest timer (device-local) ---------- */
type Rest = { endAt: number; total: number } | null
let rest: Rest = (() => {
  try {
    const r = JSON.parse(localStorage.getItem('jernlogg.rest') || 'null')
    return r && r.endAt > Date.now() - 60000 ? r : null
  } catch {
    return null
  }
})()
const restListeners = new Set<() => void>()
function setRest(r: Rest) {
  rest = r
  try {
    localStorage.setItem('jernlogg.rest', JSON.stringify(r))
  } catch {}
  restListeners.forEach((l) => l())
}
export function startRest(seconds: number) {
  setRest({ endAt: Date.now() + seconds * 1000, total: seconds })
}
export function adjustRest(delta: number) {
  if (!rest) return
  setRest({ endAt: rest.endAt + delta * 1000, total: Math.max(5, rest.total + delta) })
}
export function stopRest() {
  setRest(null)
}
export function getRest() {
  return rest
}
export function subscribeRest(cb: () => void) {
  restListeners.add(cb)
  return () => {
    restListeners.delete(cb)
  }
}

export function reopenWorkout(id: string): boolean {
  const d = getDoc<Workout>(id)
  if (!d) return false
  if (activeWorkout(d.data.userId)) return false
  updateWorkout(id, (w) => {
    w.reopenedFrom = w.endedAt ?? nowIso()
    w.status = 'active'
  })
  return true
}
