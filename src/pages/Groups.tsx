import { useEffect, useMemo, useState } from 'react'
import qrcode from 'qrcode-generator'
import { TopBar, back, go, useMe, Avatar, Sheet, toast, confirmDialog, Icon } from '../components/ui'
import { ExercisePicker } from '../components/ExercisePicker'
import { useStoreVersion, getDoc, getStatus } from '../lib/store'
import type { Group, GroupGoal, GroupChallenge } from '../lib/domain'
import { userById, myGroups, groupMembers } from '../lib/users'
import { setScope } from '../lib/scope'
import { fmtKg, fmtVolume, fmtDate, startOfWeek, exerciseById } from '../lib/stats'
import {
  createGroup,
  joinByCode,
  joinPublic,
  leaveGroup,
  kickMember,
  previewByCode,
  previewPublic,
  publicGroups,
  groupBoard,
  updateGroup,
  newInviteCode,
  inviteUrl,
  goalProgressFor,
  goalRange,
  activeChallenge,
  challengeTitle,
  challengeBoard,
  weekStats,
  thisMonday,
  ymd,
  fromYmd,
  GOAL_METRICS,
  CHALLENGES,
  type GroupPreview,
  type BoardRow,
} from '../lib/groups'

const GROUP_EMOJIS = ['🏋️', '🏃', '💪', '🔥', '⚡', '🦍', '🐺', '🏔️', '🚴', '🥇', '🎯', '🍕']

function groupLabel(g: { emoji?: string | null; name: string }) {
  return `${g.emoji ? g.emoji + ' ' : ''}${g.name}`
}

