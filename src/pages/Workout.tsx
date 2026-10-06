import { useEffect, useRef, useState } from 'react'
import { useMe, TopBar, Icon, go, confirmDialog, toast, confetti, vibrate, useNow, Sheet, unlockAudio, useWakeLock, PlateBar } from '../components/ui'
import { ExercisePicker } from '../components/ExercisePicker'
import { getDoc, useStoreVersion } from '../lib/store'
import { type Workout, type WorkoutExercise, type SetEntry, type UserId } from '../lib/domain'
import { userById, knownUsers } from '../lib/users'
import {
  activeWorkout,
  templates,
  exerciseById,
  lastSession,
  livePRCheck,
  progressionHint,
  bestE1rm,
  bestScore,
  workoutVolume,
  workoutSetCount,
  fmtDuration,
  fmtVolume,
  fmtKg,
  profile,
  doneWorkouts,
  fmtRelDate,
  fmtDate,
  PR_LABEL,
  sharedOnly,
} from '../lib/stats'
import { notifyFinished } from '../lib/push'
import { RunActive } from './Run'
import { startWorkout, updateWorkout, addExercises, finishWorkout, discardWorkout, newSet, startRest, startBackdatedWorkout, setProfile, setWorkoutPrivate } from '../lib/actions'

export function WorkoutPage() {
  useStoreVersion()
  const { me } = useMe()
  const active = activeWorkout(me)
  if (active?.data.kind === 'run') return <RunActive id={active.id} />
  if (active) return <Logger id={active.id} />
  return <StartScreen />
}

function StartScreen() {
  const { me } = useMe()
  const tpls = templates()
  const recent = doneWorkouts(me).filter((w) => w.data.kind !== 'run').slice(0, 3)
  const start = (tid?: string) => {
    startWorkout(me as UserId, tid)
    vibrate(20)
  }
  return (
    <>
      <TopBar title="Ny økt" />
      <div className="page stack-l">
        <div className="kind-tiles">
          <button className="kind-tile" onClick={() => start()}>
            <span className="kind-emoji">🏋️</span>
            <b>Styrke</b>
            <span className="tiny muted">Start tom økt</span>
          </button>
          <button className="kind-tile" onClick={() => go('lop')}>
            <span className="kind-emoji">🏃</span>
            <b>Løpetur</b>
            <span className="tiny muted">Stoppeklokke eller logg</span>
          </button>
        </div>
        {tpls.length > 0 && (
          <section>
            <div className="section-title">
              <h2>Fra mal</h2>
              <a className="small muted" href="#/maler">
                Alle maler
              </a>
            </div>
            <div className="list">
              {tpls.map((t) => (
                <button key={t.id} className="list-item" onClick={() => start(t.id)}>
                  <div className="grow">
                    <div style={{ fontWeight: 600 }}>{t.data.name}</div>
                    <div className="tiny muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {t.data.items.map((i) => exerciseById(i.exerciseId).name).join(', ')}
                    </div>
                  </div>
                  <span className="btn small primary">Start</span>
                </button>
              ))}
            </div>
          </section>
        )}
        {recent.length > 0 && (
          <section>
            <div className="section-title">
              <h2>Gjenta en økt</h2>
            </div>
            <div className="list">
              {recent.map((w) => (
                <button
                  key={w.id}
                  className="list-item"
                  onClick={() => {
                    const id = startWorkout(me as UserId)
                    updateWorkout(id, (nw) => {
                      nw.title = w.data.title
                    })
                    addExercises(id, me, dedupeIds(w.data.exercises.map((e) => e.exerciseId)))
                  }}
                >
                  <div className="grow">
                    <div style={{ fontWeight: 600 }}>{w.data.title}</div>
                    <div className="tiny muted">
                      {fmtRelDate(w.data.startedAt)} · {w.data.exercises.length} øvelser
                    </div>
                  </div>
                  <Icon.chevron />
                </button>
              ))}
            </div>
          </section>
        )}
        <BackdateCard />
        <button className="btn ghost block" style={{ marginTop: 4 }} onClick={() => go('import')}>
          Importer økt fra tekst eller fil
        </button>
        {tpls.length === 0 && recent.length === 0 && (
          <div className="empty">
            <h3>Første økt?</h3>
            <p>Start en tom økt og legg til øvelser underveis. Etterpå kan du lagre den som mal.</p>
          </div>
        )}
      </div>
    </>
  )
}

