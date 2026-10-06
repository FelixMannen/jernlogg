import { useState } from 'react'
import { Sheet, Icon, confirmDialog, toast, go, useMe } from './ui'
import { getDoc } from '../lib/store'
import type { Workout, UserId } from '../lib/domain'
import { exerciseById } from '../lib/stats'
import { deleteWorkout, reopenWorkout, templateFromWorkout, updateWorkoutMeta, setWorkoutPrivate } from '../lib/actions'

export const toLocalInput = (iso: string | Date) => {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** ⋯ button with edit/delete for the owner's own workouts and runs. */
export function WorkoutMenuButton({ id, onDeleted }: { id: string; onDeleted?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        className="icon-btn"
        aria-label="Rediger eller slett"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
      >
        <Icon.dots />
      </button>
      {open && <WorkoutActionsSheet id={id} onClose={() => setOpen(false)} onDeleted={onDeleted} />}
    </>
  )
}

export function WorkoutActionsSheet({ id, onClose, onDeleted }: { id: string; onClose: () => void; onDeleted?: () => void }) {
  const { me } = useMe()
  const doc = getDoc<Workout>(id)
  const [view, setView] = useState<'menu' | 'meta' | 'template'>('menu')
  if (!doc) return null
  const w = doc.data
  const isRun = w.kind === 'run'

  const del = async () => {
    onClose()
    const ok = await confirmDialog({
      title: isRun ? 'Slette løpeturen?' : 'Slette økta?',
      body: w.private ? 'Den forsvinner fra historikken og statistikken din.' : 'Den forsvinner fra historikken og statistikken for alle.',
      ok: isRun ? 'Slett løpetur' : 'Slett økt',
      danger: true,
    })
    if (!ok) return
    deleteWorkout(id)
    toast(isRun ? 'Løpeturen er slettet' : 'Økta er slettet')
    if (onDeleted) onDeleted()
    else if (location.hash.includes(id)) go('feed')
  }

  if (view === 'meta') return <MetaSheet id={id} w={w} onClose={onClose} />
  if (view === 'template') return <SaveTemplateSheet w={w} onClose={onClose} />

  return (
    <Sheet title={w.title} onClose={onClose}>
      <div className="list">
        {isRun ? (
          <button className="list-item" onClick={() => (onClose(), go(`lop/rediger/${id}`))}>
            <Icon.edit /> Rediger løpeturen
          </button>
        ) : (
          <>
            <button
              className="list-item"
              onClick={() => {
                onClose()
                if (reopenWorkout(id)) go('okt')
                else toast('Fullfør økta du har i gang før du redigerer en gammel')
              }}
            >
              <Icon.edit /> Rediger øvelser og sett
            </button>
            <button className="list-item" onClick={() => setView('meta')}>
              <Icon.timer /> Endre dato, tid, tittel og notat
            </button>
            <button className="list-item" onClick={() => setView('template')}>
              <Icon.list /> Lagre som mal
            </button>
          </>
        )}
        <button
          className="list-item"
          onClick={() => {
            setWorkoutPrivate(id, !w.private)
            toast(w.private ? 'Synlig for gruppene dine igjen' : 'Privat – bare du ser den nå')
            onClose()
          }}
        >
          {w.private ? '👥 Vis for gruppene mine' : '🔒 Gjør privat'}
        </button>
        <button className="list-item" style={{ color: '#ff8a80' }} onClick={del}>
          <Icon.trash /> {isRun ? 'Slett løpeturen' : 'Slett økta'}
        </button>
      </div>
      {w.userId !== me && <p className="tiny muted">Du kan bare endre dine egne økter.</p>}
    </Sheet>
  )
}

function MetaSheet({ id, w, onClose }: { id: string; w: Workout; onClose: () => void }) {
  const [date, setDate] = useState(toLocalInput(w.startedAt))
  const curMin = w.endedAt ? Math.round((Date.parse(w.endedAt) - Date.parse(w.startedAt)) / 60000) : 0
  const [minutes, setMinutes] = useState(curMin > 0 ? String(curMin) : '')
  const [title, setTitle] = useState(w.title)
  const [notes, setNotes] = useState(w.notes ?? '')
  const valid = !isNaN(new Date(date).getTime())
  return (
    <Sheet title="Endre økta" onClose={onClose}>
      <div className="stack">
        <label className="field">
          <span>Tittel</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="field grow">
            <span>Dato og starttid</span>
            <input className="input" type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field" style={{ width: 110 }}>
            <span>Varighet (min)</span>
            <input className="input num" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))} />
          </label>
        </div>
        <label className="field">
          <span>Notat</span>
          <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <button
          className="btn primary big block"
          disabled={!valid}
          onClick={() => {
            updateWorkoutMeta(id, { startedAt: new Date(date).toISOString(), minutes: minutes ? parseInt(minutes, 10) : null, title: title.trim(), notes: notes.trim() })
            toast('Endringene er lagret')
            onClose()
          }}
        >
          Lagre endringer
        </button>
      </div>
    </Sheet>
  )
}

export function SaveTemplateSheet({ w, onClose }: { w: Workout; onClose: () => void }) {
  const { me } = useMe()
  const [name, setName] = useState(w.title)
  return (
    <Sheet title="Lagre som mal" onClose={onClose}>
      <div className="stack">
        <label className="field">
          <span>Navn på malen</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <p className="small muted">{w.exercises.map((e) => exerciseById(e.exerciseId).name).join(', ')}</p>
        <button
          className="btn primary big block"
          disabled={!name.trim()}
          onClick={() => {
            templateFromWorkout(w, name.trim(), me as UserId)
            toast(`Malen «${name.trim()}» er lagret`)
            onClose()
          }}
        >
          Lagre mal
        </button>
      </div>
    </Sheet>
  )
}
