// Tester tilgangsreglene i supabase/auth.sql mot en ekte Postgres (PGlite, i minnet).
// Usage: node scripts/test-rls.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'fs'
import crypto from 'crypto'

const db = new PGlite()
let fails = 0
let passes = 0
const ok = (cond, msg) => {
  if (cond) passes++
  else {
    fails++
    console.log('  ✗', msg)
  }
}

// --- minimal Supabase-miljø ---
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub', '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  create publication supabase_realtime;
`)
await db.exec(fs.readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8'))

// --- eksisterende data (som i dag, før innlogging) ---
const now = new Date()
const iso = (daysAgo) => new Date(now.getTime() - daysAgo * 86400e3).toISOString()
const legacy = []
const W = (id, userId, daysAgo, extra = {}) =>
  legacy.push([id, 'workouts', { userId, title: 'Push', startedAt: iso(daysAgo), endedAt: iso(daysAgo), status: 'done',
    exercises: [{ uid: 'x', exerciseId: 'benkpress', sets: [{ uid: 's1', weight: 100, reps: 5, done: true }, { uid: 's2', weight: 40, reps: 10, done: true, warmup: true }] }], ...extra }])
W('w_felix1', 'felix', 1)
W('w_david1', 'david', 2)
W('w_erik1', 'erik', 3)
legacy.push(['profile:felix', 'profiles', { weeklyGoal: 3 }])
legacy.push(['profile:david', 'profiles', { weeklyGoal: 4 }])
legacy.push(['bw:david:2026-09-01', 'bodyweight', { userId: 'david', date: '2026-09-01', weight: 84 }])
legacy.push(['sup_d1', 'supplements', { userId: 'david', name: 'Kreatin', doses: [{ hour: 8 }], createdAt: '2026-09-01' }])
legacy.push(['f_1', 'feedback', { userId: 'david', text: 'Gjør X', at: iso(5), status: 'open' }])
legacy.push(['r:w_david1:felix:💪', 'reactions', { workoutId: 'w_david1', userId: 'felix', emoji: '💪' }])
legacy.push(['e_custom1', 'exercises', { name: 'Min øvelse', group: 'Annet', equipment: 'Annet', createdBy: 'erik', custom: true }])
for (const [id, c, d] of legacy) await db.query('insert into docs (id, collection, data) values ($1, $2, $3)', [id, c, d])

await db.exec(fs.readFileSync(new URL('../supabase/auth.sql', import.meta.url), 'utf8'))
const countBefore = (await db.query(`select count(*)::int n from docs where collection = 'workouts'`)).rows[0].n
ok(countBefore === 3, 'auth.sql endrer ikke eksisterende økter')
const untouched = (await db.query(`select data from docs where id = 'w_felix1'`)).rows[0].data
ok(untouched.exercises[0].sets[0].weight === 100 && !('private' in untouched), 'eksisterende data er uendret')

// --- hjelpere ---
const users = {}
function user(name, email) {
  const id = crypto.randomUUID()
  users[name] = { id, email }
  return users[name]
}
async function as(name, sql, params = []) {
  const u = users[name]
  await db.exec(`reset role; select set_config('request.jwt.claims', '${JSON.stringify({ sub: u.id, email: u.email, role: 'authenticated' })}', false); set role authenticated;`)
  try {
    return (await db.query(sql, params)).rows
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claims', '', false);`)
  }
}
async function asAnon(sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claims', '', false); set role anon;`)
  try {
    return (await db.query(sql, params)).rows
  } finally {
    await db.exec('reset role;')
  }
}
async function fails_(fn) {
  try {
    await fn()
    return false
  } catch (e) {
    if (process.env.DEBUG) console.log('    ↳', e.message)
    return true
  }
}
const rpc = async (name, fn, args = '') => (await as(name, `select public.${fn}(${args}) as r`))[0].r
const ids = async (name, coll) => (await as(name, `select id from docs where collection = $1 and not deleted order by id`, [coll])).map((r) => r.id)
const putAs = (name, id, coll, data) =>
  as(name, `insert into docs (id, collection, data) values ($1, $2, $3) on conflict (id) do update set data = excluded.data, deleted = excluded.deleted, updated_at = now()`, [id, coll, data])
const updateAs = (name, id, data) => as(name, `update docs set data = $2, updated_at = now() where id = $1 returning id`, [id, data])

user('felix', 'Felix.Werner.J@gmail.com')
user('david', 'david@example.com')
user('erik', 'erik@example.com')
user('sara', 'sara@example.com')
user('ola', 'ola@example.com')

