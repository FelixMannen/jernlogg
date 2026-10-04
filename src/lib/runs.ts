// Running: helpers, records and weekly goals.
import { list, getDoc, type Doc } from './store'
import type { Workout, Route, RunData, WeeklyGoal, UserId } from './domain'
import { doneWorkouts, profile, startOfWeek, weekKey } from './stats'

export const isRun = (w: Workout) => w.kind === 'run'

export function runs(userId?: string): Doc<Workout>[] {
  return doneWorkouts(userId).filter((w) => isRun(w.data))
}
export function strengthWorkouts(userId?: string): Doc<Workout>[] {
  return doneWorkouts(userId).filter((w) => !isRun(w.data))
}

/* ---------- formatting ---------- */
export function fmtRunTime(sec?: number | null): string {
  if (sec == null || !isFinite(sec)) return '–'
  const s = Math.round(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`
}
export function fmtKm(km?: number | null, digits = 2): string {
  if (km == null || !isFinite(km)) return '–'
  return (Math.round(km * 10 ** digits) / 10 ** digits).toLocaleString('nb-NO', { maximumFractionDigits: digits, minimumFractionDigits: km < 10 && digits >= 1 ? 1 : 0 })
}
export function fmtPace(secPerKm?: number | null): string {
  if (secPerKm == null || !isFinite(secPerKm) || secPerKm <= 0) return '–'
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`
}
/** Parse "42", "42:10", "1:02:03", "42 min", "1t 5min" → seconds. */
export function parseTime(input: string): number | null {
  const t = input.trim().toLowerCase().replace(',', '.')
  if (!t) return null
  let m = t.match(/^(\d+):(\d{1,2}):(\d{1,2})$/)
  if (m) return +m[1] * 3600 + +m[2] * 60 + +m[3]
  m = t.match(/^(\d+):(\d{1,2})$/)
  if (m) return +m[1] * 60 + +m[2]
  m = t.match(/^(?:(\d+(?:\.\d+)?)\s*(?:t|h|time|timer)\s*)?(?:(\d+(?:\.\d+)?)\s*(?:m|min|minutt|minutter)?)?$/)
  if (m && (m[1] || m[2])) return Math.round((m[1] ? +m[1] * 3600 : 0) + (m[2] ? +m[2] * 60 : 0))
  return null
}

/* ---------- per run ---------- */
export const hasDistance = (r?: RunData) => !!r && !!r.distanceKm && r.distanceKm > 0
export const hasDuration = (r?: RunData) => !!r && !!r.durationSec && r.durationSec > 0
/** Both values present and not marked as estimates – required for records and pace leaderboards. */
export const isMeasured = (r?: RunData) => hasDistance(r) && hasDuration(r) && !r!.distanceEst && !r!.durationEst
export function paceOf(r?: RunData): number | null {
  return hasDistance(r) && hasDuration(r) ? r!.durationSec! / r!.distanceKm! : null
}

/* ---------- routes ---------- */
export function routes(): Doc<Route>[] {
  return list<Route>('routes').sort((a, b) => a.data.name.localeCompare(b.data.name, 'nb'))
}
export function routeById(id?: string): Route | undefined {
  return id ? getDoc<Route>(id)?.data : undefined
}

/** Best (measured) time per user on a route, fastest first. */
export function routeBoard(routeId: string): { userId: UserId; sec: number; workoutId: string; date: string }[] {
  const best = new Map<string, { userId: UserId; sec: number; workoutId: string; date: string }>()
  for (const w of runs()) {
    const r = w.data.run
    if (r?.routeId !== routeId || !hasDuration(r) || r.durationEst) continue
    const cur = best.get(w.data.userId)
    if (!cur || r.durationSec! < cur.sec) best.set(w.data.userId, { userId: w.data.userId, sec: r.durationSec!, workoutId: w.id, date: w.data.startedAt })
  }
  return [...best.values()].sort((a, b) => a.sec - b.sec)
}

/* ---------- records ---------- */
export const STANDARD = [
  { km: 5, label: '5 km' },
  { km: 10, label: '10 km' },
  { km: 21.0975, label: 'Halvmaraton' },
]

/** Time for distance D from a measured run of D..D*1.15 km, scaled by its average pace. */
export function timeFor(r: RunData | undefined, km: number): number | null {
  if (!isMeasured(r)) return null
  if (r!.distanceKm! < km - 0.01 || r!.distanceKm! > km * 1.15) return null
  return (r!.durationSec! / r!.distanceKm!) * km
}

export type RunRecords = {
  longest?: { km: number; workoutId: string; date: string }
  bestPace?: { sec: number; workoutId: string; date: string }
  standard: { km: number; label: string; sec?: number; workoutId?: string; date?: string }[]
}

export function runRecords(userId: string, before?: string, excludeId?: string): RunRecords {
  const rec: RunRecords = { standard: STANDARD.map((s) => ({ ...s })) }
  for (const w of runs(userId)) {
    if (w.id === excludeId) continue
    if (before && w.data.startedAt >= before) continue
    const r = w.data.run
    if (hasDistance(r) && !r!.distanceEst && (!rec.longest || r!.distanceKm! > rec.longest.km)) rec.longest = { km: r!.distanceKm!, workoutId: w.id, date: w.data.startedAt }
    if (isMeasured(r) && r!.distanceKm! >= 3) {
      const p = paceOf(r)!
      if (!rec.bestPace || p < rec.bestPace.sec) rec.bestPace = { sec: p, workoutId: w.id, date: w.data.startedAt }
    }
    for (const s of rec.standard) {
      const t = timeFor(r, s.km)
      if (t != null && (s.sec == null || t < s.sec)) Object.assign(s, { sec: t, workoutId: w.id, date: w.data.startedAt })
    }
  }
  return rec
}

export type RunPR = { label: string; value: string }

/** Records set by this run compared with the same user's earlier runs (and route records). */
export function prsForRun(id: string, w: Workout): RunPR[] {
  const r = w.run
  if (!r || w.status !== 'done') return []
  const prev = runRecords(w.userId, w.startedAt, id)
  const hadAny = runs(w.userId).some((x) => x.id !== id && x.data.startedAt < w.startedAt)
  const out: RunPR[] = []
  if (hadAny && hasDistance(r) && !r.distanceEst && prev.longest && r.distanceKm! > prev.longest.km) out.push({ label: 'Lengste tur', value: `${fmtKm(r.distanceKm, 1)} km` })
  for (const s of prev.standard) {
    const t = timeFor(r, s.km)
    if (t != null && s.sec != null && t < s.sec) out.push({ label: `Beste ${s.label}`, value: fmtRunTime(t) })
  }
  if (r.routeId && hasDuration(r) && !r.durationEst) {
    const earlier = runs(w.userId).filter((x) => x.id !== id && x.data.startedAt < w.startedAt && x.data.run?.routeId === r.routeId && hasDuration(x.data.run) && !x.data.run!.durationEst)
    const best = Math.min(...earlier.map((x) => x.data.run!.durationSec!))
    if (earlier.length && r.durationSec! < best) out.push({ label: `PR på ${routeById(r.routeId)?.name ?? 'ruta'}`, value: fmtRunTime(r.durationSec) })
  }
  return out
}

/* ---------- totals ---------- */
export function kmInRange(userId: string, from: Date, to = new Date()): { km: number; est: boolean; count: number; minutes: number } {
  let km = 0
  let est = false
  let count = 0
  let minutes = 0
  for (const w of runs(userId)) {
    const t = Date.parse(w.data.startedAt)
    if (t < from.getTime() || t > to.getTime()) continue
    count++
    const r = w.data.run
    if (hasDistance(r)) {
      km += r!.distanceKm!
      if (r!.distanceEst) est = true
    }
    if (hasDuration(r)) minutes += r!.durationSec! / 60
  }
  return { km, est, count, minutes }
}

export function weeklyKm(userId: string, weeks = 12): { label: string; value: number }[] {
  const out: { key: string; label: string; value: number }[] = []
  const start = startOfWeek()
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(start)
    d.setDate(d.getDate() - i * 7)
    out.push({ key: weekKey(d), label: `u${weekKey(d).slice(5).replace(/^0/, '')}`, value: 0 })
  }
  for (const w of runs(userId)) {
    const slot = out.find((o) => o.key === weekKey(new Date(w.data.startedAt)))
    if (slot && hasDistance(w.data.run)) slot.value += w.data.run!.distanceKm!
  }
  return out.map(({ label, value }) => ({ label, value: Math.round(value * 10) / 10 }))
}