const dedupeIds = (ids: string[]) => [...new Set(ids)]

function Logger({ id }: { id: string }) {
  const { me } = useMe()
  const doc = getDoc<Workout>(id)!
  const w = doc.data
  const now = useNow(1000)
  const [picker, setPicker] = useState<null | { replace?: string }>(null)
  const [editTitle, setEditTitle] = useState(false)
  const [focus, setFocus] = useState<{ set: string; field: 'weight' | 'reps' } | null>(null)
  const restSeconds = profile(me).restSeconds ?? 90
  useWakeLock(true)
  const editing = !!w.reopenedFrom

  const finish = async () => {
    const done = workoutSetCount(w)
    const unfinished = w.exercises.reduce((n, ex) => n + ex.sets.filter((s) => !s.done && (s.weight || s.reps)).length, 0)
    if (done === 0) {
      const ok = await confirmDialog({ title: 'Ingen sett er fullført', body: 'Vil du forkaste økta?', ok: 'Forkast økt', danger: true })
      if (ok) discardWorkout(id)
      return
    }
    if (unfinished > 0) {
      const ok = await confirmDialog({
        title: 'Avslutte økta?',
        body: `${unfinished} sett er ikke huket av og blir ikke lagret.`,
        ok: 'Avslutt økt',
      })
      if (!ok) return
    }
    finishWorkout(id)
    if (!editing && !w.private) notifyFinished(id)
    if (editing) {
      toast('Endringene er lagret')
      go(`w/${id}`)
      return
    }
    confetti([userById(me).color, '#eceae4', '#f2c14e'])
    go(`w/${id}/ferdig`)
  }

  const discard = async () => {
    const ok = await confirmDialog({ title: 'Forkaste økta?', body: 'Alt du har logget i denne økta blir slettet.', ok: 'Forkast', danger: true })
    if (ok) {
      discardWorkout(id)
      toast('Økta er forkastet')
    }
  }

  return (
    <>
      <TopBar
        title={
          editTitle ? (
            <input
              className="input"
              style={{ fontSize: '1.25rem', fontWeight: 700, minHeight: 40 }}
              autoFocus
              defaultValue={w.title}
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v) updateWorkout(id, (x) => void (x.title = v))
                setEditTitle(false)
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          ) : (
            <button onClick={() => setEditTitle(true)} style={{ font: 'inherit', textAlign: 'left' }} aria-label="Endre navn på økta">
              {w.title}
            </button>
          )
        }
        right={
          <button className="btn small primary" onClick={finish}>
            {editing ? 'Lagre' : 'Fullfør'}
          </button>
        }
      />
      <div className="page">
        <div className="wk-head">
          <div className="stat">
            <div className="v">{editing ? fmtDate(w.startedAt) : fmtDuration(now - Date.parse(w.startedAt))}</div>
            <div className="l">{editing ? 'Redigerer' : 'Tid'}</div>
          </div>
          <div className="stat">
            <div className="v">{fmtVolume(workoutVolume(w))}</div>
            <div className="l">Volum</div>
          </div>
          <div className="stat">
            <div className="v">{workoutSetCount(w)}</div>
            <div className="l">Sett</div>
          </div>
        </div>

        {w.exercises.length > 0 && <Tip />}
        {w.exercises.map((ex, i) => (
          <ExerciseCard
            key={ex.uid}
            workoutId={id}
            w={w}
            ex={ex}
            index={i}
            me={me as UserId}
            focus={focus}
            setFocus={setFocus}
            restSeconds={restSeconds}
            onReplace={() => setPicker({ replace: ex.uid })}
          />
        ))}

        {w.exercises.length === 0 && (
          <div className="empty">
            <h3>Tom økt</h3>
            <p>Legg til den første øvelsen for å begynne å logge sett.</p>
          </div>
        )}

        <div className="stack" style={{ marginTop: 16 }}>
          <button className="btn big block" onClick={() => setPicker({})}>
            <Icon.plus /> Legg til øvelse
          </button>
          <label className="switch-row">
            <input type="checkbox" checked={!!w.private} onChange={(e) => setWorkoutPrivate(id, e.target.checked)} />
            <span>
              🔒 Privat økt
              <span className="tiny muted" style={{ display: 'block' }}>
                Bare du ser den. Teller i din statistikk, ikke i grupper og topplister.
              </span>
            </span>
          </label>
          {!editing && (
            <button className="btn ghost block" onClick={discard}>
              Forkast økt
            </button>
          )}
        </div>
      </div>
      {picker && (
        <ExercisePicker
          me={me as UserId}
          multi={!picker.replace}
          title={picker.replace ? 'Bytt øvelse' : 'Legg til øvelse'}
          onClose={() => setPicker(null)}
          onPick={(ids) => {
            if (picker.replace) {
              updateWorkout(id, (x) => {
                const e = x.exercises.find((e) => e.uid === picker.replace)
                if (e) e.exerciseId = ids[0]
              })
            } else addExercises(id, me, ids)
            setPicker(null)
            setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 50)
          }}
        />
      )}
    </>
  )
}

