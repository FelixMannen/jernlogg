import { useEffect, useState } from 'react'
import { useMe, toast, confirmDialog, go, Sheet } from './ui'
import { setProfile } from '../lib/actions'
import { userById, inkFor } from '../lib/users'
import { USER_COLORS, USER_EMOJIS } from '../lib/domain'
import { signOut, deleteAccount } from '../lib/auth'
import { rpc, getStatus } from '../lib/store'

/** Name, colour and avatar symbol – used at sign-up and in settings. */
export function IdentityFields({
  name,
  color,
  emoji,
  onChange,
  autoFocus,
}: {
  name: string
  color: string
  emoji: string
  onChange: (v: { name: string; color: string; emoji: string }) => void
  autoFocus?: boolean
}) {
  return (
    <div className="stack">
      <div className="row" style={{ gap: 14 }}>
        <span className="plate-letter lg" style={{ ['--c' as any]: color, color: inkFor(color) === '#fff' ? '#111' : '#1a1400' }} aria-hidden>
          {emoji || name.trim()[0]?.toUpperCase() || '?'}
        </span>
        <label className="field grow">
          <span>Navn (vises for gruppene dine)</span>
          <input
            className="input"
            value={name}
            maxLength={30}
            autoComplete="given-name"
            autoFocus={autoFocus}
            placeholder="f.eks. Kari"
            onChange={(e) => onChange({ name: e.target.value, color, emoji })}
          />
        </label>
      </div>
      <div className="field">
        <span>Farge</span>
        <div className="swatches" role="radiogroup" aria-label="Farge">
          {USER_COLORS.map((c) => (
            <button
              type="button"
              key={c}
              role="radio"
              aria-checked={c === color}
              aria-label={`Farge ${c}`}
              className={`swatch ${c === color ? 'on' : ''}`}
              style={{ background: c }}
              onClick={() => onChange({ name, color: c, emoji })}
            />
          ))}
        </div>
      </div>
      <div className="field">
        <span>Symbol (valgfritt)</span>
        <div className="swatches" role="radiogroup" aria-label="Symbol">
          <button type="button" role="radio" aria-checked={!emoji} className={`swatch text ${!emoji ? 'on' : ''}`} onClick={() => onChange({ name, color, emoji: '' })}>
            Aa
          </button>
          {USER_EMOJIS.map((e) => (
            <button type="button" key={e} role="radio" aria-checked={e === emoji} aria-label={`Symbol ${e}`} className={`swatch text ${e === emoji ? 'on' : ''}`} onClick={() => onChange({ name, color, emoji: e })}>
              {e}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function EditIdentitySheet({ onClose }: { onClose: () => void }) {
  const { me } = useMe()
  const u = userById(me)
  const [v, setV] = useState({ name: u.name === 'Tidligere medlem' ? '' : u.name, color: u.color, emoji: u.emoji ?? '' })
  return (
    <Sheet title="Navn og utseende" onClose={onClose}>
      <div className="stack">
        <IdentityFields {...v} onChange={setV} />
        <button
          className="btn primary big block"
          disabled={!v.name.trim()}
          onClick={() => {
            setProfile(me, { name: v.name.trim().slice(0, 30), color: v.color, emoji: v.emoji || undefined })
            toast('Lagret')
            onClose()
          }}
        >
          Lagre
        </button>
      </div>
    </Sheet>
  )
}

/** Account block in settings: who you are, sign out, delete account, privacy. */
export function AccountSection({ onClose }: { onClose: () => void }) {
  const { me, email } = useMe()
  const [edit, setEdit] = useState(false)
  const [del, setDel] = useState(false)
  const u = userById(me)
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="field" style={{ marginBottom: 0 }}>
        <span>Konto</span>
      </div>
      <div className="list">
        <button className="list-item" onClick={() => setEdit(true)}>
          <span className="grow">
            <b>{u.name}</b>
            <span className="tiny muted" style={{ display: 'block' }}>
              {email || 'innlogget'} · trykk for å endre navn, farge og symbol
            </span>
          </span>
        </button>
        <button className="list-item" onClick={() => (onClose(), go('personvern'))}>
          Personvern og dine data
        </button>
        <button
          className="list-item"
          onClick={async () => {
            if (getStatus().pending && !(await confirmDialog({ title: 'Logge ut?', body: `${getStatus().pending} endringer er ikke synkronisert ennå. De lagres på denne enheten og sendes neste gang du logger inn her.`, ok: 'Logg ut' }))) return
            onClose()
            await signOut()
          }}
        >
          Logg ut
        </button>
        <button className="list-item danger" onClick={() => setDel(true)}>
          Slett kontoen min
        </button>
      </div>
      {edit && <EditIdentitySheet onClose={() => setEdit(false)} />}
      {del && <DeleteAccountSheet onClose={() => setDel(false)} />}
    </div>
  )
}

function DeleteAccountSheet({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Sheet title="Slett kontoen min" onClose={onClose}>
      <div className="stack">
        <p className="small">
          Dette sletter <b>alle</b> øktene dine, rekorder, kroppsvekt, supplementer, kommentarer, reaksjoner og tilbakemeldinger, og du forsvinner fra alle grupper. Er du admin, går
          rollen videre til det eldste medlemmet. Det kan ikke angres.
        </p>
        <p className="small muted">Tips: last ned dataene dine først under «Personvern og dine data».</p>
        <label className="field">
          <span>Skriv SLETT for å bekrefte</span>
          <input className="input" value={text} onChange={(e) => setText(e.target.value)} autoCapitalize="characters" />
        </label>
        <button
          className="btn danger big block"
          disabled={text.trim().toUpperCase() !== 'SLETT' || busy}
          onClick={async () => {
            setBusy(true)
            try {
              await deleteAccount()
              toast('Kontoen er slettet')
            } catch (e: any) {
              toast(`Kunne ikke slette: ${e.message}`)
              setBusy(false)
            }
          }}
        >
          {busy ? 'Sletter…' : 'Slett alt for godt'}
        </button>
      </div>
    </Sheet>
  )
}

/** Felix only: links that connect David/Erik's new logins to their existing history. */
export function LegacyLinksSection() {
  const [status, setStatus] = useState<Record<string, boolean> | null>(null)
  const [links, setLinks] = useState<Record<string, string>>({})
  useEffect(() => {
    rpc<Record<string, boolean>>('jl_legacy_status').then(setStatus).catch(() => setStatus(null))
  }, [])
  const make = async (u: string) => {
    try {
      const code = await rpc<string>('jl_create_claim', { p_legacy: u })
      const url = `${location.origin}/#/koble/${u}/${code}`
      setLinks((l) => ({ ...l, [u]: url }))
      try {
        await navigator.clipboard.writeText(url)
        toast('Lenken er kopiert – send den til ' + userById(u).name)
      } catch {}
    } catch (e: any) {
      toast(e.message)
    }
  }
  return (
    <section className="card stack">
      <div>
        <h2>Koble David og Erik</h2>
        <p className="small muted" style={{ margin: '4px 0 0' }}>
          Når de logger inn første gang, kobler lenken kontoen deres til økthistorikken de allerede har. Hver lenke virker én gang.
        </p>
      </div>
      {['david', 'erik', 'felix'].map((u) => (
        <div key={u} className="stack" style={{ gap: 6 }}>
          <div className="spread">
            <span>
              <b>{userById(u).name}</b> <span className="tiny muted">{status ? (status[u] ? '✓ koblet' : 'ikke koblet ennå') : ''}</span>
            </span>
            {status && !status[u] && (
              <button className="btn small" onClick={() => make(u)}>
                Lag lenke
              </button>
            )}
          </div>
          {links[u] && (
            <div className="row" style={{ gap: 6 }}>
              <input className="input tiny" readOnly value={links[u]} onFocus={(e) => e.currentTarget.select()} aria-label={`Koblingslenke for ${userById(u).name}`} />
              {'share' in navigator && (
                <button className="btn small" onClick={() => navigator.share({ title: 'Jernlogg', text: `Koble kontoen din i Jernlogg:`, url: links[u] }).catch(() => {})}>
                  Del
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </section>
  )
}
