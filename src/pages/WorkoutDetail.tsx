import { useState } from 'react'
import { useMe, TopBar, Avatar, back, go, Icon, confirmDialog, toast, Sheet, useNow } from '../components/ui'
import { useStoreVersion, getDoc } from '../lib/store'
import { userById, REACTIONS, FEELINGS, FEELING_LABEL, type Workout, type UserId } from '../lib/domain'
import {
  exerciseById,
  workoutVolume,
  workoutSetCount,
  fmtVolume,
  fmtRelDate,
  fmtDurationShort,
  fmtKg,
  prsForWorkout,
  PR_LABEL,
  e1rm,
  doneWorkouts,
  fmtDuration,
} from '../lib/stats'
import { toggleReaction, reactionsFor, commentsFor, addComment, deleteWorkout, templateFromWorkout, reopenWorkout, updateWorkout } from '../lib/actions'

export function WorkoutDetailPage({ id, summary }: { id: string; summary?: boolean }) {
  useStoreVersion()
  const { me } = useMe()
  const doc = getDoc<Workout>(id)
  const [saveTpl, setSaveTpl] = useState(false)
  const [comment, setComment] = useState('')
  const now = useNow(1000)
  if (!doc)
    return (
      <>
        <TopBar title="Økt" onBack={() => back()} />
        <div className="empty">
          <h3>Fant ikke økta</h3>
          <p>Den kan ha blitt slettet.</p>
        </div>
      </>
    )
  const w = doc.data
  const u = userById(w.userId)
  const mine = w.userId === me
  const prs = w.status === 'done' ? prsForWorkout(id, w) : []
  const dur = (w.endedAt ? Date.parse(w.endedAt) : now) - Date.parse(w.startedAt)
  const reactions = reactionsFor(id)
  const comments = commentsFor(id)

  // comparison with previous workout with the same title
  const prev = doneWorkouts(w.userId).find((x) => x.id !== id && x.data.title === w.title && x.data.startedAt < w.startedAt)
  const volDiff = prev ? workoutVolume(w) - workoutVolume(prev.data) : null

  return (
    <>
      <TopBar title={summary ? 'Bra jobba! 💪' : w.title} onBack={() => (summary ? go('feed') : back())} />
      <div className="page stack">
        <div className="row" style={{ gap: 12 }}>
          <Avatar id={u.id} />
          <div className="grow">
            <div style={{ fontWeight: 700 }}>{summary ? w.title : u.name}</div>
            <div className="tiny muted">
              {w.status === 'active' ? 'Pågår nå' : fmtRelDate(w.startedAt)} {summary ? '' : ''}
            </div>
          </div>
        </div>
        <div className="stats">
          <div className="stat">
            <div className="v">{w.status === 'active' ? fmtDuration(dur) : fmtDurationShort(dur)}</div>
            <div className="l">Tid</div>
          </div>
          <div className="stat">
            <div className="v">{fmtVolume(workoutVolume(w))}</div>
            <div className="l">
              Volum
              {volDiff != null && volDiff !== 0 && (
                <span style={{ color: volDiff > 0 ? 'var(--good)' : 'var(--dust)' }}>
                  {' '}
                  {volDiff > 0 ? '+' : '−'}
                  {fmtVolume(Math.abs(volDiff))}
                </span>
              )}
            </div>
          </div>
          <div className="stat">
            <div className="v">{workoutSetCount(w)}</div>
            <div className="l">Sett</div>
          </div>
        </div>

        {mine && w.status === 'done' && (summary || !w.feeling) && (
          <div className="card">
            <h3 style={{ marginBottom: 8 }}>Hvordan føltes økta?</h3>
            <div className="feeling">
              {FEELINGS.map((f, i) => (
                <button key={i} className={w.feeling === i + 1 ? 'on' : ''} onClick={() => updateWorkout(id, (x) => void (x.feeling = i + 1))} aria-label={FEELING_LABEL[i]} title={FEELING_LABEL[i]}>
                  {f}
                </button>
              ))}
            </div>
            <textarea
              className="input"
              style={{ marginTop: 8, minHeight: 60 }}
              placeholder="Notat (valgfritt) – f.eks. sov dårlig, ny sko, vondt i skulder"
              defaultValue={w.notes}
              onBlur={(e) => updateWorkout(id, (x) => void (x.notes = e.target.value.trim() || undefined))}
            />
          </div>
        )}
        {!(mine && (summary || !w.feeling)) && (w.feeling || w.notes) && (
          <div className="card small">
            {w.feeling ? (
              <span style={{ fontSize: '1.25rem' }}>
                {FEELINGS[w.feeling - 1]} <span className="muted small">{FEELING_LABEL[w.feeling - 1]}</span>
              </span>
            ) : null}
            {w.notes && <p style={{ margin: w.feeling ? '6px 0 0' : 0 }}>{w.notes}</p>}
          </div>
        )}

        {prs.length > 0 && (
          <div className="card" style={{ background: 'color-mix(in srgb, var(--gold) 12%, var(--rubber))' }}>
            <h3 style={{ color: 'var(--gold)', marginBottom: 8 }}>🏆 {prs.length === 1 ? 'Ny personlig rekord' : `${prs.length} nye personlige rekorder`}</h3>
            {prs.map((p, i) => (
              <div key={i} className="spread small" style={{ padding: '3px 0' }}>
                <span>
                  {exerciseById(p.exerciseId).name} <span className="muted">· {PR_LABEL[p.kind].toLowerCase()}</span>
                </span>
                <span className="num">
                  {fmtKg(p.value, p.kind === 'volume' ? 0 : 1)} kg <span className="muted">(var {fmtKg(p.prev, p.kind === 'volume' ? 0 : 1)})</span>
                </span>
              </div>
            ))}
          </div>
        )}

        {w.exercises.map((ex) => {
          const info = exerciseById(ex.exerciseId)
          let n = 0
          const visible = w.status === 'done' ? ex.sets : ex.sets.filter((s) => s.done)
          if (!visible.length) return null
          return (
            <div key={ex.uid} className="card">
              <button className="spread" style={{ width: '100%', marginBottom: 6 }} onClick={() => go(`ex/${ex.exerciseId}/${w.userId}`)}>
                <h3>{info.name}</h3>
                <Icon.chevron />
              </button>
              {ex.note && <div className="small muted" style={{ marginBottom: 6 }}>{ex.note}</div>}
              {visible.map((s) => {
                const label = s.warmup ? 'V' : String(++n)
                const isPR = prs.some((p) => p.setUid === s.uid)
                return (
                  <div key={s.uid} className="spread num" style={{ padding: '4px 0', fontSize: '1.0625rem', color: s.warmup ? 'var(--dust)' : undefined }}>
                    <span style={{ width: 24, color: s.warmup ? 'var(--gold)' : 'var(--dust)' }}>{label}</span>
                    <span className="grow">
                      {s.weight ? `${fmtKg(s.weight)} kg × ${s.reps}` : `${s.reps} reps`}
                      {isPR && ' 🏆'}
                    </span>
                    {!s.warmup && s.weight ? <span className="muted small">e1RM {fmtKg(e1rm(s.weight, s.reps), 0)}</span> : null}
                  </div>
                )
              })}
            </div>
          )
        })}

        {w.status === 'done' && (
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
        )}

        {mine && w.status === 'done' && (
          <div className="stack" style={{ marginTop: 8 }}>
            <div className="row">
              <button
                className="btn grow"
                onClick={() => {
                  if (reopenWorkout(id)) go('okt')
                  else toast('Fullfør økta du har i gang før du redigerer en gammel')
                }}
              >
                <Icon.edit /> Rediger
              </button>
              <button className="btn grow" onClick={() => setSaveTpl(true)}>
                Lagre som mal
              </button>
            </div>
            {summary && (
              <button className="btn primary block big" onClick={() => go('feed')}>
                Til feeden
              </button>
            )}
            <button
              className="btn ghost block"
              onClick={async () => {
                if (await confirmDialog({ title: 'Slette økta?', body: 'Den forsvinner fra historikken og statistikken for alle.', ok: 'Slett økt', danger: true })) {
                  deleteWorkout(id)
                  toast('Økta er slettet')
                  go('feed')
                }
              }}
            >
              <Icon.trash /> Slett økt
            </button>
          </div>
        )}
      </div>
      {saveTpl && <SaveTemplateSheet w={w} onClose={() => setSaveTpl(false)} />}
    </>
  )
}

function SaveTemplateSheet({ w, onClose }: { w: Workout; onClose: () => void }) {
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
