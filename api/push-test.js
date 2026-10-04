// POST /api/push-test { userId } – sends a test notification to all of that user's devices.
import { loadDocs, sendToUser, pushReady, readBody, USERS } from './_lib.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST' })
  if (!pushReady()) return res.status(503).json({ error: 'VAPID_PRIVATE_KEY mangler i Vercel' })
  const { userId } = await readBody(req)
  if (!USERS[userId]) return res.status(400).json({ error: 'ukjent bruker' })
  try {
    const subs = await loadDocs(['push_subscriptions'])
    const r = await sendToUser(subs, userId, { title: 'Testvarsel ✅', body: `Hei ${USERS[userId]}! Push-varsler virker på denne enheten.`, url: '/#/profil', tag: 'test' })
    res.status(200).json(r)
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
}
