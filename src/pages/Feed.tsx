import { useState } from 'react'
import { useMe, TopBar, Avatar, go, Icon, useNow } from '../components/ui'
import { useStoreVersion, getStatus, type Doc } from '../lib/store'
import { USERS, userById, REACTIONS, FEELINGS, type Workout, type UserId } from '../lib/domain'
import {
  doneWorkouts,
  activeWorkouts,
  exerciseById,
  workoutVolume,
  workoutSetCount,
  fmtVolume,
  fmtRelDate,
  fmtDurationShort,
  fmtKg,
  prsForWorkout,
  e1rm,
  fmtDuration,
  weeklyGoal,
  workoutsThisWeek,
} from '../lib/stats'
import { toggleReaction, reactionsFor, commentsFor } from '../lib/actions'
import { InstallGuide } from '../components/Notifications'

export function FeedPage() {
  useStoreVersion()
  const { me } = useMe()
  const [filter, setFilter] = useState<'alle' | UserId>('alle')
  const [limit, setLimit] = useState(20)
  const now = useNow(1000)
  const all = doneWorkouts(filter === 'alle' ? undefined : filter)
  const live = activeWorkouts()
  const st = getStatus()
  return (
    <>
      <TopBar
        title="Jernlogg"
        right={
          <span className={`sync ${st.status === 'offline' ? 'offline' : ''}`} title={st.backend === 'local' ? 'Lokal testmodus' : 'Synkronisert'}>
            <i /> {st.status === 'offline' ? `Frakoblet${st.pending ? ` · ${st.pending} venter` : ''}` : st.backend === 'local' ? 'Lokal' : 'Live'}
          </span>
        }
      />
      <div className="page">
        {live.map((w) => {
          const u = userById(w.data.userId)
          const mine = w.data.userId === me
          return (
            <a key={w.id} className="live-strip" href={mine ? '#/okt' : `#/w/${w.id}`} style={{ ['--me-soft' as any]: `color-mix(in srgb, ${u.color} 16%, transparent)` }}>
              <span className="live-dot" />
              <span className="grow">
                <b>{mine ? 'Du' : u.name}</b> trener nå · {w.data.title}
              </span>
              <span className="num muted">{fmtDuration(now - Date.parse(w.data.startedAt))}</span>
            </a>
          )
        })}

        <InstallBanner />
        <WeekGoals />

        <div className="chips" style={{ marginBottom: 12 }}>
          <button className={`chip ${filter === 'alle' ? 'on' : ''}`} onClick={() => setFilter('alle')}>
            Alle
          </button>
          {USERS.map((u) => (
            <button key={u.id} className={`chip ${filter === u.id ? 'on' : ''}`} onClick={() => setFilter(u.id)}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: u.color }} />
              {u.name}
            </button>
          ))}
        </div>

        {all.length === 0 && (
          <div className="empty">
            <h3>Ingen økter ennå</h3>
            <p>Økter dere fullfører dukker opp her, med PR-er og reaksjoner.</p>
            <button className="btn primary" onClick={() => go('okt')}>
              <Icon.plus /> Start en økt
            </button>
          </div>
        )}
        {all.slice(0, limit).map((w) => (
          <FeedItem key={w.id} w={w} />
        ))}
        {all.length > limit && (
          <button className="btn block ghost" style={{ marginTop: 12 }} onClick={() => setLimit((l) => l + 20)}>
            Vis flere
          </button>
        )}
      </div>
    </>
  )
}

export function bestSetLabel(sets: { weight: number | null; reps: number | null; warmup?: boolean; done: boolean }[]) {
  const work = sets.filter((s) => s.done && !s.warmup)
  if (!work.length) return ''
  const best = work.reduce((a, b) => (e1rm(b.weight, b.reps) > e1rm(a.weight, a.reps) ? b : a))
  const sameCount = work.filter((s) => s.weight === best.weight && s.reps === best.reps).length
  if (!best.weight) return `${work.length} × ${best.reps}`
  return `${sameCount > 1 ? sameCount + ' × ' : ''}${best.reps} × ${fmtKg(best.weight)} kg`
}

