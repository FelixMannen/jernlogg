import { Fragment, useState } from 'react'
import { TopBar, Avatar, go, useMe } from '../components/ui'
import { ExercisePicker } from '../components/ExercisePicker'
import { useStoreVersion } from '../lib/store'
import { USERS, type UserId } from '../lib/domain'
import {
  bestE1rm,
  bestScore,
  exerciseById,
  fmtKg,
  fmtVolume,
  latestBodyweight,
  usedExerciseIds,
  workoutsInRange,
  startOfWeek,
  workoutVolume,
  streakWeeks,
  fmtDate,
} from '../lib/stats'

type Row = { id: UserId; value: number; sub?: string }

function Board({ rows, fmt, empty }: { rows: Row[]; fmt: (v: number) => string; empty?: string }) {
  const sorted = [...rows].sort((a, b) => b.value - a.value)
  const max = Math.max(1, ...sorted.map((r) => r.value))
  if (sorted.every((r) => r.value === 0)) return <div className="small muted" style={{ padding: '8px 0' }}>{empty ?? 'Ingen data ennå'}</div>
  return (
    <div>
      {sorted.map((r, i) => {
        const u = USERS.find((x) => x.id === r.id)!
        return (
          <div key={r.id} className="lb-row">
            <span className={`lb-rank ${i === 0 && r.value > 0 ? 'first' : ''}`}>{r.value > 0 ? i + 1 : '–'}</span>
            <Avatar id={r.id} size="sm" />
            <div>
              <div className="small" style={{ fontWeight: 600 }}>
                {u.name} {r.sub && <span className="muted tiny" style={{ fontWeight: 400 }}>{r.sub}</span>}
              </div>
              <div className="lb-bar">
                <i style={{ width: `${(r.value / max) * 100}%`, background: u.color }} />
              </div>
            </div>
            <span className="lb-val">{r.value > 0 ? fmt(r.value) : '–'}</span>
          </div>
        )
      })}
    </div>
  )
}

const BIG3 = ['benkpress', 'kneboy', 'markloft']

