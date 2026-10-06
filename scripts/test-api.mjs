// Runs the API handlers against a mocked Supabase REST API: node scripts/test-api.mjs
import webpush from 'web-push'
const testKeys = webpush.generateVAPIDKeys()
process.env.VAPID_PRIVATE_KEY = testKeys.privateKey
process.env.VAPID_PUBLIC_KEY = testKeys.publicKey
const now = new Date()
const docs = [
  { id: 'push:felix1', collection: 'push_subscriptions', data: { userId: 'felix', endpoint: 'https://example.invalid/x', keys: {} } },
  { id: 'profile:felix', collection: 'profiles', data: { notify: { tz: 'UTC', hour: 0, days: 1 } } },
  { id: 'sup1', collection: 'supplements', data: { userId: 'felix', name: 'Kreatin', amount: 5, unit: 'g', doses: [{ hour: 0 }], createdAt: '2026-01-01' } },
  { id: 'route1', collection: 'routes', data: { name: 'Elverunden', distanceKm: 6.4 } },
  { id: 'r1', collection: 'workouts', data: { userId: 'erik', kind: 'run', title: 'Elverunden', status: 'done', startedAt: new Date(now - 1800e3).toISOString(), endedAt: new Date(now - 60e3).toISOString(), exercises: [], run: { routeId: 'route1', distanceKm: 6.4, durationSec: 1755 } }, updated_at: now.toISOString() },
  { id: 'w1', collection: 'workouts', data: { userId: 'david', title: 'Push', status: 'done', startedAt: new Date(now - 3600e3).toISOString(), endedAt: new Date(now - 60e3).toISOString(), exercises: [{ sets: [{ done: true, weight: 100, reps: 5 }] }] }, updated_at: now.toISOString() },
  { id: 'w_priv', collection: 'workouts', data: { userId: 'david', private: true, title: 'Rehab', status: 'done', startedAt: new Date(now - 1200e3).toISOString(), endedAt: new Date(now - 60e3).toISOString(), exercises: [] }, updated_at: now.toISOString() },
  // the original three share a group; a stranger (u1) has a device but is in no group with them
  ...['felix', 'david', 'erik'].map((u) => ({ id: `gm:g_jernlogg:${u}`, collection: 'group_members', data: { groupId: 'g_jernlogg', userId: u } })),
  { id: 'push:u1', collection: 'push_subscriptions', data: { userId: 'u1', endpoint: 'https://example.invalid/u1', keys: {} } },
  { id: 'profile:u1', collection: 'profiles', data: { name: 'Ola', notify: { reminders: false, supplements: false } } },
  { id: 'account:auth-felix', collection: 'accounts', data: { userId: 'felix' } },
  { id: 'account:auth-david', collection: 'accounts', data: { userId: 'david' } },
  { id: 'account:auth-erik', collection: 'accounts', data: { userId: 'erik' } },
]
const tokens = { 'tok-felix': 'auth-felix', 'tok-david': 'auth-david', 'tok-erik': 'auth-erik', 'tok-nobody': 'auth-nobody' }
const inserted = new Set()
const upserts = []
global.fetch = async (url, opts = {}) => {
  const u = new URL(url)
  const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
  if (u.pathname === '/auth/v1/user') {
    const t = (opts.headers?.Authorization || '').replace('Bearer ', '')
    return tokens[t] ? json({ id: tokens[t] }) : json({ msg: 'invalid' }, 401)
  }
  if (opts.method === 'POST' && u.searchParams.get('on_conflict')) {
    const body = JSON.parse(opts.body)
    upserts.push(body)
    return new Response(null, { status: 201 })
  }
  if (opts.method === 'POST') {
    const body = JSON.parse(opts.body)
    if (inserted.has(body.id)) return new Response('dup', { status: 409 })
    inserted.add(body.id)
    return new Response(null, { status: 201 })
  }
  if (opts.method === 'PATCH') return new Response(null, { status: 204 })
  const id = u.searchParams.get('id')
  if (id) return json(docs.filter((d) => `eq.${d.id}` === id))
  const col = u.searchParams.get('collection')
  return json(docs.filter((d) => col.includes(`"${d.collection}"`)))
}
const call = async (mod, { method = 'GET', query = {}, body, as } = {}) => {
  const h = (await import(`../api/${mod}.js`)).default
  let out
  const res = { status: (s) => ({ json: (j) => (out = { s, j }) }) }
  await h({ method, query, body, headers: as ? { authorization: `Bearer tok-${as}` } : {} }, res)
  return out
}
let fail = 0
const ok = (n, c, x) => (c ? console.log('✓', n) : (fail++, console.log('✗', n, JSON.stringify(x))))
let r = await call('cron', { query: { dry: '1' } })
ok('cron dry plans one merged notification for felix (training + kreatin)', r.s === 200 && r.j.plan.length === 1 && r.j.plan[0].userId === 'felix' && r.j.plan[0].payload.body.includes('Kreatin'), r)
r = await call('cron')
ok('cron sends (push to invalid endpoint reported as error, not crash)', r.s === 200 && r.j.results.length === 1, r)
r = await call('cron')
ok('cron second run deduped', r.s === 200 && r.j.results.length === 0, r)
r = await call('notify', { method: 'POST', body: { workoutId: 'w1' } })
ok('notify requires login', r.s === 401, r)
r = await call('notify', { method: 'POST', body: { workoutId: 'w1' }, as: 'felix' })
ok('notify refuses someone else’s workout', r.s === 403, r)
r = await call('notify', { method: 'POST', body: { workoutId: 'w_priv' }, as: 'david' })
ok('notify skips private workouts', r.j.skipped === 'privat økt', r)
r = await call('notify', { method: 'POST', body: { workoutId: 'w1' }, as: 'david' })
ok('notify ok – goes to group friends', r.s === 200 && r.j.ok && r.j.results.some((x) => x.userId === 'felix'), r)
ok('notify never reaches people outside the groups', !r.j.results.some((x) => x.userId === 'u1'), r)
r = await call('notify', { method: 'POST', body: { workoutId: 'w1' }, as: 'david' })
ok('notify deduped', r.j.skipped === 'allerede varslet', r)
r = await call('notify', { method: 'POST', body: { workoutId: 'r1' }, as: 'erik' })
ok('notify run', r.s === 200 && r.j.ok && r.j.results.some((x) => x.userId === 'felix'), r)
const { signTake, devicesFor } = await import('../api/_lib.js')
const items = [{ supId: 'sup1', date: '2026-10-07', dose: 0 }]
r = await call('supp-take', { method: 'POST', body: { userId: 'felix', items } })
ok('supp-take refuses unsigned request', r.s === 403, r)
r = await call('supp-take', { method: 'POST', body: { userId: 'felix', items, token: signTake('felix', [{ supId: 'sup1', date: '2026-10-08', dose: 0 }]) } })
ok('supp-take refuses a signature for other doses', r.s === 403, r)
r = await call('supp-take', { method: 'POST', body: { userId: 'felix', items, token: signTake('felix', items) } })
ok('supp-take saves log', r.s === 200 && r.j.saved === 1 && upserts[0]?.id === 'sl:sup1:2026-10-07:0', r)
r = await call('supp-take', { method: 'POST', body: { userId: 'david', items, token: signTake('david', items) } })
ok('supp-take refuses other users supplement', r.s === 200 && r.j.saved === 0, r)
r = await call('push-test', { method: 'POST', body: {} })
ok('push-test requires login', r.s === 401, r)
r = await call('push-test', { method: 'POST', body: {}, as: 'nobody' })
ok('push-test refuses login without account', r.s === 401, r)
r = await call('push-test', { method: 'POST', body: {}, as: 'felix' })
ok('push-test sends to own devices', r.s === 200 && r.j.devices === 1, r)
const shared = [
  { id: 'a', data: { userId: 'felix', endpoint: 'E', seenAt: '2026-10-01' } },
  { id: 'b', data: { userId: 'u9', endpoint: 'E', seenAt: '2026-10-05' } },
  { id: 'c', data: { userId: 'felix', endpoint: 'F', createdAt: '2026-09-01' } },
  { id: 'd', data: { userId: 'felix', endpoint: 'F', createdAt: '2026-09-02' } },
]
ok('shared device: only the latest user gets notifications', devicesFor(shared, 'felix').map((s) => s.data.endpoint).join() === 'F' && devicesFor(shared, 'u9').length === 1, devicesFor(shared, 'felix'))
r = await call('health')
ok('health', r.j.ok && r.j.push === true, r)
console.log(fail ? `\n${fail} FEIL` : '\nAlle API-tester OK')
process.exit(fail ? 1 : 0)