function ExerciseCard({
  workoutId,
  w,
  ex,
  index,
  me,
  focus,
  setFocus,
  restSeconds,
  onReplace,
}: {
  workoutId: string
  w: Workout
  ex: WorkoutExercise
  index: number
  me: UserId
  focus: { set: string; field: 'weight' | 'reps' } | null
  setFocus: (f: { set: string; field: 'weight' | 'reps' } | null) => void
  restSeconds: number
  onReplace: () => void
}) {
  const info = exerciseById(ex.exerciseId)
  const last = lastSession(me, ex.exerciseId, workoutId)
  const lastWork = last?.sets.filter((s) => !s.warmup) ?? []
  const lastWarm = last?.sets.filter((s) => s.warmup) ?? []
  const hint = ex.sets.some((s) => s.done) ? null : progressionHint(me, ex.exerciseId, workoutId)
  const [menu, setMenu] = useState(false)
  const [setMenuFor, setSetMenu] = useState<null | { uid: string; label: string; prevWeight: number | null }>(null)
  const [noteOpen, setNoteOpen] = useState(!!ex.note)

  const upd = (fn: (e: WorkoutExercise) => void) =>
    updateWorkout(workoutId, (x) => {
      const e = x.exercises.find((e) => e.uid === ex.uid)
      if (e) fn(e)
    })

  const updSet = (uid: string, fn: (s: SetEntry) => void) => upd((e) => fn(e.sets.find((s) => s.uid === uid)!))

  let workIdx = 0,
    warmIdx = 0
  const allSetsThisExercise = w.exercises.filter((e) => e.exerciseId === ex.exerciseId).flatMap((e) => e.sets)

  const toggleDone = (s: SetEntry, prevRef?: SetEntry) => {
    unlockAudio()
    if (s.done) {
      updSet(s.uid, (x) => {
        x.done = false
        delete x.doneAt
      })
      return
    }
    const weight = s.weight ?? prevRef?.weight ?? null
    const reps = s.reps ?? prevRef?.reps ?? null
    if (reps == null) {
      toast('Fyll inn reps først')
      return
    }
    const candidate = { ...s, weight, reps, done: true }
    const prs = livePRCheck(me, ex.exerciseId, candidate, workoutId, allSetsThisExercise)
    updSet(s.uid, (x) => {
      x.weight = weight
      x.reps = reps
      x.done = true
      x.doneAt = new Date().toISOString()
    })
    setFocus(null)
    // in a superset, rest only after the last exercise of the group
    if (!s.warmup && !ex.supersetNext) startRest(profile(me).restByExercise?.[ex.exerciseId] ?? restSeconds)
    else if (!s.warmup && ex.supersetNext) {
      setTimeout(() => {
        const next = document.querySelectorAll('.ex-card')[index + 1] as HTMLElement | undefined
        next?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 300)
    }
    if (prs.length) {
      vibrate([30, 40, 30, 40, 80])
      toast(`🏆 Ny PR: ${PR_LABEL[prs[0]].toLowerCase()} i ${info.name.toLowerCase()}!`, 'pr')
      confetti(['#f2c14e', '#eceae4', userById(me).color])
    } else vibrate(25)
    // last set of this exercise? scroll the next exercise into view
    const remaining = ex.sets.filter((x) => !x.done && x.uid !== s.uid).length
    if (remaining === 0 && !ex.supersetNext) {
      setTimeout(() => {
        const cards = document.querySelectorAll('.ex-card')
        const next = cards[index + 1] as HTMLElement | undefined
        if (next) next.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 350)
    }
  }

  return (
    <div className={`ex-card ${ex.supersetNext ? 'ss-start' : ''} ${index > 0 && w.exercises[index - 1].supersetNext ? 'ss-cont' : ''}`}>
      {ex.supersetNext && !(index > 0 && w.exercises[index - 1].supersetNext) && <div className="ss-label">Supersett</div>}
      <div className="ex-title">
        <button className="name" onClick={() => go(`ex/${ex.exerciseId}`)}>
          {info.name}
        </button>
        <button className="icon-btn" onClick={() => setMenu(true)} aria-label={`Valg for ${info.name}`}>
          <Icon.dots />
        </button>
      </div>
      <RecordLine exerciseId={ex.exerciseId} me={me} />
      {hint && <div className="ex-note">💡 {hint}</div>}
      {noteOpen && (
        <input
          className="input"
          style={{ minHeight: 36, marginBottom: 8, fontSize: '0.875rem' }}
          placeholder="Notat, f.eks. sete på hull 4"
          defaultValue={ex.note}
          onBlur={(e) => upd((x) => void (x.note = e.target.value))}
        />
      )}
      <div className="set-grid headers">
        <span style={{ textAlign: 'center' }}>Sett</span>
        <span>Forrige</span>
        <span style={{ textAlign: 'center' }}>{info.bodyweight ? '+kg' : 'kg'}</span>
        <span style={{ textAlign: 'center' }}>{info.name.includes('(sek)') ? 'sek' : 'Reps'}</span>
        <span />
      </div>
      {ex.sets.map((s) => {
        const label = s.warmup ? `V${++warmIdx}` : String(++workIdx)
        const prevRef = s.warmup ? lastWarm[warmIdx - 1] : lastWork[workIdx - 1]
        const isPR = s.done && livePRCheck(me, ex.exerciseId, s, workoutId, allSetsThisExercise.filter((o) => (o.doneAt ?? '') < (s.doneAt ?? ''))).length > 0
        const isNext = !s.done && ex.sets.find((x) => !x.done)?.uid === s.uid && ex.sets.some((x) => x.done)
        return (
          <div key={s.uid}>
            <div className={`set-grid set-row ${s.done ? 'done' : ''} ${isPR ? 'pr' : ''} ${isNext ? 'next' : ''}`}>
              <button
                className={`set-idx ${s.warmup ? 'warm' : ''}`}
                onClick={() => setSetMenu({ uid: s.uid, label, prevWeight: prevRef?.weight ?? null })}
                aria-label={`Sett ${label}: oppvarming, skiver eller slett`}
                title="Oppvarming, skiver eller slett"
              >
                {label}
              </button>
              <button
                className="set-prev"
                onClick={() => prevRef && updSet(s.uid, (x) => ((x.weight = prevRef.weight), (x.reps = prevRef.reps)))}
                aria-label="Bruk forrige"
              >
                {prevRef ? `${fmtKg(prevRef.weight)}×${prevRef.reps}` : '–'}
                {isPR && <span style={{ marginLeft: 4 }}>🏆</span>}
              </button>
              <NumInput
                value={s.weight}
                placeholder={prevRef?.weight != null ? fmtKg(prevRef.weight) : '0'}
                decimal
                onFocus={() => setFocus({ set: s.uid, field: 'weight' })}
                onChange={(v) => updSet(s.uid, (x) => void (x.weight = v))}
                label={`Vekt sett ${label}`}
              />
              <NumInput
                value={s.reps}
                placeholder={prevRef?.reps != null ? String(prevRef.reps) : '0'}
                onFocus={() => setFocus({ set: s.uid, field: 'reps' })}
                onChange={(v) => updSet(s.uid, (x) => void (x.reps = v))}
                label={`Reps sett ${label}`}
              />
              <button className="check" onClick={() => toggleDone(s, prevRef)} aria-label={s.done ? 'Angre fullført sett' : 'Fullfør sett'}>
                <Icon.check />
              </button>
            </div>
          </div>
        )
      })}
      <button
        className="add-set"
        onClick={() =>
          upd((e) => {
            const lastSet = [...e.sets].reverse().find((x) => !x.warmup) ?? e.sets[e.sets.length - 1]
            const ref = lastWork[e.sets.filter((x) => !x.warmup).length]
            e.sets.push(newSet({ weight: lastSet?.weight ?? ref?.weight ?? null, reps: lastSet?.reps ?? ref?.reps ?? null }))
          })
        }
      >
        + Legg til sett
      </button>
      {setMenuFor &&
        (() => {
          const cur = ex.sets.find((x) => x.uid === setMenuFor.uid)
          if (!cur) return null
          const weight = cur.weight ?? setMenuFor.prevWeight ?? 0
          return (
            <Sheet title={`${info.name} · sett ${setMenuFor.label}`} onClose={() => setSetMenu(null)}>
              {info.equipment === 'Stang' && weight > 0 && (
                <div className="card small" style={{ marginBottom: 12 }}>
                  <div className="muted tiny" style={{ marginBottom: 2 }}>
                    Skiver for {fmtKg(weight)} kg
                  </div>
                  <PlateBar total={weight} />
                </div>
              )}
              <div className="list">
                <button
                  className="list-item"
                  onClick={() => {
                    updSet(cur.uid, (x) => void (x.warmup = !x.warmup))
                    setSetMenu(null)
                  }}
                >
                  <Icon.timer /> {cur.warmup ? 'Gjør til arbeidssett' : 'Gjør til oppvarmingssett'}
                </button>
                <button
                  className="list-item"
                  style={{ color: '#ff8a80' }}
                  onClick={() => {
                    const idx = ex.sets.findIndex((x) => x.uid === cur.uid)
                    const removed = { ...cur }
                    upd((e) => void (e.sets = e.sets.filter((x) => x.uid !== cur.uid)))
                    setSetMenu(null)
                    toast('Settet er slettet', undefined, {
                      label: 'Angre',
                      run: () => upd((e) => void e.sets.splice(Math.min(idx, e.sets.length), 0, removed)),
                    })
                  }}
                >
                  <Icon.trash /> Slett sett
                </button>
              </div>
            </Sheet>
          )
        })()}
      {menu && (
        <Sheet title={info.name} onClose={() => setMenu(false)}>
          <div className="list">
            <button className="list-item" onClick={() => (setNoteOpen(true), setMenu(false))}>
              <Icon.edit /> Legg til notat
            </button>
            <button
              className="list-item"
              onClick={() => {
                upd((e) => void e.sets.unshift({ ...newSet({ weight: e.sets[0]?.weight ? Math.round((e.sets[0].weight * 0.5) / 2.5) * 2.5 : null, reps: 10 }), warmup: true }))
                setMenu(false)
              }}
            >
              <Icon.plus /> Legg til oppvarmingssett
            </button>
            {(info.equipment === 'Stang' || info.equipment === 'Manualer' || info.equipment === 'Maskin') && (
              <button
                className="list-item"
                onClick={() => {
                  const top = ex.sets.find((x) => !x.warmup)?.weight ?? lastWork[0]?.weight
                  if (!top) {
                    toast('Fyll inn arbeidsvekt først')
                    setMenu(false)
                    return
                  }
                  upd((e) => {
                    e.sets = e.sets.filter((x) => !(x.warmup && !x.done))
                    const bar = info.equipment === 'Stang' ? 20 : 0
                    const plan: [number, number][] = info.equipment === 'Stang' ? [[0, 10], [0.4, 5], [0.6, 3], [0.8, 2]] : [[0.5, 10], [0.75, 5]]
                    const warm = plan
                      .map(([pct, reps]) => ({ w: pct === 0 ? bar : Math.max(bar, Math.round((top * pct) / 2.5) * 2.5), reps }))
                      .filter((x, i, arr) => x.w < top && (i === 0 || x.w > arr[i - 1].w))
                    e.sets.unshift(...warm.map((x) => ({ ...newSet({ weight: x.w, reps: x.reps }), warmup: true })))
                  })
                  toast('Oppvarming lagt til')
                  setMenu(false)
                }}
              >
                <Icon.timer /> Generer oppvarming
              </button>
            )}
            <div className="list-item" style={{ flexWrap: 'wrap' }}>
              <Icon.timer />
              <span className="grow">Hviletid for {info.name.toLowerCase()}</span>
              <div className="chips" style={{ margin: 0, padding: 0, width: '100%', flexWrap: 'wrap' }}>
                {[60, 90, 120, 180, 240, 300].map((sec) => {
                  const cur = profile(me).restByExercise?.[ex.exerciseId] ?? restSeconds
                  return (
                    <button
                      key={sec}
                      className={`chip ${cur === sec ? 'on' : ''}`}
                      onClick={() => setProfile(me, { restByExercise: { ...(profile(me).restByExercise ?? {}), [ex.exerciseId]: sec } })}
                    >
                      {sec < 120 ? `${sec} s` : `${sec / 60} min`}
                    </button>
                  )
                })}
              </div>
            </div>
            {index < w.exercises.length - 1 && (
              <button
                className="list-item"
                onClick={() => {
                  upd((e) => void (e.supersetNext = !e.supersetNext))
                  setMenu(false)
                }}
              >
                <Icon.down /> {ex.supersetNext ? 'Fjern supersett med neste øvelse' : 'Supersett med neste øvelse'}
              </button>
            )}
            <button className="list-item" onClick={() => (setMenu(false), onReplace())}>
              <Icon.search /> Bytt øvelse
            </button>
            <button
              className="list-item"
              disabled={index === 0}
              onClick={() => {
                updateWorkout(workoutId, (x) => {
                  const i = x.exercises.findIndex((e) => e.uid === ex.uid)
                  if (i > 0) [x.exercises[i - 1], x.exercises[i]] = [x.exercises[i], x.exercises[i - 1]]
                })
                setMenu(false)
              }}
            >
              <Icon.up /> Flytt opp
            </button>
            <button
              className="list-item"
              disabled={index === w.exercises.length - 1}
              onClick={() => {
                updateWorkout(workoutId, (x) => {
                  const i = x.exercises.findIndex((e) => e.uid === ex.uid)
                  if (i < x.exercises.length - 1) [x.exercises[i + 1], x.exercises[i]] = [x.exercises[i], x.exercises[i + 1]]
                })
                setMenu(false)
              }}
            >
              <Icon.down /> Flytt ned
            </button>
            <button className="list-item" onClick={() => (setMenu(false), go(`ex/${ex.exerciseId}`))}>
              <Icon.bar /> Se historikk og PR-er
            </button>
            <button
              className="list-item"
              style={{ color: '#ff8a80' }}
              onClick={async () => {
                setMenu(false)
                const hasDone = ex.sets.some((s) => s.done)
                if (hasDone && !(await confirmDialog({ title: `Fjerne ${info.name}?`, body: 'Settene du har logget på denne øvelsen forsvinner.', ok: 'Fjern', danger: true })))
                  return
                updateWorkout(workoutId, (x) => void (x.exercises = x.exercises.filter((e) => e.uid !== ex.uid)))
              }}
            >
              <Icon.trash /> Fjern øvelse
            </button>
          </div>
        </Sheet>
      )}
    </div>
  )
}

function NumInput({
  value,
  onChange,
  placeholder,
  decimal,
  onFocus,
  label,
}: {
  value: number | null
  onChange: (v: number | null) => void
  placeholder?: string
  decimal?: boolean
  onFocus?: () => void
  label: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  const shown = draft ?? (value == null ? '' : String(value).replace('.', ','))
  useEffect(() => {
    if (draft === null) return
    const parsed = draft === '' ? null : parseFloat(draft.replace(',', '.'))
    if (document.activeElement !== ref.current || parsed !== value) setDraft(null)
  }, [value])
  return (
    <input
      ref={ref}
      className="set-input"
      inputMode={decimal ? 'decimal' : 'numeric'}
      enterKeyHint="next"
      aria-label={label}
      value={shown}
      placeholder={placeholder}
      onFocus={(e) => {
        e.target.select()
        onFocus?.()
      }}
      onBlur={() => setDraft(null)}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^0-9.,]/g, '')
        setDraft(raw)
        if (raw === '') return onChange(null)
        const n = parseFloat(raw.replace(',', '.'))
        if (!isNaN(n)) onChange(decimal ? n : Math.round(n))
      }}
    />
  )
}

