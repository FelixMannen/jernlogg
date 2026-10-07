import { useEffect, useRef, useState } from 'react'
import { requestCode, verifyCode, register, claimLegacy, peekLink, takeLink, retryAuth, signOut } from '../lib/auth'
import { isLocal } from '../lib/supabase'
import { IdentityFields } from '../components/Account'
import { USER_COLORS, LEGACY_USERS } from '../lib/domain'
import { Icon } from '../components/ui'
import { isIOS, isStandalone } from '../lib/push'

function linkInfo(hash: string | null): { kind: 'claim'; legacy: string; code: string } | { kind: 'invite'; code: string } | null {
  if (!hash) return null
  const parts = hash.replace(/^#?\/?/, '').split('/')
  if (parts[0] === 'koble' && parts[1] && parts[2]) return { kind: 'claim', legacy: parts[1], code: parts[2] }
  if (parts[0] === 'bli-med' && parts[1]) return { kind: 'invite', code: parts[1] }
  return null
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="picker auth">
      <h1>
        Jern
        <br />
        logg
      </h1>
      {children}
    </div>
  )
}

export function LoadingScreen() {
  return (
    <div className="picker auth">
      <div className="empty">Laster…</div>
    </div>
  )
}

export function AuthErrorScreen({ message }: { message: string }) {
  return (
    <AuthShell>
      <p className="muted" style={{ margin: '12px 0 20px' }}>
        {message}
      </p>
      <button className="btn primary big block" onClick={retryAuth}>
        Prøv igjen
      </button>
      <button className="btn ghost block" style={{ marginTop: 8 }} onClick={() => signOut()}>
        Logg ut
      </button>
    </AuthShell>
  )
}

export function LoginPage() {
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem('jernlogg.lastEmail') || ''
    } catch {
      return ''
    }
  })
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const codeRef = useRef<HTMLInputElement>(null)
  const link = linkInfo(peekLink())
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  useEffect(() => {
    if (!cooldown) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const send = async () => {
    if (!validEmail || busy) return
    setBusy(true)
    setErr('')
    try {
      await requestCode(email.trim().toLowerCase())
      try {
        localStorage.setItem('jernlogg.lastEmail', email.trim().toLowerCase())
      } catch {}
      setStep('code')
      setCooldown(60)
      setTimeout(() => codeRef.current?.focus(), 50)
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }
  const verify = async (c = code) => {
    const digits = c.replace(/\D/g, '')
    if (digits.length < 6 || busy) return
    setBusy(true)
    setErr('')
    try {
      await verifyCode(email.trim().toLowerCase(), digits)
    } catch (e: any) {
      setErr(e.message)
      setBusy(false)
    }
  }

  return (
    <AuthShell>
      <p className="muted" style={{ margin: '12px 0 24px' }}>
        {link?.kind === 'invite'
          ? 'Logg inn for å bli med i gruppa du er invitert til.'
          : link?.kind === 'claim'
            ? `Logg inn for å koble kontoen din til ${LEGACY_USERS.find((u) => u.id === link.legacy)?.name ?? 'din'} sin historikk.`
            : 'Styrke- og løpelogg for deg og gjengen din.'}
      </p>
      {link && isIOS() && !isStandalone() && <OpenInAppCard hash={peekLink() ?? ''} kind={link.kind} />}
      {step === 'email' ? (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
        >
          <label className="field">
            <span>E-post</span>
            <input
              className="input big"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="navn@eksempel.no"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <button className="btn primary big block" type="submit" disabled={!validEmail || busy}>
            {busy ? 'Sender…' : 'Send meg en kode'}
          </button>
          <p className="tiny muted">Ingen passord. Du får en 6-sifret kode på e-post, og appen husker deg etterpå.</p>
        </form>
      ) : (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault()
            verify()
          }}
        >
          <p className="small">
            Vi har sendt en kode til <b>{email.trim()}</b>.
          </p>
          <label className="field">
            <span>Kode fra e-posten</span>
            <input
              ref={codeRef}
              className="input big num code-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={10}
              placeholder="123456"
              value={code}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '')
                setCode(v)
                if (v.length === 6) verify(v)
              }}
            />
          </label>
          <button className="btn primary big block" type="submit" disabled={code.length < 6 || busy}>
            {busy ? 'Logger inn…' : 'Logg inn'}
          </button>
          <div className="spread">
            <button type="button" className="btn ghost smallall" onClick={() => (setStep('email'), setCode(''), setErr(''))}>
              Bytt e-post
            </button>
            <button type="button" className="btn ghost smallall" disabled={cooldown > 0 || busy} onClick={send}>
              {cooldown > 0 ? `Ny kode om ${cooldown} s` : 'Send ny kode'}
            </button>
          </div>
          <p className="tiny muted">Finner du den ikke? Sjekk søppelpost. Koden gjelder i én time.</p>
          {isLocal && <p className="tiny muted">Testmodus: koden er 123456.</p>}
        </form>
      )}
      {err && (
        <p className="small" role="alert" style={{ color: 'var(--bad)', marginTop: 12 }}>
          {err}
        </p>
      )}
    </AuthShell>
  )
}

