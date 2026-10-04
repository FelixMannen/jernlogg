import { useState } from 'react'
import { TopBar, Avatar, useMe, go, back, Icon, Sheet, toast } from '../components/ui'
import { BarChart, LineChart } from '../components/charts'
import { useStoreVersion, getStatus, allDocs } from '../lib/store'
import { USERS, userById, type UserId } from '../lib/domain'
import {
  doneWorkouts,
  weeklyVolume,
  streakWeeks,
  workoutVolume,
  fmtVolume,
  favoriteExercises,
  exerciseById,
  bestE1rm,
  fmtKg,
  bodyweights,
  latestBodyweight,
  profile,
  usedExerciseIds,
  fmtDate,
  trainingDays,
  setsPerGroup,
  startOfWeek,
  weeklyGoal,
} from '../lib/stats'
import { addBodyweight, setProfile } from '../lib/actions'
import { FeedItem } from './Feed'

export function ProfilePage({ userId }: { userId?: string }) {
  useStoreVersion()
  const { me, setMe } = useMe()
  const uid = (userId ?? me) as UserId
  const u = userById(uid)
  const mine = uid === me
  const ws = doneWorkouts(uid)
  const weeks = weeklyVolume(uid, 12)
  const total = ws.reduce((a, w) => a + workoutVolume(w.data), 0)
  const favs = favoriteExercises(uid, 5)
  const bw = bodyweights(uid)
  const [bwOpen, setBwOpen] = useState(false)
  const [settings, setSettings] = useState(false)
  const records = usedExerciseIds(uid)
    .map((id) => ({ id, best: bestE1rm(uid, id) }))
    .filter((r) => r.best.value > 0)
    .sort((a, b) => b.best.value - a.best.value)
    .slice(0, 8)

  return (
    <>
      <TopBar
        title={mine ? 'Profil' : u.name}
        onBack={mine ? undefined : () => back()}
        right={
          mine ? (
            <button className="icon-btn" onClick={() => setSettings(true)} aria-label="Innstillinger">
              <Icon.dots />
            </button>
          ) : undefined
        }
      />
      <div className="page stack">
        <div className="row" style={{ gap: 16 }}>
          <Avatar id={uid} size="lg" />
          <div className="grow">
            <h1 style={{ fontSize: '2.25rem' }}>{u.name}</h1>
            <div className="small muted">
              {latestBodyweight(uid) ? `${fmtKg(latestBodyweight(uid))} kg kroppsvekt` : mine ? 'Legg inn kroppsvekt for relativ styrke' : ''}
            </div>
          </div>
        </div>
        {!mine && (
          <div className="chips">
            {USERS.filter((x) => x.id !== uid).map((x) => (
              <button key={x.id} className="chip" onClick={() => go(`u/${x.id}`)}>
                Se {x.name}
              </button>
            ))}
          </div>
        )}
        <div className="stats">
          <div className="stat">
            <div className="v">{ws.length}</div>
            <div className="l">Økter</div>
          </div>
          <div className="stat">
            <div className="v">{streakWeeks(uid)} 🔥</div>
            <div className="l">Uker på rad</div>
          </div>
          <div className="stat">
            <div className="v">{fmtVolume(total)}</div>
            <div className="l">Totalt løftet</div>
          </div>
        </div>

        <Heatmap userId={uid} color={u.color} />
        <MuscleGroups userId={uid} color={u.color} />

        <section className="card">
          <div className="spread" style={{ marginBottom: 4 }}>
            <h2>Volum per uke</h2>
            <span className="tiny muted">siste 12 uker</span>
          </div>
          <BarChart data={weeks.map((w) => ({ label: w.label, value: w.volume }))} color={u.color} fmt={(v) => fmtVolume(v)} />
        </section>

        {records.length > 0 && (
          <section>
            <div className="section-title">
              <h2>Rekorder</h2>
              <span className="tiny muted">estimert 1RM</span>
            </div>
            <div className="list">
              {records.map((r) => (
                <button key={r.id} className="list-item" onClick={() => go(`ex/${r.id}/${uid}`)}>
                  <div className="grow">
                    <div style={{ fontWeight: 600 }}>{exerciseById(r.id).name}</div>
                    <div className="tiny muted">
                      {r.best.set ? `${fmtKg(r.best.set.weight)} kg × ${r.best.set.reps}` : ''} · {r.best.date ? fmtDate(r.best.date) : ''}
                    </div>
                  </div>
                  <span className="num" style={{ fontSize: '1.375rem', fontWeight: 700 }}>
                    {fmtKg(r.best.value, 0)}
                  </span>
                  <Icon.chevron />
                </button>
              ))}
            </div>
          </section>
        )}

        {favs.length > 0 && (
          <section>
            <div className="section-title">
              <h2>Mest trent</h2>
            </div>
            <div className="chips" style={{ flexWrap: 'wrap', margin: 0, padding: 0 }}>
              {favs.map((f) => (
                <button key={f.exerciseId} className="chip" onClick={() => go(`ex/${f.exerciseId}/${uid}`)}>
                  {exerciseById(f.exerciseId).name} <span className="muted">{f.count}×</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="card">
          <div className="spread" style={{ marginBottom: 4 }}>
            <h2>Kroppsvekt</h2>
            {mine && (
              <button className="btn small" onClick={() => setBwOpen(true)}>
                <Icon.plus /> Logg
              </button>
            )}
          </div>
          {bw.length ? (
            <LineChart series={[{ name: u.name, color: u.color, points: bw.map((b) => ({ x: Date.parse(b.date), y: b.weight })) }]} height={150} />
          ) : (
            <div className="small muted">{mine ? 'Logg vekta di for å se utviklingen og få relativ styrke på topplistene.' : 'Ingen registreringer.'}</div>
          )}
        </section>

        {ws.length > 0 && (
          <section>
            <div className="section-title">
              <h2>Siste økter</h2>
            </div>
            {ws.slice(0, 5).map((w) => (
              <FeedItem key={w.id} w={w} />
            ))}
          </section>
        )}
      </div>
      {bwOpen && <BodyweightSheet onClose={() => setBwOpen(false)} />}
      {settings && <SettingsSheet onClose={() => setSettings(false)} onSwitch={() => setMe(null)} />}
    </>
  )
}

function BodyweightSheet({ onClose }: { onClose: () => void }) {
  const { me } = useMe()
  const [v, setV] = useState(latestBodyweight(me) ? String(latestBodyweight(me)).replace('.', ',') : '')
  const n = parseFloat(v.replace(',', '.'))
  return (
    <Sheet title="Logg kroppsvekt" onClose={onClose}>
      <div className="stack">
        <label className="field">
          <span>Vekt i dag (kg)</span>
          <input className="input num" style={{ fontSize: '1.5rem' }} inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} autoFocus />
        </label>
        <button
          className="btn primary big block"
          disabled={!(n > 20 && n < 300)}
          onClick={() => {
            addBodyweight(me as UserId, n)
            toast('Kroppsvekt er lagret')
            onClose()
          }}
        >
          Lagre
        </button>
      </div>
    </Sheet>
  )
}

function download(name: string, text: string, type: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function SettingsSheet({ onClose, onSwitch }: { onClose: () => void; onSwitch: () => void }) {
  const { me } = useMe()
  const p = profile(me)
  const st = getStatus()
  const rest = p.restSeconds ?? 90
  return (
    <Sheet title="Innstillinger" onClose={onClose}>
      <div className="stack">
        <div className="field">
          <span>Standard hviletid</span>
          <div className="chips" style={{ flexWrap: 'wrap', margin: 0, padding: 0 }}>
            {[60, 90, 120, 150, 180, 240].map((s) => (
              <button key={s} className={`chip ${rest === s ? 'on' : ''}`} onClick={() => setProfile(me, { restSeconds: s })}>
                {s < 120 ? `${s} s` : `${s / 60} min`.replace('.5', ',5')}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Ukesmål (økter per uke)</span>
          <div className="chips" style={{ flexWrap: 'wrap', margin: 0, padding: 0 }}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button key={n} className={`chip ${weeklyGoal(me) === n ? 'on' : ''}`} onClick={() => setProfile(me, { weeklyGoal: n })}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="list">
          <button
            className="list-item"
            onClick={() => {
              const mine = allDocs().filter((d) => !d.deleted && d.collection === 'workouts' && d.data.userId === me)
              download(`jernlogg-${me}.json`, JSON.stringify(mine, null, 2), 'application/json')
            }}
          >
            Eksporter mine økter (JSON)
          </button>
          <button
            className="list-item"
            onClick={() => {
              const rows = [['dato', 'okt', 'ovelse', 'sett', 'kg', 'reps', 'oppvarming']]
              for (const w of doneWorkouts(me))
                for (const ex of w.data.exercises) {
                  let i = 0
                  for (const s of ex.sets) rows.push([w.data.startedAt.slice(0, 10), w.data.title, exerciseById(ex.exerciseId).name, String(++i), String(s.weight ?? ''), String(s.reps ?? ''), s.warmup ? 'ja' : ''])
                }
              download(`jernlogg-${me}.csv`, rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv')
            }}
          >
            Eksporter mine sett (CSV)
          </button>
          <button className="list-item" onClick={onSwitch}>
            Bytt bruker
          </button>
        </div>
        <p className="tiny muted">
          Database: {st.backend === 'supabase' ? 'Supabase' : 'lokal (kun denne enheten)'} · {st.status === 'offline' ? 'frakoblet' : 'tilkoblet'}
          {st.pending ? ` · ${st.pending} endringer venter` : ''}
        </p>
      </div>
    </Sheet>
  )
}

function Heatmap({ userId, color }: { userId: string; color: string }) {
  const days = trainingDays(userId)
  const weeks = 18
  const start = startOfWeek()
  start.setDate(start.getDate() - (weeks - 1) * 7)
  const cells: { key: string; v: number; future: boolean }[] = []
  const today = new Date()
  const max = Math.max(1, ...days.values())
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    cells.push({ key, v: days.get(key) || 0, future: d > today })
  }
  const count = [...days.keys()].filter((k) => k >= cells[0].key).length
  return (
    <section className="card">
      <div className="spread" style={{ marginBottom: 8 }}>
        <h2>Treningsdager</h2>
        <span className="tiny muted">{count} dager siste {weeks} uker</span>
      </div>
      <div className="heat">
        {cells.map((c) => (
          <i
            key={c.key}
            title={c.key}
            style={c.v ? { background: color, opacity: 0.45 + 0.55 * (c.v / max) } : c.future ? { opacity: 0.3 } : undefined}
          />
        ))}
      </div>
    </section>
  )
}

function MuscleGroups({ userId, color }: { userId: string; color: string }) {
  const from = new Date(Date.now() - 28 * 86400000)
  const rows = setsPerGroup(userId, from)
  if (!rows.length) return null
  const max = Math.max(...rows.map((r) => r.sets))
  return (
    <section className="card">
      <div className="spread" style={{ marginBottom: 6 }}>
        <h2>Sett per muskelgruppe</h2>
        <span className="tiny muted">siste 4 uker</span>
      </div>
      {rows.map((r) => (
        <div key={r.group} className="group-bar">
          <span>{r.group}</span>
          <span className="track">
            <i style={{ width: `${(r.sets / max) * 100}%`, background: color }} />
          </span>
          <span className="num" style={{ textAlign: 'right' }}>
            {r.sets}
          </span>
        </div>
      ))}
    </section>
  )
}
