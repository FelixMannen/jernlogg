// POST /api/push-test – sends a test notification to all of the signed-in user's devices.
import { loadDocs, sendToUser, pushReady, authUser, userNames } from './_lib.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST' })
  if (!pushReady()) return res.status(503).json({ error: 'VAPID_PRIVATE_KEY mangler i Vercel' })
  try {
    const me = await authUser(req)
    if (!me) return res.status(401).json({ error: 'Logg inn på nytt' })
    const docs = await loadDocs(['push_subscriptions', 'profiles'])
    const subs = docs.filter((d) => d.collection === 'push_subscriptions')
    const name = userNames(docs)[me.userId] || 'der'
    const r = await sendToUser(subs, me.userId, { title: 'Testvarsel ✅', body: `Hei ${name}! Push-varsler virker på denne enheten.`, url: '/#/profil', tag: 'test' })
    res.status(200).json(r)
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
}
