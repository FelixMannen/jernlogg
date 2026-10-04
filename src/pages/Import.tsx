import { useMemo, useRef, useState } from 'react'
import { TopBar, Icon, useMe, toast, go } from '../components/ui'
import { ExercisePicker } from '../components/ExercisePicker'
import { useStoreVersion, put, uid } from '../lib/store'
import { USERS, userById, type UserId, type Workout } from '../lib/domain'
import { exercises, exerciseById, doneWorkouts, fmtKg } from '../lib/stats'
import { addCustomExercise } from '../lib/actions'
import { parseWorkoutText, decodeImportParam, extractImportParam, type ParseResult } from '../lib/importText'

type DraftSet = { key: string; weight: string; reps: string }
type DraftExercise = {
  key: string
  name: string // as written in the text
  exerciseId: string | null // null = unknown, needs a decision
  createNew: boolean
  sets: DraftSet[]
}
type Draft = {
  userId: UserId
  date: string // yyyy-mm-ddThh:mm (local)
  duration: string
  title: string
  note: string
  exercises: DraftExercise[]
  warnings: string[]
  errors: ParseResult['errors']
}

const norm = (s: string) => s.trim().toLowerCase()
const pad = (n: number) => String(n).padStart(2, '0')
const localInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

function matchExercise(name: string): string | null {
  const n = norm(name)
  const all = exercises()
  return all.find((e) => norm(e.name) === n)?.id ?? all.find((e) => e.alt && norm(e.alt) === n)?.id ?? null
}

function buildDraft(text: string, me: UserId): Draft {
  const r = parseWorkoutText(text)
  const warnings: string[] = []
  let userId = me
  if (r.user) {
    const u = USERS.find((x) => norm(x.name) === norm(r.user!) || x.id === norm(r.user!))
    if (u) userId = u.id
    else warnings.push(`Ukjent bruker «${r.user}» – bruker ${userById(me).name}. Bytt under hvis det er feil.`)
  } else warnings.push(`Teksten sier ikke hvem økta gjelder – bruker ${userById(me).name}.`)
  const date = r.date ? new Date(r.date.y, r.date.m - 1, r.date.d, r.date.hh, r.date.mm) : new Date()
  // merge lines that resolve to the same known exercise (e.g. "Benkpress" and "bench press")
  const exs: DraftExercise[] = []
  for (const e of r.exercises) {
    const id = matchExercise(e.name)
    const sets = e.sets.map((s) => ({ key: uid('d'), weight: String(s.weight), reps: String(s.reps) }))
    const same = exs.find((x) => (id ? x.exerciseId === id : !x.exerciseId && norm(x.name) === norm(e.name)))
    if (same) same.sets.push(...sets)
    else exs.push({ key: uid('d'), name: e.name, exerciseId: id, createNew: false, sets })
  }
  return {
    userId,
    date: localInput(date),
    duration: r.duration != null ? String(r.duration) : '',
    title: 'Importert økt',
    note: r.note ?? '',
    exercises: exs,
    warnings,
    errors: r.errors,
  }
}

function payloadFromLocation(): string | null {
  const raw = extractImportParam(location.hash) ?? extractImportParam(location.search)
  return raw == null ? null : decodeImportParam(raw)
}

/** Pasted text may itself be a full import link – unwrap it. */
function unwrapPasted(text: string): string {
  const t = text.trim()
  if (/^https?:\/\/|^#\/import/i.test(t)) {
    const raw = extractImportParam(t)
    if (raw != null) return decodeImportParam(raw)
  }
  return text
}

const CLAUDE_PROMPT = `Når jeg beskriver en treningsøkt, gjør den om til Jernlogg-format og gi meg en klikkbar lenke.
Format (én ting per linje, eller skilt med semikolon i lenken):
bruker: <Felix|David|Erik>
dato: ÅÅÅÅ-MM-DD HH:MM
varighet: <minutter>
notat: <valgfritt>
<Øvelse>: SxRxKG eller RxKG, kommaseparert (f.eks. Benkpress: 3x15x80 eller Knebøy: 2x10x60, 8x80). 0 kg = kroppsvekt. Bruk punktum som desimaltegn.
Bruk norske øvelsesnavn som Benkpress, Knebøy, Markløft, Militærpress, Sittende roing, Nedtrekk, Kabelkryss, Pull-ups, Dips, Bicepscurl med manualer, Triceps pushdown, Sidehev, Beinpress, Utfall.
Lenken: https://jernlogg.vercel.app/#/import?d=<teksten URL-enkodet, linjer skilt med ;>`

