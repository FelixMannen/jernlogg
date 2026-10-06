// Unit tests for reminder decisions: node scripts/test-reminders.mjs
import { decideReminders, localParts } from '../api/_reminders.js'
const USERS = { felix: 'Felix', david: 'David', erik: 'Erik', u1: 'Ola' }
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

// goals with running
import('../api/_reminders.js').then(() => {})
const { goalRemaining } = await import('../api/_reminders.js')
ok('goal split remaining', goalRemaining({ goal: { mode: 'split', strength: 3, run: 2 } }, 1, 1) === '2 styrkeøkter og 1 løpetur', goalRemaining({ goal: { mode: 'split', strength: 3, run: 2 } }, 1, 1))
ok('goal min remaining', goalRemaining({ goal: { mode: 'min', total: 4, runMin: 1 } }, 3, 0) === '1 økt og minst 1 løpetur')
ok('goal legacy weeklyGoal', goalRemaining({ weeklyGoal: 2 }, 2, 0) === null)
ok('goal km', goalRemaining({ goal: { mode: 'total', total: 1, km: 10 } }, 0, 1, [{ data: { kind: 'run', run: { distanceKm: 6.5 } } }]) === '3,5 km')
d = decideReminders(now, USERS, {
  subs: [sub('felix')],
  profiles: [{ id: 'profile:felix', data: { notify: { tz, hour: 18, days: 2 }, goal: { mode: 'split', strength: 2, run: 2 } } }],
  workouts: [{ id: 'r1', data: { userId: 'felix', kind: 'run', status: 'done', startedAt: '2026-10-05T08:00:00Z', run: { distanceKm: 5 } } }],
  logs: [],
})
ok('reminder counts a run as last workout and mentions split goal', d[0]?.payload.body === '2 dager siden sist. Du mangler 2 styrkeøkter og 1 løpetur på ukesmålet.', d[0]?.payload.body)
// friend comparison only within groups, private workouts don't count for others
{
  const friendWk = (u, iso, extra = {}) => ({ id: u + iso, data: { userId: u, status: 'done', startedAt: iso, ...extra } })
  const many = ['2026-10-05T08:00:00Z', '2026-10-06T08:00:00Z', '2026-10-06T10:00:00Z'].map((t) => friendWk('u1', t))
  const args = { subs: [sub('felix')], profiles: [prof('felix', { tz, hour: 18, days: 1 })], workouts: [friendWk('felix', '2026-10-01T08:00:00Z'), ...many], logs: [] }
  let x = decideReminders(now, USERS, { ...args, peers: { felix: new Set(['david', 'erik']) } })
  ok('friend comparison ignores people outside my groups', !x[0]?.payload.body.includes('Ola'), x[0]?.payload.body)
  x = decideReminders(now, USERS, { ...args, peers: { felix: new Set(['u1']) } })
  ok('friend comparison uses group friends', x[0]?.payload.body.startsWith('Ola har 3 økter'), x[0]?.payload.body)
  x = decideReminders(now, USERS, { ...args, workouts: [friendWk('felix', '2026-10-01T08:00:00Z'), ...many.map((w) => ({ ...w, data: { ...w.data, private: true } }))], peers: { felix: new Set(['u1']) } })
  ok('private workouts are not counted for friends', !x[0]?.payload.body.includes('Ola'), x[0]?.payload.body)
}
// supplements
const { decideSupplements, buildPayload } = await import('../api/_supplements.js')
const kreatin = { id: 'sup1', data: { userId: 'felix', name: 'Kreatin', amount: 5, unit: 'g', doses: [{ hour: 8 }], createdAt: '2026-10-01', stock: { total: 50, refillAt: '2026-10-01' } } }
const omega = { id: 'sup2', data: { userId: 'felix', name: 'Omega-3', amount: 2, unit: 'kapsler', doses: [{ hour: 8 }, { hour: 20 }], createdAt: '2026-10-01' } }
const base = { subs: [sub('felix')], profiles: [prof('felix', { tz, hour: 18, days: 2 })], logs: [] }
let s1 = decideSupplements(now, USERS, { ...base, supplements: [kreatin, omega], supLogs: [] })
ok('supp: due doses at 18:30 (kreatin 08, omega 08; not omega 20)', s1[0]?.items.map((i) => i.supId + ':' + i.dose).join(',') === 'sup1:0,sup2:0', JSON.stringify(s1))
s1 = decideSupplements(now, USERS, { ...base, supplements: [kreatin], supLogs: [{ id: 'sl:sup1:2026-10-07:0', data: { supId: 'sup1', date: '2026-10-07' } }] })
ok('supp: taken today → no reminder', !s1[0] || s1[0].items.length === 0)
s1 = decideSupplements(now, USERS, { ...base, supplements: [kreatin], supLogs: [], logs: [{ id: 'supp:sup1:2026-10-07:0' }] })
ok('supp: already reminded → not again', !s1[0] || s1[0].items.length === 0)
s1 = decideSupplements(now, USERS, { ...base, supplements: [{ ...kreatin, data: { ...kreatin.data, pauses: [{ from: '2026-10-06' }] } }], supLogs: [] })
ok('supp: paused → nothing', s1.length === 0)
const logs6 = Array.from({ length: 6 }, (_, i) => ({ id: `sl:sup1:2026-10-0${i + 1}:0`, data: { supId: 'sup1', date: `2026-10-0${i + 1}` } }))
s1 = decideSupplements(now, USERS, { ...base, supplements: [kreatin], supLogs: logs6 })
ok('supp: low stock (50 g − 6×5 g = 20 g → 4 days)', s1[0]?.stock[0]?.daysLeft === 4, JSON.stringify(s1[0]?.stock))
s1 = decideSupplements(now, USERS, { ...base, supplements: [kreatin], supLogs: [] })
const train = { userId: 'felix', logId: 'reminder:felix:2026-10-07', payload: { title: 'Du burde trene i dag 💪', body: '3 dager siden sist.', url: '/#/okt', tag: 'reminder' } }
let pl = buildPayload(train, s1[0])
ok('merged: one notification with training title + supplement line + Tatt-button', pl.title === 'Du burde trene i dag 💪' && pl.body.includes('Ikke tatt ennå: Kreatin') && pl.actions[0]?.action === 'take' && pl.take.length === 1, JSON.stringify(pl))
pl = buildPayload(null, s1[0])
ok('supplement-only notification', pl.title === 'Husk kreatin 💊' && pl.url === '/#/supplementer' && pl.body.includes('5 g'), JSON.stringify(pl))
console.log(fail ? `\n${fail} FEIL` : '\nAlle påminnelsestester OK')
process.exit(fail ? 1 : 0)