console.log('Konto og kobling')
ok((await rpc('felix', 'jl_whoami')) === 'felix', 'Felix kobles automatisk via e-post (uavhengig av store bokstaver)')
ok((await rpc('felix', 'jl_whoami')) === 'felix', 'whoami er stabil')
ok((await rpc('david', 'jl_whoami')) === null, 'David er ikke koblet før han har kode')
ok(await fails_(() => rpc('david', 'jl_claim', `'david', 'feil'`)), 'feil kode avvises')
ok(await fails_(() => rpc('sara', 'jl_create_claim', `'david'`)), 'bare Felix kan lage koblingskoder')
const code = await rpc('felix', 'jl_create_claim', `'david'`)
ok(typeof code === 'string' && code.length === 10, 'Felix får koblingskode')
ok(await fails_(() => rpc('sara', 'jl_claim', `'felix', '${code}'`)), 'koden gjelder bare riktig bruker')
ok((await rpc('david', 'jl_claim', `'david', '${code}'`)) === 'david', 'David kobles med koden')
ok(await fails_(() => rpc('sara', 'jl_claim', `'david', '${code}'`)), 'koden kan bare brukes én gang')
const code2 = await rpc('felix', 'jl_create_claim', `'david'`)
ok(await fails_(() => rpc('sara', 'jl_claim', `'david', '${code2}'`)), 'en allerede koblet bruker kan ikke kapres med ny kode')
const codeE = await rpc('felix', 'jl_create_claim', `'erik'`)
ok((await rpc('erik', 'jl_claim', `'erik', '${codeE}'`)) === 'erik', 'Erik kobles')
ok((await as('sara', `select * from docs where collection = 'claims'`)).length === 0, 'ingen kan lese koblingskoder')
ok(await fails_(() => rpc('sara', 'jl_register', `''`)), 'tomt navn avvises')
const sara = await rpc('sara', 'jl_register', `'Sara', '#22aa88', '🦊'`)
ok(/^u[0-9a-f]{11}$/.test(sara), 'ny bruker får egen id')
ok((await rpc('sara', 'jl_register', `'Sara K'`)) === sara, 'registrering to ganger gir samme id')
const saraProf = (await as('sara', `select data from docs where id = $1`, ['profile:' + sara]))[0]?.data
ok(saraProf?.name === 'Sara K' && saraProf?.color === '#22aa88', 'profil med navn og farge')
const ola = await rpc('ola', 'jl_register', `'Ola'`)
ok((await as('sara', `select id from docs where collection = 'accounts'`)).length === 1, 'man ser bare sin egen konto')

console.log('Lesetilgang')
ok((await ids('felix', 'workouts')).join() === 'w_david1,w_erik1,w_felix1', 'gjengen ser hverandres økter')
ok((await ids('sara', 'workouts')).length === 0, 'ny bruker uten gruppe ser ingen andres økter')
ok((await ids('felix', 'bodyweight')).length === 0, 'kroppsvekt er privat')
ok((await ids('david', 'bodyweight')).length === 1, 'man ser sin egen kroppsvekt')
ok((await ids('felix', 'supplements')).length === 0 && (await ids('david', 'supplements')).length === 1, 'supplementer er private')
ok((await ids('sara', 'feedback')).length === 1, 'alle innloggede ser tilbakemeldinger')
ok((await ids('sara', 'exercises')).length === 1, 'egne øvelser er synlige for alle (trengs for å vise økter)')
ok((await ids('sara', 'profiles')).join() === 'profile:' + sara, 'profiler synes bare for gruppevenner')
ok((await ids('felix', 'groups')).join() === 'g_jernlogg', 'gjengen er med i Jernlogg-gjengen')
ok((await ids('sara', 'groups')).length === 0 && (await ids('sara', 'group_members')).length === 0, 'andre ser ikke private grupper')

