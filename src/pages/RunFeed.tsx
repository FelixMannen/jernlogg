import type { Workout } from '../lib/domain'
import { RUN_TYPES } from '../lib/domain'
import { go, useMe } from '../components/ui'
import { hasDistance, hasDuration, paceOf, fmtKm, fmtRunTime, fmtPace, prsForRun, routeById } from '../lib/runs'

/** Body of a run in the feed: distance · time · pace, type, records and a nudge for missing data. */
export function RunFeedBody({ id, w }: { id: string; w: Workout }) {
  const { me } = useMe()
  const r = w.run ?? {}
  const pace = paceOf(r)
  const prs = prsForRun(id, w)
  const type = RUN_TYPES.find((t) => t.id === r.runType)
  const route = routeById(r.routeId)
  const missing = !hasDistance(r) ? 'distanse' : !hasDuration(r) ? 'tid' : null
  return (
    <>
      <div className="run-line">
        {hasDistance(r) && (
          <span>
            {r.distanceEst ? 'ca. ' : ''}
            {fmtKm(r.distanceKm, 2)}
            <small>km</small>
          </span>
        )}
        {hasDuration(r) && (
          <span>
            {r.durationEst ? 'ca. ' : ''}
            {fmtRunTime(r.durationSec)}
            <small>tid</small>
          </span>
        )}
        {pace && (
          <span>
            {fmtPace(pace)}
            <small>/km</small>
          </span>
        )}
      </div>
      {(type || route) && (
        <div className="tiny muted" style={{ marginTop: 2 }}>
          {[type?.label, route ? `rute: ${route.name}` : null].filter(Boolean).join(' · ')}
        </div>
      )}
      {prs.length > 0 && (
        <div className="row" style={{ flexWrap: 'wrap', marginTop: 8, gap: 6 }}>
          {prs.map((p, i) => (
            <span key={i} className="badge-pr">
              🏆 {p.label} {p.value}
            </span>
          ))}
        </div>
      )}
      {missing && w.userId === me && (
        <button className="tiny" style={{ marginTop: 6, color: 'var(--gold)', textAlign: 'left' }} onClick={() => go(`lop/rediger/${id}`)}>
          + Legg til {missing} for tempo og rekorder
        </button>
      )}
    </>
  )
}
