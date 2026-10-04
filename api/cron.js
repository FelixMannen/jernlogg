// Daily training reminders. Called hourly by Supabase pg_cron (and daily by Vercel Cron as a fallback).
// Safe to call any time: each user gets at most one reminder per local day (dedupe via push_log).
// GET /api/cron?dry=1 shows what would be sent without sending.
import { loadDocs, sendToUser, claimLog, pushReady, USERS } from './_lib.js'
import { decideReminders } from './_reminders.js'

export default async function handler(req, res) {
  try {
    const dry = req.query?.dry === '1'
    const docs = await loadDocs(['push_subscriptions', 'profiles', 'workouts', 'push_log'])
    const by = (c) => docs.filter((d) => d.collection === c)
    const subs = by('push_subscriptions')
    const decisions = decideReminders(new Date(), USERS, { subs, profiles: by('profiles'), workouts: by('workouts'), logs: by('push_log') })
    if (dry) return res.status(200).json({ dry: true, subscribers: [...new Set(subs.map((s) => s.data.userId))], decisions })
    if (!pushReady()) return res.status(503).json({ error: 'VAPID_PRIVATE_KEY mangler i Vercel' })
    const results = []
    for (const d of decisions) {
      if (!(await claimLog(d.logId, { kind: 'reminder', userId: d.userId, at: new Date().toISOString(), body: d.payload.body }))) continue
      results.push({ userId: d.userId, ...(await sendToUser(subs, d.userId, d.payload)) })
    }
    res.status(200).json({ ok: true, results })
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
}
