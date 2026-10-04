import { useEffect, useState, useSyncExternalStore } from 'react'
import { MeContext, useMe, useRoute, Icon, ToastHost, ConfirmHost, useNow, vibrate } from './components/ui'
import { init, useStoreVersion, getStatus } from './lib/store'
import { USERS, userById } from './lib/domain'
import { activeWorkout, fmtDuration } from './lib/stats'
import { getRest, subscribeRest, adjustRest, stopRest } from './lib/actions'
import { FeedPage } from './pages/Feed'
import { WorkoutPage } from './pages/Workout'
import { WorkoutDetailPage } from './pages/WorkoutDetail'
import { LeaderboardPage } from './pages/Leaderboard'
import { TemplatesPage } from './pages/Templates'
import { ProfilePage } from './pages/Profile'
import { ExerciseDetailPage } from './pages/ExerciseDetail'

init()

const ME_KEY = 'jernlogg.me'

export default function App() {
  const [me, setMeState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ME_KEY)
    } catch {
      return null
    }
  })
  const setMe = (id: string | null) => {
    try {
      if (id) localStorage.setItem(ME_KEY, id)
      else localStorage.removeItem(ME_KEY)
    } catch {}
    setMeState(id)
  }
  useEffect(() => {
    const color = me ? userById(me).color : '#eceae4'
    document.documentElement.style.setProperty('--me', color)
    document.documentElement.style.setProperty('--me-ink', me === 'erik' ? '#1a1400' : '#fff')
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', '#15181c')
  }, [me])

  if (!me) return <UserPicker onPick={setMe} />
  return (
    <MeContext.Provider value={{ me, setMe }}>
      <Shell />
      <ToastHost />
      <ConfirmHost />
    </MeContext.Provider>
  )
}

function UserPicker({ onPick }: { onPick: (id: string) => void }) {
  return (
    <div className="picker">
      <h1>
        Jern
        <br />
        logg
      </h1>
      <p className="muted" style={{ margin: '12px 0 32px' }}>
        Hvem er det som trener?
      </p>
      {USERS.map((u) => (
        <button key={u.id} className="picker-btn" onClick={() => onPick(u.id)}>
          <span className="plate-letter lg" style={{ ['--c' as any]: u.color, width: 52, height: 52, fontSize: '1.625rem' }}>
            {u.name[0]}
          </span>
          {u.name}
        </button>
      ))}
      <p className="tiny muted" style={{ marginTop: 24 }}>
        Valget huskes på denne enheten. Du kan bytte under Profil.
      </p>
    </div>
  )
}

function Shell() {
  useStoreVersion()
  const route = useRoute()
  const [r0, r1, r2] = route
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route.join('/')])

  let page
  switch (r0) {
    case 'okt':
      page = <WorkoutPage />
      break
    case 'w':
      page = <WorkoutDetailPage key={r1} id={r1} summary={r2 === 'ferdig'} />
      break
    case 'topp':
      page = <LeaderboardPage />
      break
    case 'maler':
      page = <TemplatesPage />
      break
    case 'profil':
      page = <ProfilePage />
      break
    case 'u':
      page = <ProfilePage key={r1} userId={r1} />
      break
    case 'ex':
      page = <ExerciseDetailPage key={r1 + r2} id={r1} userId={r2} />
      break
    default:
      page = <FeedPage />
  }
  const st = getStatus()
  return (
    <div className="app">
      {st.status === 'loading' ? <div className="empty">Laster…</div> : page}
      <RestTimer />
      <Nav current={r0 || 'feed'} />
    </div>
  )
}

function Nav({ current }: { current: string }) {
  return (
    <nav className="nav">
      <div className="nav-inner">
        <NavLink to="feed" label="Feed" icon={<Icon.feed />} on={current === 'feed' || current === 'w'} />
        <NavLink to="topp" label="Topplister" icon={<Icon.trophy />} on={current === 'topp' || current === 'ex'} />
        <StartLink on={current === 'okt'} />
        <NavLink to="maler" label="Maler" icon={<Icon.list />} on={current === 'maler'} />
        <NavLink to="profil" label="Profil" icon={<Icon.user />} on={current === 'profil' || current === 'u'} />
      </div>
    </nav>
  )
}

function NavLink({ to, label, icon, on }: { to: string; label: string; icon: React.ReactNode; on: boolean }) {
  return (
    <a href={`#/${to}`} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined}>
      {icon}
      {label}
    </a>
  )
}

function StartLink({ on }: { on: boolean }) {
  const { me } = useMe()
  const active = activeWorkout(me)
  const now = useNow(active ? 1000 : 60000)
  return (
    <a href="#/okt" className={`${on ? 'on' : ''} ${active ? 'live' : ''}`} aria-label={active ? 'Pågående økt' : 'Start økt'}>
      <span className="start-btn">{active ? <span className="num" style={{ fontSize: '0.9375rem', fontWeight: 700 }}>{fmtDuration(now - Date.parse(active.data.startedAt)).replace(/^(\d+:\d+):\d+$/, '$1')}</span> : <Icon.plus />}</span>
      {active ? 'Økt' : 'Start'}
    </a>
  )
}

function RestTimer() {
  const rest = useSyncExternalStore(subscribeRest, getRest)
  const now = useNow(250)
  const [buzzed, setBuzzed] = useState<number | null>(null)
  if (!rest) return null
  const left = rest.endAt - now
  if (left <= 0 && buzzed !== rest.endAt) {
    setBuzzed(rest.endAt)
    vibrate([200, 100, 200])
  }
  if (left < -30000) {
    setTimeout(stopRest, 0)
    return null
  }
  const over = left <= 0
  return (
    <div className={`rest ${over ? 'over' : ''}`} role="timer" aria-label="Hviletimer">
      <button onClick={() => adjustRest(-15)} aria-label="Trekk fra 15 sekunder">
        −15
      </button>
      <span className="t">{over ? 'Kjør!' : fmtDuration(left + 999)}</span>
      <button onClick={() => adjustRest(15)} aria-label="Legg til 15 sekunder">
        +15
      </button>
      <button onClick={stopRest} aria-label="Stopp hviletimer">
        <span style={{ display: 'inline-flex', width: 18, height: 18 }}>
          <Icon.x />
        </span>
      </button>
      {!over && (
        <span className="bar">
          <i style={{ width: `${Math.max(0, Math.min(100, (left / (rest.total * 1000)) * 100))}%` }} />
        </span>
      )}
    </div>
  )
}
