// POST /api/supp-take { userId, items: [{ supId, date, dose }], token }
// Used by the «Tatt ✓» button on a notification (Android/desktop) to check off without opening the app.
// The notification carries a signature (made by the cron) for exactly these doses, so nobody can check off for others.
import { getDoc, upsertDoc, readBody, verifyTake } from './_lib.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST' })
  const { userId, items, token } = await readBody(req)
  if (typeof userId !== 'string' || !Array.isArray(items) || items.length > 20) return res.status(400).json({ error: 'ugyldig' })
  if (!verifyTake(userId, items, token)) return res.status(403).json({ error: 'ugyldig signatur' })
  try {
    let saved = 0
    for (const it of items) {
      if (typeof it?.supId !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(it.date) || !Number.isInteger(it.dose) || it.dose < 0 || it.dose > 9) continue
      const sup = await getDoc(it.supId)
      if (!sup || sup.collection !== 'supplements' || sup.data.userId !== userId) continue
      await upsertDoc(`sl:${it.supId}:${it.date}:${it.dose}`, 'supplement_logs', { supId: it.supId, userId, date: it.date, dose: it.dose, at: new Date().toISOString(), via: 'push' })
      saved++
    }
    res.status(200).json({ ok: true, saved })
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
}