console.log('Skrivetilgang')
ok(await fails_(() => putAs('sara', 'w_fake', 'workouts', { userId: 'felix', title: 'x', status: 'done', exercises: [] })), 'kan ikke lage økt i andres navn')
ok(await fails_(() => putAs('sara', 'w_felix1', 'workouts', { userId: sara, title: 'kapret', status: 'done', exercises: [] })), 'kan ikke overskrive andres økt med upsert')
ok((await updateAs('sara', 'w_felix1', { userId: sara })).length === 0, 'kan ikke endre andres økt med update')
ok(await fails_(() => putAs('sara', 'account:' + users.sara.id, 'accounts', { userId: 'felix' })), 'kan ikke endre egen konto til en annen bruker')
ok(await fails_(() => putAs('sara', 'gm:g_jernlogg:' + sara, 'group_members', { groupId: 'g_jernlogg', userId: sara })), 'kan ikke melde seg inn i gruppe direkte')
ok(await fails_(() => putAs('sara', 'g_fake', 'groups', { name: 'x', adminId: sara })), 'grupper lages bare via RPC')
ok(await fails_(() => putAs('sara', 'profile:felix', 'profiles', { name: 'Hacket' })), 'kan ikke endre andres profil')
ok(await fails_(() => putAs('sara', 'profile:nyid', 'profiles', { name: 'squat' })), 'kan ikke lage profil for en annen id')
ok(await fails_(() => putAs('sara', 'push_log:x', 'push_log', { userId: sara })), 'push_log er bare for serveren')
await putAs('sara', 'w_sara1', 'workouts', { userId: sara, title: 'Bein', startedAt: iso(1), status: 'done', exercises: [{ uid: 'a', exerciseId: 'kneboy', sets: [{ uid: 'b', weight: 80, reps: 10, done: true }] }] })
ok((await ids('sara', 'workouts')).join() === 'w_sara1', 'kan lagre egen økt')
await as('sara', `update docs set deleted = true where id = 'w_sara1'`)
await putAs('sara', 'w_sara1', 'workouts', { userId: sara, title: 'Bein', startedAt: iso(1), status: 'done', exercises: [{ uid: 'a', exerciseId: 'kneboy', sets: [{ uid: 'b', weight: 80, reps: 10, done: true }] }] })
ok(await fails_(() => as('sara', `update docs set collection = 'accounts' where id = 'w_sara1'`)), 'kan ikke gjøre egen rad om til konto')
ok(await fails_(() => as('sara', `delete from docs where id = 'w_sara1'`)) || (await ids('sara', 'workouts')).length === 1, 'sletting er ikke tillatt (bare myk)')
ok(await fails_(() => putAs('sara', 'c1', 'comments', { workoutId: 'w_felix1', userId: sara, text: 'hei', at: iso(0) })), 'kan ikke kommentere økter man ikke ser')
const s1 = (await db.query(`select synced_at from docs where id = 'w_sara1'`)).rows[0].synced_at
await new Promise((r) => setTimeout(r, 15))
await updateAs('sara', 'w_sara1', { userId: sara, title: 'Bein 2', startedAt: iso(1), status: 'done', exercises: [] })
const s2 = (await db.query(`select synced_at from docs where id = 'w_sara1'`)).rows[0].synced_at
ok(s2 > s1, 'synced_at settes av serveren ved endring')

console.log('Privat økt')
await putAs('david', 'w_david_priv', 'workouts', { userId: 'david', title: 'Rehab', startedAt: iso(0), status: 'done', private: true, exercises: [] })
ok(!(await ids('felix', 'workouts')).includes('w_david_priv'), 'private økter synes ikke for andre')
ok((await ids('david', 'workouts')).includes('w_david_priv'), 'eieren ser sin private økt')
ok(await fails_(() => putAs('felix', 'c_priv', 'comments', { workoutId: 'w_david_priv', userId: 'felix', text: 'x', at: iso(0) })), 'kan ikke kommentere private økter')

