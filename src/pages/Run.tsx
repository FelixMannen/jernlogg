import { useEffect, useMemo, useState } from 'react'
import { useMe, TopBar, Icon, go, back, toast, confirmDialog, Sheet, useNow, useWakeLock, Avatar, vibrate, confetti } from '../components/ui'
import { WorkoutMenuButton, toLocalInput } from '../components/WorkoutActions'
import { useStoreVersion, getDoc } from '../lib/store'
import { USERS, userById, REACTIONS, FEELINGS, FEELING_LABEL, RUN_TYPES, type Workout, type UserId, type RunData, type RunType, type Route } from '../lib/domain'
import { fmtRelDate, activeWorkout, fmtDate } from '../lib/stats'
import {
  saveRun,
  startStopwatch,
  stopwatchElapsed,
  togglePause,
  discardWorkout,
  saveRoute,
  deleteRoute,
  updateWorkout,
  toggleReaction,
  reactionsFor,
  commentsFor,
  addComment,
} from '../lib/actions'
import { notifyFinished } from '../lib/push'
import {
  routes,
  routeById,
  routeBoard,
  fmtRunTime,
  fmtKm,
  fmtPace,
  parseTime,
  paceOf,
  hasDistance,
  hasDuration,
  prsForRun,
  runs,
} from '../lib/runs'

const DIST_CHIPS = [3, 5, 8, 10, 15, 21.1]
const TIME_CHIPS = [20, 30, 45, 60, 90]

