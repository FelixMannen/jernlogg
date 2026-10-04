import { useState } from 'react'
import { TopBar, Avatar, useMe, back, Sheet, toast, Icon } from '../components/ui'
import { useStoreVersion, type Doc } from '../lib/store'
import { userById, type Feedback, type UserId } from '../lib/domain'
import { fmtRelDate } from '../lib/stats'
import { feedbackList, complaintsFor, complainFeedback, sendFeedback, deleteFeedback } from '../lib/actions'

type Filter = 'alle' | 'venter' | 'fikset'

function statusOf(f: Doc<Feedback>) {
  const complaints = complaintsFor(f.id)
  if (f.data.status === 'done') return { key: 'done', label: '✓ Fikset', color: 'var(--good)' }
  if (complaints.length) return { key: 'redo', label: 'Klage – gjøres på nytt', color: 'var(--bad)' }
  return { key: 'open', label: 'Venter', color: 'var(--gold)' }
}

export function FeedbackPage() {
  useStoreVersion()
  const { me } = useMe()
  const [filter, setFilter] = useState<Filter>('alle')
  const [text, setText] = useState('')
  const [complainOn, setComplainOn] = useState<string | null>(null)
  const all = feedbackList()
  const open = all.filter((f) => f.data.status !== 'done')
  const done = all.filter((f) => f.data.status === 'done')
  const shown = filter === 'venter' ? open : filter === 'fikset' ? done : all

  return (
    <>
      <TopBar title="Tilbakemeldinger" onBack={() => back('profil')} />
      <div className="page stack">
        <section className="card stack">
          <p className="small muted" style={{ margin: 0 }}>
            Alle ønsker og klager fra dere tre. Claude sjekker lista hver gang appen oppdateres, fikser det som venter og huker av. Er du misfornøyd med en løsning, trykk «Tilbakemelding utført dårlig», så blir den gjort på nytt.
          </p>
          <textarea className="input" placeholder="Ny tilbakemelding – f.eks. vil kunne sortere maler" value={text} onChange={(e) => setText(e.target.value)} />
          <button
            className="btn primary block"
            disabled={!text.trim()}
            onClick={() => {
              sendFeedback(me as UserId, text.trim())
              setText('')
              toast('Takk! Tilbakemeldingen er sendt')
            }}
          >
            Send tilbakemelding
          </button>
        </section>

        <div className="chips">
          {(
            [
              ['alle', `Alle (${all.length})`],
              ['venter', `Venter (${open.length})`],
              ['fikset', `Fikset (${done.length})`],
            ] as const
          ).map(([k, l]) => (
            <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>
              {l}
            </button>
          ))}
        </div>

        {shown.length === 0 && (
          <div className="empty small">{filter === 'fikset' ? 'Ingenting er fikset ennå.' : filter === 'venter' ? 'Ingenting venter – alt er gjort.' : 'Ingen tilbakemeldinger ennå.'}</div>
        )}

        {shown.map((f) => (
          <FeedbackCard key={f.id} f={f} me={me} onComplain={() => setComplainOn(f.id)} />
        ))}
      </div>
      {complainOn && <ComplaintSheet id={complainOn} onClose={() => setComplainOn(null)} />}
    </>
  )
}

function FeedbackCard({ f, me, onComplain }: { f: Doc<Feedback>; me: string; onComplain: () => void }) {
  const st = statusOf(f)
  const complaints = complaintsFor(f.id)
  // timeline: earlier attempts and complaints in date order, then the latest fix
  const events = [
    ...(f.data.attempts ?? []).map((a) => ({ kind: 'fix' as const, at: a.doneAt, text: a.reply, userId: undefined as string | undefined })),
    ...complaints.map((c) => ({ kind: 'complaint' as const, at: c.data.at, text: c.data.text, userId: c.data.userId as string | undefined })),
    ...(f.data.status === 'done' && f.data.reply ? [{ kind: 'fix' as const, at: f.data.doneAt ?? f.data.at, text: f.data.reply, userId: undefined }] : []),
  ].sort((a, b) => a.at.localeCompare(b.at))
  const u = userById(f.data.userId)
  return (
    <article className="card fb-card">
      <div className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
        <Avatar id={f.data.userId} size="sm" />
        <div className="grow">
          <div className="spread" style={{ alignItems: 'baseline' }}>
            <span className="small" style={{ fontWeight: 600 }}>
              {u.name} <span className="muted tiny" style={{ fontWeight: 400 }}>· {fmtRelDate(f.data.at)}</span>
            </span>
            <span className="fb-status" style={{ color: st.color, borderColor: st.color }}>
              {st.label}
            </span>
          </div>
          <p style={{ margin: '4px 0 0' }}>{f.data.text}</p>
        </div>
      </div>

      {events.length > 0 && (
        <ol className="fb-timeline">
          {events.map((e, i) => (
            <li key={i} className={e.kind}>
              <div className="tiny muted">
                {e.kind === 'fix' ? 'Claude fikset' : `Klage fra ${userById(e.userId!).name}`} · {fmtRelDate(e.at)}
              </div>
              <div className="small">{e.text}</div>
            </li>
          ))}
        </ol>
      )}

      <div className="row" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
        {f.data.status !== 'done' && f.data.userId === me && complaints.length === 0 && (
          <button className="btn small ghost" onClick={() => deleteFeedback(f.id)}>
            <Icon.x /> Trekk tilbake
          </button>
        )}
        {f.data.status === 'done' && (
          <button className="btn small danger" onClick={onComplain}>
            Tilbakemelding utført dårlig
          </button>
        )}
      </div>
    </article>
  )
}

function ComplaintSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { me } = useMe()
  const [text, setText] = useState('')
  return (
    <Sheet title="Utført dårlig" onClose={onClose}>
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>
          Hva er feil eller mangler med løsningen? Tilbakemeldingen settes tilbake til «venter», klagen logges synlig for alle, og Claude må gjøre den på nytt.
        </p>
        <textarea className="input" style={{ minHeight: 110 }} autoFocus placeholder="f.eks. Knappen er for liten på mobil, og den lagrer ikke valget" value={text} onChange={(e) => setText(e.target.value)} />
        <button
          className="btn primary big block"
          disabled={!text.trim()}
          onClick={() => {
            complainFeedback(id, me as UserId, text.trim())
            toast('Klagen er logget – tilbakemeldingen gjøres på nytt')
            onClose()
          }}
        >
          Send klage
        </button>
      </div>
    </Sheet>
  )
}