function RecordLine({ exerciseId, me }: { exerciseId: string; me: UserId }) {
  const unit = bestScore(me, exerciseId).unit
  // top 4 among the people I train with (private workouts excluded), always including me
  const all = sharedOnly(() => knownUsers(me).map((id) => ({ u: userById(id), v: bestScore(id, exerciseId).value }))).filter((r) => r.v > 0)
  all.sort((a, b) => b.v - a.v)
  const rows = all.filter((r, i) => i < 4 || r.u.id === me)
  if (!rows.length) return null
  const max = Math.max(...rows.map((r) => r.v))
  return (
    <div className="ex-note row" style={{ gap: 10, flexWrap: 'wrap' }}>
      <span>{unit === 'reps' ? 'Rekord reps:' : 'Rekord e1RM:'}</span>
      {rows.map(({ u, v }) => (
        <span key={u.id} className="num" style={{ color: v === max ? 'var(--chalk)' : undefined, fontWeight: v === max ? 700 : 500 }}>
          <i style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 4, background: u.color, marginRight: 4 }} />
          {u.id === me ? 'Du' : u.name} {fmtKg(v, 0)}
          {v === max && rows.length > 1 ? ' 👑' : ''}
        </span>
      ))}
    </div>
  )
}

function Tip() {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem('jernlogg.tip1') === '1'
    } catch {
      return true
    }
  })
  if (hidden) return null
  return (
    <div className="card small" style={{ marginBottom: 12, background: 'var(--me-soft)' }}>
      <div className="spread" style={{ alignItems: 'flex-start' }}>
        <div>
          <b>Tips:</b> Trykk på settnummeret for oppvarming (V), skiver og sletting. Trykk på «Forrige» for å kopiere forrige gang. Hviletimeren starter når du huker av.
        </div>
        <button
          className="icon-btn"
          aria-label="Skjul tips"
          onClick={() => {
            try {
              localStorage.setItem('jernlogg.tip1', '1')
            } catch {}
            setHidden(true)
          }}
        >
          <Icon.x />
        </button>
      </div>
    </div>
  )
}

function BackdateCard() {
  const { me } = useMe()
  const [open, setOpen] = useState(false)
  const yesterday = new Date(Date.now() - 86400000)
  const [date, setDate] = useState(yesterday.toISOString().slice(0, 10))
  if (!open)
    return (
      <button className="btn ghost block" onClick={() => setOpen(true)}>
        Logg en tidligere økt eller gamle rekorder
      </button>
    )
  return (
    <section className="card stack">
      <h3>Logg en tidligere økt</h3>
      <p className="small muted" style={{ margin: 0 }}>
        Fint for å legge inn rekordene du allerede har, så topplister og PR-er stemmer fra dag én.
      </p>
      <label className="field">
        <span>Dato</span>
        <input className="input" type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} />
      </label>
      <button
        className="btn primary block"
        disabled={!date}
        onClick={() => {
          const id = startBackdatedWorkout(me as UserId, `${date}T17:00:00`)
          if (!id) toast('Fullfør økta du har i gang først')
        }}
      >
        Start registrering
      </button>
    </section>
  )
}
