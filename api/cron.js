// Reminders: training («Du burde trene i dag») + supplements not checked off + low stock.
// Called hourly by Supabase pg_cron (and daily by Vercel Cron as a fallback).
// Safe to call any time: every reminder is sent at most once (dedupe via push_log).
// When a training reminder and supplement reminders are due at the same time they become ONE notification.
// GET /api/cron?dry=1 shows what would be sent without sending.
import { loadDocs, sendToUser, claimLog, pushReady, USERS } from './_lib.js'
import { decideReminders } from './_reminders.js'
import { decideSupplements, buildPayload } from './_supplements.js'

export default async function handler(req, res) {
  res.setHeader?.('Cache-Control', 'no-store')
  try {
    const dry = req.query?.dry === '1'
    const docs = await loadDocs(['push_subscriptions', 'profiles', 'workouts', 'push_log', 'supplements', 'supplement_logs'])
    const by = (c) => docs.filter((d) => d.collection === c)
    const subs = by('push_subscriptions')
    const now = new Date()
    const training = decideReminders(now, USERS, { subs, profiles: by('profiles'), workouts: by('workouts'), logs: by('push_log') })
    const supp = decideSupplements(now, USERS, { subs, profiles: by('profiles'), supplements: by('supplements'), supLogs: by('supplement_logs'), logs: by('push_log') })
    const users = [...new Set([...training.map((t) => t.userId), ...supp.map((s) => s.userId)])]
    const plan = users.map((userId) => {
      const t = training.find((x) => x.userId === userId)
      const s = supp.find((x) => x.userId === userId)
      return { userId, training: t, supp: s, payload: buildPayload(t, s) }
    })
    if (dry) return res.status(200).json({ dry: true, subscribers: [...new Set(subs.map((s) => s.data.userId))], plan })
    if (!pushReady()) return res.status(503).json({ error: 'VAPID_PRIVATE_KEY mangler i Vercel' })
    const results = []
    for (const p of plan) {
      const at = new Date().toISOString()
      // claim every part first; drop parts another run already sent
      const t = p.training && (await claimLog(p.training.logId, { kind: 'reminder', userId: p.userId, at, body: p.training.payload.body })) ? p.training : null
      const items = []
      for (const i of p.supp?.items ?? []) if (await claimLog(i.logId, { kind: 'supplement', userId: p.userId, at, supId: i.supId })) items.push(i)
      const stock = []
      for (const s of p.supp?.stock ?? []) if (await claimLog(s.logId, { kind: 'stock', userId: p.userId, at, supId: s.supId })) stock.push(s)
      if (!t && !items.length && !stock.length) continue
      const payload = buildPayload(t, { items, stock })
      results.push({ userId: p.userId, ...(await sendToUser(subs, p.userId, { ...payload, userId: p.userId })) })
    }
    res.status(200).json({ ok: true, results })
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
}
