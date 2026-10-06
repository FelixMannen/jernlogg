// GET /api/health – quick check that the backend is configured (no secrets returned).
import { pushReady, hasServiceKey, VAPID_PUBLIC_KEY } from './_lib.js'
export default function handler(req, res) {
  res.status(200).json({ ok: true, push: pushReady(), serviceKey: hasServiceKey(), publicKey: VAPID_PUBLIC_KEY.slice(0, 12) + '…' })
}
