// Pure decision logic for daily reminders – unit tested in scripts/test-reminders.mjs.

export const DEFAULTS = { reminders: true, days: 2, hour: 18, friends: true, tz: 'Europe/Oslo' }

export function prefsFor(profile) {
  const n = (profile && profile.notify) || {}
  return {
    reminders: n.reminders !== false,
    days: Number.isFinite(n.days) ? n.days : DEFAULTS.days,
    hour: Number.isFinite(n.hour) ? n.hour : DEFAULTS.hour,
    friends: n.friends !== false,
    tz: n.tz || DEFAULTS.tz,
  }
}

/** Local calendar date (yyyy-mm-dd) and hour of `date` in time zone `tz`. */
export function localParts(date, tz) {
  let parts
  try {
    parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  } catch {
    parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  }
  const get = (t) => parts.find((p) => p.type === t).value
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: parseInt(get('hour'), 10) }
}

function dayDiff(a, b) {
  // a, b: yyyy-mm-dd
  return Math.round((Date.UTC(...a.split('-').map((x, i) => (i === 1 ? x - 1 : +x))) - Date.UTC(...b.split('-').map((x, i) => (i === 1 ? x - 1 : +x)))) / 86400000)
}

function startOfIsoWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() - day + 1)
  return t.toISOString().slice(0, 10)
}

/**
 * Decide which reminders to send now.
 * @param now Date
 * @param users {id: name}
 * @param docs { subs, profiles, workouts, logs } – arrays of docs {id, data}
 * @returns [{ userId, logId, payload }]
 */
export function decideReminders(now, users, { subs, profiles, workouts, logs }) {
  const logIds = new Set(logs.map((l) => l.id))
  const out = []
  for (const userId of Object.keys(users)) {
    if (!subs.some((s) => s.data.userId === userId)) continue
    const profile = profiles.find((p) => p.id === `profile:${userId}`)?.data
    const p = prefsFor(profile)
    if (!p.reminders) continue
    const { date: today, hour } = localParts(now, p.tz)
    if (hour < p.hour || hour > 22) continue
    const logId = `reminder:${userId}:${today}`
    if (logIds.has(logId)) continue
    const mine = workouts.filter((w) => w.data.userId === userId)
    // currently training (or started in the last 6 hours)?
    if (mine.some((w) => w.data.status === 'active' && !w.data.reopenedFrom && now - Date.parse(w.data.startedAt) < 6 * 3600e3)) continue
    const done = mine.filter((w) => w.data.status === 'done').map((w) => localParts(new Date(w.data.startedAt), p.tz).date).sort()
    const last = done[done.length - 1]
    const days = last ? dayDiff(today, last) : Infinity
    if (days < p.days) continue

    // context for a more useful message
    const weekStart = startOfIsoWeek(today)
    const goal = (profile && profile.weeklyGoal) || 3
    const doneThisWeek = done.filter((d) => d >= weekStart).length
    const friendWeek = Object.keys(users)
      .filter((u) => u !== userId)
      .map((u) => ({
        u,
        n: workouts.filter((w) => w.data.userId === u && w.data.status === 'done' && localParts(new Date(w.data.startedAt), p.tz).date >= weekStart).length,
      }))
      .sort((a, b) => b.n - a.n)[0]
    let body
    if (!last) body = 'Første økt venter – velg en mal og kjør på 💪'
    else if (friendWeek && friendWeek.n > doneThisWeek) body = `${users[friendWeek.u]} har ${friendWeek.n} ${friendWeek.n === 1 ? 'økt' : 'økter'} denne uka, du har ${doneThisWeek}. Din tur!`
    else if (doneThisWeek < goal) body = `${days} dager siden sist. Du mangler ${goal - doneThisWeek} ${goal - doneThisWeek === 1 ? 'økt' : 'økter'} på ukesmålet.`
    else body = `${days} dager siden sist – en kort økt holder 💪`
    out.push({ userId, logId, payload: { title: 'Du burde trene i dag 💪', body, url: '/#/okt', tag: 'reminder' } })
  }
  return out
}