console.log('Grupper')
const g = await rpc('sara', 'jl_create_group', `'Løpeklubben', '🏃', false, 'Vi løper'`)
ok(/^g[0-9a-f]{12}$/.test(g), 'gruppe opprettet')
const gdoc = (await as('sara', `select data from docs where id = $1`, [g]))[0].data
ok(gdoc.adminId === sara && gdoc.inviteCode.length === 8, 'oppretter er admin og får invitasjonskode')
ok((await as('felix', `select public.jl_group_preview($1) as r`, [gdoc.inviteCode]))[0].r?.name === 'Løpeklubben', 'forhåndsvisning via kode')
ok((await as('felix', `select public.jl_group_preview(null, $1) as r`, [g]))[0].r === null, 'private grupper kan ikke ses via id')
ok(await fails_(() => as('felix', `select public.jl_join_group(null, $1)`, [g])), 'kan ikke bli med i privat gruppe uten kode')
ok((await as('felix', `select public.jl_join_group($1) as r`, [gdoc.inviteCode.toUpperCase()]))[0].r === g, 'Felix blir med via kode')
ok((await ids('sara', 'workouts')).includes('w_felix1'), 'Sara ser Felix sine økter etter at han ble med')
ok(!(await ids('sara', 'workouts')).includes('w_david1'), 'men ikke David (ikke i samme gruppe)')
ok((await ids('felix', 'workouts')).includes('w_sara1'), 'Felix ser Sara sine økter')
ok(!(await ids('david', 'workouts')).includes('w_sara1'), 'David ser ikke Sara')
ok((await ids('sara', 'profiles')).includes('profile:felix'), 'gruppevenner ser hverandres profil')
await putAs('sara', 'c_ok', 'comments', { workoutId: 'w_felix1', userId: sara, text: 'Sterkt!', at: iso(0) })
ok((await ids('felix', 'comments')).includes('c_ok'), 'kommentar fra gruppevenn')
ok((await ids('david', 'comments')).length === 0, 'David ser ikke kommentaren fra Sara (ikke venner)')
ok((await updateAs('felix', g, { ...gdoc, name: 'Hacket' })).length === 0, 'vanlig medlem kan ikke endre gruppa')
ok((await updateAs('sara', g, { ...gdoc, name: 'Løpeklubben Oslo' })).length === 1, 'admin kan endre gruppa (update)')
let upsertOk = !(await fails_(() => putAs('sara', g, 'groups', { ...gdoc, name: 'Løpeklubben Oslo' })))
console.log(`  (info) admin-endring via upsert: ${upsertOk ? 'tillatt' : 'avvist – klienten bruker update for grupper'}`)
ok(await fails_(() => updateAs('sara', g, { ...gdoc, adminId: 'david' })), 'admin kan ikke gis til en som ikke er medlem')
ok((await updateAs('sara', g, { ...gdoc, name: 'Løpeklubben Oslo', adminId: 'felix' })).length === 1, 'admin kan gi admin videre til et medlem')
ok((await updateAs('sara', g, { ...gdoc, name: 'x', adminId: sara })).length === 0, 'tidligere admin kan ikke endre lenger')
ok(await fails_(() => rpc('sara', 'jl_kick', `'${g}', 'felix'`)), 'bare admin kan fjerne medlemmer')
await as('felix', `select public.jl_join_group($1)`, [gdoc.inviteCode]) // idempotent
ok((await ids('felix', 'group_members')).filter((i) => i.startsWith('gm:' + g)).length === 2, 'å bli med to ganger lager ikke duplikat')
ok((await rpc('felix', 'jl_kick', `'${g}', '${sara}'`)) === true, 'admin fjerner medlem')
ok(!(await ids('sara', 'workouts')).includes('w_felix1'), 'fjernet medlem ser ikke lenger gruppas økter')
ok((await ids('sara', 'groups')).length === 0, 'fjernet medlem ser ikke gruppa')
ok(await fails_(() => putAs('sara', 'c_ok2', 'comments', { workoutId: 'w_felix1', userId: sara, text: 'hei igjen', at: iso(0) })), 'fjernet medlem kan ikke kommentere')
ok((await ids('felix', 'comments')).includes('c_ok'), 'eieren ser fortsatt gamle kommentarer på egen økt')
// leave + handover
const g2 = await rpc('ola', 'jl_create_group', `'Ola sin', null, true`)
const code2g = (await as('ola', `select data->>'inviteCode' c from docs where id = $1`, [g2]))[0].c
await as('erik', `select public.jl_join_group(null, $1)`, [g2])
ok((await ids('erik', 'groups')).includes(g2), 'kan bli med i offentlig gruppe uten kode')
await as('sara', `select public.jl_join_group($1)`, [code2g])
await rpc('ola', 'jl_leave_group', `'${g2}'`)
const g2doc = (await as('erik', `select data from docs where id = $1`, [g2]))[0].data
ok(g2doc.adminId === 'erik', 'admin som går ut gir admin til eldste medlem')
await updateAs('erik', g2, { ...g2doc, inviteEnabled: false })
ok(await fails_(() => as('felix', `select public.jl_join_group($1)`, [code2g])), 'avslått invitasjonslenke virker ikke')

console.log('Tilbakemeldinger')
ok((await updateAs('sara', 'f_1', { userId: 'david', text: 'Gjør X', status: 'done' })).length === 0, 'andre kan ikke endre tilbakemeldinger')
ok((await updateAs('felix', 'f_1', { userId: 'david', text: 'Gjør X', at: iso(5), status: 'done', reply: 'Fikset' })).length === 1, 'Felix (admin) kan markere som fikset')
ok(await fails_(() => putAs('sara', 'review:f_x', 'feedback_review', { approved: true })), 'bare Felix kan godkjenne tilbakemeldinger')
await putAs('felix', 'review:f_x', 'feedback_review', { feedbackId: 'f_x', approved: true, text: 'a' })
ok((await ids('sara', 'feedback_review')).length === 1, 'godkjenninger er synlige')
await putAs('sara', 'f_sara', 'feedback', { userId: sara, text: 'Mitt forslag', at: iso(0), status: 'open' })
ok((await ids('felix', 'feedback')).includes('f_sara'), 'ny bruker kan sende tilbakemelding')

