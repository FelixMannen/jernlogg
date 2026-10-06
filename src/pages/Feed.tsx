import { useState } from 'react'
import { useMe, TopBar, Avatar, go, Icon, useNow } from '../components/ui'
import { useStoreVersion, getStatus, type Doc } from '../lib/store'
import { REACTIONS, FEELINGS, type Workout, type UserId } from '../lib/domain'
import { userById, myGroups } from '../lib/users'
import { useScope, scopeUsers, inScope } from '../lib/scope'
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
} from '../lib/stats'
import { toggleReaction, reactionsFor, commentsFor } from '../lib/actions'
import { InstallGuide } from '../components/Notifications'
import { WorkoutMenuButton } from '../components/WorkoutActions'
import { goalProgress } from '../lib/runs'
import { stopwatchElapsed } from '../lib/actions'
import { RunFeedBody } from './RunFeed'
import { TodaySupplementsCard } from '../components/Supplements'

export function FeedPage() {
  useStoreVersion()
  const { me } = useMe()
  const [scope, setScope] = useScope(me)
  const [filter, setFilter] = useState<'alle' | UserId>('alle')
  const [limit, setLimit] = useState(20)
  const now = useNow(1000)
  const people = scopeUsers(me, scope)
  const ids = new Set(people.map((u) => u.id))
  const person = filter !== 'alle' && ids.has(filter) ? filter : 'alle'
  const all = doneWorkouts(person === 'alle' ? undefined : person).filter((w) => inScope(w, ids, scope))
  const live = activeWorkouts().filter((w) => ids.has(w.data.userId) && !w.data.private)
  const groups = myGroups(me)
  const alone = people.length <= 1
  const st = getStatus()
  return (
    <>
      <TopBar
        title="Jernlogg"
        right={
          <span className="row" style={{ gap: 4 }}>
          <a className="icon-btn" href="#/grupper" aria-label="Grupper" style={{ fontSize: '1.125rem', textDecoration: 'none' }}>
            👥
          </a>
          <span className={`sync ${st.status === 'offline' ? 'offline' : ''}`} title={st.backend === 'local' ? 'Lokal testmodus' : 'Synkronisert'}>
            <i /> {st.status === 'offline' ? `Frakoblet${st.pending ? ` · ${st.pending} venter` : ''}` : st.backend === 'local' ? 'Lokal' : 'Live'}
          </span>
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
                <b>{mine ? 'Du' : u.name}</b> {w.data.kind === 'run' ? 'løper nå' : 'trener nå'} · {w.data.title}
              </span>
              <span className="num muted">{fmtDuration(w.data.kind === 'run' ? stopwatchElapsed(w.data, now) : now - Date.parse(w.data.startedAt))}</span>
            </a>
          )
        })}

        <InstallBanner />
        <TodaySupplementsCard />
        {alone ? <GroupsNudge hasGroups={groups.length > 0} /> : <WeekGoals ids={people.map((u) => u.id)} scope={scope} />}

        {groups.length > 1 && (
          <div className="chips scroll" style={{ marginBottom: 8 }} role="group" aria-label="Vis gruppe">
            <button className={`chip ${scope === 'alle' ? 'on' : ''}`} onClick={() => setScope('alle')}>
              Alle grupper
            </button>
            {groups.map((g) => (
              <button key={g.id} className={`chip ${scope === g.id ? 'on' : ''}`} onClick={() => setScope(g.id)}>
                {g.data.emoji ? `${g.data.emoji} ` : ''}
                {g.data.name}
              </button>
            ))}
          </div>
        )}
        {!alone && (
          <div className="chips scroll" style={{ marginBottom: 12 }} role="group" aria-label="Vis person">
            <button className={`chip ${person === 'alle' ? 'on' : ''}`} onClick={() => setFilter('alle')}>
              Alle
            </button>
            {people.map((u) => (
              <button key={u.id} className={`chip ${person === u.id ? 'on' : ''}`} onClick={() => setFilter(u.id)}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: u.color }} />
                {u.id === me ? 'Meg' : u.name}
              </button>
            ))}
          </div>
        )}

        {all.length === 0 && (
          <div className="empty">
            <h3>Ingen økter ennå</h3>
            <p>{alone ? 'Øktene dine dukker opp her, med PR-er og reaksjoner.' : 'Økter dere fullfører dukker opp her, med PR-er og reaksjoner.'}</p>
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
  const isRun = w.data.kind === 'run'
  return (
    <article className="feed-item">
      <div className="row" style={{ alignItems: 'flex-start', gap: 0 }}>
        <button className="feed-head grow" style={{ textAlign: 'left' }} onClick={() => go(`w/${w.id}`)}>
          <Avatar id={u.id} />
          <div className="grow">
            <div style={{ fontWeight: 700 }}>
              {u.name} <span className="muted" style={{ fontWeight: 500 }}>· {isRun ? '🏃 ' : ''}{w.data.title}</span>
              {w.data.private && (
                <span className="private-tag" title="Privat – bare du ser denne">
                  🔒 Privat
                </span>
              )}
              {w.data.feeling ? <span style={{ marginLeft: 6 }}>{FEELINGS[w.data.feeling - 1]}</span> : null}
            </div>
            <div className="tiny muted">
              {isRun
                ? fmtRelDate(w.data.startedAt)
                : `${fmtRelDate(w.data.startedAt)} · ${dur > 0 ? `${fmtDurationShort(dur)} · ` : ''}${fmtVolume(workoutVolume(w.data))} · ${workoutSetCount(w.data)} sett`}
            </div>
          </div>
        </button>
        {w.data.userId === me && <WorkoutMenuButton id={w.id} />}
      </div>
      {isRun && <RunFeedBody id={w.id} w={w.data} />}
      {!isRun && prs.length > 0 && (
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
      {!isRun && <ul className="feed-ex">
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
      </ul>}
      {!w.data.private && <div className="reactions">
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
      </div>}
    </article>
  )
}

function GroupsNudge({ hasGroups }: { hasGroups: boolean }) {
  return (
    <section className="card nudge" style={{ marginBottom: 12 }}>
      <h3>{hasGroups ? 'Inviter noen til gruppa di' : 'Tren sammen med venner'}</h3>
      <p className="small muted" style={{ margin: '4px 0 10px' }}>
        {hasGroups
          ? 'Del invitasjonslenken, så ser dere hverandres økter, PR-er og ukesmål.'
          : 'Lag en gruppe eller bli med i en – da ser dere hverandres økter og kan konkurrere på topplistene.'}
      </p>
      <button className="btn primary" onClick={() => go('grupper')}>
        {hasGroups ? 'Til gruppene mine' : 'Finn eller lag en gruppe'}
      </button>
    </section>
  )
}

const GOAL_ROWS = 8
function WeekGoals({ ids, scope }: { ids: string[]; scope: string }) {
  const [more, setMore] = useState(false)
  const all = ids.map((id) => ({ u: userById(id), p: goalProgress(id) })) // own private sessions count towards own goal
  const rows = more ? all : all.slice(0, GOAL_ROWS)
  const allDone = all.every((r) => r.p.met)
  void scope
  return (
    <section className="card" style={{ marginBottom: 12, padding: '12px 16px' }}>
      <div className="spread" style={{ marginBottom: 8 }}>
        <h3>Ukesmål</h3>
        <span className="tiny muted">{allDone ? 'Alle i mål denne uka 🎉' : 'denne uka'}</span>
      </div>
      <div className="goals">
        {rows.map(({ u, p }) => {
          const sessionRows = p.rows.filter((r) => r.key !== 'km' && r.key !== 'runMin')
          const km = p.rows.find((r) => r.key === 'km')
          const runMin = p.rows.find((r) => r.key === 'runMin')
          const total = sessionRows.reduce((a, r) => a + r.target, 0)
          // pips: strength first, then runs (striped)
          const pips: ('s' | 'r' | '')[] = []
          if (sessionRows.length === 1 && sessionRows[0].key === 'total') {
            for (let i = 0; i < p.strength; i++) pips.push('s')
            for (let i = 0; i < p.run; i++) pips.push('r')
          } else
            for (const r of sessionRows) for (let i = 0; i < Math.max(r.target, r.done); i++) pips.push(i < r.done ? (r.key === 'run' ? 'r' : 's') : '')
          while (pips.length < total) pips.push('')
          const done = sessionRows.reduce((a, r) => a + Math.min(r.done, r.target), 0)
          return (
            <button key={u.id} className="goal" onClick={() => go(`u/${u.id}`)} aria-label={`${u.name}: ${done} av ${total}`}>
              <span className="goal-name">
                {u.name}
                {p.met ? ' ✓' : ''}
              </span>
              <span>
                <span className="goal-pips">
                  {pips.map((k, i) => (
                    <i key={i} className={k === 'r' ? 'run' : ''} style={{ background: k ? u.color : undefined, opacity: i >= total ? 0.6 : 1 }} />
                  ))}
                </span>
                {(km || runMin) && (
                  <span className="tiny muted" style={{ display: 'block', marginTop: 2 }}>
                    {runMin ? `løping ${runMin.done}/${runMin.target}` : ''}
                    {runMin && km ? ' · ' : ''}
                    {km ? `${km.est ? 'ca. ' : ''}${String(km.done).replace('.', ',')}/${km.target} km` : ''}
                  </span>
                )}
              </span>
              <span className="num goal-n">
                {done}/{total}
              </span>
            </button>
          )
        })}
      </div>
      {all.length > GOAL_ROWS && (
        <button className="btn ghost small" style={{ marginTop: 6 }} onClick={() => setMore((m) => !m)}>
          {more ? 'Vis færre' : `Vis alle ${all.length}`}
        </button>
      )}
      <div className="tiny muted" style={{ marginTop: 6 }}>Hel = styrke · stripet = løping</div>
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