export function ImportPage() {
  useStoreVersion()
  const { me } = useMe()
  const fromLink = useMemo(payloadFromLocation, [])
  const [draft, setDraft] = useState<Draft | null>(() => (fromLink != null ? buildDraft(fromLink, me as UserId) : null))
  const [text, setText] = useState('')
  const [picking, setPicking] = useState<null | { replace?: string }>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const upd = (fn: (d: Draft) => void) =>
    setDraft((d) => {
      if (!d) return d
      const c = structuredClone(d)
      fn(c)
      return c
    })

  const leave = (to = 'feed') => {
    // drop ?d= so a refresh does not import again
    const params = new URLSearchParams(location.search)
    params.delete('d')
    const search = params.toString() ? `?${params}` : ''
    location.replace(location.pathname + search + '#/' + to)
  }

  if (!draft) {
    return (
      <>
        <TopBar title="Importer økt" onBack={() => go('okt')} />
        <div className="page stack">
          <p className="small muted" style={{ margin: 0 }}>
            Lim inn en økt i Jernlogg-formatet (eller hele lenken), eller last opp en .md/.txt-fil. Du får se og rette alt før noe lagres.
          </p>
          <textarea
            className="input"
            style={{ minHeight: 160, fontFamily: 'var(--font-num)' }}
            placeholder={'# Jernlogg v1\nbruker: David\ndato: 2026-10-04 17:00\nvarighet: 60\nBenkpress: 3x15x80\nSittende roing: 12x80, 12x80, 10x80'}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button className="btn primary big block" disabled={!text.trim()} onClick={() => setDraft(buildDraft(unwrapPasted(text), me as UserId))}>
            Tolk teksten
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".md,.txt,text/plain,text/markdown"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (!f) return
              const t = await f.text()
              setText(t)
              setDraft(buildDraft(unwrapPasted(t), me as UserId))
            }}
          />
          <button className="btn block" onClick={() => fileRef.current?.click()}>
            Last opp .md- eller .txt-fil
          </button>
          <details className="card">
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Slik får du Claude til å lage lenken</summary>
            <p className="small muted">Kopier instruksen og lim den inn i en Claude-samtale (eller lagre den som et prosjekt/instruks). Etterpå kan du bare skrive «benk 3x15x80, roing 3x12x80, 1 time».</p>
            <pre className="small" style={{ whiteSpace: 'pre-wrap', background: 'var(--floor-2)', padding: 12, borderRadius: 8 }}>{CLAUDE_PROMPT}</pre>
            <button
              className="btn block"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(CLAUDE_PROMPT)
                  toast('Instruksen er kopiert')
                } catch {
                  toast('Kunne ikke kopiere – merk teksten og kopier manuelt')
                }
              }}
            >
              Kopier instruks til Claude
            </button>
          </details>
        </div>
      </>
    )
  }

  // ---------- editable draft ----------
  const d = draft
  const unresolved = d.exercises.filter((e) => !e.exerciseId && !e.createNew)
  const validExercises = d.exercises.filter((e) => e.sets.some((s) => s.reps.trim() !== ''))
  const start = new Date(d.date)
  const dayKey = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`
  const ids = [...new Set(d.exercises.map((e) => e.exerciseId).filter(Boolean))].sort().join(',')
  const duplicate =
    !isNaN(start.getTime()) &&
    doneWorkouts(d.userId).some(
      (w) =>
        dayKey(new Date(w.data.startedAt)) === dayKey(start) &&
        [...new Set(w.data.exercises.map((e) => e.exerciseId))].sort().join(',') === ids &&
        ids !== '',
    )

  const save = () => {
    if (isNaN(start.getTime())) return toast('Ugyldig dato')
    const exs = d.exercises
      .map((e) => {
        let exerciseId = e.exerciseId
        if (!exerciseId && e.createNew) {
          const bw = e.sets.every((s) => !parseFloat(s.weight.replace(',', '.')))
          exerciseId = addCustomExercise({ name: e.name.trim(), group: 'Annet', equipment: bw ? 'Kroppsvekt' : 'Annet', bodyweight: bw, createdBy: d.userId })
        }
        return {
          uid: uid('x'),
          exerciseId: exerciseId!,
          sets: e.sets
            .filter((s) => s.reps.trim() !== '')
            .map((s) => ({
              uid: uid('s'),
              weight: parseFloat(s.weight.replace(',', '.')) || 0,
              reps: parseInt(s.reps, 10) || 0,
              done: true,
              warmup: false,
              doneAt: start.toISOString(),
            })),
        }
      })
      .filter((e) => e.exerciseId && e.sets.length)
    const mins = parseInt(d.duration, 10)
    const w: Workout = {
      userId: d.userId,
      title: d.title.trim() || 'Importert økt',
      startedAt: start.toISOString(),
      endedAt: new Date(start.getTime() + (mins > 0 ? mins : 0) * 60000).toISOString(),
      status: 'done',
      notes: d.note.trim() || undefined,
      exercises: exs,
    }
    put('workouts', uid('w'), w)
    toast(`Økta er lagret for ${userById(d.userId).name}`)
    leave('feed')
  }

  return (
    <>
      <TopBar title="Importer økt" onBack={() => leave('okt')} />
      <div className="page stack">
        {d.errors.length > 0 && (
          <div className="card small" style={{ background: 'color-mix(in srgb, var(--bad) 14%, var(--rubber))' }}>
            <b>Noen linjer kunne ikke tolkes</b> – resten er importert:
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {d.errors.map((e, i) => (
                <li key={i}>
                  Linje {e.line}: «{e.text}» – {e.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        {d.warnings.map((w, i) => (
          <div key={i} className="card small" style={{ background: 'color-mix(in srgb, var(--gold) 14%, var(--rubber))' }}>
            ⚠️ {w}
          </div>
        ))}
        {duplicate && (
          <div className="card small" style={{ background: 'color-mix(in srgb, var(--gold) 14%, var(--rubber))' }}>
            ⚠️ <b>Denne økta ser ut til å være lagret fra før</b> ({userById(d.userId).name}, samme dato og øvelser). Du kan lagre likevel.
          </div>
        )}

        <section className="card stack">
          <div className="field">
            <span>Hvem</span>
            <div className="chips" style={{ margin: 0, padding: 0 }}>
              {USERS.map((u) => (
                <button key={u.id} className={`chip ${d.userId === u.id ? 'on' : ''}`} onClick={() => upd((x) => void (x.userId = u.id))}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: u.color }} /> {u.name}
                </button>
              ))}
            </div>
          </div>
          <label className="field">
            <span>Tittel</span>
            <input className="input" value={d.title} onChange={(e) => upd((x) => void (x.title = e.target.value))} />
          </label>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <label className="field grow">
              <span>Dato og tid</span>
              <input className="input" type="datetime-local" value={d.date} onChange={(e) => upd((x) => void (x.date = e.target.value))} />
            </label>
            <label className="field" style={{ width: 110 }}>
              <span>Varighet (min)</span>
              <input className="input num" inputMode="numeric" value={d.duration} onChange={(e) => upd((x) => void (x.duration = e.target.value.replace(/\D/g, '')))} />
            </label>
          </div>
          <label className="field">
            <span>Notat</span>
            <input className="input" value={d.note} onChange={(e) => upd((x) => void (x.note = e.target.value))} />
          </label>
        </section>

        {d.exercises.map((ex) => {
          const known = ex.exerciseId ? exerciseById(ex.exerciseId) : null
          return (
            <section key={ex.key} className="ex-card">
              <div className="ex-title">
                <span className="name" style={{ flex: 1, fontFamily: 'var(--font-num)', fontSize: '1.25rem', fontWeight: 700, padding: '4px' }}>
                  {known ? known.name : ex.name}
                </span>
                <button className="icon-btn" aria-label={`Fjern ${ex.name}`} onClick={() => upd((x) => void (x.exercises = x.exercises.filter((e) => e.key !== ex.key)))}>
                  <Icon.trash />
                </button>
              </div>
              {known && norm(known.name) !== norm(ex.name) && <div className="ex-note">Fra teksten: «{ex.name}»</div>}
              {!ex.exerciseId && (
                <div className="card small" style={{ background: ex.createNew ? 'var(--me-soft)' : 'color-mix(in srgb, var(--bad) 16%, var(--floor-2))', padding: 12, marginBottom: 8 }}>
                  {ex.createNew ? (
                    <>
                      «{ex.name}» opprettes som ny øvelse når du lagrer.{' '}
                      <button className="tiny" style={{ textDecoration: 'underline' }} onClick={() => upd((x) => void (x.exercises.find((e) => e.key === ex.key)!.createNew = false))}>
                        Angre
                      </button>
                    </>
                  ) : (
                    <>
                      <b>Ukjent øvelse «{ex.name}».</b> Velg hva den er:
                      <div className="row" style={{ marginTop: 8 }}>
                        <button className="btn small grow" onClick={() => setPicking({ replace: ex.key })}>
                          Velg eksisterende øvelse
                        </button>
                        <button className="btn small grow" onClick={() => upd((x) => void (x.exercises.find((e) => e.key === ex.key)!.createNew = true))}>
                          Opprett ny
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
              <div className="set-grid headers" style={{ gridTemplateColumns: '30px 1fr 1fr 44px' }}>
                <span style={{ textAlign: 'center' }}>Sett</span>
                <span style={{ textAlign: 'center' }}>kg</span>
                <span style={{ textAlign: 'center' }}>Reps</span>
                <span />
              </div>
              {ex.sets.map((s, i) => (
                <div key={s.key} className="set-grid set-row" style={{ gridTemplateColumns: '30px 1fr 1fr 44px' }}>
                  <span className="set-idx">{i + 1}</span>
                  <input
                    className="set-input"
                    inputMode="decimal"
                    aria-label={`Vekt sett ${i + 1} ${ex.name}`}
                    value={s.weight.replace('.', ',')}
                    onChange={(e) => upd((x) => void (x.exercises.find((q) => q.key === ex.key)!.sets[i].weight = e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.')))}
                  />
                  <input
                    className="set-input"
                    inputMode="numeric"
                    aria-label={`Reps sett ${i + 1} ${ex.name}`}
                    value={s.reps}
                    onChange={(e) => upd((x) => void (x.exercises.find((q) => q.key === ex.key)!.sets[i].reps = e.target.value.replace(/\D/g, '')))}
                  />
                  <button className="icon-btn" aria-label={`Slett sett ${i + 1}`} onClick={() => upd((x) => void x.exercises.find((q) => q.key === ex.key)!.sets.splice(i, 1))}>
                    <Icon.x />
                  </button>
                </div>
              ))}
              <button
                className="add-set"
                onClick={() =>
                  upd((x) => {
                    const e = x.exercises.find((q) => q.key === ex.key)!
                    const last = e.sets[e.sets.length - 1]
                    e.sets.push({ key: uid('d'), weight: last?.weight ?? '', reps: last?.reps ?? '' })
                  })
                }
              >
                + Legg til sett
              </button>
              <div className="tiny muted" style={{ textAlign: 'right', paddingTop: 2 }}>
                {ex.sets.length} sett · {fmtKg(ex.sets.reduce((a, s) => a + (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0), 0), 0)} kg volum
              </div>
            </section>
          )
        })}

        <button className="btn block" onClick={() => setPicking({})}>
          <Icon.plus /> Legg til øvelse
        </button>

        {unresolved.length > 0 && <p className="small" style={{ color: '#ff8a80', margin: 0 }}>Velg eller opprett {unresolved.length === 1 ? 'den ukjente øvelsen' : `de ${unresolved.length} ukjente øvelsene`} før du lagrer.</p>}
        <button className="btn primary big block" disabled={unresolved.length > 0 || validExercises.length === 0} onClick={save}>
          Lagre økt
        </button>
        <button className="btn ghost block" onClick={() => (fromLink != null ? leave('okt') : setDraft(null))}>
          Avbryt
        </button>
      </div>
      {picking && (
        <ExercisePicker
          me={me as UserId}
          multi={!picking.replace}
          title={picking.replace ? 'Velg øvelse' : 'Legg til øvelse'}
          onClose={() => setPicking(null)}
          onPick={(picked) => {
            upd((x) => {
              if (picking.replace) {
                const e = x.exercises.find((q) => q.key === picking.replace)
                if (e) {
                  e.exerciseId = picked[0]
                  e.createNew = false
                }
              } else for (const id of picked) x.exercises.push({ key: uid('d'), name: exerciseById(id).name, exerciseId: id, createNew: false, sets: [{ key: uid('d'), weight: '', reps: '' }] })
            })
            setPicking(null)
          }}
        />
      )}
    </>
  )
}
