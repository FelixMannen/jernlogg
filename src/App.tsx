import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { MeContext, useMe, useRoute, Icon, ToastHost, ConfirmHost, useNow, vibrate, beep, toast } from './components/ui'
import { init, useStoreVersion, getStatus } from './lib/store'
import { USERS, userById } from './lib/domain'
import { activeWorkout, fmtDuration, doneWorkouts, activeWorkouts, prsForWorkout } from './lib/stats'
import { getRest, subscribeRest, adjustRest, stopRest } from './lib/actions'
import { list } from './lib/store'
import type { Reaction, Comment, UserId } from './lib/domain'
import { FeedPage } from './pages/Feed'
import { WorkoutPage } from './pages/Workout'
import { WorkoutDetailPage } from './pages/WorkoutDetail'
import { LeaderboardPage } from './pages/Leaderboard'
import { TemplatesPage } from './pages/Templates'
import { ProfilePage } from './pages/Profile'
import { ExerciseDetailPage } from './pages/ExerciseDetail'
import { ToolsPage } from './pages/Tools'
import { FeedbackPage } from './pages/Feedback'
import { SupplementsTodayPage } from './components/Supplements'
import { ImportPage } from './pages/Import'
import { RunStartPage, RunFormPage } from './pages/Run'
import { stopwatchElapsed } from './lib/actions'
import { syncSubscription } from './lib/push'

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

function useFriendNotifications(me: string) {
  const v = useStoreVersion()
  const seen = useRef<{ done: Set<string>; live: Set<string>; social: Set<string> } | null>(null)
  useEffect(() => {
    if (getStatus().status === 'loading') return
    const done = doneWorkouts().filter((w) => w.data.userId !== me)
    const live = activeWorkouts().filter((w) => w.data.userId !== me)
    const myIds = new Set(doneWorkouts(me).map((w) => w.id))
    const social = [
      ...list<Reaction>('reactions').filter((r) => myIds.has(r.data.workoutId) && r.data.userId !== me),
      ...list<Comment>('comments').filter((c) => myIds.has(c.data.workoutId) && c.data.userId !== me),
    ]
    if (!seen.current) {
      seen.current = { done: new Set(done.map((w) => w.id)), live: new Set(live.map((w) => w.id)), social: new Set(social.map((d) => d.id)) }
      return
    }
    for (const d of social) {
      if (seen.current.social.has(d.id)) continue
      seen.current.social.add(d.id)
      const who = userById(d.data.userId).name
      const text = d.collection === 'comments' ? `${who} kommenterte: «${(d.data as Comment).text.slice(0, 60)}»` : `${who} reagerte ${(d.data as Reaction).emoji} på økta di`
      toast(text, undefined, { label: 'Se', run: () => (location.hash = `/w/${d.data.workoutId}`) })
    }
    for (const w of done) {
      if (seen.current.done.has(w.id)) continue
      seen.current.done.add(w.id)
      if (Date.now() - Date.parse(w.data.endedAt ?? w.data.startedAt) > 15 * 60000) continue
      const prs = prsForWorkout(w.id, w.data)
      toast(`${userById(w.data.userId).name} fullførte ${w.data.title}${prs.length ? ` med ${prs.length} PR 🏆` : ' 💪'}`, prs.length ? 'pr' : undefined, {
        label: 'Se',
        run: () => (location.hash = `/w/${w.id}`),
      })
    }
    for (const w of live) {
      if (seen.current.live.has(w.id)) continue
      seen.current.live.add(w.id)
      toast(`${userById(w.data.userId).name} har startet en økt 🔥`)
    }
  }, [v, me])
}

function Shell() {
  useStoreVersion()
  const { me } = useMe()
  useEffect(() => {
    syncSubscription(me as UserId)
  }, [me])
  useFriendNotifications(me)
  const route = useRoute()
  const [r0, r1, r2] = route
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route.join('/')])

  let page
  switch ((r0 || '').split('?')[0]) {
    case 'import':
      page = <ImportPage key={location.hash} />
      break
    case 'okt':
      page = <WorkoutPage />
      break
    case 'lop': {
      const sub = (r1 || '').split('?')[0]
      page =
        sub === 'ny' ? <RunFormPage key={location.hash} /> : sub === 'rediger' ? <RunFormPage key={location.hash} editId={(r2 || '').split('?')[0]} /> : <RunStartPage />
      break
    }
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
    case 'supplementer':
      page = <SupplementsTodayPage />
      break
    case 'tilbakemeldinger':
      page = <FeedbackPage />
      break
    case 'verktoy':
      page = <ToolsPage />
      break
    case 'ex':
      page = <ExerciseDetailPage key={r1 + r2} id={r1} userId={r2} />
      break
    default:
      page = <FeedPage />
  }
  const st = getStatus()
  const resting = !!useSyncExternalStore(subscribeRest, getRest)
  return (
    <div className={`app ${resting ? 'resting' : ''}`}>
      {st.status === 'loading' ? <div className="empty">Laster…</div> : page}
      <RestTimer />
      <UpdateBanner />
      <Nav current={(r0 || 'feed').split('?')[0]} />
    </div>
  )
}

function Nav({ current }: { current: string }) {
  return (
    <nav className="nav">
      <div className="nav-inner">
        <NavLink to="feed" label="Feed" icon={<Icon.feed />} on={current === 'feed' || current === 'w'} />
        <NavLink to="topp" label="Topplister" icon={<Icon.trophy />} on={current === 'topp' || current === 'ex'} />
        <StartLink on={current === 'okt' || current === 'import' || current === 'lop'} />
        <NavLink to="maler" label="Maler" icon={<Icon.list />} on={current === 'maler'} />
        <NavLink to="profil" label="Profil" icon={<Icon.user />} on={current === 'profil' || current === 'u' || current === 'verktoy' || current === 'tilbakemeldinger' || current === 'supplementer'} />
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
      <span className="start-btn">
        {active ? (
          <span className="num" style={{ fontSize: '0.9375rem', fontWeight: 700 }}>
            {fmtDuration(active.data.kind === 'run' ? stopwatchElapsed(active.data, now) : now - Date.parse(active.data.startedAt)).replace(/^(\d+:\d+):\d+$/, '$1')}
          </span>
        ) : (
          <Icon.plus />
        )}
      </span>
      {active ? (active.data.kind === 'run' ? 'Løper' : 'Økt') : 'Start'}
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
    beep(3)
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

function currentBundle() {
  return [...document.scripts].map((s) => s.src).find((src) => src.includes('/assets/index-')) ?? ''
}
function UpdateBanner() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!import.meta.env.PROD) return
    const mine = currentBundle()
    const check = async () => {
      try {
        const html = await (await fetch('/', { cache: 'no-store' })).text()
        const m = html.match(/\/assets\/index-[^"]+\.js/)
        if (m && mine && !mine.endsWith(m[0])) setReady(true)
      } catch {}
    }
    const t = setInterval(check, 5 * 60000)
    const onVis = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', onVis)
    check()
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])
  if (!ready) return null
  return (
    <button className="update-banner" onClick={() => location.reload()}>
      Ny versjon av appen er klar · <b>Oppdater</b>
    </button>
  )
}
