import { useState } from 'react'
import { TopBar, back, PlateBar } from '../components/ui'
import { e1rm, fmtKg } from '../lib/stats'

function Num({ label, value, onChange, step = 2.5 }: { label: string; value: number; onChange: (n: number) => void; step?: number }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="row">
        <button className="btn" onClick={() => onChange(Math.max(0, Math.round((value - step) * 100) / 100))} aria-label={`Minus ${step}`}>
          −
        </button>
        <input
          className="input num"
          style={{ textAlign: 'center', fontSize: '1.5rem', fontWeight: 700 }}
          inputMode="decimal"
          value={String(value).replace('.', ',')}
          onChange={(e) => {
            const n = parseFloat(e.target.value.replace(',', '.'))
            onChange(isNaN(n) ? 0 : n)
          }}
        />
        <button className="btn" onClick={() => onChange(Math.round((value + step) * 100) / 100)} aria-label={`Pluss ${step}`}>
          +
        </button>
      </div>
    </label>
  )
}

export function ToolsPage() {
  const [total, setTotal] = useState(100)
  const [bar, setBar] = useState(20)
  const [w, setW] = useState(80)
  const [r, setR] = useState(5)
  const max = e1rm(w, r)
  return (
    <>
      <TopBar title="Verktøy" onBack={() => back('profil')} />
      <div className="page stack">
        <section className="card stack">
          <h2>Skivekalkulator</h2>
          <Num label="Totalvekt (kg)" value={total} onChange={setTotal} />
          <div className="field">
            <span>Stang</span>
            <div className="chips" style={{ margin: 0, padding: 0 }}>
              {[20, 15, 10].map((b) => (
                <button key={b} className={`chip ${bar === b ? 'on' : ''}`} onClick={() => setBar(b)}>
                  {b} kg
                </button>
              ))}
            </div>
          </div>
          <div style={{ transform: 'scale(1.4)', transformOrigin: 'left center', padding: '8px 0' }}>
            <PlateBar total={total} bar={bar} />
          </div>
        </section>

        <section className="card stack">
          <h2>1RM-kalkulator</h2>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="grow">
              <Num label="Vekt (kg)" value={w} onChange={setW} />
            </div>
            <div style={{ width: 150 }}>
              <Num label="Reps" value={r} onChange={(n) => setR(Math.max(1, Math.round(n)))} step={1} />
            </div>
          </div>
          <div className="spread">
            <span className="muted">Estimert 1RM</span>
            <span className="num" style={{ fontSize: '2rem', fontWeight: 700 }}>
              {fmtKg(max, 1)} kg
            </span>
          </div>
          <div>
            {[
              [100, 1],
              [95, 2],
              [90, 3],
              [85, 5],
              [80, 6],
              [75, 8],
              [70, 10],
              [65, 12],
              [60, 15],
            ].map(([p, reps]) => (
              <div key={p} className="spread num" style={{ padding: '3px 0' }}>
                <span className="muted" style={{ width: 48 }}>
                  {p} %
                </span>
                <span className="grow muted">~{reps} reps</span>
                <span style={{ fontWeight: 700 }}>{fmtKg(Math.round((max * p) / 100 / 2.5) * 2.5)} kg</span>
              </div>
            ))}
          </div>
          <p className="tiny muted" style={{ margin: 0 }}>
            Epley-formelen. Mest treffsikker for 1–10 reps.
          </p>
        </section>
      </div>
    </>
  )
}
