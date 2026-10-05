// POST /api/supp-take { userId, items: [{ supId, date, dose }] }
// Used by the «Tatt ✓» button on a notification (Android/desktop) to check off without opening the app.
import { getDoc, upsertDoc, readBody, USERS } from './_lib.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST' })
  const { userId, items } = await readBody(req)
  if (!USERS[userId] || !Array.isArray(items) || items.length > 20) return res.status(400).json({ error: 'ugyldig' })
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
