import { useState } from 'react'
import { Sheet, Icon, toast, confirmDialog, useMe, go, TopBar, vibrate } from './ui'
import { useStoreVersion } from '../lib/store'
import type { UserId } from '../lib/domain'
import {
  supplements,
  isTaken,
  setTaken,
  setDayTaken,
  doseLabel,
  dayKey,
  addDays,
  dayStatus,
  streak,
  stockInfo,
  pendingToday,
  saveSupplement,
  deleteSupplement,
  togglePauseSupplement,
  refill,
  setRefillDate,
  pausedNow,
  UNITS,
  type Supplement,
} from '../lib/supplements'

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`
const SUGGESTIONS: { name: string; amount: number; unit: string }[] = [
  { name: 'Kreatin', amount: 5, unit: 'g' },
  { name: 'Proteinpulver', amount: 30, unit: 'g' },
  { name: 'Omega-3', amount: 2, unit: 'kapsler' },
  { name: 'Vitamin D', amount: 1, unit: 'tabletter' },
  { name: 'Magnesium', amount: 1, unit: 'tabletter' },
  { name: 'Multivitamin', amount: 1, unit: 'tabletter' },
]

/* ---------- profile section (own profile only) ---------- */
export function SupplementsSection() {
  useStoreVersion()
  const { me } = useMe()
  const [edit, setEdit] = useState<null | { id?: string }>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const list = supplements(me)
  const today = dayKey()
  return (
    <section className="card stack" id="supplementer">
      <div className="spread">
        <h2>💊 Supplementer</h2>
        <button className="btn small" onClick={() => setEdit({})}>
          <Icon.plus /> Legg til
        </button>
      </div>
      {list.length === 0 && (
        <p className="small muted" style={{ margin: 0 }}>
          Legg inn det du tar, f.eks. 5 g kreatin daglig, og kryss av hver dag. Glemmer du det, får du en påminnelse. Bare du ser supplementene dine.
        </p>
      )}
      {list.map((s) => {
        const st = streak(s)
        const stock = stockInfo(s)
        const paused = pausedNow(s.data)
        const warn = s.data.stockWarnDays ?? 7
        return (
          <div key={s.id} className="supp">
            <button className="spread supp-head" onClick={() => setDetail(s.id)}>
              <span>
                <b>{s.data.name}</b> <span className="muted small">{doseLabel(s.data)}</span>
              </span>
              <span className="small">
                {paused ? <span className="muted">På pause</span> : `${st} 🔥`}
                <Icon.chevron />
              </span>
            </button>
            {!paused && (
              <div className="supp-doses">
                {s.data.doses.map((d, i) => {
                  const on = isTaken(s.id, today, i)
                  return (
                    <button
                      key={i}
                      className={`supp-dose ${on ? 'on' : ''}`}
                      aria-pressed={on}
                      aria-label={`${s.data.name} ${hh(d.hour)} ${on ? 'tatt' : 'ikke tatt'}`}
                      onClick={() => {
                        setTaken(s, today, i, !on)
                        if (!on) vibrate(20)
                      }}
                    >
                      <span className="supp-box">{on ? <Icon.check /> : null}</span>
                      {hh(d.hour)}
                      <span className="tiny">{on ? 'Tatt' : 'Ikke tatt'}</span>
                    </button>
                  )
                })}
              </div>
            )}
            {stock && (
              <div className={`tiny ${stock.daysLeft <= warn ? 'supp-low' : 'muted'}`}>
                {stock.daysLeft <= warn ? '⚠️ ' : ''}
                {String(Math.round(stock.left * 10) / 10).replace('.', ',')} {s.data.unit} igjen · ca. {stock.daysLeft} {stock.daysLeft === 1 ? 'dag' : 'dager'}
              </div>
            )}
          </div>
        )
      })}
      {edit && <SupplementEditor id={edit.id} onClose={() => setEdit(null)} />}
      {detail && (
        <SupplementDetail
          id={detail}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setEdit({ id: detail })
            setDetail(null)
          }}
        />
      )}
    </section>
  )
}

/* ---------- add / edit ---------- */
function SupplementEditor({ id, onClose }: { id?: string; onClose: () => void }) {
  const { me } = useMe()
  const cur = id ? supplements(me).find((s) => s.id === id)?.data : undefined
  const [name, setName] = useState(cur?.name ?? '')
  const [amount, setAmount] = useState(cur?.amount != null ? String(cur.amount).replace('.', ',') : '')
  const [unit, setUnit] = useState(cur?.unit ?? 'g')
  const [hours, setHours] = useState<number[]>(cur?.doses.map((d) => d.hour) ?? [8])
  const [stock, setStock] = useState(cur?.stock ? String(cur.stock.total).replace('.', ',') : '')
  const [since, setSince] = useState(cur?.stock?.refillAt ?? dayKey())
  const amt = parseFloat(amount.replace(',', '.'))
  const total = parseFloat(stock.replace(',', '.'))
  const valid = name.trim() && hours.length > 0
  return (
    <Sheet title={id ? 'Rediger supplement' : 'Nytt supplement'} onClose={onClose}>
      <div className="stack">
        {!id && (
          <div className="chips" style={{ margin: 0, padding: 0, flexWrap: 'wrap' }}>
            {SUGGESTIONS.map((s) => (
              <button
                key={s.name}
                className={`chip ${name === s.name ? 'on' : ''}`}
                onClick={() => {
                  setName(s.name)
                  setAmount(String(s.amount))
                  setUnit(s.unit)
                }}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}
        <label className="field">
          <span>Navn</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="f.eks. Kreatin" />
        </label>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="field" style={{ width: 110 }}>
            <span>Mengde per dose</span>
            <input className="input num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="5" />
          </label>
          <div className="field grow">
            <span>Enhet</span>
            <div className="chips" style={{ margin: 0, padding: 0, flexWrap: 'wrap' }}>
              {UNITS.map((u) => (
                <button key={u} className={`chip ${unit === u ? 'on' : ''}`} onClick={() => setUnit(u)}>
                  {u}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="field">
          <span>Når tar du den? (påminnelse hvis den ikke er krysset av innen klokkeslettet)</span>
          {hours.map((h, i) => (
            <div key={i} className="row" style={{ marginBottom: 6 }}>
              <span className="small muted" style={{ width: 52 }}>
                Dose {i + 1}
              </span>
              <select className="input grow" value={h} onChange={(e) => setHours((l) => l.map((x, j) => (j === i ? parseInt(e.target.value, 10) : x)))} aria-label={`Klokkeslett dose ${i + 1}`}>
                {Array.from({ length: 18 }, (_, k) => k + 6).map((x) => (
                  <option key={x} value={x}>
                    {hh(x)}
                  </option>
                ))}
              </select>
              {hours.length > 1 && (
                <button className="icon-btn" aria-label={`Fjern dose ${i + 1}`} onClick={() => setHours((l) => l.filter((_, j) => j !== i))}>
                  <Icon.x />
                </button>
              )}
            </div>
          ))}
          {hours.length < 4 && (
            <button className="btn small ghost" onClick={() => setHours((l) => [...l, Math.min(22, (l[l.length - 1] ?? 8) + 4)])}>
              <Icon.plus /> Legg til en dose til
            </button>
          )}
        </div>

        <label className="field">
          <span>Lager (valgfritt): hvor mye var i boksen da du begynte på den, i {unit}?</span>
          <input className="input num" inputMode="decimal" value={stock} onChange={(e) => setStock(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder={unit === 'g' ? 'f.eks. 500' : 'f.eks. 120'} />
        </label>
        {stock && (
          <label className="field">
            <span>Begynte på boksen (alle doser fra og med denne dagen trekkes fra)</span>
            <input className="input" type="date" value={since} max={dayKey()} onChange={(e) => setSince(e.target.value || dayKey())} />
          </label>
        )}
        {stock && !(amt > 0) && <p className="tiny" style={{ color: 'var(--gold)', margin: 0 }}>Fyll inn mengde per dose for å få lagerteller.</p>}

        <button
          className="btn primary big block"
          disabled={!valid}
          onClick={() => {
            const sorted = [...hours].sort((a, b) => a - b)
            const s: Supplement = {
              ...(cur ?? {}),
              userId: (cur?.userId ?? me) as UserId,
              name: name.trim(),
              amount: amt > 0 ? amt : undefined,
              unit,
              doses: sorted.map((hour) => ({ hour })),
              stock: total > 0 ? { total, refillAt: since } : undefined,
              createdAt: cur?.createdAt ?? dayKey(),
            }
            saveSupplement(s, id)
            toast(id ? 'Supplementet er oppdatert' : `${s.name} er lagt til`)
            onClose()
          }}
        >
          Lagre
        </button>
      </div>
    </Sheet>
  )
}

/* ---------- detail: calendar, streak, stock, pause ---------- */
function SupplementDetail({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: () => void }) {
  useStoreVersion()
  const { me } = useMe()
  const sup = supplements(me).find((s) => s.id === id)
  const [refillOpen, setRefillOpen] = useState(false)
  const [refillVal, setRefillVal] = useState(sup?.data.stock ? String(sup.data.stock.total) : '')
  if (!sup) return null
  const s = sup.data
  const today = dayKey()
  const yesterday = addDays(today, -1)
  const stock = stockInfo(sup)
  const paused = pausedNow(s)
  // 6 weeks, Monday first, ending this week
  const now = new Date()
  const dow = (now.getDay() + 6) % 7
  const start = addDays(today, -dow - 35)
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i))
  const yStatus = dayStatus(sup, yesterday, today)
  return (
    <Sheet title={s.name} onClose={onClose}>
      <div className="stack">
        <div className="stats">
          <div className="stat">
            <div className="v">{streak(sup)} 🔥</div>
            <div className="l">Dager på rad</div>
          </div>
          <div className="stat">
            <div className="v">{doseLabel(s) || '–'}</div>
            <div className="l">{s.doses.length > 1 ? `× ${s.doses.length} per dag` : 'Per dag'}</div>
          </div>
          <div className="stat">
            <div className="v">{stock ? stock.daysLeft : '–'}</div>
            <div className="l">Dager igjen</div>
          </div>
        </div>

        {yStatus !== 'full' && yStatus !== 'paused' && (
          <button className="btn block" onClick={() => {
              setDayTaken(sup, yesterday, true)
              if (s.stock && yesterday < s.stock.refillAt) toast('Registrert for i går', undefined, { label: 'Trekk fra boksen', run: () => setRefillDate(sup, yesterday) })
              else toast('Registrert for i går')
            }}>
            Tok den i går
          </button>
        )}

        <div>
          <div className="supp-cal-head tiny muted">
            {['M', 'T', 'O', 'T', 'F', 'L', 'S'].map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          <div className="supp-cal">
            {days.map((d) => {
              const st = dayStatus(sup, d, today)
              const editable = d <= today && d >= addDays(today, -30)
              return (
                <button
                  key={d}
                  className={`supp-day ${st} ${d === today ? 'today' : ''}`}
                  disabled={!editable}
                  title={d}
                  aria-label={`${d}: ${st}`}
                  onClick={() => {
                    const taking = st !== 'full'
                    setDayTaken(sup, d, taking)
                    // ticked off a day before the current box was registered: offer to count it from that box
                    if (taking && s.stock && d < s.stock.refillAt)
                      toast(`Registrert ${parseInt(d.slice(8), 10)}.`, undefined, {
                        label: 'Trekk fra boksen',
                        run: () => setRefillDate(sup, d),
                      })
                  }}
                >
                  {parseInt(d.slice(8), 10)}
                </button>
              )
            })}
          </div>
          <div className="tiny muted" style={{ marginTop: 6 }}>
            Trykk på en dag for å krysse av eller fjerne. Grønn = alt tatt, gul = delvis, grå = pause.
            {s.stock ? ` Lageret teller doser fra ${parseInt(s.stock.refillAt.slice(8), 10)}.${s.stock.refillAt.slice(5, 7)} (endres under «Rediger»).` : ''}
          </div>
        </div>

        {s.stock && (
          <div className="card small" style={{ background: 'var(--rubber)' }}>
            {stock && (
              <div>
                {String(Math.round(stock.left * 10) / 10).replace('.', ',')} {s.unit} igjen av {String(s.stock.total).replace('.', ',')} · ca. {stock.daysLeft} dager
              </div>
            )}
            {!refillOpen ? (
              <button className="btn small block" style={{ marginTop: 8 }} onClick={() => setRefillOpen(true)}>
                Ny boks
              </button>
            ) : (
              <div className="row" style={{ marginTop: 8 }}>
                <input className="input num grow" inputMode="decimal" value={refillVal} onChange={(e) => setRefillVal(e.target.value.replace(/[^0-9.,]/g, ''))} aria-label="Mengde i ny boks" />
                <button
                  className="btn primary"
                  disabled={!(parseFloat(refillVal.replace(',', '.')) > 0)}
                  onClick={() => {
                    refill(sup, parseFloat(refillVal.replace(',', '.')))
                    setRefillOpen(false)
                    toast('Lageret er fylt opp')
                  }}
                >
                  Lagre
                </button>
              </div>
            )}
          </div>
        )}

        <div className="list">
          <button className="list-item" onClick={() => (togglePauseSupplement(sup), toast(paused ? 'Fortsetter – streaken teller igjen' : 'Satt på pause – streaken står stille'))}>
            <Icon.timer /> {paused ? 'Fortsett' : 'Sett på pause'}
          </button>
          <button className="list-item" onClick={onEdit}>
            <Icon.edit /> Rediger
          </button>
          <button
            className="list-item"
            style={{ color: '#ff8a80' }}
            onClick={async () => {
              if (await confirmDialog({ title: `Slette ${s.name}?`, body: 'Supplementet og påminnelsene forsvinner.', ok: 'Slett', danger: true })) {
                deleteSupplement(id)
                toast(`${s.name} er slettet`)
                onClose()
              }
            }}
          >
            <Icon.trash /> Slett
          </button>
        </div>
      </div>
    </Sheet>
  )
}

/* ---------- quick check: feed card + #/supplementer ---------- */
export function TodaySupplementsCard() {
  useStoreVersion()
  const { me } = useMe()
  const pending = pendingToday(me)
  if (!pending.length) return null
  const today = dayKey()
  return (
    <section className="card supp-today" aria-label="Supplementer i dag">
      <div className="spread" style={{ marginBottom: 6 }}>
        <h3>💊 I dag</h3>
        <button className="tiny muted" onClick={() => go('profil')}>
          Endre
        </button>
      </div>
      <div className="supp-doses">
        {pending.map(({ sup, dose, hour }) => (
          <button
            key={`${sup.id}-${dose}`}
            className="supp-dose"
            onClick={() => {
              setTaken(sup, today, dose, true)
              vibrate(20)
              toast(`${sup.data.name} er krysset av`)
            }}
            aria-label={`Kryss av ${sup.data.name} ${hh(hour)}`}
          >
            <span className="supp-box" />
            {sup.data.name}
            <span className="tiny">
              {doseLabel(sup.data)} · {hh(hour)}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

export function SupplementsTodayPage() {
  useStoreVersion()
  const { me } = useMe()
  const list = supplements(me)
  const today = dayKey()
  return (
    <>
      <TopBar title="Supplementer i dag" onBack={() => go('feed')} />
      <div className="page stack">
        {list.length === 0 && (
          <div className="empty">
            <h3>Ingen supplementer</h3>
            <p>Legg dem inn under Profil.</p>
            <button className="btn primary" onClick={() => go('profil')}>
              Til profilen
            </button>
          </div>
        )}
        {list.map((s) =>
          pausedNow(s.data) ? null : (
            <div key={s.id} className="card">
              <div className="spread" style={{ marginBottom: 8 }}>
                <b>{s.data.name}</b>
                <span className="small muted">
                  {doseLabel(s.data)} · {streak(s)} 🔥
                </span>
              </div>
              <div className="supp-doses">
                {s.data.doses.map((d, i) => {
                  const on = isTaken(s.id, today, i)
                  return (
                    <button key={i} className={`supp-dose big ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => setTaken(s, today, i, !on)}>
                      <span className="supp-box">{on ? <Icon.check /> : null}</span>
                      {hh(d.hour)}
                      <span className="tiny">{on ? 'Tatt' : 'Trykk når tatt'}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ),
        )}
        {list.length > 0 && (
          <button className="btn ghost block" onClick={() => go('profil')}>
            Administrer supplementer
          </button>
        )}
      </div>
    </>
  )
}