export function runsMissingData(userId: string) {
  return runs(userId).filter((w) => !hasDistance(w.data.run) || !hasDuration(w.data.run))
}

/* ---------- weekly goals ---------- */
export function goalFor(userId: string): WeeklyGoal {
  const p = profile(userId)
  return p.goal ?? { mode: 'total', total: p.weeklyGoal ?? 3 }
}

export type GoalRow = { key: string; label: string; done: number; target: number; unit?: string; est?: boolean }
export type GoalProgress = { rows: GoalRow[]; met: boolean; strength: number; run: number }

export function goalProgress(userId: string, weekStart = startOfWeek()): GoalProgress {
  const end = new Date(weekStart)
  end.setDate(end.getDate() + 7)
  const inWeek = doneWorkouts(userId).filter((w) => {
    const t = Date.parse(w.data.startedAt)
    return t >= weekStart.getTime() && t < end.getTime()
  })
  const run = inWeek.filter((w) => isRun(w.data)).length
  const strength = inWeek.length - run
  const g = goalFor(userId)
  const rows: GoalRow[] = []
  if (g.mode === 'split') {
    if (g.strength) rows.push({ key: 'strength', label: 'Styrke', done: strength, target: g.strength })
    if (g.run) rows.push({ key: 'run', label: 'Løping', done: run, target: g.run })
  } else {
    rows.push({ key: 'total', label: 'Økter', done: strength + run, target: g.total ?? 3 })
    if (g.mode === 'min' && g.runMin) rows.push({ key: 'runMin', label: 'Minst løping', done: run, target: g.runMin })
  }
  if (g.km) {
    const k = kmInRange(userId, weekStart, new Date(end.getTime() - 1))
    rows.push({ key: 'km', label: 'Km', done: Math.round(k.km * 10) / 10, target: g.km, unit: 'km', est: k.est })
  }
  return { rows, met: rows.length > 0 && rows.every((r) => r.done >= r.target), strength, run }
}

/** Consecutive weeks where the (current) weekly goal was met. This week counts once met, and does not break the streak while in progress. */
export function goalStreak(userId: string): number {
  let n = 0
  const d = startOfWeek()
  if (goalProgress(userId, d).met) n++
  for (let i = 0; i < 260; i++) {
    d.setDate(d.getDate() - 7)
    if (!goalProgress(userId, new Date(d)).met) break
    n++
  }
  return n
}

/** Short text like "Du mangler 1 løpetur og 2 styrkeøkter". */
export function goalRemainingText(userId: string): string | null {
  const p = goalProgress(userId)
  const parts = p.rows
    .filter((r) => r.done < r.target)
    .map((r) => {
      const left = Math.round((r.target - r.done) * 10) / 10
      if (r.key === 'km') return `${String(left).replace('.', ',')} km`
      if (r.key === 'run' || r.key === 'runMin') return `${left} ${left === 1 ? 'løpetur' : 'løpeturer'}`
      if (r.key === 'strength') return `${left} ${left === 1 ? 'styrkeøkt' : 'styrkeøkter'}`
      return `${left} ${left === 1 ? 'økt' : 'økter'}`
    })
  return parts.length ? `Du mangler ${parts.join(' og ')}` : null
}
