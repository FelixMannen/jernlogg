// POST /api/notify { workoutId } – called by the app when someone finishes a workout.
// Tells the other two ("David trente akkurat – din tur!"). Sent once per workout, only for fresh workouts.
import { loadDocs, getDoc, sendToUser, claimLog, pushReady, readBody, USERS } from './_lib.js'
import { prefsFor } from './_reminders.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST' })
  if (!pushReady()) return res.status(503).json({ error: 'VAPID_PRIVATE_KEY mangler i Vercel' })
  const { workoutId } = await readBody(req)
  if (typeof workoutId !== 'string') return res.status(400).json({ error: 'workoutId mangler' })
  try {
    const w = await getDoc(workoutId)
    if (!w || w.collection !== 'workouts' || w.data.status !== 'done') return res.status(200).json({ skipped: 'ikke en fullført økt' })
    if (Date.now() - Date.parse(w.data.endedAt || w.updated_at) > 45 * 60000) return res.status(200).json({ skipped: 'for gammel' })
    if (!(await claimLog(`done:${workoutId}`, { kind: 'friend', workoutId, at: new Date().toISOString() }))) return res.status(200).json({ skipped: 'allerede varslet' })
    const name = USERS[w.data.userId] || 'En kompis'
    let sets = 0
    let volume = 0
    for (const ex of w.data.exercises || []) for (const s of ex.sets || []) if (s.done && !s.warmup) {
      sets++
      volume += (s.weight || 0) * (s.reps || 0)
    }
    const mins = w.data.endedAt ? Math.round((Date.parse(w.data.endedAt) - Date.parse(w.data.startedAt)) / 60000) : 0
    const vol = volume >= 10000 ? `${(volume / 1000).toFixed(1).replace('.', ',')} t` : `${Math.round(volume)} kg`
    const details = [w.data.title, mins > 0 && mins < 600 ? `${mins} min` : null, `${sets} sett`, volume ? vol : null].filter(Boolean).join(' · ')
    const docs = await loadDocs(['push_subscriptions', 'profiles'])
    const subs = docs.filter((d) => d.collection === 'push_subscriptions')
    const results = []
    for (const other of Object.keys(USERS).filter((u) => u !== w.data.userId)) {
      const p = prefsFor(docs.find((d) => d.id === `profile:${other}`)?.data)
      if (!p.friends) continue
      results.push({
        userId: other,
        ...(await sendToUser(subs, other, { title: `${name} trente akkurat 💪`, body: `${details} – din tur!`, url: `/#/w/${workoutId}`, tag: `done-${workoutId}` })),
      })
    }
    res.status(200).json({ ok: true, results })
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
}
