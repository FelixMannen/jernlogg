import { useState } from 'react'
import { TopBar, Icon, useMe, Sheet, confirmDialog, toast, go, Avatar } from '../components/ui'
import { ExercisePicker } from '../components/ExercisePicker'
import { useStoreVersion, getDoc } from '../lib/store'
import { type Template, type TemplateItem, type UserId } from '../lib/domain'
import { templates, exerciseById, activeWorkout } from '../lib/stats'
import { saveTemplate, deleteTemplate, startWorkout } from '../lib/actions'

export function TemplatesPage() {
  useStoreVersion()
  const { me } = useMe()
  const all = templates()
  const mine = all.filter((t) => t.data.createdBy === me)
  const others = all.filter((t) => t.data.createdBy !== me)
  const [showOthers, setShowOthers] = useState(false)
  const list = [...mine, ...(showOthers ? others : others.slice(0, mine.length ? 3 : 6))]
  const [edit, setEdit] = useState<null | { id?: string }>(null)
  const active = activeWorkout(me)

  return (
    <>
      <TopBar
        title="Maler"
        right={
          <button className="btn small" onClick={() => setEdit({})}>
            <Icon.plus /> Ny
          </button>
        }
      />
      <div className="page">
        {all.length === 0 && (
          <div className="empty">
            <h3>Ingen maler ennå</h3>
            <p>Lag en mal for push, pull, bein eller hva dere kjører, så starter dere økta med ett trykk.</p>
            <button className="btn primary" onClick={() => setEdit({})}>
              <Icon.plus /> Lag mal
            </button>
            <div className="stack" style={{ marginTop: 24 }}>
              <p className="small">Eller start med et forslag:</p>
              {STARTERS.map((s) => (
                <button key={s.name} className="btn block" onClick={() => (saveTemplate({ ...s, createdBy: me as UserId }), toast(`«${s.name}» er lagt til`))}>
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="stack">
          {list.map((t, i) => (
            <div key={t.id} className="card">
              {i === mine.length && others.length > 0 && <div className="tiny muted" style={{ marginBottom: 6 }}>Fra gruppene dine</div>}
              <div className="spread">
                <h2>{t.data.name}</h2>
                <Avatar id={t.data.createdBy} size="sm" />
              </div>
              <ul className="feed-ex" style={{ marginTop: 6 }}>
                {t.data.items.map((it, i) => (
                  <li key={i}>
                    <span>{exerciseById(it.exerciseId).name}</span>
                    <span>
                      {it.sets} × {it.reps}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="row" style={{ marginTop: 12 }}>
                <button
                  className="btn primary grow"
                  onClick={() => {
                    if (active) {
                      toast('Du har allerede en økt i gang')
                      go('okt')
                      return
                    }
                    startWorkout(me as UserId, t.id)
                    go('okt')
                  }}
                >
                  Start økt
                </button>
                {t.data.createdBy === me ? (
                  <button className="btn" onClick={() => setEdit({ id: t.id })}>
                    Rediger
                  </button>
                ) : (
                  <button className="btn" onClick={() => (saveTemplate({ ...t.data, name: t.data.name, createdBy: me as UserId }), toast(`«${t.data.name}» er kopiert til dine maler`))}>
                    Kopier
                  </button>
                )}
              </div>
            </div>
          ))}
          {others.length > list.length - mine.length && (
            <button className="btn ghost block" onClick={() => setShowOthers(true)}>
              Vis alle {others.length} maler fra gruppene dine
            </button>
          )}
        </div>
        {all.length > 0 && (
          <details style={{ marginTop: 24 }}>
            <summary className="small muted" style={{ cursor: 'pointer' }}>
              Legg til ferdige forslag
            </summary>
            <div className="stack" style={{ marginTop: 12 }}>
              {STARTERS.map((s) => (
                <button key={s.name} className="btn block" onClick={() => (saveTemplate({ ...s, createdBy: me as UserId }), toast(`«${s.name}» er lagt til`))}>
                  {s.name}
                </button>
              ))}
            </div>
          </details>
        )}
      </div>
      {edit && <TemplateEditor id={edit.id} onClose={() => setEdit(null)} />}
    </>
  )
}

const STARTERS: Omit<Template, 'createdBy'>[] = [
  {
    name: 'Push',
    items: [
      { exerciseId: 'benkpress', sets: 4, reps: 6 },
      { exerciseId: 'skraa-benk-manual', sets: 3, reps: 10 },
      { exerciseId: 'militaerpress', sets: 3, reps: 8 },
      { exerciseId: 'sidehev', sets: 3, reps: 15 },
      { exerciseId: 'triceps-pushdown', sets: 3, reps: 12 },
    ],
  },
  {
    name: 'Pull',
    items: [
      { exerciseId: 'markloft', sets: 3, reps: 5 },
      { exerciseId: 'pullups', sets: 4, reps: 8 },
      { exerciseId: 'stangroing', sets: 3, reps: 8 },
      { exerciseId: 'face-pull', sets: 3, reps: 15 },
      { exerciseId: 'bicepscurl-manual', sets: 3, reps: 12 },
    ],
  },
  {
    name: 'Bein',
    items: [
      { exerciseId: 'kneboy', sets: 4, reps: 6 },
      { exerciseId: 'rumensk-markloft', sets: 3, reps: 8 },
      { exerciseId: 'beinpress', sets: 3, reps: 12 },
      { exerciseId: 'larcurl', sets: 3, reps: 12 },
      { exerciseId: 'tahev', sets: 4, reps: 15 },
    ],
  },
]

function TemplateEditor({ id, onClose }: { id?: string; onClose: () => void }) {
  const { me } = useMe()
  const existing = id ? getDoc<Template>(id)?.data : undefined
  const [name, setName] = useState(existing?.name ?? '')
  const [items, setItems] = useState<TemplateItem[]>(existing?.items ?? [])
  const [picking, setPicking] = useState(false)
  const set = (i: number, p: Partial<TemplateItem>) => setItems((l) => l.map((it, j) => (j === i ? { ...it, ...p } : it)))
  const move = (i: number, d: number) =>
    setItems((l) => {
      const n = [...l]
      const j = i + d
      if (j < 0 || j >= n.length) return l
      ;[n[i], n[j]] = [n[j], n[i]]
      return n
    })
  return (
    <>
      <Sheet title={id ? 'Rediger mal' : 'Ny mal'} onClose={onClose}>
        <div className="stack">
          <label className="field">
            <span>Navn</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="f.eks. Push A" autoFocus={!id} />
          </label>
          {items.length > 0 && (
            <div className="list">
              {items.map((it, i) => (
                <div key={i} className="list-item" style={{ flexWrap: 'wrap' }}>
                  <div className="grow" style={{ fontWeight: 600 }}>
                    {exerciseById(it.exerciseId).name}
                  </div>
                  <div className="row" style={{ gap: 4 }}>
                    <input
                      className="set-input"
                      style={{ width: 48 }}
                      inputMode="numeric"
                      value={it.sets}
                      aria-label="Antall sett"
                      onChange={(e) => set(i, { sets: Math.max(1, parseInt(e.target.value) || 1) })}
                    />
                    <span className="muted">×</span>
                    <input
                      className="set-input"
                      style={{ width: 48 }}
                      inputMode="numeric"
                      value={it.reps}
                      aria-label="Reps"
                      onChange={(e) => set(i, { reps: Math.max(1, parseInt(e.target.value) || 1) })}
                    />
                    <button className="icon-btn" onClick={() => move(i, -1)} aria-label="Flytt opp" disabled={i === 0}>
                      <Icon.up />
                    </button>
                    <button className="icon-btn" onClick={() => setItems((l) => l.filter((_, j) => j !== i))} aria-label="Fjern">
                      <Icon.x />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button className="btn block" onClick={() => setPicking(true)}>
            <Icon.plus /> Legg til øvelser
          </button>
          <button
            className="btn primary big block"
            disabled={!name.trim() || items.length === 0}
            onClick={() => {
              saveTemplate({ name: name.trim(), items, createdBy: (existing?.createdBy ?? me) as UserId, notes: existing?.notes }, id)
              toast(id ? 'Malen er oppdatert' : `Malen «${name.trim()}» er lagret`)
              onClose()
            }}
          >
            Lagre mal
          </button>
          {id && (
            <button
              className="btn ghost block"
              onClick={async () => {
                if (await confirmDialog({ title: `Slette «${name}»?`, body: 'Malen forsvinner for alle tre. Økter dere har logget påvirkes ikke.', ok: 'Slett mal', danger: true })) {
                  deleteTemplate(id)
                  toast('Malen er slettet')
                  onClose()
                }
              }}
            >
              <Icon.trash /> Slett mal
            </button>
          )}
        </div>
      </Sheet>
      {picking && (
        <ExercisePicker
          me={me as UserId}
          onClose={() => setPicking(false)}
          onPick={(ids) => {
            setItems((l) => [...l, ...ids.map((exerciseId) => ({ exerciseId, sets: 3, reps: 10 }))])
            setPicking(false)
          }}
        />
      )}
    </>
  )
}