/* =================== start page (#/lop) =================== */
export function RunStartPage() {
  useStoreVersion()
  const { me } = useMe()
  const [routeSheet, setRouteSheet] = useState<null | { id?: string }>(null)
  const active = activeWorkout(me)
  const list = routes()
  const mine = runs(me).slice(0, 3)
  return (
    <>
      <TopBar title="Løpetur" onBack={() => go('okt')} />
      <div className="page stack-l">
        <div className="stack">
          <button
            className="btn primary big block"
            onClick={() => {
              if (active) {
                toast('Du har allerede en økt i gang')
                go('okt')
                return
              }
              startStopwatch(me as UserId)
              vibrate(20)
              go('okt')
            }}
          >
            ▶ Start stoppeklokke
          </button>
          <button className="btn big block" onClick={() => go('lop/ny')}>
            <Icon.plus /> Logg en løpetur
          </button>
          <p className="tiny muted" style={{ margin: 0 }}>
            Stoppeklokka teller riktig selv om skjermen låses. Distansen legger du inn etterpå, eller velg en rute.
          </p>
        </div>

        <section>
          <div className="section-title">
            <h2>Ruter</h2>
            <button className="small muted" onClick={() => setRouteSheet({})}>
              + Ny rute
            </button>
          </div>
          {list.length === 0 ? (
            <div className="card small muted">
              Lag en rute (f.eks. «Elverunden, 6,4 km») – så trenger du bare å skrive inn tiden, og dere får en egen toppliste per rute.
              <button className="btn block" style={{ marginTop: 10 }} onClick={() => setRouteSheet({})}>
                <Icon.plus /> Lag første rute
              </button>
            </div>
          ) : (
            <div className="list">
              {list.map((r) => {
                const board = routeBoard(r.id)
                const myBest = board.find((b) => b.userId === me)
                return (
                  <div key={r.id} className="list-item">
                    <button className="grow" style={{ textAlign: 'left' }} onClick={() => go(`lop/ny?rute=${r.id}`)}>
                      <div style={{ fontWeight: 600 }}>{r.data.name}</div>
                      <div className="tiny muted">
                        {fmtKm(r.data.distanceKm, 2)} km
                        {board[0] ? ` · rekord ${fmtRunTime(board[0].sec)} (${userById(board[0].userId).name})` : ''}
                        {myBest ? ` · din beste ${fmtRunTime(myBest.sec)}` : ''}
                      </div>
                    </button>
                    <button className="btn small primary" onClick={() => go(`lop/ny?rute=${r.id}`)}>
                      Logg
                    </button>
                    <button className="icon-btn" aria-label={`Rediger ${r.data.name}`} onClick={() => setRouteSheet({ id: r.id })}>
                      <Icon.edit />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {mine.length > 0 && (
          <section>
            <div className="section-title">
              <h2>Dine siste turer</h2>
            </div>
            <div className="list">
              {mine.map((w) => (
                <button key={w.id} className="list-item" onClick={() => go(`w/${w.id}`)}>
                  <div className="grow">
                    <div style={{ fontWeight: 600 }}>{w.data.title}</div>
                    <div className="tiny muted">{fmtRelDate(w.data.startedAt)}</div>
                  </div>
                  <span className="num">{runSummary(w.data.run)}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
      {routeSheet && <RouteSheet id={routeSheet.id} onClose={() => setRouteSheet(null)} />}
    </>
  )
}

export function runSummary(r?: RunData): string {
  if (!r) return ''
  const parts: string[] = []
  if (hasDistance(r)) parts.push(`${r.distanceEst ? 'ca. ' : ''}${fmtKm(r.distanceKm, 2)} km`)
  if (hasDuration(r)) parts.push(`${r.durationEst ? 'ca. ' : ''}${fmtRunTime(r.durationSec)}`)
  const p = paceOf(r)
  if (p) parts.push(`${fmtPace(p)} /km`)
  return parts.join(' · ')
}

/* =================== route editor =================== */
export function RouteSheet({ id, onClose, onSaved }: { id?: string; onClose: () => void; onSaved?: (id: string) => void }) {
  const { me } = useMe()
  const cur = id ? getDoc<Route>(id)?.data : undefined
  const [name, setName] = useState(cur?.name ?? '')
  const [dist, setDist] = useState(cur ? String(cur.distanceKm).replace('.', ',') : '')
  const [note, setNote] = useState(cur?.note ?? '')
  const km = parseFloat(dist.replace(',', '.'))
  const valid = name.trim() && km > 0 && km < 200
  return (
    <Sheet title={id ? 'Rediger rute' : 'Ny rute'} onClose={onClose}>
      <div className="stack">
        <label className="field">
          <span>Navn</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="f.eks. Elverunden" autoFocus={!id} />
        </label>
        <label className="field">
          <span>Distanse (km)</span>
          <input className="input num" inputMode="decimal" value={dist} onChange={(e) => setDist(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="6,4" />
        </label>
        <label className="field">
          <span>Notat (valgfritt)</span>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="flatt, langs elva" />
        </label>
        {id && <p className="tiny muted" style={{ margin: 0 }}>Endrer du distansen, påvirker det bare nye turer – gamle turer beholder distansen de ble lagret med.</p>}
        <button
          className="btn primary big block"
          disabled={!valid}
          onClick={() => {
            const rid = saveRoute({ name: name.trim(), distanceKm: Math.round(km * 1000) / 1000, note: note.trim() || undefined, createdBy: (cur?.createdBy ?? me) as UserId }, id)
            toast(id ? 'Ruta er oppdatert' : `Ruta «${name.trim()}» er lagret`)
            onSaved?.(rid)
            onClose()
          }}
        >
          Lagre rute
        </button>
        {id && (
          <button
            className="btn ghost block"
            onClick={async () => {
              if (await confirmDialog({ title: `Slette «${name}»?`, body: 'Ruta forsvinner fra lista for alle. Turer som er logget på den, beholdes.', ok: 'Slett rute', danger: true })) {
                deleteRoute(id)
                toast('Ruta er slettet')
                onClose()
              }
            }}
          >
            <Icon.trash /> Slett rute
          </button>
        )}
      </div>
    </Sheet>
  )
}

/* =================== form =================== */
export type RunFormValues = {
  userId: UserId
  date: string // local datetime input
  dateTouched: boolean
  routeId?: string
  distance: string
  distanceEst: boolean
  time: string
  durationEst: boolean
  runType?: RunType
  feeling?: number
  notes: string
  elevation: string
  avgHr: string
  title: string
}

export function emptyRunValues(userId: UserId, init: Partial<RunFormValues> = {}): RunFormValues {
  return {
    userId,
    date: toLocalInput(new Date()),
    dateTouched: false,
    distance: '',
    distanceEst: false,
    time: '',
    durationEst: false,
    notes: '',
    elevation: '',
    avgHr: '',
    title: '',
    ...init,
  }
}

export function valuesFromRun(w: Workout): RunFormValues {
  const r = w.run ?? {}
  return {
    userId: w.userId,
    date: toLocalInput(w.startedAt),
    dateTouched: true,
    routeId: r.routeId,
    distance: r.distanceKm ? String(r.distanceKm).replace('.', ',') : '',
    distanceEst: !!r.distanceEst,
    time: r.durationSec ? fmtRunTime(r.durationSec) : '',
    durationEst: !!r.durationEst,
    runType: r.runType,
    feeling: w.feeling,
    notes: w.notes ?? '',
    elevation: r.elevationM ? String(r.elevationM) : '',
    avgHr: r.avgHr ? String(r.avgHr) : '',
    title: w.title,
  }
}

function autoTitle(v: RunFormValues): string {
  const route = routeById(v.routeId)
  if (route) return route.name
  const t = RUN_TYPES.find((x) => x.id === v.runType)
  return t && t.id !== 'rolig' ? `${t.label}løp` : 'Løpetur'
}

/** Turn form values into what gets saved. */
export function runInputFrom(v: RunFormValues) {
  const km = parseFloat(v.distance.replace(',', '.'))
  const sec = parseTime(v.time)
  const run: RunData = {}
  if (km > 0) {
    run.distanceKm = Math.round(km * 1000) / 1000
    if (v.distanceEst) run.distanceEst = true
  }
  if (sec && sec > 0) {
    run.durationSec = sec
    if (v.durationEst) run.durationEst = true
  }
  if (v.routeId) run.routeId = v.routeId
  if (v.runType) run.runType = v.runType
  const elev = parseInt(v.elevation, 10)
  if (elev > 0) run.elevationM = elev
  const hr = parseInt(v.avgHr, 10)
  if (hr > 0) run.avgHr = hr
  let start = new Date(v.date)
  // logged right after the run without touching the date → it started «duration» ago
  if (!v.dateTouched && run.durationSec) start = new Date(Date.now() - run.durationSec * 1000)
  return { userId: v.userId, startedAt: start.toISOString(), title: v.title.trim() || autoTitle(v), run, notes: v.notes.trim() || undefined, feeling: v.feeling }
}

export function RunForm({
  values,
  onChange,
  showUser,
}: {
  values: RunFormValues
  onChange: (v: RunFormValues) => void
  showUser?: boolean
}) {
  useStoreVersion()
  const v = values
  const set = (p: Partial<RunFormValues>) => onChange({ ...v, ...p })
  const [more, setMore] = useState(!!(v.elevation || v.avgHr || v.title))
  const [routeSheet, setRouteSheet] = useState(false)
  const list = routes()
  const route = routeById(v.routeId)
  const km = parseFloat(v.distance.replace(',', '.'))
  const sec = parseTime(v.time)
  const timeInvalid = v.time.trim() !== '' && !sec
  const pace = km > 0 && sec ? sec / km : null
  const hasKm = km > 0
  const hasSec = !!sec

  return (
    <div className="stack">
      {showUser && (
        <div className="field">
          <span>Hvem</span>
          <div className="chips" style={{ margin: 0, padding: 0 }}>
            {USERS.map((u) => (
              <button key={u.id} className={`chip ${v.userId === u.id ? 'on' : ''}`} onClick={() => set({ userId: u.id })}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: u.color }} /> {u.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="field">
        <span>Rute (valgfritt)</span>
        <div className="chips" style={{ margin: 0, padding: 0, flexWrap: 'wrap' }}>
          {list.map((r) => (
            <button
              key={r.id}
              className={`chip ${v.routeId === r.id ? 'on' : ''}`}
              onClick={() =>
                v.routeId === r.id
                  ? set({ routeId: undefined })
                  : set({ routeId: r.id, distance: String(r.data.distanceKm).replace('.', ','), distanceEst: false })
              }
            >
              {r.data.name} <span className="muted">{fmtKm(r.data.distanceKm, 1)}</span>
            </button>
          ))}
          <button className="chip" onClick={() => setRouteSheet(true)}>
            + Ny rute
          </button>
        </div>
      </div>

      <section className="card stack">
        <div className="run-field">
          <label className="field grow">
            <span>Distanse (km)</span>
            <input
              className="input num run-big"
              inputMode="decimal"
              placeholder="–"
              aria-label="Distanse i km"
              value={v.distance}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9.,]/g, '')
                // a different distance than the route's means it wasn't the route
                const keepRoute = route && parseFloat(val.replace(',', '.')) === route.distanceKm
                set({ distance: val, routeId: keepRoute ? v.routeId : undefined })
              }}
            />
          </label>
          <EstToggle on={v.distanceEst} onChange={(b) => set({ distanceEst: b })} disabled={!!route} />
        </div>
        <div className="chips" style={{ margin: 0, padding: 0 }}>
          {DIST_CHIPS.map((d) => (
            <button key={d} className="chip num" onClick={() => set({ distance: String(d).replace('.', ','), routeId: undefined })}>
              {String(d).replace('.', ',')}
            </button>
          ))}
        </div>

        <div className="run-field">
          <label className="field grow">
            <span>Tid (mm:ss, t:mm:ss eller minutter)</span>
            <input
              className="input num run-big"
              inputMode="text"
              placeholder="–"
              aria-label="Tid"
              value={v.time}
              onChange={(e) => set({ time: e.target.value.replace(/[^0-9:.,a-zA-Z ]/g, '') })}
              style={timeInvalid ? { borderColor: 'var(--bad)' } : undefined}
            />
          </label>
          <EstToggle on={v.durationEst} onChange={(b) => set({ durationEst: b })} />
        </div>
        <div className="chips" style={{ margin: 0, padding: 0 }}>
          {TIME_CHIPS.map((m) => (
            <button key={m} className="chip num" onClick={() => set({ time: String(m) })}>
              {m} min
            </button>
          ))}
        </div>
        {timeInvalid && <p className="tiny" style={{ color: '#ff8a80', margin: 0 }}>Skriv tiden som 42:10, 1:05:00 eller 42.</p>}

        <div className="spread run-pace">
          <span className="muted small">Tempo</span>
          <span className="num" style={{ fontSize: '1.5rem', fontWeight: 700 }}>
            {pace ? `${v.distanceEst || v.durationEst ? 'ca. ' : ''}${fmtPace(pace)} /km` : '–'}
          </span>
        </div>
        {hasKm !== hasSec && (
          <p className="nudge">
            💡 Legg til {hasKm ? 'tiden' : 'distansen'} for å få tempo, rekorder og plass på topplista. Du kan også fylle det inn senere.
          </p>
        )}
        {hasKm && hasSec && (v.distanceEst || v.durationEst) && (
          <p className="nudge">Turer med «ca.» teller i km-totalen og ukesmålet, men ikke på rekorder og tempo-topplister.</p>
        )}
      </section>

      <div className="field">
        <span>Type</span>
        <div className="chips" style={{ margin: 0, padding: 0, flexWrap: 'wrap' }}>
          {RUN_TYPES.map((t) => (
            <button key={t.id} className={`chip ${v.runType === t.id ? 'on' : ''}`} onClick={() => set({ runType: v.runType === t.id ? undefined : t.id })}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <label className="field">
        <span>Dato og starttid</span>
        <input className="input" type="datetime-local" value={v.date} onChange={(e) => set({ date: e.target.value, dateTouched: true })} />
      </label>

      <div className="field">
        <span>Hvordan føltes det?</span>
        <div className="feeling">
          {FEELINGS.map((f, i) => (
            <button key={i} className={v.feeling === i + 1 ? 'on' : ''} onClick={() => set({ feeling: v.feeling === i + 1 ? undefined : i + 1 })} aria-label={FEELING_LABEL[i]} title={FEELING_LABEL[i]}>
              {f}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span>Notat</span>
        <input className="input" value={v.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="f.eks. motvind, nye sko" />
      </label>

      {!more ? (
        <button className="btn ghost small" style={{ alignSelf: 'flex-start' }} onClick={() => setMore(true)}>
          + Mer (høydemeter, puls, tittel)
        </button>
      ) : (
        <div className="row">
          <label className="field grow">
            <span>Høydemeter</span>
            <input className="input num" inputMode="numeric" value={v.elevation} onChange={(e) => set({ elevation: e.target.value.replace(/\D/g, '') })} />
          </label>
          <label className="field grow">
            <span>Snittpuls</span>
            <input className="input num" inputMode="numeric" value={v.avgHr} onChange={(e) => set({ avgHr: e.target.value.replace(/\D/g, '') })} />
          </label>
          <label className="field grow">
            <span>Tittel</span>
            <input className="input" value={v.title} placeholder={autoTitle(v)} onChange={(e) => set({ title: e.target.value })} />
          </label>
        </div>
      )}
      {routeSheet && (
        <RouteSheet
          onClose={() => setRouteSheet(false)}
          onSaved={(rid) => {
            const r = routeById(rid)
            if (r) set({ routeId: rid, distance: String(r.distanceKm).replace('.', ','), distanceEst: false })
          }}
        />
      )}
    </div>
  )
}

function EstToggle({ on, onChange, disabled }: { on: boolean; onChange: (b: boolean) => void; disabled?: boolean }) {
  return (
    <button className={`chip est ${on ? 'on' : ''}`} disabled={disabled} onClick={() => onChange(!on)} aria-pressed={on} title="Marker som anslag">
      ca.
    </button>
  )
}

/* =================== new / edit page =================== */
export function RunFormPage({ editId }: { editId?: string }) {
  useStoreVersion()
  const { me } = useMe()
  const params = new URLSearchParams(location.hash.split('?')[1] ?? '')
  const fromId = params.get('fra') ?? undefined // stopped stopwatch
  const routeParam = params.get('rute') ?? undefined
  const target = editId ?? fromId
  const existing = target ? getDoc<Workout>(target)?.data : undefined

  const [values, setValues] = useState<RunFormValues>(() => {
    if (editId && existing) return valuesFromRun(existing)
    if (fromId && existing) {
      const r = existing.run ?? {}
      return emptyRunValues(me as UserId, {
        date: toLocalInput(existing.startedAt),
        dateTouched: true,
        routeId: r.routeId,
        distance: r.distanceKm ? String(r.distanceKm).replace('.', ',') : '',
        time: fmtRunTime(stopwatchElapsed(existing) / 1000),
      })
    }
    const route = routeById(routeParam)
    return emptyRunValues(me as UserId, route ? { routeId: routeParam, distance: String(route.distanceKm).replace('.', ',') } : {})
  })

  const input = useMemo(() => runInputFrom(values), [values])
  const canSave = hasDistance(input.run) || hasDuration(input.run)
  const timeInvalid = values.time.trim() !== '' && !parseTime(values.time)

  if ((editId || fromId) && !existing)
    return (
      <>
        <TopBar title="Løpetur" onBack={() => back('lop')} />
        <div className="empty">Fant ikke løpeturen.</div>
      </>
    )

  const save = () => {
    const id = saveRun(input, target)
    if (editId) {
      toast('Løpeturen er oppdatert')
      go(`w/${id}`)
      return
    }
    notifyFinished(id)
    const prs = prsForRun(id, getDoc<Workout>(id)!.data)
    if (prs.length) confetti(['#f2c14e', '#eceae4', userById(me).color])
    go(`w/${id}/ferdig`)
  }

  return (
    <>
      <TopBar title={editId ? 'Rediger løpetur' : 'Logg løpetur'} onBack={() => back('lop')} />
      <div className="page stack">
        <RunForm values={values} onChange={setValues} />
        {!canSave && <p className="small muted" style={{ margin: 0 }}>Fyll inn tid eller distanse – helst begge.</p>}
        <button className="btn primary big block" disabled={!canSave || timeInvalid} onClick={save}>
          {editId ? 'Lagre endringer' : 'Lagre løpetur'}
        </button>
        {fromId && (
          <button className="btn ghost block" onClick={() => go('okt')}>
            Tilbake til stoppeklokka
          </button>
        )}
      </div>
    </>
  )
}

/* =================== stopwatch =================== */
export function RunActive({ id }: { id: string }) {
  useStoreVersion()
  const now = useNow(250)
  useWakeLock(true)
  const doc = getDoc<Workout>(id)
  if (!doc) return null
  const w = doc.data
  const paused = !!w.run?.pausedAt
  const elapsed = stopwatchElapsed(w, now)
  const list = routes()
  return (
    <>
      <TopBar title={w.title} />
      <div className="page stack-l">
        <div className="stopwatch">
          <div className={`stopwatch-time num ${paused ? 'paused' : ''}`}>{fmtRunTime(elapsed / 1000)}</div>
          <div className="small muted">{paused ? 'På pause' : 'Løper'} · startet {new Date(w.startedAt).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
        <div className="row">
          <button className="btn big grow" onClick={() => togglePause(id)}>
            {paused ? '▶ Fortsett' : '❚❚ Pause'}
          </button>
          <button
            className="btn primary big grow"
            onClick={() => {
              if (!paused) togglePause(id)
              vibrate(30)
              go(`lop/ny?fra=${id}`)
            }}
          >
            ■ Stopp
          </button>
        </div>
        {list.length > 0 && (
          <div className="field">
            <span>Løper du en rute?</span>
            <div className="chips" style={{ margin: 0, padding: 0, flexWrap: 'wrap' }}>
              {list.map((r) => (
                <button
                  key={r.id}
                  className={`chip ${w.run?.routeId === r.id ? 'on' : ''}`}
                  onClick={() =>
                    updateWorkout(id, (x) => {
                      const run = (x.run = x.run ?? {})
                      if (run.routeId === r.id) {
                        delete run.routeId
                        delete run.distanceKm
                        x.title = 'Løpetur'
                      } else {
                        run.routeId = r.id
                        run.distanceKm = r.data.distanceKm
                        x.title = r.data.name
                      }
                    })
                  }
                >
                  {r.data.name} <span className="muted">{fmtKm(r.data.distanceKm, 1)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <button
          className="btn ghost block"
          onClick={async () => {
            if (await confirmDialog({ title: 'Forkaste løpeturen?', body: 'Stoppeklokka nullstilles og ingenting lagres.', ok: 'Forkast', danger: true })) {
              discardWorkout(id)
              toast('Løpeturen er forkastet')
            }
          }}
        >
          Forkast
        </button>
      </div>
    </>
  )
}

/* =================== detail =================== */
export function RunDetail({ id, summary }: { id: string; summary?: boolean }) {
  useStoreVersion()
  const { me } = useMe()
  const doc = getDoc<Workout>(id)
  if (!doc) return null
  const w = doc.data
  const r = w.run ?? {}
  const u = userById(w.userId)
  const mine = w.userId === me
  const route = routeById(r.routeId)
  const prs = prsForRun(id, w)
  const pace = paceOf(r)
  const type = RUN_TYPES.find((t) => t.id === r.runType)
  const board = r.routeId ? routeBoard(r.routeId) : []
  return (
    <>
      <TopBar title={summary ? 'Bra løpt! 🏃' : w.title} onBack={() => (summary ? go('feed') : back())} right={mine ? <WorkoutMenuButton id={id} /> : undefined} />
      <div className="page stack">
        <div className="row" style={{ gap: 12 }}>
          <Avatar id={u.id} />
          <div className="grow">
            <div style={{ fontWeight: 700 }}>
              {u.name} · {w.title}
            </div>
            <div className="tiny muted">
              {fmtRelDate(w.startedAt)}
              {type ? ` · ${type.label}` : ''}
            </div>
          </div>
        </div>
        <div className="stats">
          <div className="stat">
            <div className="v">
              {hasDistance(r) ? fmtKm(r.distanceKm, 2) : '–'}
              {r.distanceEst && <span className="ca">ca.</span>}
            </div>
            <div className="l">Km</div>
          </div>
          <div className="stat">
            <div className="v">
              {hasDuration(r) ? fmtRunTime(r.durationSec) : '–'}
              {r.durationEst && <span className="ca">ca.</span>}
            </div>
            <div className="l">Tid</div>
          </div>
          <div className="stat">
            <div className="v">{pace ? fmtPace(pace) : '–'}</div>
            <div className="l">Tempo /km</div>
          </div>
        </div>
        {(r.elevationM || r.avgHr) && (
          <div className="small muted">
            {r.elevationM ? `${r.elevationM} høydemeter` : ''}
            {r.elevationM && r.avgHr ? ' · ' : ''}
            {r.avgHr ? `snittpuls ${r.avgHr}` : ''}
          </div>
        )}

        {mine && (!hasDistance(r) || !hasDuration(r)) && (
          <div className="card small nudge-card">
            💡 Legg til {!hasDistance(r) ? 'distansen' : 'tiden'} for å få tempo, rekorder og plass på topplista.
            <button className="btn small block" style={{ marginTop: 8 }} onClick={() => go(`lop/rediger/${id}`)}>
              Legg til {!hasDistance(r) ? 'distanse' : 'tid'}
            </button>
          </div>
        )}

        {prs.length > 0 && (
          <div className="card" style={{ background: 'color-mix(in srgb, var(--gold) 12%, var(--rubber))' }}>
            <h3 style={{ color: 'var(--gold)', marginBottom: 6 }}>🏆 {prs.length === 1 ? 'Ny personlig rekord' : `${prs.length} nye personlige rekorder`}</h3>
            {prs.map((p, i) => (
              <div key={i} className="spread small" style={{ padding: '3px 0' }}>
                <span>{p.label}</span>
                <span className="num">{p.value}</span>
              </div>
            ))}
          </div>
        )}

        {mine && summary && (
          <div className="card">
            <h3 style={{ marginBottom: 8 }}>Hvordan føltes det?</h3>
            <div className="feeling">
              {FEELINGS.map((f, i) => (
                <button key={i} className={w.feeling === i + 1 ? 'on' : ''} onClick={() => updateWorkout(id, (x) => void (x.feeling = i + 1))} aria-label={FEELING_LABEL[i]}>
                  {f}
                </button>
              ))}
            </div>
          </div>
        )}
        {!(mine && summary) && (w.feeling || w.notes) && (
          <div className="card small">
            {w.feeling ? (
              <span style={{ fontSize: '1.25rem' }}>
                {FEELINGS[w.feeling - 1]} <span className="muted small">{FEELING_LABEL[w.feeling - 1]}</span>
              </span>
            ) : null}
            {w.notes && <p style={{ margin: w.feeling ? '6px 0 0' : 0 }}>{w.notes}</p>}
          </div>
        )}

        {route && (
          <section className="card">
            <div className="spread" style={{ marginBottom: 6 }}>
              <h3>{route.name}</h3>
              <span className="tiny muted">{fmtKm(route.distanceKm, 2)} km · rekordliste</span>
            </div>
            {board.length === 0 && <div className="small muted">Ingen målte tider ennå.</div>}
            {board.map((b, i) => (
              <button key={b.userId} className="spread small" style={{ width: '100%', padding: '5px 0' }} onClick={() => go(`w/${b.workoutId}`)}>
                <span className="row" style={{ gap: 8 }}>
                  <span className="num" style={{ width: 18, color: i === 0 ? 'var(--gold)' : 'var(--dust)', fontWeight: 700 }}>
                    {i + 1}
                  </span>
                  <Avatar id={b.userId} size="sm" />
                  {userById(b.userId).name}
                  <span className="tiny muted">{fmtDate(b.date)}</span>
                </span>
                <span className="num" style={{ fontWeight: 700 }}>
                  {fmtRunTime(b.sec)}
                  {i === 0 ? ' 👑' : ''}
                </span>
              </button>
            ))}
          </section>
        )}

        <Social id={id} />

        {summary && (
          <button className="btn primary block big" onClick={() => go('feed')}>
            Til feeden
          </button>
        )}
      </div>
    </>
  )
}

function Social({ id }: { id: string }) {
  const { me } = useMe()
  const [comment, setComment] = useState('')
  const reactions = reactionsFor(id)
  const comments = commentsFor(id)
  return (
    <div className="card">
      <div className="reactions" style={{ marginTop: 0 }}>
        {REACTIONS.map((e) => {
          const who = reactions.filter((r) => r.emoji === e)
          const on = who.some((r) => r.userId === me)
          return (
            <button key={e} className={`react ${on ? 'on' : ''}`} onClick={() => toggleReaction(id, me as UserId, e)}>
              {e}
              {who.length > 0 && <span className="n">{who.map((r) => userById(r.userId).name[0]).join('')}</span>}
            </button>
          )
        })}
      </div>
      <div style={{ marginTop: 12 }}>
        {comments.map((c) => (
          <div key={c.id} className="row" style={{ alignItems: 'flex-start', padding: '6px 0' }}>
            <Avatar id={c.data.userId} size="sm" />
            <div className="grow small">
              <b>{userById(c.data.userId).name}</b> {c.data.text}
              <div className="tiny muted">{fmtRelDate(c.data.at)}</div>
            </div>
          </div>
        ))}
        <form
          className="row"
          style={{ marginTop: 8 }}
          onSubmit={(e) => {
            e.preventDefault()
            if (!comment.trim()) return
            addComment(id, me as UserId, comment.trim())
            setComment('')
          }}
        >
          <input className="input" placeholder="Skriv en kommentar" value={comment} onChange={(e) => setComment(e.target.value)} />
          <button className="btn" disabled={!comment.trim()}>
            Send
          </button>
        </form>
      </div>
    </div>
  )
}

/** Keeps the run form page in sync when opened via hash with query (?rute=, ?fra=). */
export function useHashKey() {
  const [h, setH] = useState(location.hash)
  useEffect(() => {
    const f = () => setH(location.hash)
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  return h
}
