import { useState, type ComponentType } from 'react'
import { Avatar, go } from '../components/ui'
import { type UserId } from '../lib/domain'
import { startOfWeek, fmtDate, sharedOnly } from '../lib/stats'
import { userById, type UserInfo } from '../lib/users'
import { kmInRange, runRecords, routes, routeBoard, fmtKm, fmtRunTime, fmtPace, runs } from '../lib/runs'

type Row = { id: UserId; value: number; sub?: string }
type BoardT = ComponentType<{ rows: Row[]; fmt: (v: number) => string; empty?: string }>

/** Lower is better (times, pace). */
function TimeBoard({ rows, fmt, empty, onRow }: { rows: (Row & { workoutId?: string })[]; fmt: (v: number) => string; empty: string; onRow?: (r: Row & { workoutId?: string }) => void }) {
  const have = rows.filter((r) => r.value > 0).sort((a, b) => a.value - b.value)
  if (!have.length) return <div className="small muted" style={{ padding: '8px 0' }}>{empty}</div>
  const best = have[0].value
  return (
    <div>
      {have.map((r, i) => {
        const u = userById(r.id)
        return (
          <button key={r.id} className="lb-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => onRow?.(r)}>
            <span className={`lb-rank ${i === 0 ? 'first' : ''}`}>{i + 1}</span>
            <Avatar id={r.id} size="sm" />
            <div>
              <div className="small" style={{ fontWeight: 600 }}>
                {u.name} {r.sub && <span className="muted tiny" style={{ fontWeight: 400 }}>{r.sub}</span>}
              </div>
              <div className="lb-bar">
                <i style={{ width: `${(best / r.value) * 100}%`, background: u.color }} />
              </div>
            </div>
            <span className="lb-val">{fmt(r.value)}</span>
          </button>
        )
      })}
    </div>
  )
}

export function RunBoards({ Board, people }: { Board: BoardT; people: UserInfo[] }) {
  const list = routes()
  const [routeId, setRouteId] = useState<string | undefined>(list[0]?.id)
  return sharedOnly(() => RunBoardsView({ Board, USERS: people, list, routeId, setRouteId }))
}

function RunBoardsView({ Board, USERS, list, routeId, setRouteId }: { Board: BoardT; USERS: UserInfo[]; list: ReturnType<typeof routes>; routeId?: string; setRouteId: (id: string) => void }) {
  const weekStart = startOfWeek()
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const week = USERS.map((u) => ({ u, k: kmInRange(u.id, weekStart) }))
  const month = USERS.map((u) => ({ u, k: kmInRange(u.id, monthStart) }))
  const recs = USERS.map((u) => ({ u, r: runRecords(u.id) }))
  const noRuns = runs().length === 0
  const kmFmt = (v: number) => fmtKm(v, 1)

  if (noRuns)
    return (
      <div className="page">
        <div className="empty">
          <h3>Ingen løpeturer ennå</h3>
          <p>Logg en tur fra Start → Løpetur, så dukker topplistene opp her.</p>
          <button className="btn primary" onClick={() => go('lop')}>
            🏃 Løpetur
          </button>
        </div>
      </div>
    )

  return (
    <div className="page" style={{ paddingTop: 0 }}>
      <section className="card">
        <h2>Km denne uka</h2>
        <p className="tiny muted" style={{ margin: '2px 0 4px' }}>
          Teller også anslag («ca.»)
        </p>
        <Board
          rows={week.map(({ u, k }) => ({ id: u.id, value: Math.round(k.km * 10) / 10, sub: `${k.count} ${k.count === 1 ? 'tur' : 'turer'}${k.est ? ' · ca.' : ''}` }))}
          fmt={kmFmt}
          empty="Ingen har løpt denne uka ennå."
        />
      </section>

      <section className="card" style={{ marginTop: 12 }}>
        <h2>Km denne måneden</h2>
        <Board
          rows={month.map(({ u, k }) => ({ id: u.id, value: Math.round(k.km * 10) / 10, sub: `${k.count} ${k.count === 1 ? 'tur' : 'turer'} · ${Math.round(k.minutes)} min${k.est ? ' · ca.' : ''}` }))}
          fmt={kmFmt}
        />
      </section>

      {list.length > 0 && (
        <section className="card" style={{ marginTop: 12 }}>
          <h2>Rute-rekorder</h2>
          <div className="chips" style={{ margin: '8px -16px 4px' }}>
            {list.map((r) => (
              <button key={r.id} className={`chip ${routeId === r.id ? 'on' : ''}`} onClick={() => setRouteId(r.id)}>
                {r.data.name}
              </button>
            ))}
          </div>
          {routeId && (
            <TimeBoard
              rows={routeBoard(routeId).filter((b) => USERS.some((u) => u.id === b.userId)).map((b) => ({ id: b.userId, value: b.sec, sub: fmtDate(b.date), workoutId: b.workoutId }))}
              fmt={(v) => fmtRunTime(v)}
              empty="Ingen målte tider på denne ruta ennå."
              onRow={(r) => r.workoutId && go(`w/${r.workoutId}`)}
            />
          )}
        </section>
      )}

      <section className="card" style={{ marginTop: 12 }}>
        <h2>Lengste tur</h2>
        <Board rows={recs.map(({ u, r }) => ({ id: u.id, value: r.longest?.km ?? 0, sub: r.longest ? fmtDate(r.longest.date) : undefined }))} fmt={kmFmt} empty="Ingen målte distanser ennå." />
      </section>

      {[0, 1, 2].map((i) => {
        const label = recs[0].r.standard[i].label
        const rows = recs.map(({ u, r }) => ({ id: u.id, value: r.standard[i].sec ?? 0, sub: r.standard[i].date ? fmtDate(r.standard[i].date!) : undefined, workoutId: r.standard[i].workoutId }))
        if (i > 0 && rows.every((x) => !x.value)) return null
        return (
          <section key={i} className="card" style={{ marginTop: 12 }}>
            <h2>Beste {label}</h2>
            <p className="tiny muted" style={{ margin: '2px 0 4px' }}>
              Fra målte turer på {fmtKm(recs[0].r.standard[i].km, 1)}–{fmtKm(recs[0].r.standard[i].km * 1.15, 1)} km, regnet om etter snittempo
            </p>
            <TimeBoard rows={rows} fmt={(v) => fmtRunTime(v)} empty={`Ingen målte turer på ${label} ennå.`} onRow={(r) => r.workoutId && go(`w/${r.workoutId}`)} />
          </section>
        )
      })}

      <section className="card" style={{ marginTop: 12 }}>
        <h2>Beste snittempo</h2>
        <p className="tiny muted" style={{ margin: '2px 0 4px' }}>
          Målte turer på minst 3 km
        </p>
        <TimeBoard
          rows={recs.map(({ u, r }) => ({ id: u.id, value: r.bestPace?.sec ?? 0, sub: r.bestPace ? fmtDate(r.bestPace.date) : undefined, workoutId: r.bestPace?.workoutId }))}
          fmt={(v) => `${fmtPace(v)}`}
          empty="Ingen målte turer på 3+ km ennå."
          onRow={(r) => r.workoutId && go(`w/${r.workoutId}`)}
        />
      </section>
    </div>
  )
}

