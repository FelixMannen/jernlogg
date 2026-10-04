import { useEffect, useRef, useState } from 'react'
import { useMe, TopBar, Icon, go, confirmDialog, toast, confetti, vibrate, useNow, Sheet, unlockAudio, useWakeLock, PlateBar } from '../components/ui'
import { ExercisePicker } from '../components/ExercisePicker'
import { getDoc, useStoreVersion } from '../lib/store'
import { userById, type Workout, type WorkoutExercise, type SetEntry, type UserId } from '../lib/domain'
import {
  activeWorkout,
  templates,
  exerciseById,
  lastSession,
  livePRCheck,
  progressionHint,
  workoutVolume,
  workoutSetCount,
  fmtDuration,
  fmtVolume,
  fmtKg,
  profile,
  doneWorkouts,
  fmtRelDate,
  PR_LABEL,
} from '../lib/stats'
import { startWorkout, updateWorkout, addExercises, finishWorkout, discardWorkout, newSet, startRest } from '../lib/actions'

export function WorkoutPage() {
  useStoreVersion()
  const { me } = useMe()
  const active = activeWorkout(me)
  if (active) return <Logger id={active.id} />
  return <StartScreen />
}

function StartScreen() {
  const { me } = useMe()
  const tpls = templates()
  const recent = doneWorkouts(me).slice(0, 3)
  const start = (tid?: string) => {
    startWorkout(me as UserId, tid)
    vibrate(20)
  }
  return (
    <>
      <TopBar title="Ny økt" />
      <div className="page stack-l">
        <button className="btn primary big block" onClick={() => start()}>
          <Icon.plus /> Start tom økt
        </button>
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
            <div className="v">{editing ? '✎' : fmtDuration(now - Date.parse(w.startedAt))}</div>
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
    if (!s.warmup) startRest(restSeconds)
    if (prs.length) {
      vibrate([30, 40, 30, 40, 80])
      toast(`🏆 Ny PR: ${PR_LABEL[prs[0]].toLowerCase()} i ${info.name.toLowerCase()}!`, 'pr')
      confetti(['#f2c14e', '#eceae4', userById(me).color])
    } else vibrate(25)
  }

  return (
    <div className="ex-card">
      <div className="ex-title">
        <button className="name" onClick={() => go(`ex/${ex.exerciseId}`)}>
          {info.name}
        </button>
        <button className="icon-btn" onClick={() => setMenu(true)} aria-label={`Valg for ${info.name}`}>
          <Icon.dots />
        </button>
      </div>
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
        const label = s.warmup ? `O${++warmIdx}` : String(++workIdx)
        const prevRef = s.warmup ? lastWarm[warmIdx - 1] : lastWork[workIdx - 1]
        const isPR = s.done && livePRCheck(me, ex.exerciseId, s, workoutId, allSetsThisExercise.filter((o) => (o.doneAt ?? '') < (s.doneAt ?? ''))).length > 0
        const focused = focus?.set === s.uid
        return (
          <div key={s.uid}>
            <div className={`set-grid set-row ${s.done ? 'done' : ''} ${isPR ? 'pr' : ''}`}>
              <button
                className={`set-idx ${s.warmup ? 'warm' : ''}`}
                onClick={() => updSet(s.uid, (x) => void (x.warmup = !x.warmup))}
                aria-label={s.warmup ? 'Oppvarmingssett – trykk for arbeidssett' : 'Trykk for å gjøre til oppvarmingssett'}
                title="Trykk for oppvarming"
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
            {focused && (
              <div className="stepper" onPointerDown={(e) => e.preventDefault()}>
                {(focus!.field === 'weight' ? [-5, -2.5, 2.5, 5] : [-2, -1, 1, 2]).map((d) => (
                  <button
                    key={d}
                    onClick={() =>
                      updSet(s.uid, (x) => {
                        const cur = (focus!.field === 'weight' ? x.weight ?? prevRef?.weight : x.reps ?? prevRef?.reps) ?? 0
                        const nv = Math.max(0, Math.round((cur + d) * 100) / 100)
                        if (focus!.field === 'weight') x.weight = nv
                        else x.reps = nv
                      })
                    }
                  >
                    {d > 0 ? '+' : '−'}
                    {String(Math.abs(d)).replace('.', ',')}
                  </button>
                ))}
              </div>
            )}
            {focused && focus!.field === 'weight' && info.equipment === 'Stang' && (s.weight ?? prevRef?.weight ?? 0) > 0 && (
              <PlateBar total={(s.weight ?? prevRef?.weight)!} />
            )}
            {focused && (
              <div className="row" style={{ justifyContent: 'space-between', padding: '0 0 6px' }} onPointerDown={(e) => e.preventDefault()}>
                <button
                  className="btn small ghost"
                  onClick={() => {
                    upd((e) => void (e.sets = e.sets.filter((x) => x.uid !== s.uid)))
                    setFocus(null)
                  }}
                >
                  <Icon.trash /> Slett sett
                </button>
                <button className="btn small ghost" onClick={() => setFocus(null)}>
                  Ferdig
                </button>
              </div>
            )}
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
