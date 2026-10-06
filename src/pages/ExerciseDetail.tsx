import { useState } from 'react'
import { TopBar, back, useMe, go } from '../components/ui'
import { LineChart } from '../components/charts'
import { useStoreVersion } from '../lib/store'
import { type UserId } from '../lib/domain'
import { useScope, scopeUsers } from '../lib/scope'
import { exerciseById, exerciseHistory, recordsFrom, fmtKg, fmtRelDate, e1rm } from '../lib/stats'

export function ExerciseDetailPage({ id, userId }: { id: string; userId?: string }) {
  useStoreVersion()
  const { me } = useMe()
  const [who, setWho] = useState<UserId>((userId ?? me) as UserId)
  const [compare, setCompare] = useState(false)
  const [scope] = useScope(me)
  const scoped = scopeUsers(me, scope)
  const USERS = scoped.some((u) => u.id === who) ? scoped : [...scoped, ...scopeUsers(me, 'alle').filter((u) => u.id === who)]
  const info = exerciseById(id)
  const bw = !!info.bodyweight
  const [metric, setMetric] = useState<'e1rm' | 'top' | 'volume' | 'reps' | 'totalReps'>(bw ? 'reps' : 'e1rm')
  const hist = exerciseHistory(who, id)
  const rec = recordsFrom(hist)
  const pick = (h: ReturnType<typeof exerciseHistory>[number]) =>
    metric === 'e1rm'
      ? h.bestE1rm
      : metric === 'top'
        ? h.topWeight
        : metric === 'reps'
          ? Math.max(0, ...h.sets.filter((s) => !s.warmup).map((s) => s.reps || 0))
          : metric === 'totalReps'
            ? h.totalReps
            : h.volume
  const series = (compare ? USERS.slice(0, 8) : USERS.filter((u) => u.id === who))
    .map((u) => ({
      name: u.name,
      color: u.color,
      points: exerciseHistory(u.id, id)
        .map((h) => ({ x: Date.parse(h.date), y: Math.round(pick(h) * 10) / 10 }))
        .filter((p) => p.y > 0),
    }))
    .filter((s) => s.points.length)

  return (
    <>
      <TopBar title={info.name} onBack={() => back()} />
      <div className="page stack">
        <div className="tiny muted">
          {info.group} · {info.equipment}
        </div>
        <div className="chips">
          {USERS.map((u) => (
            <button key={u.id} className={`chip ${who === u.id && !compare ? 'on' : ''}`} onClick={() => (setWho(u.id), setCompare(false))}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: u.color }} /> {u.name}
            </button>
          ))}
          {USERS.length > 1 && (
            <button className={`chip ${compare ? 'on' : ''}`} onClick={() => setCompare(!compare)}>
              Sammenlign{USERS.length > 8 ? ' topp 8' : ' alle'}
            </button>
          )}
        </div>

        {!compare && (
          <div className="stats" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <div className="stat">
              <div className="v">{bw ? rec.maxReps || '–' : rec.maxE1rm ? fmtKg(rec.maxE1rm, 1) : '–'}</div>
              <div className="l">{bw ? 'Flest reps i ett sett' : 'Beste 1RM (est.)'}</div>
            </div>
            <div className="stat">
              <div className="v">{rec.maxWeight ? `${fmtKg(rec.maxWeight)}` : '–'}</div>
              <div className="l">{bw ? 'Mest ekstra vekt' : 'Tyngste vekt'}</div>
            </div>
            <div className="stat">
              <div className="v">{bw ? Math.max(0, ...hist.map((h) => h.totalReps)) || '–' : rec.maxVolume ? fmtKg(rec.maxVolume, 0) : '–'}</div>
              <div className="l">{bw ? 'Flest reps i én økt' : 'Mest volum i én økt'}</div>
            </div>
            <div className="stat">
              <div className="v">{hist.length}</div>
              <div className="l">Økter</div>
            </div>
          </div>
        )}

        <section className="card">
          <div className="chips" style={{ marginBottom: 8 }}>
            {(bw
              ? ([
                  ['reps', 'Flest reps'],
                  ['totalReps', 'Reps totalt'],
                  ['top', 'Ekstra vekt'],
                ] as const)
              : ([
                  ['e1rm', 'Est. 1RM'],
                  ['top', 'Toppvekt'],
                  ['volume', 'Volum'],
                ] as const)
            ).map(([k, l]) => (
              <button key={k} className={`chip ${metric === k ? 'on' : ''}`} onClick={() => setMetric(k)}>
                {l}
              </button>
            ))}
          </div>
          {series.length ? <LineChart series={series} unit={metric === 'reps' || metric === 'totalReps' ? 'reps' : 'kg'} /> : <div className="small muted">Ingen økter med denne øvelsen ennå.</div>}
          {compare && series.length > 1 && (
            <div className="row tiny" style={{ marginTop: 6, gap: 12 }}>
              {series.map((s) => (
                <span key={s.name} className="row" style={{ gap: 4 }}>
                  <i style={{ width: 10, height: 3, background: s.color, borderRadius: 2 }} /> {s.name}
                </span>
              ))}
            </div>
          )}
        </section>

        {!compare && rec.repsAtWeight.size > 0 && (
          <section className="card">
            <h3 style={{ marginBottom: 6 }}>Flest reps per vekt</h3>
            <div className="chips" style={{ flexWrap: 'wrap', margin: 0, padding: 0 }}>
              {[...rec.repsAtWeight.entries()]
                .filter(([w]) => w > 0 || bw)
                .sort((a, b) => b[0] - a[0])
                .slice(0, 12)
                .map(([w, r]) => (
                  <span key={w} className="chip num">
                    {w ? `${bw ? '+' : ''}${fmtKg(w)} kg` : 'Kroppsvekt'} × {r}
                  </span>
                ))}
            </div>
          </section>
        )}

        {!compare && hist.length > 0 && (
          <section>
            <div className="section-title">
              <h2>Historikk</h2>
            </div>
            <div className="list">
              {hist.map((h) => (
                <button key={h.workoutId} className="list-item" style={{ alignItems: 'flex-start' }} onClick={() => go(`w/${h.workoutId}`)}>
                  <div className="grow">
                    <div className="small muted">{fmtRelDate(h.date)}</div>
                    <div className="num" style={{ fontSize: '1.0625rem' }}>
                      {h.sets
                        .filter((s) => !s.warmup)
                        .map((s) => (s.weight ? `${fmtKg(s.weight)}×${s.reps}` : `${s.reps}`))
                        .join('  ')}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="num" style={{ fontWeight: 700, fontSize: '1.125rem' }}>
                      {fmtKg(h.bestE1rm, 0)}
                    </div>
                    <div className="tiny muted">e1RM</div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}
        {!compare && hist.length === 0 && (
          <div className="empty small">{USERS.find((u) => u.id === who)?.name ?? 'Personen'} har ikke logget {info.name.toLowerCase()} ennå.</div>
        )}
        <PercentTable max={rec.maxE1rm} show={!compare && rec.maxE1rm > 0} />
      </div>
    </>
  )
}

function PercentTable({ max, show }: { max: number; show: boolean }) {
  if (!show) return null
  const rows = [
    [95, 2],
    [90, 3],
    [85, 5],
    [80, 6],
    [75, 8],
    [70, 10],
    [65, 12],
  ]
  return (
    <section className="card">
      <h3 style={{ marginBottom: 4 }}>Planlegg neste økt</h3>
      <p className="tiny muted" style={{ marginTop: 0 }}>
        Prosent av estimert 1RM, rundet til nærmeste 2,5 kg
      </p>
      {rows.map(([p, reps]) => (
        <div key={p} className="spread num" style={{ padding: '3px 0' }}>
          <span className="muted">{p} %</span>
          <span>~{reps} reps</span>
          <span style={{ fontWeight: 700 }}>{fmtKg(Math.round((max * p) / 100 / 2.5) * 2.5)} kg</span>
        </div>
      ))}
      <div className="tiny muted" style={{ marginTop: 4 }}>
        Basert på beste estimerte 1RM: {fmtKg(max, 1)} kg
      </div>
    </section>
  )
}
