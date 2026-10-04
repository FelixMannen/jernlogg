import { useMe, go } from '../components/ui'
import { BarChart } from '../components/charts'
import type { WeeklyGoal } from '../lib/domain'
import { setProfile } from '../lib/actions'
import { fmtDate, fmtRelDate } from '../lib/stats'
import { goalFor, goalProgress, goalStreak, runRecords, weeklyKm, runsMissingData, runs, routes, routeBoard, fmtKm, fmtRunTime, fmtPace, kmInRange, hasDistance } from '../lib/runs'
import { runSummary } from './Run'

const N = [1, 2, 3, 4, 5, 6, 7]

/** Weekly goal settings: total, split by type, or total with a running minimum – plus an optional km goal. */
export function GoalEditor() {
  const { me } = useMe()
  const g = goalFor(me)
  const set = (p: Partial<WeeklyGoal>) => setProfile(me, { goal: { ...g, ...p } })
  const Chips = ({ value, onPick, options = N, allowNone }: { value?: number; onPick: (n: number | undefined) => void; options?: number[]; allowNone?: boolean }) => (
    <div className="chips" style={{ flexWrap: 'wrap', margin: 0, padding: 0 }}>
      {allowNone && (
        <button className={`chip ${!value ? 'on' : ''}`} onClick={() => onPick(undefined)}>
          Av
        </button>
      )}
      {options.map((n) => (
        <button key={n} className={`chip ${value === n ? 'on' : ''}`} onClick={() => onPick(n)}>
          {n}
        </button>
      ))}
    </div>
  )
  return (
    <div className="card stack" style={{ background: 'var(--rubber)' }}>
      <h3>Ukesmål</h3>
      <div className="seg" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginBottom: 0 }}>
        {(
          [
            ['total', 'Samlet'],
            ['split', 'Fordelt'],
            ['min', 'Med minimum'],
          ] as const
        ).map(([m, l]) => (
          <button
            key={m}
            className={g.mode === m ? 'on' : ''}
            onClick={() =>
              set(
                m === 'split'
                  ? { mode: m, strength: g.strength ?? Math.max(1, (g.total ?? 3) - 1), run: g.run ?? 1 }
                  : m === 'min'
                    ? { mode: m, total: g.total ?? 4, runMin: g.runMin ?? 1 }
                    : { mode: m, total: g.total ?? 3 },
              )
            }
          >
            {l}
          </button>
        ))}
      </div>
      <p className="tiny muted" style={{ margin: 0 }}>
        {g.mode === 'total' && 'Antall økter i uka, uansett om det er styrke eller løping.'}
        {g.mode === 'split' && 'Eget mål for styrke og for løping. Uka er nådd når begge er nådd.'}
        {g.mode === 'min' && 'Antall økter totalt, hvorav minst et visst antall løpeturer.'}
      </p>
      {g.mode !== 'split' && (
        <div className="field">
          <span>Økter totalt</span>
          <Chips value={g.total} onPick={(n) => set({ total: n ?? 3 })} />
        </div>
      )}
      {g.mode === 'split' && (
        <>
          <div className="field">
            <span>Styrkeøkter</span>
            <Chips value={g.strength} onPick={(n) => set({ strength: n })} options={[0, ...N]} />
          </div>
          <div className="field">
            <span>Løpeturer</span>
            <Chips value={g.run} onPick={(n) => set({ run: n })} options={[0, ...N]} />
          </div>
        </>
      )}
      {g.mode === 'min' && (
        <div className="field">
          <span>Hvorav minst løpeturer</span>
          <Chips value={g.runMin} onPick={(n) => set({ runMin: n })} options={[1, 2, 3, 4]} />
        </div>
      )}
      <div className="field">
        <span>Km-mål for løping per uke (valgfritt)</span>
        <Chips value={g.km} onPick={(n) => set({ km: n })} options={[5, 10, 15, 20, 30, 40, 50]} allowNone />
      </div>
    </div>
  )
}

export function GoalCard({ userId, color }: { userId: string; color: string }) {
  const p = goalProgress(userId)
  const streak = goalStreak(userId)
  if (!p.rows.length) return null
  return (
    <section className="card">
      <div className="spread" style={{ marginBottom: 6 }}>
        <h2>Ukesmål</h2>
        <span className="tiny muted">{streak > 0 ? `nådd ${streak} ${streak === 1 ? 'uke' : 'uker'} på rad 🎯` : p.met ? 'nådd denne uka 🎯' : 'denne uka'}</span>
      </div>
      {p.rows.map((r) => (
        <div key={r.key} className="group-bar" style={{ gridTemplateColumns: '92px 1fr 64px' }}>
          <span>{r.label}</span>
          <span className="track">
            <i style={{ width: `${Math.min(100, (r.done / Math.max(r.target, 0.0001)) * 100)}%`, background: color }} />
          </span>
          <span className="num" style={{ textAlign: 'right' }}>
            {r.est ? 'ca. ' : ''}
            {String(r.done).replace('.', ',')}/{r.target}
            {r.unit ? ` ${r.unit}` : ''}
          </span>
        </div>
      ))}
    </section>
  )
}

