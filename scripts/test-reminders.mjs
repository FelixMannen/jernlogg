// Unit tests for reminder decisions: node scripts/test-reminders.mjs
import { decideReminders, localParts } from '../api/_reminders.js'
const USERS = { felix: 'Felix', david: 'David', erik: 'Erik' }
let fail = 0
const ok = (name, cond, extra = '') => {
  if (!cond) fail++
  console.log(`${cond ? '✓' : '✗'} ${name} ${cond ? '' : extra}`)
}
const sub = (u) => ({ id: 'push:' + u, data: { userId: u } })
const prof = (u, notify, weeklyGoal) => ({ id: `profile:${u}`, data: { notify, weeklyGoal } })
const wk = (u, iso, status = 'done') => ({ id: 'w' + Math.random(), data: { userId: u, startedAt: iso, status } })
// 2026-10-07 is a Wednesday. 09:30 UTC = 18:30 Seoul.
const now = new Date('2026-10-07T09:30:00Z')
const tz = 'Asia/Seoul'

ok('localParts Seoul', JSON.stringify(localParts(now, tz)) === JSON.stringify({ date: '2026-10-07', hour: 18 }))

let d = decideReminders(now, USERS, { subs: [sub('felix')], profiles: [prof('felix', { tz, hour: 18, days: 2 })], workouts: [wk('felix', '2026-10-04T08:00:00Z')], logs: [] })
ok('sends after 3 days', d.length === 1 && d[0].userId === 'felix' && d[0].logId === 'reminder:felix:2026-10-07', JSON.stringify(d))

d = decideReminders(now, USERS, { subs: [sub('felix')], profiles: [prof('felix', { tz, hour: 18, days: 2 })], workouts: [wk('felix', '2026-10-06T08:00:00Z')], logs: [] })
ok('not when trained yesterday (days=2)', d.length === 0)

d = decideReminders(now, USERS, { subs: [sub('felix')], profiles: [prof('felix', { tz, hour: 20, days: 1 })], workouts: [], logs: [] })
ok('not before chosen hour', d.length === 0)

d = decideReminders(now, USERS, { subs: [sub('felix')], profiles: [prof('felix', { tz, hour: 18, days: 1 })], workouts: [], logs: [{ id: 'reminder:felix:2026-10-07' }] })
ok('only once per day', d.length === 0)

d = decideReminders(now, USERS, { subs: [], profiles: [prof('felix', { tz, hour: 18, days: 1 })], workouts: [], logs: [] })
ok('no subscription → nothing', d.length === 0)

d = decideReminders(now, USERS, { subs: [sub('felix')], profiles: [prof('felix', { tz, hour: 18, days: 1, reminders: false })], workouts: [], logs: [] })
ok('reminders off', d.length === 0)

d = decideReminders(now, USERS, { subs: [sub('felix')], profiles: [prof('felix', { tz, hour: 18, days: 1 })], workouts: [wk('felix', '2026-10-07T09:00:00Z', 'active')], logs: [] })
ok('not while training', d.length === 0)

d = decideReminders(now, USERS, { subs: [sub('felix')], profiles: [prof('felix', { tz, hour: 18, days: 1 })], workouts: [wk('felix', '2026-10-07T02:00:00Z')], logs: [] })
ok('not when already trained today', d.length === 0)

d = decideReminders(now, USERS, {
  subs: [sub('felix')],
  profiles: [prof('felix', { tz, hour: 18, days: 2 })],
  workouts: [wk('felix', '2026-10-03T08:00:00Z'), wk('david', '2026-10-05T08:00:00Z'), wk('david', '2026-10-06T08:00:00Z')],
  logs: [],
})
ok('friend message', d[0]?.payload.body.startsWith('David har 2 økter denne uka, du har 0'), d[0]?.payload.body)

d = decideReminders(now, USERS, { subs: [sub('erik')], profiles: [], workouts: [], logs: [] })
ok('defaults: Oslo tz 11:30 < 18 → nothing', d.length === 0)
d = decideReminders(new Date('2026-10-07T17:00:00Z'), USERS, { subs: [sub('erik')], profiles: [], workouts: [], logs: [] })
ok('defaults: Oslo 19:00, never trained → first-workout message', d.length === 1 && d[0].payload.body.startsWith('Første økt'), JSON.stringify(d))
d = decideReminders(new Date('2026-10-07T21:30:00Z'), USERS, { subs: [sub('erik')], profiles: [], workouts: [], logs: [] })
ok('not after 22 local', d.length === 0)

console.log(fail ? `\n${fail} FEIL` : '\nAlle påminnelsestester OK')
process.exit(fail ? 1 : 0)