export function LeaderboardPage() {
  useStoreVersion()
  const { me } = useMe()
  const used = usedExerciseIds()
  const candidates = [...new Set([...BIG3, ...used])]
  const [ex, setEx] = useState<string>(used[0] ?? 'benkpress')
  const [relative, setRelative] = useState(false)
  const [picking, setPicking] = useState(false)

  const exRows: Row[] = USERS.map((u) => {
    const b = bestScore(u.id, ex)
    const bw = latestBodyweight(u.id)
    const val = relative && b.unit === 'kg' ? (bw && b.value ? b.value / bw : 0) : b.value
    return {
      id: u.id,
      value: val,
      sub: b.set ? `${b.set.weight ? fmtKg(b.set.weight) + '×' : ''}${b.set.reps}${b.set.weight ? '' : ' reps'} · ${fmtDate(b.date!)}` : undefined,
    }
  })

  const big3Rows: Row[] = USERS.map((u) => {
    const parts = BIG3.map((id) => bestE1rm(u.id, id).value)
    return { id: u.id, value: parts.every((p) => p > 0) ? parts.reduce((a, b) => a + b, 0) : 0, sub: parts.every((p) => p > 0) ? parts.map((p) => Math.round(p)).join(' + ') : undefined }
  })

  const weekStart = startOfWeek()
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const weekRows: Row[] = USERS.map((u) => {
    const ws = workoutsInRange(u.id, weekStart)
    return { id: u.id, value: ws.reduce((a, w) => a + workoutVolume(w.data), 0), sub: `${ws.length} økter` }
  })
  const monthRows: Row[] = USERS.map((u) => ({ id: u.id, value: workoutsInRange(u.id, monthStart).length }))
  const streakRows: Row[] = USERS.map((u) => ({ id: u.id, value: streakWeeks(u.id) }))
  const anyBw = USERS.some((u) => latestBodyweight(u.id))

  return (
    <>
      <TopBar title="Topplister" />
      <div className="page">
        <section className="card">
          <div className="spread" style={{ marginBottom: 8 }}>
            <h2>{exerciseById(ex).bodyweight ? 'Flest reps' : 'Beste 1RM'}</h2>
            {anyBw && (
              <div className="row">
                <button className={`chip ${!relative ? 'on' : ''}`} onClick={() => setRelative(false)}>
                  kg
                </button>
                <button className={`chip ${relative ? 'on' : ''}`} onClick={() => setRelative(true)}>
                  × kroppsvekt
                </button>
              </div>
            )}
          </div>
          <div className="chips" style={{ marginBottom: 4 }}>
            {candidates.slice(0, 10).map((id) => (
              <button key={id} className={`chip ${ex === id ? 'on' : ''}`} onClick={() => setEx(id)}>
                {exerciseById(id).name}
              </button>
            ))}
            <button className="chip" onClick={() => setPicking(true)}>
              Annen…
            </button>
          </div>
          <Board rows={exRows} fmt={(v) => (exerciseById(ex).bodyweight ? `${v}` : relative ? `${v.toFixed(2).replace('.', ',')}×` : `${fmtKg(v, 0)}`)} empty={`Ingen har logget ${exerciseById(ex).name.toLowerCase()} ennå.`} />
          <button className="btn small ghost" style={{ marginTop: 4 }} onClick={() => go(`ex/${ex}`)}>
            Se utvikling for {exerciseById(ex).name.toLowerCase()}
          </button>
        </section>

        <HeadToHead />

        <section className="card" style={{ marginTop: 12 }}>
          <h2>Big 3-total</h2>
          <p className="tiny muted" style={{ margin: '2px 0 4px' }}>
            Estimert 1RM i benk + knebøy + markløft
          </p>
          <Board rows={big3Rows} fmt={(v) => fmtKg(v, 0)} empty="Logg alle tre løftene for å komme på lista." />
        </section>

        <section className="card" style={{ marginTop: 12 }}>
          <h2>Volum denne uka</h2>
          <Board rows={weekRows} fmt={(v) => fmtVolume(v)} empty="Ingen har trent denne uka ennå." />
        </section>

        <section className="card" style={{ marginTop: 12 }}>
          <h2>Økter denne måneden</h2>
          <Board rows={monthRows} fmt={(v) => String(v)} />
        </section>

        <section className="card" style={{ marginTop: 12 }}>
          <h2>Streak</h2>
          <p className="tiny muted" style={{ margin: '2px 0 4px' }}>
            Uker på rad med minst én økt
          </p>
          <Board rows={streakRows} fmt={(v) => `${v} 🔥`} />
        </section>
      </div>
      {picking && (
        <ExercisePicker
          me={me as UserId}
          multi={false}
          title="Velg øvelse"
          onClose={() => setPicking(false)}
          onPick={(ids) => {
            setEx(ids[0])
            setPicking(false)
          }}
        />
      )}
    </>
  )
}

function HeadToHead() {
  // exercises at least two people have logged
  const ids = usedExerciseIds().filter((id) => USERS.filter((u) => bestScore(u.id, id).value > 0).length >= 2)
  if (!ids.length) return null
  const wins: Record<string, number> = { felix: 0, david: 0, erik: 0 }
  const rows = ids.map((id) => {
    const vals = USERS.map((u) => bestScore(u.id, id).value)
    const max = Math.max(...vals)
    USERS.forEach((u, i) => vals[i] === max && max > 0 && wins[u.id]++)
    return { id, vals, max }
  })
  return (
    <section className="card" style={{ marginTop: 12 }}>
      <div className="spread" style={{ marginBottom: 8 }}>
        <h2>Hvem er sterkest på hva</h2>
      </div>
      <div className="h2h">
        <span />
        {USERS.map((u) => (
          <span key={u.id} className="h2h-head">
            <Avatar id={u.id} size="sm" />
            <span className="num tiny muted">{wins[u.id]} 👑</span>
          </span>
        ))}
        {rows.map((r) => (
          <Fragment key={r.id}>
            <button className="h2h-ex" onClick={() => go(`ex/${r.id}`)}>
              {exerciseById(r.id).name}
            </button>
            {r.vals.map((v, i) => (
              <span key={i} className="num h2h-v" style={v === r.max && v > 0 ? { color: USERS[i].color, fontWeight: 700 } : undefined}>
                {v > 0 ? fmtKg(v, 0) : '–'}
              </span>
            ))}
          </Fragment>
        ))}
      </div>
    </section>
  )
}
