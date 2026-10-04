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
  badges,
  recentPRs,
  PR_LABEL,
  fmtRelDate,
} from '../lib/stats'
import { addBodyweight, setProfile, sendFeedback, feedbackList } from '../lib/actions'
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
        {mine && (
          <div className="chips">
            <button className="chip" onClick={() => go('verktoy')}>
              🧮 Skive- og 1RM-kalkulator
            </button>
          </div>
        )}
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

        <Badges userId={uid} color={u.color} />
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

        <RecentPRs userId={uid} />

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

        {mine && <FeedbackSection />}

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
          <button
            className="list-item"
            onClick={() => {
              const docs = allDocs()
              download(`jernlogg-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ exportedAt: new Date().toISOString(), docs }, null, 1), 'application/json')
              toast(`Backup lastet ned (${docs.length} rader)`)
            }}
          >
            Last ned full backup av alle data (JSON)
          </button>
          <button className="list-item" onClick={() => go('verktoy')}>
            Verktøy: skive- og 1RM-kalkulator
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

function Badges({ userId, color }: { userId: string; color: string }) {
  const [all, setAll] = useState(false)
  const list = badges(userId)
  const earned = list.filter((b) => b.earned)
  // next goal per category: the first unearned in each family, sorted by closeness
  const next = list
    .filter((b) => !b.earned && b.progress)
    .filter((b, i, arr) => arr.findIndex((x) => x.id.split('-')[0] === b.id.split('-')[0]) === i)
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 3)
  return (
    <section className="card">
      <div className="spread" style={{ marginBottom: 8 }}>
        <h2>Milepæler</h2>
        <button className="tiny muted" onClick={() => setAll(!all)}>
          {earned.length}/{list.length} · {all ? 'skjul' : 'vis alle'}
        </button>
      </div>
      <div className="chips" style={{ flexWrap: 'wrap', margin: 0, padding: 0 }}>
        {(all ? list : earned).map((b) => (
          <span key={b.id} className="chip" style={b.earned ? { background: 'color-mix(in srgb, ' + color + ' 18%, var(--floor-2))', color: 'var(--chalk)' } : { opacity: 0.45 }}>
            {b.icon} {b.label}
          </span>
        ))}
        {!all && earned.length === 0 && <span className="small muted">Ingen ennå – første økt gir den første.</span>}
      </div>
      {next.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="tiny muted" style={{ marginBottom: 4 }}>
            Nærmest neste
          </div>
          {next.map((b) => (
            <div key={b.id} className="group-bar" style={{ gridTemplateColumns: '1fr 80px', gap: 12 }}>
              <span>
                {b.icon} {b.label} <span className="muted tiny">· {b.progress}</span>
              </span>
              <span className="track">
                <i style={{ width: `${b.ratio * 100}%`, background: color }} />
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function RecentPRs({ userId }: { userId: string }) {
  const prs = recentPRs(userId, 6)
  if (!prs.length) return null
  return (
    <section>
      <div className="section-title">
        <h2>Siste PR-er</h2>
      </div>
      <div className="list">
        {prs.map(({ workoutId, date, pr }, i) => (
          <button key={i} className="list-item" onClick={() => go(`w/${workoutId}`)}>
            <span style={{ fontSize: '1.25rem' }}>🏆</span>
            <div className="grow">
              <div style={{ fontWeight: 600 }}>{exerciseById(pr.exerciseId).name}</div>
              <div className="tiny muted">
                {PR_LABEL[pr.kind]} · {fmtRelDate(date)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="num" style={{ fontWeight: 700, fontSize: '1.125rem' }}>
                {fmtKg(pr.value, pr.kind === 'e1rm' ? 0 : 1)} kg
              </div>
              <div className="tiny" style={{ color: 'var(--good)' }}>
                +{fmtKg(pr.value - pr.prev, 1)}
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}

function FeedbackSection() {
  const { me } = useMe()
  const [text, setText] = useState('')
  const all = feedbackList()
  const open = all.filter((f) => f.data.status !== 'done').length
  const done = all.length - open
  return (
    <section className="card stack" id="tilbakemelding">
      <div>
        <h2>Tilbakemelding på appen</h2>
        <p className="small muted" style={{ margin: '4px 0 0' }}>
          Savner du noe, eller er noe knotete? Skriv det her. Ønskene samles i databasen og blir fikset neste gang appen oppdateres.
        </p>
      </div>
      <textarea className="input" placeholder="f.eks. Vil kunne sette hviletid per øvelse" value={text} onChange={(e) => setText(e.target.value)} />
      <button
        className="btn primary block"
        disabled={!text.trim()}
        onClick={() => {
          sendFeedback(me as UserId, text.trim())
          setText('')
          toast('Takk! Tilbakemeldingen er sendt')
        }}
      >
        Send tilbakemelding
      </button>
      <button className="btn block" onClick={() => go('tilbakemeldinger')}>
        Se alle tilbakemeldinger{all.length ? ` (${open} venter · ${done} fikset)` : ''}
      </button>
    </section>
  )
}