/** iPhone opens links in Safari even when Jernlogg is on the home screen – offer to copy the link into the app. */
function OpenInAppCard({ hash, kind }: { hash: string; kind: 'claim' | 'invite' }) {
  const [copied, setCopied] = useState(false)
  const [manual, setManual] = useState(false)
  const url = `${location.origin}/${hash.replace(/^\/?/, '')}`
  return (
    <section className="card stack" style={{ marginBottom: 16 }}>
      <b className="small">Har du Jernlogg på hjem-skjermen?</b>
      <p className="tiny muted" style={{ margin: 0 }}>
        Da er du kanskje allerede logget inn der. Kopier {kind === 'invite' ? 'invitasjonen' : 'lenken'}, åpne appen og lim den inn under Profil → 👥 Grupper → «Har du fått en invitasjon?».
      </p>
      <button
        className="btn block"
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url)
            setCopied(true)
          } catch {
            setManual(true)
          }
        }}
      >
        {copied ? 'Kopiert ✓ – åpne appen og lim inn' : 'Kopier lenken'}
      </button>
      {manual && <input className="input tiny" readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Lenke å kopiere" />}
    </section>
  )
}

export function OnboardingPage({ email }: { email: string }) {
  const [v, setV] = useState(() => ({ name: '', color: USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)], emoji: '' }))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const link = linkInfo(peekLink())
  const claim = link?.kind === 'claim' ? link : null
  const legacyName = claim ? LEGACY_USERS.find((u) => u.id === claim.legacy)?.name ?? claim.legacy : ''

  const doClaim = async () => {
    if (!claim) return
    setBusy(true)
    setErr('')
    try {
      await claimLegacy(claim.legacy, claim.code)
      takeLink()
      location.hash = '/feed'
    } catch (e: any) {
      setErr(e.message)
      setBusy(false)
    }
  }

  return (
    <div className="picker auth onboarding">
      <h1 style={{ fontSize: '2.25rem' }}>Velkommen!</h1>
      <p className="muted small" style={{ margin: '6px 0 20px' }}>
        Logget inn som {email || 'ny bruker'}.
      </p>
      {claim ? (
        <div className="stack">
          <section className="card stack">
            <h2>Er du {legacyName}?</h2>
            <p className="small muted" style={{ margin: 0 }}>
              Koble denne innloggingen til {legacyName} sin økthistorikk i Jernlogg. Alt du har logget før blir med.
            </p>
            <button className="btn primary big block" disabled={busy} onClick={doClaim}>
              {busy ? 'Kobler…' : `Ja, koble til ${legacyName}`}
            </button>
          </section>
          <button className="btn ghost block" onClick={() => (takeLink(), location.reload())}>
            Nei, jeg er ny – lag en ny profil
          </button>
        </div>
      ) : (
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!v.name.trim() || busy) return
            setBusy(true)
            setErr('')
            try {
              await register(v.name.trim(), v.color, v.emoji || undefined)
              const pending = takeLink()
              location.hash = pending && linkInfo(pending)?.kind === 'invite' ? pending.replace(/^#/, '') : '/grupper'
            } catch (e: any) {
              setErr(e.message)
              setBusy(false)
            }
          }}
        >
          <h2>Hva skal vi kalle deg?</h2>
          <IdentityFields {...v} onChange={setV} />
          <button className="btn primary big block" type="submit" disabled={!v.name.trim() || busy}>
            {busy ? 'Lager profil…' : 'Kom i gang'} <Icon.chevron />
          </button>
          <p className="tiny muted">
            Har du brukt Jernlogg før (David eller Erik)? Be Felix om en koblingslenke og åpne den, så får du med deg historikken din.
          </p>
        </form>
      )}
      {err && (
        <p className="small" role="alert" style={{ color: 'var(--bad)', marginTop: 12 }}>
          {err}
        </p>
      )}
    </div>
  )
}

/** Opened while already signed in (e.g. David made a new profile by mistake before using his link). */
export function ClaimPage({ legacy, code }: { legacy: string; code: string }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const name = LEGACY_USERS.find((u) => u.id === legacy)?.name ?? legacy
  return (
    <div className="page stack" style={{ paddingTop: 24 }}>
      <h1>Koble til {name}</h1>
      <p className="small muted">
        Denne lenken kobler innloggingen din til {name} sin økthistorikk. Har du laget en ny profil i mellomtiden, blir den liggende igjen (og øktene i den følger ikke med).
      </p>
      <button
        className="btn primary big block"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setErr('')
          try {
            await claimLegacy(legacy, code)
            location.hash = '/feed'
          } catch (e: any) {
            setErr(e.message)
            setBusy(false)
          }
        }}
      >
        {busy ? 'Kobler…' : `Koble til ${name}`}
      </button>
      <a className="btn ghost block" href="#/feed">
        Avbryt
      </a>
      {err && (
        <p className="small" role="alert" style={{ color: 'var(--bad)' }}>
          {err}
        </p>
      )}
    </div>
  )
}