export function FeedItem({ w }: { w: Doc<Workout> }) {
  const { me } = useMe()
  const u = userById(w.data.userId)
  const prs = prsForWorkout(w.id, w.data)
  const reactions = reactionsFor(w.id)
  const comments = commentsFor(w.id)
  const dur = w.data.endedAt ? Date.parse(w.data.endedAt) - Date.parse(w.data.startedAt) : 0
  const exs = w.data.exercises
  return (
    <article className="feed-item">
      <button className="feed-head" style={{ width: '100%', textAlign: 'left' }} onClick={() => go(`w/${w.id}`)}>
        <Avatar id={u.id} />
        <div className="grow">
          <div style={{ fontWeight: 700 }}>
            {u.name} <span className="muted" style={{ fontWeight: 500 }}>· {w.data.title}</span>
            {w.data.feeling ? <span style={{ marginLeft: 6 }}>{FEELINGS[w.data.feeling - 1]}</span> : null}
          </div>
          <div className="tiny muted">
            {fmtRelDate(w.data.startedAt)} · {dur > 0 ? `${fmtDurationShort(dur)} · ` : ''}{fmtVolume(workoutVolume(w.data))} · {workoutSetCount(w.data)} sett
          </div>
        </div>
      </button>
      {prs.length > 0 && (
        <div className="row" style={{ flexWrap: 'wrap', marginTop: 10, gap: 6 }}>
          {prs.slice(0, 3).map((p, i) => (
            <span key={i} className="badge-pr">
              🏆 {exerciseById(p.exerciseId).name}
              {p.kind === 'weight' ? ` ${fmtKg(p.value)} kg` : p.kind === 'e1rm' ? ` e1RM ${fmtKg(p.value, 0)}` : ' volum'}
            </span>
          ))}
          {prs.length > 3 && <span className="badge-pr">+{prs.length - 3}</span>}
        </div>
      )}
      {w.data.notes && <p className="feed-note">«{w.data.notes}»</p>}
      <ul className="feed-ex">
        {exs.slice(0, 4).map((ex) => (
          <li key={ex.uid}>
            <span>{exerciseById(ex.exerciseId).name}</span>
            <span>{bestSetLabel(ex.sets)}</span>
          </li>
        ))}
        {exs.length > 4 && (
          <li>
            <span className="muted small">+ {exs.length - 4} øvelser til</span>
            <span />
          </li>
        )}
      </ul>
      <div className="reactions">
        {REACTIONS.map((e) => {
          const who = reactions.filter((r) => r.emoji === e)
          const on = who.some((r) => r.userId === me)
          return (
            <button
              key={e}
              className={`react ${on ? 'on' : ''}`}
              onClick={() => toggleReaction(w.id, me as UserId, e)}
              aria-label={`${e} ${who.length}`}
              title={who.map((r) => userById(r.userId).name).join(', ')}
            >
              {e}
              {who.length > 0 && <span className="n">{who.length}</span>}
            </button>
          )
        })}
        {comments.length > 0 && (
          <button className="react" onClick={() => go(`w/${w.id}`)}>
            💬 <span className="n">{comments.length}</span>
          </button>
        )}
      </div>
    </article>
  )
}

function WeekGoals() {
  const rows = USERS.map((u) => ({ u, done: workoutsThisWeek(u.id), goal: weeklyGoal(u.id) }))
  const allDone = rows.every((r) => r.done >= r.goal)
  return (
    <section className="card" style={{ marginBottom: 12, padding: '12px 16px' }}>
      <div className="spread" style={{ marginBottom: 8 }}>
        <h3>Ukesmål</h3>
        <span className="tiny muted">{allDone ? 'Alle i mål denne uka 🎉' : 'økter denne uka'}</span>
      </div>
      <div className="goals">
        {rows.map(({ u, done, goal }) => (
          <button key={u.id} className="goal" onClick={() => go(`u/${u.id}`)} aria-label={`${u.name}: ${done} av ${goal} økter`}>
            <span className="goal-name">{u.name}</span>
            <span className="goal-pips">
              {Array.from({ length: Math.max(goal, done) }).map((_, i) => (
                <i key={i} style={{ background: i < done ? u.color : undefined, opacity: i >= goal ? 0.6 : 1 }} />
              ))}
            </span>
            <span className="num goal-n">
              {done}/{goal}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

function InstallBanner() {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem('jernlogg.installHidden') === '1'
    } catch {
      return false
    }
  })
  if (hidden) return null
  return (
    <div className="install-wrap">
      <InstallGuide
        compact
        onClose={() => {
          try {
            localStorage.setItem('jernlogg.installHidden', '1')
          } catch {}
          setHidden(true)
        }}
      />
    </div>
  )
}