/* =================== list of my groups =================== */
export function GroupsPage() {
  useStoreVersion()
  const { me } = useMe()
  const mine = myGroups(me)
  const [creating, setCreating] = useState(false)
  const [code, setCode] = useState('')
  const [pub, setPub] = useState<GroupPreview[] | null>(null)
  const [pubErr, setPubErr] = useState('')
  const online = getStatus().status !== 'offline'

  useEffect(() => {
    publicGroups()
      .then(setPub)
      .catch((e) => setPubErr(e.message))
  }, [mine.length])

  const codeFrom = (s: string) => {
    const m = /bli-med\/([^/?#\s]+)/.exec(s)
    return (m ? m[1] : s).trim()
  }

  return (
    <>
      <TopBar title="Grupper" onBack={() => back('profil')} />
      <div className="page stack">
        <p className="small muted" style={{ margin: 0 }}>
          Alle økter du logger, teller automatisk i alle gruppene du er med i. Private økter teller ikke.
        </p>
        {mine.length === 0 ? (
          <div className="card nudge">
            <h3>Du er ikke med i noen gruppe ennå</h3>
            <p className="small muted" style={{ margin: '4px 0 0' }}>
              Lag en gruppe og del lenken med vennene dine, eller bli med i en offentlig gruppe under.
            </p>
          </div>
        ) : (
          <div className="list">
            {mine.map((g) => {
              const n = groupMembers(g.id).length
              return (
                <button key={g.id} className="list-item group-item" onClick={() => go(`g/${g.id}`)}>
                  <span className="group-emoji" aria-hidden>
                    {g.data.emoji || '👥'}
                  </span>
                  <span className="grow">
                    <b>{g.data.name}</b>
                    <span className="tiny muted" style={{ display: 'block' }}>
                      {n} {n === 1 ? 'medlem' : 'medlemmer'} · {g.data.public ? 'offentlig' : 'privat'}
                      {g.data.adminId === me ? ' · du er admin' : ''}
                    </span>
                  </span>
                  <Icon.chevron />
                </button>
              )
            })}
          </div>
        )}
        <button className="btn primary big block" onClick={() => setCreating(true)} disabled={!online}>
          <Icon.plus /> Lag ny gruppe
        </button>

        <section className="card stack">
          <h2>Har du fått en invitasjon?</h2>
          <form
            className="row"
            style={{ gap: 8 }}
            onSubmit={(e) => {
              e.preventDefault()
              const c = codeFrom(code)
              if (c) go(`bli-med/${c}`)
            }}
          >
            <input className="input grow" placeholder="Lim inn lenke eller kode" value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="none" aria-label="Invitasjonslenke eller kode" />
            <button className="btn" type="submit" disabled={!codeFrom(code)}>
              Åpne
            </button>
          </form>
        </section>

        <section className="stack" style={{ gap: 8 }}>
          <div className="section-title spread">
            <h2>Offentlige grupper</h2>
            <a className="btn small ghost" href="#/grupper/topp">
              🌍 Toppliste
            </a>
          </div>
          {pubErr && <div className="small muted">Kunne ikke hente offentlige grupper ({online ? pubErr : 'frakoblet'}).</div>}
          {pub && pub.length === 0 && <div className="small muted">Ingen offentlige grupper ennå. Lag en og huk av for «Offentlig».</div>}
          {pub && pub.length > 0 && (
            <div className="list">
              {pub.map((g) => (
                <button key={g.id} className="list-item group-item" onClick={() => go(g.isMember ? `g/${g.id}` : `bli-med/offentlig/${g.id}`)}>
                  <span className="group-emoji" aria-hidden>
                    {g.emoji || '👥'}
                  </span>
                  <span className="grow">
                    <b>{g.name}</b>
                    <span className="tiny muted" style={{ display: 'block' }}>
                      {g.members} {g.members === 1 ? 'medlem' : 'medlemmer'}
                      {g.isMember ? ' · du er med' : ''}
                      {g.description ? ` · ${g.description}` : ''}
                    </span>
                  </span>
                  <Icon.chevron />
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
      {creating && <CreateGroupSheet onClose={() => setCreating(false)} />}
    </>
  )
}

function CreateGroupSheet({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🏋️')
  const [description, setDescription] = useState('')
  const [isPublic, setPublic] = useState(false)
  const [busy, setBusy] = useState(false)
  return (
    <Sheet title="Ny gruppe" onClose={onClose}>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!name.trim() || busy) return
          setBusy(true)
          try {
            const id = await createGroup(name.trim(), emoji, isPublic, description.trim())
            onClose()
            toast('Gruppa er laget – del invitasjonslenken!')
            go(`g/${id}`)
          } catch (err: any) {
            toast(err.message)
            setBusy(false)
          }
        }}
      >
        <label className="field">
          <span>Navn</span>
          <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="f.eks. Gymgjengen" />
        </label>
        <div className="field">
          <span>Symbol</span>
          <div className="swatches">
            {GROUP_EMOJIS.map((e) => (
              <button type="button" key={e} className={`swatch text ${emoji === e ? 'on' : ''}`} aria-pressed={emoji === e} onClick={() => setEmoji(e)}>
                {e}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>Beskrivelse (valgfritt)</span>
          <input className="input" value={description} maxLength={120} onChange={(e) => setDescription(e.target.value)} placeholder="f.eks. Vi trener på SiT Gløshaugen" />
        </label>
        <label className="switch-row">
          <input type="checkbox" checked={isPublic} onChange={(e) => setPublic(e.target.checked)} />
          <span>
            Offentlig gruppe
            <span className="tiny muted" style={{ display: 'block' }}>
              Hvem som helst kan finne og bli med, og gruppa er med på gruppe-topplisten. Kan endres senere.
            </span>
          </span>
        </label>
        <button className="btn primary big block" type="submit" disabled={!name.trim() || busy}>
          {busy ? 'Lager…' : 'Lag gruppe'}
        </button>
      </form>
    </Sheet>
  )
}

/* =================== join via link =================== */
export function JoinPage({ code }: { code: string }) {
  const parts = location.hash.split('/')
  const publicId = code === 'offentlig' ? decodeURIComponent(parts[3] || '') : null
  const [p, setP] = useState<GroupPreview | null | undefined>(undefined)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    ;(publicId ? previewPublic(publicId) : previewByCode(code)).then(setP).catch((e) => setErr(e.message))
  }, [code, publicId])
  const join = async () => {
    setBusy(true)
    try {
      const id = publicId ? await joinPublic(publicId) : await joinByCode(code)
      toast('Du er med! 🎉')
      go(`g/${id}`)
    } catch (e: any) {
      toast(e.message)
      setBusy(false)
    }
  }
  return (
    <>
      <TopBar title="Invitasjon" onBack={() => back('grupper')} />
      <div className="page stack">
        {err && <div className="empty">Kunne ikke åpne invitasjonen: {err}</div>}
        {p === undefined && !err && <div className="empty">Henter gruppa…</div>}
        {p === null && (
          <div className="empty">
            <h3>Fant ingen gruppe</h3>
            <p>Lenken kan være utløpt eller slått av. Be om en ny fra den som inviterte deg.</p>
            <a className="btn" href="#/grupper">
              Til gruppene mine
            </a>
          </div>
        )}
        {p && (
          <section className="card stack join-card">
            <span className="group-emoji big" aria-hidden>
              {p.emoji || '👥'}
            </span>
            <h1>{p.name}</h1>
            {p.description && <p className="small muted" style={{ margin: 0 }}>{p.description}</p>}
            <p className="small muted" style={{ margin: 0 }}>
              {p.members} {p.members === 1 ? 'medlem' : 'medlemmer'} · {p.public ? 'offentlig' : 'privat'} gruppe
            </p>
            {p.isMember ? (
              <button className="btn primary big block" onClick={() => go(`g/${p.id}`)}>
                Du er allerede med – åpne gruppa
              </button>
            ) : (
              <>
                <p className="small" style={{ margin: 0 }}>
                  Når du blir med, ser dere hverandres økter (ikke de private), og øktene dine teller i gruppas topplister og mål.
                </p>
                <button className="btn primary big block" disabled={busy} onClick={join}>
                  {busy ? 'Blir med…' : 'Bli med i gruppa'}
                </button>
              </>
            )}
          </section>
        )}
      </div>
    </>
  )
}

/* =================== one group =================== */
export function GroupPage({ id }: { id: string }) {
  useStoreVersion()
  const { me } = useMe()
  const doc = getDoc<Group>(id)
  const [sheet, setSheet] = useState<null | 'settings' | 'goal' | 'challenge' | 'invite'>(null)
  if (!doc)
    return (
      <>
        <TopBar title="Gruppe" onBack={() => back('grupper')} />
        <div className="empty">
          <h3>Fant ikke gruppa</h3>
          <p>Du er kanskje ikke med i den lenger.</p>
          <a className="btn" href="#/grupper">
            Til gruppene mine
          </a>
        </div>
      </>
    )
  const g = doc.data
  const admin = g.adminId === me
  const members = groupMembers(id)
  return (
    <>
      <TopBar
        title={groupLabel(g)}
        onBack={() => back('grupper')}
        right={
          admin ? (
            <button className="icon-btn" aria-label="Gruppeinnstillinger" onClick={() => setSheet('settings')}>
              <Icon.dots />
            </button>
          ) : undefined
        }
      />
      <div className="page stack">
        <div className="group-head">
          <span className="group-emoji big" aria-hidden>
            {g.emoji || '👥'}
          </span>
          <div className="grow">
            <div className="small muted">
              {members.length} {members.length === 1 ? 'medlem' : 'medlemmer'} · {g.public ? 'offentlig' : 'privat'} · admin {userById(g.adminId).name}
            </div>
            {g.description && <p className="small" style={{ margin: '4px 0 0' }}>{g.description}</p>}
          </div>
        </div>
        <div className="chips">
          <button className="chip" onClick={() => (setScope(id), go('feed'))}>
            📰 Gruppas feed
          </button>
          <button className="chip" onClick={() => (setScope(id), go('topp'))}>
            🏆 Topplister
          </button>
          <button className="chip" onClick={() => setSheet('invite')}>
            ➕ Inviter
          </button>
        </div>

        {members.length <= 1 && <InviteCard g={g} admin={admin} onOpen={() => setSheet('invite')} />}
        <GoalCard id={id} g={g} admin={admin} onEdit={() => setSheet('goal')} />
        <ChallengeCard id={id} g={g} admin={admin} onEdit={() => setSheet('challenge')} />
        <WeekCard id={id} />
        <MembersCard id={id} g={g} me={me} admin={admin} />

        <button
          className="btn ghost block"
          onClick={async () => {
            const others = members.filter((m) => m.userId !== me).length
            const ok = await confirmDialog({
              title: `Forlate ${g.name}?`,
              body: admin && others ? 'Admin-rollen går videre til det medlemmet som har vært med lengst.' : !others ? 'Du er siste medlem, så gruppa blir lagt ned.' : 'Dere slutter å se hverandres økter (med mindre dere er i en annen gruppe sammen).',
              ok: 'Forlat gruppa',
              danger: true,
            })
            if (!ok) return
            try {
              await leaveGroup(id)
              toast(`Du har forlatt ${g.name}`)
              go('grupper')
            } catch (e: any) {
              toast(e.message)
            }
          }}
        >
          Forlat gruppa
        </button>
      </div>
      {sheet === 'invite' && <InviteSheet id={id} g={g} admin={admin} onClose={() => setSheet(null)} />}
      {sheet === 'settings' && <GroupSettingsSheet id={id} g={g} onClose={() => setSheet(null)} />}
      {sheet === 'goal' && <GoalSheet id={id} g={g} onClose={() => setSheet(null)} />}
      {sheet === 'challenge' && <ChallengeSheet id={id} g={g} me={me} onClose={() => setSheet(null)} />}
    </>
  )
}

function InviteCard({ g, admin, onOpen }: { g: Group; admin: boolean; onOpen: () => void }) {
  return (
    <section className="card nudge stack">
      <h3>Inviter noen</h3>
      <p className="small muted" style={{ margin: 0 }}>
        {g.inviteEnabled === false ? (admin ? 'Invitasjonslenken er slått av. Slå den på i innstillingene.' : 'Admin har slått av invitasjonslenken.') : 'Send lenken til vennene dine – de logger inn og er med med én gang.'}
      </p>
      {g.inviteEnabled !== false && (
        <button className="btn primary block" onClick={onOpen}>
          Del invitasjonslenke
        </button>
      )}
    </section>
  )
}

function QR({ text }: { text: string }) {
  const svg = useMemo(() => {
    const q = qrcode(0, 'M')
    q.addData(text)
    q.make()
    const n = q.getModuleCount()
    let d = ''
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`
    return { d, size: n + 4 }
  }, [text])
  return (
    <svg className="qr" viewBox={`0 0 ${svg.size} ${svg.size}`} role="img" aria-label="QR-kode for invitasjonslenken" shapeRendering="crispEdges">
      <rect width={svg.size} height={svg.size} fill="#fff" />
      <path d={svg.d} fill="#111" />
    </svg>
  )
}

function InviteSheet({ id, g, admin, onClose }: { id: string; g: Group; admin: boolean; onClose: () => void }) {
  const url = inviteUrl(g)
  const off = g.inviteEnabled === false
  return (
    <Sheet title="Inviter til gruppa" onClose={onClose}>
      <div className="stack">
        {off ? (
          <>
            <p className="small">Invitasjonslenken er slått av.</p>
            {admin && (
              <button className="btn primary block" onClick={() => updateGroup(id, (x) => ({ ...x, inviteEnabled: true }))}>
                Slå på lenken
              </button>
            )}
          </>
        ) : (
          <>
            <QR text={url} />
            <p className="tiny muted" style={{ textAlign: 'center', margin: 0 }}>
              Vis QR-koden, eller send lenken:
            </p>
            <input className="input tiny" readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Invitasjonslenke" />
            <div className="row" style={{ gap: 8 }}>
              <button
                className="btn grow"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(url)
                    toast('Lenken er kopiert')
                  } catch {
                    toast('Marker lenken og kopier den')
                  }
                }}
              >
                Kopier
              </button>
              {'share' in navigator && (
                <button className="btn primary grow" onClick={() => navigator.share({ title: g.name, text: `Bli med i ${g.name} på Jernlogg 💪`, url }).catch(() => {})}>
                  Del
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </Sheet>
  )
}

function GroupSettingsSheet({ id, g, onClose }: { id: string; g: Group; onClose: () => void }) {
  const [name, setName] = useState(g.name)
  const [emoji, setEmoji] = useState(g.emoji ?? '')
  const [description, setDescription] = useState(g.description ?? '')
  return (
    <Sheet title="Gruppeinnstillinger" onClose={onClose}>
      <div className="stack">
        <label className="field">
          <span>Navn</span>
          <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="field">
          <span>Symbol</span>
          <div className="swatches">
            {GROUP_EMOJIS.map((e) => (
              <button key={e} className={`swatch text ${emoji === e ? 'on' : ''}`} aria-pressed={emoji === e} onClick={() => setEmoji(e)}>
                {e}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>Beskrivelse</span>
          <input className="input" value={description} maxLength={120} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <button
          className="btn primary block"
          disabled={!name.trim()}
          onClick={() => {
            updateGroup(id, (x) => ({ ...x, name: name.trim().slice(0, 40), emoji: emoji || undefined, description: description.trim() || undefined }))
            toast('Lagret')
          }}
        >
          Lagre navn og beskrivelse
        </button>
        <label className="switch-row">
          <input type="checkbox" checked={!!g.public} onChange={(e) => updateGroup(id, (x) => ({ ...x, public: e.target.checked }))} />
          <span>
            Offentlig gruppe
            <span className="tiny muted" style={{ display: 'block' }}>
              Kan finnes og bli med i av alle, og er med på gruppe-topplisten.
            </span>
          </span>
        </label>
        <label className="switch-row">
          <input type="checkbox" checked={g.inviteEnabled !== false} onChange={(e) => updateGroup(id, (x) => ({ ...x, inviteEnabled: e.target.checked }))} />
          <span>
            Invitasjonslenke på
            <span className="tiny muted" style={{ display: 'block' }}>
              Slå av for å stoppe nye medlemmer via lenken.
            </span>
          </span>
        </label>
        <button
          className="btn block"
          onClick={async () => {
            const ok = await confirmDialog({ title: 'Lage ny invitasjonslenke?', body: 'Den gamle lenken slutter å virke.', ok: 'Lag ny lenke' })
            if (!ok) return
            updateGroup(id, (x) => ({ ...x, inviteCode: newInviteCode(), inviteEnabled: true }))
            toast('Ny lenke er laget')
          }}
        >
          Lag ny invitasjonslenke
        </button>
      </div>
    </Sheet>
  )
}

/* ---------- felles mål ---------- */
function fmtMetric(metric: GroupGoal['metric'], v: number) {
  if (metric === 'kg') return fmtVolume(v)
  if (metric === 'km') return `${fmtKg(v, 1)} km`
  return `${v} ${v === 1 ? 'økt' : 'økter'}`
}

function GoalCard({ id, g, admin, onEdit }: { id: string; g: Group; admin: boolean; onEdit: () => void }) {
  const goal = g.goal
  if (!goal)
    return admin ? (
      <section className="card stack">
        <div className="spread">
          <h2>Felles mål</h2>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Sett et mål dere jobber mot sammen, f.eks. «100 km løping i oktober».
        </p>
        <button className="btn block" onClick={onEdit}>
          Sett et felles mål
        </button>
      </section>
    ) : null
  const { done, perUser } = goalProgressFor(id, goal)
  const pct = Math.min(100, (done / goal.target) * 100)
  const { from, to } = goalRange(goal)
  const now = Date.now()
  const daysLeft = Math.ceil((to.getTime() - now) / 86400e3)
  const status = now < from.getTime() ? `starter ${fmtDate(from.toISOString())}` : daysLeft <= 0 ? 'ferdig' : `${daysLeft} ${daysLeft === 1 ? 'dag' : 'dager'} igjen`
  const top = [...perUser.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  return (
    <section className="card stack">
      <div className="spread">
        <h2>{goal.title || 'Felles mål'}</h2>
        {admin && (
          <button className="btn small ghost" onClick={onEdit}>
            Endre
          </button>
        )}
      </div>
      <div className="spread small">
        <span>
          <b className="num" style={{ fontSize: '1.375rem' }}>
            {fmtMetric(goal.metric, done)}
          </b>{' '}
          <span className="muted">av {fmtMetric(goal.metric, goal.target)}</span>
        </span>
        <span className="tiny muted">{status}</span>
      </div>
      <div className="goal-track" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <i style={{ width: `${pct}%` }} />
      </div>
      {pct >= 100 && <div className="small">🎉 Målet er nådd!</div>}
      {top.length > 0 && (
        <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
          {top.map(([u, v]) => (
            <span key={u} className="tiny">
              <i className="dot" style={{ background: userById(u).color }} /> {userById(u).name} {fmtMetric(goal.metric, Math.round(v * 10) / 10)}
            </span>
          ))}
        </div>
      )}
      <div className="tiny muted">
        {fmtDate(from.toISOString())}–{fmtDate(new Date(to.getTime() - 86400e3).toISOString())}
      </div>
    </section>
  )
}

function GoalSheet({ id, g, onClose }: { id: string; g: Group; onClose: () => void }) {
  const today = new Date()
  const monthStart = ymd(new Date(today.getFullYear(), today.getMonth(), 1))
  const monthEnd = ymd(new Date(today.getFullYear(), today.getMonth() + 1, 0))
  const cur = g.goal
  const [metric, setMetric] = useState<GroupGoal['metric']>(cur?.metric ?? 'km')
  const [target, setTarget] = useState(cur ? String(cur.target) : '')
  const [from, setFrom] = useState(cur?.from ?? monthStart)
  const [to, setTo] = useState(cur?.to ?? monthEnd)
  const [title, setTitle] = useState(cur?.title ?? '')
  const n = parseFloat(target.replace(',', '.'))
  const valid = n > 0 && from && to && to >= from
  const auto = `${fmtMetric(metric, n > 0 ? n : 0).replace(/^0 /, '')} ${from === monthStart && to === monthEnd ? 'i ' + today.toLocaleDateString('nb-NO', { month: 'long' }) : 'sammen'}`
  return (
    <Sheet title="Felles mål" onClose={onClose}>
      <div className="stack">
        <div className="field">
          <span>Hva teller</span>
          <div className="chips" style={{ margin: 0, padding: 0, flexWrap: 'wrap' }}>
            {GOAL_METRICS.map((m) => (
              <button key={m.id} className={`chip ${metric === m.id ? 'on' : ''}`} onClick={() => setMetric(m.id)}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>Mål ({GOAL_METRICS.find((m) => m.id === metric)!.unit} til sammen)</span>
          <input className="input num" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder={metric === 'km' ? '100' : metric === 'kg' ? '50000' : '40'} />
        </label>
        <div className="row">
          <label className="field grow">
            <span>Fra</span>
            <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field grow">
            <span>Til og med</span>
            <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Navn (valgfritt)</span>
          <input className="input" value={title} maxLength={50} onChange={(e) => setTitle(e.target.value)} placeholder={n > 0 ? auto : 'f.eks. Oktober-løpet'} />
        </label>
        <button
          className="btn primary big block"
          disabled={!valid}
          onClick={() => {
            updateGroup(id, (x) => ({ ...x, goal: { metric, target: n, from, to, title: title.trim() || auto } }))
            toast('Målet er satt')
            onClose()
          }}
        >
          Lagre mål
        </button>
        {cur && (
          <button
            className="btn ghost block"
            onClick={() => {
              updateGroup(id, (x) => {
                const y = { ...x }
                delete y.goal
                return y
              })
              onClose()
            }}
          >
            Fjern målet
          </button>
        )}
      </div>
    </Sheet>
  )
}

/* ---------- ukas utfordring ---------- */
function fmtChallenge(c: GroupChallenge, v: number) {
  if (c.kind === 'heaviest') return `${fmtKg(v)} kg`
  if (c.kind === 'volume') return fmtVolume(v)
  if (c.kind === 'km') return `${fmtKg(v, 1)} km`
  if (c.kind === 'reps') return `${v} reps`
  return `${v}`
}

function ChallengeCard({ id, g, admin, onEdit }: { id: string; g: Group; admin: boolean; onEdit: () => void }) {
  const c = activeChallenge(g)
  if (!c)
    return admin ? (
      <section className="card stack">
        <h2>Ukas utfordring</h2>
        <p className="small muted" style={{ margin: 0 }}>
          Sett en utfordring for uka, f.eks. «flest pull-ups» eller «flest km».
        </p>
        <button className="btn block" onClick={onEdit}>
          Sett ukas utfordring
        </button>
      </section>
    ) : null
  const rows = challengeBoard(id, c)
  const max = Math.max(1, ...rows.map((r) => r.value))
  const end = new Date(startOfWeek())
  end.setDate(end.getDate() + 7)
  const daysLeft = Math.ceil((end.getTime() - Date.now()) / 86400e3)
  return (
    <section className="card">
      <div className="spread" style={{ marginBottom: 4 }}>
        <h2>🎯 {challengeTitle(c)}</h2>
        {admin && (
          <button className="btn small ghost" onClick={onEdit}>
            Endre
          </button>
        )}
      </div>
      <p className="tiny muted" style={{ margin: '0 0 6px' }}>
        Ukas utfordring · {daysLeft} {daysLeft === 1 ? 'dag' : 'dager'} igjen{c.repeat ? ' · gjentas hver uke' : ''}
      </p>
      {rows.slice(0, 10).map((r, i) => {
        const u = userById(r.userId)
        return (
          <div key={r.userId} className="lb-row">
            <span className={`lb-rank ${i === 0 && r.value > 0 ? 'first' : ''}`}>{r.value > 0 ? i + 1 : '–'}</span>
            <Avatar id={r.userId} size="sm" />
            <div>
              <div className="small" style={{ fontWeight: 600 }}>
                {u.name}
              </div>
              <div className="lb-bar">
                <i style={{ width: `${(r.value / max) * 100}%`, background: u.color }} />
              </div>
            </div>
            <span className="lb-val">{r.value > 0 ? fmtChallenge(c, r.value) : '–'}</span>
          </div>
        )
      })}
    </section>
  )
}

function ChallengeSheet({ id, g, me, onClose }: { id: string; g: Group; me: string; onClose: () => void }) {
  const cur = g.challenge
  const [kind, setKind] = useState<GroupChallenge['kind']>(cur?.kind ?? 'reps')
  const [exerciseId, setExerciseId] = useState<string | undefined>(cur?.exerciseId ?? 'pullups')
  const [repeat, setRepeat] = useState(!!cur?.repeat)
  const [picking, setPicking] = useState(false)
  const needsEx = CHALLENGES.find((c) => c.id === kind)!.needsExercise
  const preview: GroupChallenge = { kind, exerciseId: needsEx ? exerciseId : undefined, weekOf: thisMonday(), repeat }
  return (
    <>
      <Sheet title="Ukas utfordring" onClose={onClose}>
        <div className="stack">
          <div className="list">
            {CHALLENGES.map((c) => (
              <button key={c.id} className={`list-item ${kind === c.id ? 'on' : ''}`} aria-pressed={kind === c.id} onClick={() => setKind(c.id)}>
                <span className="grow">{c.label}</span>
                {kind === c.id && <Icon.check />}
              </button>
            ))}
          </div>
          {needsEx && (
            <button className="btn block" onClick={() => setPicking(true)}>
              Øvelse: <b>{exerciseId ? exerciseById(exerciseId).name : 'velg'}</b>
            </button>
          )}
          <label className="switch-row">
            <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
            <span>Gjenta hver uke</span>
          </label>
          <p className="small muted" style={{ margin: 0 }}>
            Gjelder denne uka (mandag–søndag): «{challengeTitle(preview)}».
          </p>
          <button
            className="btn primary big block"
            disabled={needsEx && !exerciseId}
            onClick={() => {
              updateGroup(id, (x) => ({ ...x, challenge: preview }))
              toast('Utfordringen er satt 🎯')
              onClose()
            }}
          >
            Start utfordringen
          </button>
          {cur && (
            <button
              className="btn ghost block"
              onClick={() => {
                updateGroup(id, (x) => {
                  const y = { ...x }
                  delete y.challenge
                  return y
                })
                onClose()
              }}
            >
              Avslutt utfordringen
            </button>
          )}
        </div>
      </Sheet>
      {picking && (
        <ExercisePicker
          me={me}
          multi={false}
          title="Velg øvelse"
          onClose={() => setPicking(false)}
          onPick={(ids) => {
            setExerciseId(ids[0])
            setPicking(false)
          }}
        />
      )}
    </>
  )
}

/* ---------- this week + members ---------- */
function WeekCard({ id }: { id: string }) {
  const rows = weekStats(id)
  if (rows.length < 2) return null
  return (
    <section className="card">
      <div className="spread" style={{ marginBottom: 6 }}>
        <h2>Denne uka</h2>
        <span className="tiny muted">økter · kg · km</span>
      </div>
      {rows.slice(0, 12).map((r) => (
        <button key={r.userId} className="week-row" onClick={() => go(`u/${r.userId}`)}>
          <Avatar id={r.userId} size="sm" />
          <span className="grow small" style={{ fontWeight: 600 }}>
            {userById(r.userId).name}
          </span>
          <span className="num">{r.sessions}</span>
          <span className="num muted">{r.kg ? fmtVolume(r.kg) : '–'}</span>
          <span className="num muted">{r.km ? fmtKg(r.km, 1) : '–'}</span>
        </button>
      ))}
    </section>
  )
}

function MembersCard({ id, g, me, admin }: { id: string; g: Group; me: string; admin: boolean }) {
  const members = groupMembers(id)
  const [menu, setMenu] = useState<string | null>(null)
  return (
    <section className="card">
      <h2 style={{ marginBottom: 6 }}>Medlemmer</h2>
      <div className="list flush">
        {members.map((m) => {
          const u = userById(m.userId)
          return (
            <div key={m.userId} className="list-item">
              <button className="row grow" style={{ gap: 10, textAlign: 'left' }} onClick={() => go(m.userId === me ? 'profil' : `u/${m.userId}`)}>
                <Avatar id={m.userId} size="sm" />
                <span className="grow">
                  <b>{m.userId === me ? `${u.name} (deg)` : u.name}</b>
                  <span className="tiny muted" style={{ display: 'block' }}>
                    {g.adminId === m.userId ? 'Admin · ' : ''}med siden {fmtDate(m.joinedAt)}
                  </span>
                </span>
              </button>
              {admin && m.userId !== me && (
                <button className="icon-btn" aria-label={`Valg for ${u.name}`} onClick={() => setMenu(m.userId)}>
                  <Icon.dots />
                </button>
              )}
            </div>
          )
        })}
      </div>
      {menu && (
        <Sheet title={userById(menu).name} onClose={() => setMenu(null)}>
          <div className="list">
            <button
              className="list-item"
              onClick={async () => {
                const name = userById(menu).name
                setMenu(null)
                const ok = await confirmDialog({ title: `Gjøre ${name} til admin?`, body: 'Det kan bare være én admin. Du blir vanlig medlem.', ok: 'Gi admin' })
                if (!ok) return
                updateGroup(id, (x) => ({ ...x, adminId: menu }))
                toast(`${name} er admin nå`)
              }}
            >
              👑 Gjør til admin
            </button>
            <button
              className="list-item danger"
              onClick={async () => {
                const name = userById(menu).name
                setMenu(null)
                const ok = await confirmDialog({ title: `Fjerne ${name}?`, body: `${name} forsvinner fra gruppa. Lag gjerne en ny invitasjonslenke etterpå.`, ok: 'Fjern', danger: true })
                if (!ok) return
                try {
                  await kickMember(id, menu)
                  toast(`${name} er fjernet`)
                } catch (e: any) {
                  toast(e.message)
                }
              }}
            >
              Fjern fra gruppa
            </button>
          </div>
        </Sheet>
      )}
    </section>
  )
}

/* =================== group leaderboard (public groups) =================== */
type Period = 'uke' | 'maned' | 'ar'
export function GroupBoardPage() {
  const { me } = useMe()
  const [period, setPeriod] = useState<Period>('uke')
  const [metric, setMetric] = useState<'kg' | 'km'>('kg')
  const [perMember, setPerMember] = useState(false)
  const [rows, setRows] = useState<BoardRow[] | null>(null)
  const [err, setErr] = useState('')
  const range = useMemo(() => {
    const now = new Date()
    const from = period === 'uke' ? startOfWeek() : period === 'maned' ? new Date(now.getFullYear(), now.getMonth(), 1) : new Date(now.getFullYear(), 0, 1)
    const to = period === 'uke' ? new Date(from.getTime() + 7 * 86400e3) : period === 'maned' ? new Date(now.getFullYear(), now.getMonth() + 1, 1) : new Date(now.getFullYear() + 1, 0, 1)
    return { from, to }
  }, [period])
  useEffect(() => {
    setRows(null)
    setErr('')
    groupBoard(range.from, range.to)
      .then(setRows)
      .catch((e) => setErr(e.message))
  }, [range])
  const val = (r: BoardRow) => {
    const v = metric === 'kg' ? r.kg : r.km
    return perMember ? v / Math.max(1, r.members) : v
  }
  const sorted = (rows ?? []).filter((r) => val(r) > 0 || r.isMember).sort((a, b) => val(b) - val(a))
  const max = Math.max(1, ...sorted.map(val))
  const mineIds = new Set(myGroups(me).map((g) => g.id))
  return (
    <>
      <TopBar title="Gruppe-toppliste" onBack={() => back('topp')} />
      <div className="page stack">
        <div className="seg" role="tablist">
          <button role="tab" aria-selected={metric === 'kg'} className={metric === 'kg' ? 'on' : ''} onClick={() => setMetric('kg')}>
            🏋️ Kg løftet
          </button>
          <button role="tab" aria-selected={metric === 'km'} className={metric === 'km' ? 'on' : ''} onClick={() => setMetric('km')}>
            🏃 Km løpt
          </button>
        </div>
        <div className="chips" style={{ margin: 0, padding: 0, flexWrap: 'wrap' }}>
          {(
            [
              ['uke', 'Denne uka'],
              ['maned', 'Denne måneden'],
              ['ar', 'I år'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} className={`chip ${period === k ? 'on' : ''}`} onClick={() => setPeriod(k)}>
              {l}
            </button>
          ))}
          <button className={`chip ${perMember ? 'on' : ''}`} onClick={() => setPerMember((p) => !p)} aria-pressed={perMember}>
            Per medlem
          </button>
        </div>
        {err && <div className="small muted">Kunne ikke hente topplisten ({err}).</div>}
        {!rows && !err && <div className="empty small">Henter…</div>}
        {rows && sorted.length === 0 && (
          <div className="empty">
            <h3>Ingen offentlige grupper har trent {period === 'uke' ? 'denne uka' : period === 'maned' ? 'denne måneden' : 'i år'} ennå</h3>
            <p>Gjør gruppa di offentlig i gruppeinnstillingene for å være med.</p>
          </div>
        )}
        {sorted.length > 0 && (
          <section className="card">
            {sorted.slice(0, 50).map((r, i) => (
              <button key={r.id} className={`lb-row group-row ${mineIds.has(r.id) ? 'mine' : ''}`} style={{ width: '100%', textAlign: 'left' }} onClick={() => go(r.isMember ? `g/${r.id}` : `bli-med/offentlig/${r.id}`)}>
                <span className={`lb-rank ${i === 0 && val(r) > 0 ? 'first' : ''}`}>{val(r) > 0 ? i + 1 : '–'}</span>
                <span className="group-emoji sm" aria-hidden>
                  {r.emoji || '👥'}
                </span>
                <div>
                  <div className="small" style={{ fontWeight: 600 }}>
                    {r.name}{' '}
                    <span className="muted tiny" style={{ fontWeight: 400 }}>
                      {r.members} {r.members === 1 ? 'medlem' : 'medlemmer'}
                      {r.isMember ? ' · din gruppe' : ''}
                    </span>
                  </div>
                  <div className="lb-bar">
                    <i style={{ width: `${(val(r) / max) * 100}%`, background: r.isMember ? 'var(--me)' : 'var(--chalk-2)' }} />
                  </div>
                </div>
                <span className="lb-val">{val(r) > 0 ? (metric === 'kg' ? fmtVolume(val(r)) : `${fmtKg(val(r), 1)} km`) : '–'}</span>
              </button>
            ))}
          </section>
        )}
        <p className="tiny muted">
          Bare offentlige grupper er med. Kg løftet = vekt × reps i alle fullførte arbeidssett. Private økter teller ikke. {fromYmd(ymd(range.from)).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })}–
          {new Date(range.to.getTime() - 86400e3).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })}
        </p>
      </div>
    </>
  )
}
