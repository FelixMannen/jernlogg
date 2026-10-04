// GET /api/health – quick check that the push backend is configured (no secrets returned).
import { pushReady, VAPID_PUBLIC_KEY } from './_lib.js'
export default function handler(req, res) {
  res.status(200).json({ ok: true, push: pushReady(), publicKey: VAPID_PUBLIC_KEY.slice(0, 12) + '…' })
}
