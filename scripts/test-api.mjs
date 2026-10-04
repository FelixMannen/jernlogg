// Runs the API handlers against a mocked Supabase REST API: node scripts/test-api.mjs
import webpush from 'web-push'
const testKeys = webpush.generateVAPIDKeys()
process.env.VAPID_PRIVATE_KEY = testKeys.privateKey
process.env.VAPID_PUBLIC_KEY = testKeys.publicKey
const now = new Date()
const docs = [
  { id: 'push:felix1', collection: 'push_subscriptions', data: { userId: 'felix', endpoint: 'https://example.invalid/x', keys: {} } },
  { id: 'profile:felix', collection: 'profiles', data: { notify: { tz: 'UTC', hour: 0, days: 1 } } },
  { id: 'w1', collection: 'workouts', data: { userId: 'david', title: 'Push', status: 'done', startedAt: new Date(now - 3600e3).toISOString(), endedAt: new Date(now - 60e3).toISOString(), exercises: [{ sets: [{ done: true, weight: 100, reps: 5 }] }] }, updated_at: now.toISOString() },
]
const inserted = new Set()
global.fetch = async (url, opts = {}) => {
  const u = new URL(url)
  const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
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
const call = async (mod, { method = 'GET', query = {}, body } = {}) => {
  const h = (await import(`../api/${mod}.js`)).default
  let out
  const res = { status: (s) => ({ json: (j) => (out = { s, j }) }) }
  await h({ method, query, body }, res)
  return out
}
let fail = 0
const ok = (n, c, x) => (c ? console.log('✓', n) : (fail++, console.log('✗', n, JSON.stringify(x))))
let r = await call('cron', { query: { dry: '1' } })
ok('cron dry decides felix', r.s === 200 && r.j.decisions.length === 1 && r.j.decisions[0].userId === 'felix', r)
r = await call('cron')
ok('cron sends (push to invalid endpoint reported as error, not crash)', r.s === 200 && r.j.results.length === 1, r)
r = await call('cron')
ok('cron second run deduped', r.s === 200 && r.j.results.length === 0, r)
r = await call('notify', { method: 'POST', body: { workoutId: 'w1' } })
ok('notify ok', r.s === 200 && r.j.ok && r.j.results.some((x) => x.userId === 'felix'), r)
r = await call('notify', { method: 'POST', body: { workoutId: 'w1' } })
ok('notify deduped', r.j.skipped === 'allerede varslet', r)
r = await call('push-test', { method: 'POST', body: { userId: 'nobody' } })
ok('push-test rejects unknown user', r.s === 400, r)
r = await call('health')
ok('health', r.j.ok && r.j.push === true, r)
console.log(fail ? `\n${fail} FEIL` : '\nAlle API-tester OK')
process.exit(fail ? 1 : 0)
