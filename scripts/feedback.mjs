// Read and resolve user feedback stored in Supabase (collection "feedback").
//   node scripts/feedback.mjs list            -> open feedback
//   node scripts/feedback.mjs all             -> all feedback
//   node scripts/feedback.mjs done <id> "<what was changed>"
// Needs network access to *.supabase.co. If blocked (e.g. sandbox), run the same
// fetch calls from the browser console on https://jernlogg.vercel.app instead.
import fs from 'fs'
const cfg = fs.readFileSync(new URL('../src/config.ts', import.meta.url), 'utf8')
const URL_ = cfg.match(/https:\/\/[a-z0-9]+\.supabase\.co/)[0]
const KEY = cfg.match(/'(eyJ[^']+)'/)[1]
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const [cmd = 'list', id, reply] = process.argv.slice(2)

async function fetchAll() {
  const r = await fetch(`${URL_}/rest/v1/docs?collection=eq.feedback&deleted=eq.false&order=created_at.asc`, { headers: H })
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
  return r.json()
}

async function fetchComplaints() {
  const r = await fetch(`${URL_}/rest/v1/docs?collection=eq.feedback_complaints&deleted=eq.false&order=created_at.asc`, { headers: H })
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
  return r.json()
}

if (cmd === 'list' || cmd === 'all') {
  const rows = (await fetchAll()).filter((d) => cmd === 'all' || d.data.status !== 'done')
  const complaints = await fetchComplaints()
  if (!rows.length) console.log('Ingen åpne tilbakemeldinger.')
  for (const d of rows) {
    const ks = complaints.filter((k) => k.data.feedbackId === d.id)
    const tag = d.data.status === 'done' ? 'done' : ks.length ? 'KLAGE – gjør på nytt' : 'open'
    console.log(`[${tag}] ${d.id}  (${d.data.userId}, ${d.data.at.slice(0, 10)})\n    ${d.data.text}`)
    for (const a of d.data.attempts ?? []) console.log(`    tidligere forsøk (${a.doneAt.slice(0, 10)}): ${a.reply}`)
    for (const k of ks) console.log(`    klage fra ${k.data.userId} (${k.data.at.slice(0, 10)}): ${k.data.text}`)
    if (d.data.reply) console.log(`    -> ${d.data.reply}`)
  }
} else if (cmd === 'done') {
  if (!id || !reply) throw new Error('usage: done <id> "<what was changed>"')
  const row = (await fetchAll()).find((d) => d.id === id)
  if (!row) throw new Error('not found: ' + id)
  const now = new Date().toISOString()
  const data = { ...row.data, status: 'done', doneAt: now, reply }
  const r = await fetch(`${URL_}/rest/v1/docs?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ data, updated_at: now }) })
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
  console.log('Markert som fikset:', id)
}
