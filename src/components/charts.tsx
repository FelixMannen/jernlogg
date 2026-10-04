import { useId, useState } from 'react'

export type Pt = { x: number; y: number; label?: string }
export type Series = { name: string; color: string; points: Pt[] }

function niceTicks(min: number, max: number, count = 4, integer = false) {
  if (min === max) {
    min = min - 1
    max = max + 1
  }
  const span = max - min
  const step0 = span / count
  const mag = 10 ** Math.floor(Math.log10(step0))
  let step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0
  if (integer) step = Math.max(1, Math.round(step))
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 100) / 100)
  return { lo, hi, ticks }
}

export function LineChart({ series, height = 180, unit = 'kg', fmtX }: { series: Series[]; height?: number; unit?: string; fmtX?: (x: number) => string }) {
  const W = 340
  const H = height
  const pad = { l: 34, r: 10, t: 12, b: 22 }
  const all = series.flatMap((s) => s.points)
  const [hover, setHover] = useState<{ s: number; i: number } | null>(null)
  const gid = useId()
  if (all.length === 0) return <div className="empty small">Ingen data ennå</div>
  const xs = all.map((p) => p.x)
  const ys = all.map((p) => p.y)
  let xMin = Math.min(...xs),
    xMax = Math.max(...xs)
  if (xMin === xMax) {
    xMin -= 86400000 * 3
    xMax += 86400000 * 3
  }
  const integer = ys.every((y) => Number.isInteger(y))
  const { lo, hi, ticks } = integer ? niceTicks(Math.min(...ys) - 1, Math.max(...ys) + 1, 4, true) : niceTicks(Math.min(...ys) * 0.97, Math.max(...ys) * 1.02)
  const sx = (x: number) => pad.l + ((x - xMin) / (xMax - xMin)) * (W - pad.l - pad.r)
  const sy = (y: number) => pad.t + (1 - (y - lo) / (hi - lo || 1)) * (H - pad.t - pad.b)
  const fx = fmtX ?? ((x: number) => new Date(x).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }))
  const single = series.length === 1
  const hp = hover ? series[hover.s].points[hover.i] : null
  return (
    <div style={{ position: 'relative' }}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Graf">
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={series[0].color} stopOpacity="0.28" />
            <stop offset="1" stopColor={series[0].color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} stroke="var(--seam)" strokeDasharray="2 4" />
            <text x={pad.l - 6} y={sy(t) + 4} textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        <text x={pad.l} y={H - 4}>
          {fx(xMin)}
        </text>
        <text x={W - pad.r} y={H - 4} textAnchor="end">
          {fx(xMax)}
        </text>
        {series.map((s, si) => {
          const pts = [...s.points].sort((a, b) => a.x - b.x)
          if (!pts.length) return null
          const d = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ')
          return (
            <g key={si}>
              {single && pts.length > 1 && (
                <path d={`${d} L${sx(pts[pts.length - 1].x)},${H - pad.b} L${sx(pts[0].x)},${H - pad.b} Z`} fill={`url(#${gid})`} />
              )}
              <path d={d} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              {pts.map((p, i) => (
                <circle
                  key={i}
                  cx={sx(p.x)}
                  cy={sy(p.y)}
                  r={hover && hover.s === si && s.points[hover.i] === p ? 5 : 3}
                  fill={s.color}
                  stroke="var(--rubber)"
                  strokeWidth="1.5"
                />
              ))}
              {pts.map((p, i) => (
                <circle
                  key={'h' + i}
                  cx={sx(p.x)}
                  cy={sy(p.y)}
                  r={12}
                  fill="transparent"
                  onPointerEnter={() => setHover({ s: si, i: s.points.indexOf(p) })}
                  onPointerDown={() => setHover({ s: si, i: s.points.indexOf(p) })}
                  onPointerLeave={() => setHover(null)}
                />
              ))}
            </g>
          )
        })}
      </svg>
      {hp && (
        <div
          className="small num"
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            background: 'var(--floor-2)',
            padding: '2px 8px',
            borderRadius: 6,
            pointerEvents: 'none',
          }}
        >
          {hp.label ?? `${Math.round(hp.y * 10) / 10} ${unit}`} · {fx(hp.x)}
        </div>
      )}
    </div>
  )
}

export function BarChart({ data, color, height = 140, fmt }: { data: { label: string; value: number }[]; color: string; height?: number; fmt?: (v: number) => string }) {
  const W = 340
  const H = height
  const pad = { l: 4, r: 4, t: 16, b: 20 }
  const max = Math.max(1, ...data.map((d) => d.value))
  const bw = (W - pad.l - pad.r) / data.length
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Søylediagram">
      {data.map((d, i) => {
        const h = (d.value / max) * (H - pad.t - pad.b)
        const x = pad.l + i * bw + bw * 0.15
        const last = i === data.length - 1
        return (
          <g key={i}>
            <rect x={x} y={H - pad.b - h} width={bw * 0.7} height={Math.max(h, d.value ? 2 : 0)} rx={3} fill={color} opacity={last ? 1 : 0.55} />
            {d.value > 0 && (last || d.value === max) && (
              <text x={x + bw * 0.35} y={H - pad.b - h - 4} textAnchor="middle" style={{ fill: 'var(--chalk-2)' }}>
                {fmt ? fmt(d.value) : d.value}
              </text>
            )}
            {(i % 2 === data.length % 2 || data.length <= 8) && (
              <text x={x + bw * 0.35} y={H - 4} textAnchor="middle">
                {d.label}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
