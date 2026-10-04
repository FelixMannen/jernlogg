import { useEffect, useState } from 'react'
import { toast, useMe, Icon } from './ui'
import type { UserId } from '../lib/domain'
import {
  pushState,
  enablePush,
  disablePush,
  sendTestPush,
  notifyPrefs,
  setNotifyPrefs,
  syncSubscription,
  deviceCount,
  isIOS,
  isStandalone,
  useInstallPrompt,
  type PushState,
} from '../lib/push'

export function InstallGuide({ compact, onClose }: { compact?: boolean; onClose?: () => void }) {
  const install = useInstallPrompt()
  if (isStandalone()) return null
  if (install)
    return (
      <div className="card small install-card">
        <div className="spread">
          <b>Installer Jernlogg som app</b>
          {onClose && (
            <button className="icon-btn" aria-label="Skjul" onClick={onClose}>
              <Icon.x />
            </button>
          )}
        </div>
        <p className="muted" style={{ margin: '4px 0 8px' }}>
          Da får du eget ikon, fullskjerm og push-varsler.
        </p>
        <button className="btn primary block" onClick={install}>
          Installer
        </button>
      </div>
    )
  if (!isIOS()) return null
  return (
    <div className="card small install-card">
      <div className="spread">
        <b>Legg Jernlogg på Hjem-skjermen</b>
        {onClose && (
          <button className="icon-btn" aria-label="Skjul" onClick={onClose}>
            <Icon.x />
          </button>
        )}
      </div>
      {!compact && <p className="muted" style={{ margin: '4px 0 6px' }}>På iPhone må appen åpnes fra Hjem-skjermen for at push-varsler skal virke.</p>}
      <ol className="install-steps">
        <li>
          Trykk på <b>Del</b>-knappen <ShareIcon /> nederst i Safari
        </li>
        <li>
          Velg <b>Legg til på Hjem-skjerm</b>
        </li>
        <li>
          Åpne <b>Jernlogg</b> fra ikonet og slå på varsler under Profil
        </li>
      </ol>
    </div>
  )
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: '-3px' }} aria-label="Del-ikon">
      <path d="M12 3v12M8 7l4-4 4 4M5 11v9h14v-9" />
    </svg>
  )
}

const HOURS = [7, 9, 12, 15, 17, 18, 19, 20, 21]

export function NotificationsSection() {
  const { me } = useMe()
  const [state, setState] = useState<PushState | 'loading'>('loading')
  const [busy, setBusy] = useState(false)
  const prefs = notifyPrefs(me)

  useEffect(() => {
    pushState().then(setState)
    syncSubscription(me as UserId)
  }, [me])

  const turnOn = async () => {
    setBusy(true)
    try {
      const s = await enablePush(me as UserId)
      setState(s)
      if (s === 'on') toast('Varsler er slått på 🔔')
      else if (s === 'denied') toast('Varsler er blokkert i innstillingene')
    } catch (e: any) {
      toast('Kunne ikke slå på varsler: ' + (e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    setBusy(true)
    try {
      const r = await sendTestPush(me as UserId)
      if (r.sent > 0) toast(`Testvarsel sendt til ${r.sent} ${r.sent === 1 ? 'enhet' : 'enheter'}`)
      else toast(r.errors?.[0] ? `Feil: ${r.errors[0]}` : 'Fant ingen enheter med varsler på')
    } catch (e: any) {
      toast(String(e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card stack" id="varsler">
      <div className="spread">
        <h2>Varsler</h2>
        <span className={`fb-status`} style={{ color: state === 'on' ? 'var(--good)' : 'var(--dust)', borderColor: 'currentColor' }}>
          {state === 'on' ? 'På på denne enheten' : state === 'loading' ? '…' : 'Av'}
        </span>
      </div>

      {state === 'needs-install' && <InstallGuide />}
      {state === 'unsupported' && <p className="small muted" style={{ margin: 0 }}>Denne nettleseren støtter ikke push-varsler. Prøv Chrome på Android/PC eller Safari på iPhone (iOS 16.4+, installert på Hjem-skjermen).</p>}
      {state === 'dev' && <p className="small muted" style={{ margin: 0 }}>Varsler er slått av i testmodus. Bruk den publiserte appen.</p>}
      {state === 'denied' && (
        <p className="small muted" style={{ margin: 0 }}>
          Varsler er blokkert. iPhone: Innstillinger → Varslinger → Jernlogg. Android/PC: trykk på hengelåsen ved adressefeltet → Varsler → Tillat.
        </p>
      )}
      {state === 'off' && (
        <button className="btn primary big block" disabled={busy} onClick={turnOn}>
          🔔 Slå på varsler
        </button>
      )}

      {(state === 'on' || state === 'off' || state === 'dev') && (
        <div className="stack" style={{ opacity: state === 'on' ? 1 : 0.6 }}>
          <label className="toggle-row">
            <span>
              <b>Påminnelse om å trene</b>
              <span className="tiny muted" style={{ display: 'block' }}>
                «Du burde trene i dag 💪» når det har gått {prefs.days} {prefs.days === 1 ? 'dag' : 'dager'} siden sist
              </span>
            </span>
            <input type="checkbox" checked={prefs.reminders} onChange={(e) => setNotifyPrefs(me, { reminders: e.target.checked })} />
          </label>
          {prefs.reminders && (
            <>
              <div className="field">
                <span>Etter hvor mange dager uten økt</span>
                <div className="chips" style={{ margin: 0, padding: 0 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} className={`chip ${prefs.days === n ? 'on' : ''}`} onClick={() => setNotifyPrefs(me, { days: n })}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <span>Klokkeslett ({prefs.tz.replace('_', ' ')})</span>
                <div className="chips" style={{ margin: 0, padding: 0, flexWrap: 'wrap' }}>
                  {HOURS.map((h) => (
                    <button key={h} className={`chip ${prefs.hour === h ? 'on' : ''}`} onClick={() => setNotifyPrefs(me, { hour: h, tz: Intl.DateTimeFormat().resolvedOptions().timeZone || prefs.tz })}>
                      {String(h).padStart(2, '0')}:00
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          <label className="toggle-row">
            <span>
              <b>Når en kompis har trent</b>
              <span className="tiny muted" style={{ display: 'block' }}>
                «David trente akkurat 💪 – din tur!»
              </span>
            </span>
            <input type="checkbox" checked={prefs.friends} onChange={(e) => setNotifyPrefs(me, { friends: e.target.checked })} />
          </label>
        </div>
      )}

      {state === 'on' && (
        <div className="row">
          <button className="btn grow" disabled={busy} onClick={test}>
            Send testvarsel
          </button>
          <button
            className="btn ghost"
            disabled={busy}
            onClick={async () => {
              await disablePush()
              setState(await pushState())
              toast('Varsler er slått av på denne enheten')
            }}
          >
            Slå av
          </button>
        </div>
      )}
      {deviceCount(me) > 0 && (
        <p className="tiny muted" style={{ margin: 0 }}>
          Varsler er på for {deviceCount(me)} {deviceCount(me) === 1 ? 'enhet' : 'enheter'} for deg.
        </p>
      )}
    </section>
  )
}
