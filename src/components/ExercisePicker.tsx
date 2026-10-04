import { useMemo, useState } from 'react'
import { Sheet, Icon, toast } from './ui'
import { GROUPS, type MuscleGroup, type Equipment, type UserId } from '../lib/domain'
import { exercises, usedExerciseIds } from '../lib/stats'
import { addCustomExercise } from '../lib/actions'

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/å/g, 'a')

export function ExercisePicker({
  me,
  onPick,
  onClose,
  multi = true,
  title = 'Legg til øvelse',
}: {
  me: UserId
  onPick: (ids: string[]) => void
  onClose: () => void
  multi?: boolean
  title?: string
}) {
  const [q, setQ] = useState('')
  const [group, setGroup] = useState<MuscleGroup | 'Nylig' | 'Alle'>('Alle')
  const [sel, setSel] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const all = exercises()
  const recent = usedExerciseIds(me)

  const shown = useMemo(() => {
    let l = all
    if (group === 'Nylig') l = recent.map((id) => all.find((e) => e.id === id)!).filter(Boolean)
    else if (group !== 'Alle') l = l.filter((e) => e.group === group)
    if (q.trim()) {
      const n = norm(q.trim())
      l = l.filter((e) => norm(e.name + ' ' + (e.alt ?? '')).includes(n))
      // prefix matches first
      l = [...l].sort((a, b) => Number(!norm(a.name).startsWith(n)) - Number(!norm(b.name).startsWith(n)))
    } else if (group === 'Alle') {
      // recent first
      const rset = new Set(recent.slice(0, 8))
      l = [...l.filter((e) => rset.has(e.id)).sort((a, b) => recent.indexOf(a.id) - recent.indexOf(b.id)), ...l.filter((e) => !rset.has(e.id))]
    }
    return l
  }, [q, group, all.length, recent.join()])

  const toggle = (id: string) => {
    if (!multi) {
      onPick([id])
      return
    }
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  if (creating) return <CreateExercise me={me} initialName={q} onCancel={() => setCreating(false)} onCreated={(id) => (multi ? (setSel((s) => [...s, id]), setCreating(false)) : onPick([id]))} />

  return (
    <Sheet title={title} onClose={onClose}>
      <div className="stack" style={{ position: 'sticky', top: 0, background: 'var(--floor-2)', paddingBottom: 8, zIndex: 1 }}>
        <label className="search">
          <Icon.search />
          <input className="input" placeholder="Søk – f.eks. benk, squat, curl" value={q} onChange={(e) => setQ(e.target.value)} autoFocus={matchMedia('(hover: hover)').matches} />
        </label>
        <div className="chips">
          {(['Alle', ...(recent.length ? ['Nylig'] : []), ...GROUPS] as const).map((g) => (
            <button key={g} className={`chip ${group === g ? 'on' : ''}`} onClick={() => setGroup(g as any)}>
              {g}
            </button>
          ))}
        </div>
      </div>
      <div className="list" style={{ marginTop: 4 }}>
        {shown.map((e) => {
          const on = sel.includes(e.id)
          return (
            <button key={e.id} className="list-item" onClick={() => toggle(e.id)} style={on ? { background: 'var(--me-soft)' } : undefined}>
              <div className="grow">
                <div style={{ fontWeight: 600 }}>{e.name}</div>
                <div className="tiny muted">
                  {e.group} · {e.equipment}
                  {e.custom ? ' · egen' : ''}
                  {recent.includes(e.id) ? ' · brukt før' : ''}
                </div>
              </div>
              {multi && (
                <span className="check" style={on ? { background: 'var(--me)', color: 'var(--me-ink)' } : { background: 'transparent', width: 32 }}>
                  {on ? <Icon.check /> : <Icon.plus />}
                </span>
              )}
            </button>
          )
        })}
        {shown.length === 0 && (
          <div className="empty small">
            Fant ingen øvelse som heter «{q}».
          </div>
        )}
      </div>
      <button className="btn ghost block" style={{ marginTop: 8 }} onClick={() => setCreating(true)}>
        <Icon.plus /> Lag egen øvelse{q ? ` «${q}»` : ''}
      </button>
      {multi && sel.length > 0 && (
        <div style={{ position: 'sticky', bottom: 0, paddingTop: 12, background: 'linear-gradient(transparent, var(--floor-2) 30%)' }}>
          <button className="btn primary big block" onClick={() => onPick(sel)}>
            Legg til {sel.length} {sel.length === 1 ? 'øvelse' : 'øvelser'}
          </button>
        </div>
      )}
    </Sheet>
  )
}

function CreateExercise({ me, initialName, onCancel, onCreated }: { me: UserId; initialName: string; onCancel: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState(initialName)
  const [group, setGroup] = useState<MuscleGroup>('Bryst')
  const [equipment, setEquipment] = useState<Equipment>('Stang')
  const EQ: Equipment[] = ['Stang', 'Manualer', 'Maskin', 'Kabel', 'Kroppsvekt', 'Kettlebell', 'Annet']
  return (
    <Sheet title="Ny øvelse" onClose={onCancel}>
      <div className="stack">
        <label className="field">
          <span>Navn</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="f.eks. Pendlay-roing" />
        </label>
        <div className="field">
          <span>Muskelgruppe</span>
          <div className="chips" style={{ flexWrap: 'wrap', margin: 0, padding: 0 }}>
            {GROUPS.map((g) => (
              <button key={g} className={`chip ${group === g ? 'on' : ''}`} onClick={() => setGroup(g)}>
                {g}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Utstyr</span>
          <div className="chips" style={{ flexWrap: 'wrap', margin: 0, padding: 0 }}>
            {EQ.map((g) => (
              <button key={g} className={`chip ${equipment === g ? 'on' : ''}`} onClick={() => setEquipment(g)}>
                {g}
              </button>
            ))}
          </div>
        </div>
        <button
          className="btn primary big block"
          disabled={!name.trim()}
          onClick={() => {
            const id = addCustomExercise({ name: name.trim(), group, equipment, createdBy: me, bodyweight: equipment === 'Kroppsvekt' })
            toast(`${name.trim()} er lagt til`)
            onCreated(id)
          }}
        >
          Lagre øvelse
        </button>
      </div>
    </Sheet>
  )
}
