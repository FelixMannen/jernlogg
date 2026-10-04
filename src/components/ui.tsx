import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { userById } from '../lib/domain'

/* ---------- icons ---------- */
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
export const Icon = {
  feed: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  ),
  trophy: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
    </svg>
  ),
  plus: () => (
    <svg viewBox="0 0 24 24" {...P} strokeWidth={2.5}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  bar: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M2 12h20M5 8v8M8 6v12M16 6v12M19 8v8" />
    </svg>
  ),
  list: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  ),
  user: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </svg>
  ),
  back: () => (
    <svg viewBox="0 0 24 24" {...P} width="24" height="24">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  ),
  check: () => (
    <svg viewBox="0 0 24 24" {...P} strokeWidth={3}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  ),
  dots: () => (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  ),
  x: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  search: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </svg>
  ),
  chevron: () => (
    <svg viewBox="0 0 24 24" {...P} width="18" height="18">
      <path d="M9 6l6 6-6 6" />
    </svg>
  ),
  trash: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
    </svg>
  ),
  timer: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2 2M9 2h6" />
    </svg>
  ),
  up: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M6 15l6-6 6 6" />
    </svg>
  ),
  down: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  ),
  edit: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4" />
    </svg>
  ),
}

/* ---------- router (hash based) ---------- */
function getHash() {
  return location.hash.replace(/^#\/?/, '') || 'feed'
}
export function useRoute(): string[] {
  const h = useSyncExternalStore(
    (cb) => {
      window.addEventListener('hashchange', cb)
      return () => window.removeEventListener('hashchange', cb)
    },
    getHash,
  )
  return h.split('/').map(decodeURIComponent)
}
export function go(path: string) {
  location.hash = '/' + path
}
export function back(fallback = 'feed') {
  if (history.length > 1 && (window as any).__navCount > 0) history.back()
  else go(fallback)
}
;(window as any).__navCount = -1
window.addEventListener('hashchange', () => ((window as any).__navCount += 1))
;(window as any).__navCount = 0

/* ---------- current user context ---------- */
export const MeContext = createContext<{ me: string; setMe: (id: string | null) => void }>({ me: 'felix', setMe: () => {} })
export const useMe = () => useContext(MeContext)

/* ---------- avatar ---------- */
export function Avatar({ id, size }: { id: string; size?: 'sm' | 'lg' }) {
  const u = userById(id)
  return (
    <span className={`plate-letter ${size ?? ''}`} style={{ ['--c' as any]: u.color }} aria-hidden>
      {u.name[0]}
    </span>
  )
}

/* ---------- sheet / dialog ---------- */
export function Sheet({ title, onClose, children, actions }: { title: string; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])
  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-label={title}>
        <div className="sheet-head">
          <h2>{title}</h2>
          {actions}
          <button className="icon-btn" onClick={onClose} aria-label="Lukk">
            <Icon.x />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}

type ConfirmOpts = { title: string; body?: string; ok: string; danger?: boolean }
let confirmState: (ConfirmOpts & { resolve: (v: boolean) => void }) | null = null
const confirmListeners = new Set<() => void>()
export function confirmDialog(opts: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => {
    confirmState = { ...opts, resolve }
    confirmListeners.forEach((l) => l())
  })
}
export function ConfirmHost() {
  const [, setN] = useState(0)
  useEffect(() => {
    const l = () => setN((n) => n + 1)
    confirmListeners.add(l)
    return () => {
      confirmListeners.delete(l)
    }
  }, [])
  if (!confirmState) return null
  const s = confirmState
  const done = (v: boolean) => {
    confirmState = null
    s.resolve(v)
    setN((n) => n + 1)
  }
  return (
    <div className="scrim" style={{ alignItems: 'center' }} onClick={(e) => e.target === e.currentTarget && done(false)}>
      <div className="dialog" role="alertdialog">
        <h2>{s.title}</h2>
        {s.body && <p className="muted">{s.body}</p>}
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="btn ghost" onClick={() => done(false)}>
            Avbryt
          </button>
          <button className={`btn ${s.danger ? 'danger' : 'primary'}`} onClick={() => done(true)} autoFocus>
            {s.ok}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------- toasts ---------- */
type Toast = { id: number; text: string; kind?: 'pr' }
let toasts: Toast[] = []
const toastListeners = new Set<() => void>()
export function toast(text: string, kind?: 'pr') {
  const t = { id: Date.now() + Math.random(), text, kind }
  toasts = [...toasts, t]
  toastListeners.forEach((l) => l())
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id)
    toastListeners.forEach((l) => l())
  }, 2600)
}
export function ToastHost() {
  const [, setN] = useState(0)
  useEffect(() => {
    const l = () => setN((n) => n + 1)
    toastListeners.add(l)
    return () => {
      toastListeners.delete(l)
    }
  }, [])
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind ?? ''}`}>
          {t.text}
        </div>
      ))}
    </div>
  )
}

/* ---------- confetti ---------- */
export function confetti(colors: string[]) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const host = document.createElement('div')
  host.className = 'confetti'
  for (let i = 0; i < 40; i++) {
    const p = document.createElement('i')
    p.style.left = Math.random() * 100 + '%'
    p.style.background = colors[i % colors.length]
    p.style.animationDelay = Math.random() * 0.3 + 's'
    p.style.animationDuration = 1 + Math.random() * 0.8 + 's'
    host.appendChild(p)
  }
  document.body.appendChild(host)
  setTimeout(() => host.remove(), 2400)
}

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern)
  } catch {}
}

/* ---------- topbar ---------- */
export function TopBar({ title, onBack, right }: { title: ReactNode; onBack?: () => void; right?: ReactNode }) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const f = () => setScrolled(window.scrollY > 4)
    f()
    window.addEventListener('scroll', f, { passive: true })
    return () => window.removeEventListener('scroll', f)
  }, [])
  return (
    <header className={`topbar ${scrolled ? 'scrolled' : ''}`}>
      {onBack && (
        <button className="back" onClick={onBack} aria-label="Tilbake">
          <Icon.back />
        </button>
      )}
      <h1>{title}</h1>
      {right}
    </header>
  )
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}
