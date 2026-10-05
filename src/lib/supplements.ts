// Supplements: what you take, daily check-offs, streaks and stock.
import { list, put, remove, uid, getDoc, type Doc } from './store'
import type { UserId } from './domain'

export type Supplement = {
  userId: UserId
  name: string
  amount?: number // per dose
  unit?: string // g, mg, kapsler, stk, ml
  doses: { hour: number }[] // one entry per dose per day
  stock?: { total: number; refillAt: string } // total in the same unit as amount, counted from refillAt (yyyy-mm-dd)
  pauses?: { from: string; to?: string }[] // yyyy-mm-dd, to = exclusive
  stockWarnDays?: number
  createdAt: string // yyyy-mm-dd
}
export type SuppLog = { supId: string; userId: UserId; date: string; dose: number; at: string }

export const UNITS = ['g', 'mg', 'kapsler', 'tabletter', 'stk', 'ml', 'IE']

const pad = (n: number) => String(n).padStart(2, '0')
export function dayKey(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number)
  const t = new Date(y, m - 1, d + n)
  return dayKey(t)
}

export function supplements(userId: string): Doc<Supplement>[] {
  return list<Supplement>('supplements')
    .filter((d) => d.data.userId === userId)
    .sort((a, b) => a.data.createdAt.localeCompare(b.data.createdAt) || a.data.name.localeCompare(b.data.name, 'nb'))
}

export const logId = (supId: string, date: string, dose: number) => `sl:${supId}:${date}:${dose}`

export function isTaken(supId: string, date: string, dose: number): boolean {
  return !!getDoc<SuppLog>(logId(supId, date, dose))
}

export function setTaken(sup: Doc<Supplement>, date: string, dose: number, taken: boolean) {
  const id = logId(sup.id, date, dose)
  if (taken) put('supplement_logs', id, { supId: sup.id, userId: sup.data.userId, date, dose, at: new Date().toISOString() } as SuppLog)
  else if (getDoc(id)) remove(id)
}

export function setDayTaken(sup: Doc<Supplement>, date: string, taken: boolean) {
  sup.data.doses.forEach((_, i) => setTaken(sup, date, i, taken))
}

export function doseLabel(s: Supplement): string {
  return s.amount ? `${String(s.amount).replace('.', ',')} ${s.unit ?? ''}`.trim() : ''
}

export function isPaused(s: Supplement, date: string): boolean {
  return (s.pauses ?? []).some((p) => p.from <= date && (!p.to || date < p.to))
}
export function pausedNow(s: Supplement) {
  return isPaused(s, dayKey())
}

export type DayStatus = 'full' | 'partial' | 'missed' | 'paused' | 'before' | 'future'
export function dayStatus(sup: Doc<Supplement>, date: string, today = dayKey()): DayStatus {
  if (date > today) return 'future'
  if (date < sup.data.createdAt) {
    // allow logging before the supplement was added (e.g. «tok den i går»)
    const any = sup.data.doses.some((_, i) => isTaken(sup.id, date, i))
    if (!any) return 'before'
  }
  if (isPaused(sup.data, date)) return 'paused'
  const n = sup.data.doses.filter((_, i) => isTaken(sup.id, date, i)).length
  if (n === sup.data.doses.length) return 'full'
  if (n > 0) return 'partial'
  return 'missed'
}

/** Days in a row with every dose taken. Today counts once complete and doesn't break the streak while open; paused days are skipped. */
export function streak(sup: Doc<Supplement>): number {
  const today = dayKey()
  let n = 0
  let d = today
  const st = dayStatus(sup, d, today)
  if (st === 'full') n++
  for (let i = 0; i < 2000; i++) {
    d = addDays(d, -1)
    const s = dayStatus(sup, d, today)
    if (s === 'paused') continue
    if (s !== 'full') break
    n++
  }
  return n
}

export function stockInfo(sup: Doc<Supplement>): { left: number; daysLeft: number } | null {
  const s = sup.data
  if (!s.stock || !s.amount || !s.doses.length) return null
  const taken = list<SuppLog>('supplement_logs').filter((l) => l.data.supId === sup.id && l.data.date >= s.stock!.refillAt).length
  const left = Math.max(0, s.stock.total - taken * s.amount)
  return { left, daysLeft: Math.floor(left / (s.amount * s.doses.length)) }
}

/** Doses not yet taken today, across all active supplements for a user. */
export function pendingToday(userId: string): { sup: Doc<Supplement>; dose: number; hour: number }[] {
  const today = dayKey()
  const out: { sup: Doc<Supplement>; dose: number; hour: number }[] = []
  for (const sup of supplements(userId)) {
    if (isPaused(sup.data, today)) continue
    sup.data.doses.forEach((d, i) => {
      if (!isTaken(sup.id, today, i)) out.push({ sup, dose: i, hour: d.hour })
    })
  }
  return out.sort((a, b) => a.hour - b.hour)
}

export function saveSupplement(s: Supplement, id = uid('sup')) {
  put('supplements', id, s)
  return id
}
export function deleteSupplement(id: string) {
  remove(id)
}
export function togglePauseSupplement(sup: Doc<Supplement>) {
  const today = dayKey()
  const pauses = [...(sup.data.pauses ?? [])]
  const open = pauses.findIndex((p) => !p.to)
  if (open >= 0) {
    if (pauses[open].from === today) pauses.splice(open, 1)
    else pauses[open] = { ...pauses[open], to: today }
  } else pauses.push({ from: today })
  put('supplements', sup.id, { ...sup.data, pauses })
}
export function refill(sup: Doc<Supplement>, total: number) {
  put('supplements', sup.id, { ...sup.data, stock: { total, refillAt: dayKey() } })
}