console.log('Gruppe-toppliste')
await putAs('erik', 'w_erik_run', 'workouts', { userId: 'erik', kind: 'run', title: 'Løp', startedAt: iso(0.5), status: 'done', exercises: [], run: { distanceKm: 8.5 } })
await putAs('erik', 'w_erik_priv', 'workouts', { userId: 'erik', title: 'P', startedAt: iso(0.5), status: 'done', private: true, exercises: [{ uid: 'a', exerciseId: 'x', sets: [{ uid: 'b', weight: 1000, reps: 10, done: true }] }] })
const board = await as('david', `select public.jl_group_board($1, $2) as r`, [iso(7), iso(-1)])
const row = board[0].r.find((x) => x.id === g2)
ok(row && Number(row.km) === 8.5, 'km løpt summeres for offentlige grupper')
ok(row && Number(row.kg) === 500, 'kg løftet = vekt × reps i arbeidssett (oppvarming og private økter teller ikke)')
ok(row && row.members === 2, 'antall medlemmer')
ok(!board[0].r.some((x) => x.id === g || x.id === 'g_jernlogg'), 'private grupper er ikke med på topplisten')
const pub = await as('felix', `select public.jl_public_groups() as r`)
ok(pub[0].r.length === 1 && pub[0].r[0].id === g2, 'liste over offentlige grupper')

console.log('Slett konto')
const g3 = await rpc('sara', 'jl_create_group', `'Saras'`)
const c3 = (await as('sara', `select data->>'inviteCode' c from docs where id = $1`, [g3]))[0].c
await as('ola', `select public.jl_join_group($1)`, [c3])
await db.query(`insert into auth.users values ($1, $2)`, [users.sara.id, users.sara.email])
ok((await rpc('sara', 'jl_delete_account')) === true, 'sletting kjører')
const left = (await db.query(`select id from docs where jl.owner(collection, id, data) = $1 or id = $2`, [sara, 'account:' + users.sara.id])).rows
ok(left.length === 0, 'alt Sara eide er slettet (økter, profil, kommentarer, medlemskap, konto)')
ok((await db.query(`select * from auth.users where id = $1`, [users.sara.id])).rows.length === 0, 'innloggingen er slettet')
ok((await db.query(`select data->>'adminId' a from docs where id = $1`, [g3])).rows[0].a === ola, 'gruppene hennes får ny admin')
ok((await db.query(`select count(*)::int n from docs where data->>'userId' in ('felix','david','erik') and collection = 'workouts'`)).rows[0].n >= 3, 'andres data er urørt')

console.log('Overgang (anon) og stenging')
ok((await asAnon(`select id from docs where collection = 'workouts'`)).length > 0, 'gamle app-versjoner (anon) virker fortsatt i overgangen')
ok((await asAnon(`select id from docs where collection in ('accounts','claims','groups','group_members')`)).length === 0, 'anon ser aldri kontoer, koder eller grupper')
ok(await fails_(() => asAnon(`insert into docs (id, collection, data) values ('account:x', 'accounts', '{"userId":"felix"}')`)), 'anon kan ikke lage kontoer')
ok(await fails_(() => asAnon(`select public.jl_create_group('x')`)), 'anon kan ikke kalle RPC')
await db.exec(fs.readFileSync(new URL('../supabase/lockdown.sql', import.meta.url), 'utf8'))
ok(await fails_(() => asAnon(`select id from docs`)), 'etter lockdown har anon ingen tilgang')
ok((await ids('felix', 'workouts')).length >= 3, 'innloggede virker etter lockdown')
await db.exec(fs.readFileSync(new URL('../supabase/auth.sql', import.meta.url), 'utf8'))
ok((await db.query(`select count(*)::int n from docs where collection = 'groups' and id = 'g_jernlogg'`)).rows[0].n === 1, 'auth.sql kan kjøres på nytt uten å duplisere')
await db.exec(fs.readFileSync(new URL('../supabase/lockdown.sql', import.meta.url), 'utf8'))

console.log(`\n${passes} ok, ${fails} feil`)
process.exit(fails ? 1 : 0)