export function RunSection({ userId, color, mine }: { userId: string; color: string; mine: boolean }) {
  const all = runs(userId)
  if (!all.length) return null
  const rec = runRecords(userId)
  const weeks = weeklyKm(userId, 12)
  const missing = mine ? runsMissingData(userId) : []
  const yearStart = new Date(new Date().getFullYear(), 0, 1)
  const year = kmInRange(userId, yearStart)
  const myRoutes = routes()
    .map((r) => ({ r, best: routeBoard(r.id).find((b) => b.userId === userId) }))
    .filter((x) => x.best)
  return (
    <>
      <section className="card">
        <div className="spread" style={{ marginBottom: 4 }}>
          <h2>🏃 Løping</h2>
          <span className="tiny muted">
            {all.length} turer · {year.est ? 'ca. ' : ''}
            {fmtKm(year.km, 0)} km i år
          </span>
        </div>
        <BarChart data={weeks} color={color} fmt={(v) => `${String(v).replace('.', ',')} km`} />
        <div className="tiny muted" style={{ textAlign: 'right' }}>
          km per uke, siste 12 uker
        </div>
      </section>

      {missing.length > 0 && (
        <section className="card small nudge-card">
          💡 {missing.length} {missing.length === 1 ? 'tur mangler' : 'turer mangler'} distanse eller tid – fyll inn for tempo og rekorder:
          <div className="list" style={{ marginTop: 8, background: 'transparent' }}>
            {missing.slice(0, 5).map((w) => (
              <button key={w.id} className="list-item" style={{ minHeight: 44, padding: '8px 4px' }} onClick={() => go(`lop/rediger/${w.id}`)}>
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{w.data.title}</div>
                  <div className="tiny muted">
                    {fmtRelDate(w.data.startedAt)} · {runSummary(w.data.run) || 'ingen data'}
                  </div>
                </div>
                <span className="small" style={{ color: 'var(--gold)' }}>
                  + {hasDistance(w.data.run) ? 'tid' : 'distanse'}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="section-title">
          <h2>Løperekorder</h2>
          <span className="tiny muted">kun målte turer</span>
        </div>
        <div className="list">
          <RecRow label="Lengste tur" value={rec.longest ? `${fmtKm(rec.longest.km, 2)} km` : '–'} date={rec.longest?.date} id={rec.longest?.workoutId} />
          {rec.standard.map((s) => (
            <RecRow key={s.label} label={`Beste ${s.label}`} value={s.sec ? fmtRunTime(s.sec) : '–'} date={s.date} id={s.workoutId} />
          ))}
          <RecRow label="Beste snittempo (3+ km)" value={rec.bestPace ? `${fmtPace(rec.bestPace.sec)} /km` : '–'} date={rec.bestPace?.date} id={rec.bestPace?.workoutId} />
        </div>
      </section>

      {myRoutes.length > 0 && (
        <section>
          <div className="section-title">
            <h2>Ruter</h2>
          </div>
          <div className="list">
            {myRoutes.map(({ r, best }) => {
              const board = routeBoard(r.id)
              const rank = board.findIndex((b) => b.userId === userId) + 1
              return (
                <button key={r.id} className="list-item" onClick={() => go(`w/${best!.workoutId}`)}>
                  <div className="grow">
                    <div style={{ fontWeight: 600 }}>{r.data.name}</div>
                    <div className="tiny muted">
                      {fmtKm(r.data.distanceKm, 2)} km · {rank === 1 ? 'rekordholder 👑' : `nr. ${rank} av ${board.length}`}
                    </div>
                  </div>
                  <span className="num" style={{ fontWeight: 700, fontSize: '1.125rem' }}>
                    {fmtRunTime(best!.sec)}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      )}
    </>
  )
}

function RecRow({ label, value, date, id }: { label: string; value: string; date?: string; id?: string }) {
  return (
    <button className="list-item" disabled={!id} onClick={() => id && go(`w/${id}`)} style={!id ? { opacity: 1 } : undefined}>
      <div className="grow">
        <div style={{ fontWeight: 600 }}>{label}</div>
        {date && <div className="tiny muted">{fmtDate(date)}</div>}
      </div>
      <span className="num" style={{ fontWeight: 700, fontSize: '1.125rem', color: id ? undefined : 'var(--dust)' }}>
        {value}
      </span>
    </button>
  )
}
