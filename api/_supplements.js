// Pure decision logic for supplement reminders – unit tested in scripts/test-reminders.mjs.
import { localParts, prefsFor } from './_reminders.js'

const isPaused = (s, date) => (s.pauses || []).some((p) => p.from <= date && (!p.to || date < p.to))
const hh = (h) => `${String(h).padStart(2, '0')}:00`
const amountLabel = (s) => (s.amount ? `${String(s.amount).replace('.', ',')} ${s.unit || ''}`.trim() : '')

/**
 * Doses that are due (their hour has passed) and not taken today, plus low-stock warnings.
 * @returns [{ userId, items: [{ supId, name, dose, date, logId, label }], stock: [{ supId, name, daysLeft, logId }] }]
 */
export function decideSupplements(now, users, { subs, profiles, supplements, supLogs, logs }) {
  const sent = new Set(logs.map((l) => l.id))
  const taken = new Set(supLogs.map((l) => l.id))
  const out = []
  for (const userId of Object.keys(users)) {
    if (!subs.some((s) => s.data.userId === userId)) continue
    const profile = profiles.find((x) => x.id === `profile:${userId}`)?.data
    if (profile?.notify?.supplements === false) continue
    const p = prefsFor(profile)
    const { date, hour } = localParts(now, p.tz)
    if (hour > 22) continue
    const items = []
    const stock = []
    for (const sup of supplements.filter((s) => s.data.userId === userId)) {
      const s = sup.data
      if (isPaused(s, date) || (s.createdAt && s.createdAt > date)) continue
      ;(s.doses || []).forEach((d, i) => {
        if (hour < d.hour) return
        if (taken.has(`sl:${sup.id}:${date}:${i}`)) return
        const logId = `supp:${sup.id}:${date}:${i}`
        if (sent.has(logId)) return
        items.push({ supId: sup.id, name: s.name, dose: i, date, logId, label: [amountLabel(s), (s.doses.length > 1 ? hh(d.hour) : '')].filter(Boolean).join(' · ') })
      })
      if (s.stock && s.amount && s.doses && s.doses.length) {
        const used = supLogs.filter((l) => l.data.supId === sup.id && l.data.date >= s.stock.refillAt).length
        const left = Math.max(0, s.stock.total - used * s.amount)
        const daysLeft = Math.floor(left / (s.amount * s.doses.length))
        const logId = `stock:${sup.id}:${s.stock.refillAt}`
        if (daysLeft <= (s.stockWarnDays ?? 7) && !sent.has(logId)) stock.push({ supId: sup.id, name: s.name, daysLeft, logId })
      }
    }
    if (items.length || stock.length) out.push({ userId, items, stock })
  }
  return out
}

/** Merge an (optional) training reminder and supplement reminders into one notification. */
export function buildPayload(training, supp) {
  const items = supp ? supp.items : []
  const stock = supp ? supp.stock : []
  const names = [...new Set(items.map((i) => i.name))]
  const stockText = stock.map((s) => `${s.name}: ca. ${s.daysLeft} ${s.daysLeft === 1 ? 'dag' : 'dager'} igjen i boksen`).join(' · ')
  const take = items.map((i) => ({ supId: i.supId, date: i.date, dose: i.dose }))
  const actions = take.length ? [{ action: 'take', title: 'Tatt ✓' }] : []
  if (training) {
    const extra = [names.length ? `💊 Ikke tatt ennå: ${names.join(', ')}` : '', stockText].filter(Boolean).join('\n')
    return { ...training.payload, body: [training.payload.body, extra].filter(Boolean).join('\n'), take, actions }
  }
  if (names.length) {
    const label = items.length === 1 && items[0].label ? ` (${items[0].label})` : ''
    return {
      title: `Husk ${names.join(' og ').toLowerCase()} 💊`,
      body: [`Ikke krysset av i dag${label}. Trykk «Tatt» når du har tatt ${names.length > 1 ? 'dem' : 'den'}.`, stockText].filter(Boolean).join('\n'),
      url: '/#/supplementer',
      tag: 'supplements',
      take,
      actions,
    }
  }
  return { title: 'Snart tomt 💊', body: stockText, url: '/#/profil', tag: 'stock' }
}
