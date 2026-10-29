import { useState } from 'react'
import { Link } from 'react-router-dom'
import { cx } from './ui'

/**
 * Small single-series charts. One hue (brand blue) so no categorical palette is needed;
 * values are direct-labeled in text ink, and every chart has a hover/focus tooltip.
 */

export interface BarRow {
  label: string
  value: number
  href?: string
  note?: string
}

/** Horizontal bars, sorted by the caller. Rows are links when `href` is set. */
export function HBarChart({ rows, unit = '', label }: { rows: BarRow[]; unit?: string; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <figure aria-label={label}>
      <ul className="space-y-2.5">
        {rows.map((r) => {
          const inner = (
            <>
              <span className="w-28 shrink-0 truncate text-sm text-ink/80 sm:w-36" title={r.label}>
                {r.label}
              </span>
              <span className="relative h-6 flex-1 rounded-md bg-slate-50">
                <span
                  className="absolute inset-y-0 left-0 rounded-r-[4px] bg-brand-600 transition-all duration-500 group-hover:bg-brand-700"
                  style={{ width: r.value === 0 ? 0 : `max(4px, ${(r.value / max) * 100}%)` }}
                />
              </span>
              <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-ink">
                {r.value}
                {unit}
              </span>
            </>
          )
          return (
            <li key={r.label} title={`${r.label}: ${r.value}${unit}${r.note ? ` · ${r.note}` : ''}`}>
              {r.href ? (
                <Link to={r.href} className="group flex items-center gap-3 rounded-lg focus-visible:outline-2">
                  {inner}
                </Link>
              ) : (
                <div className="group flex items-center gap-3">{inner}</div>
              )}
            </li>
          )
        })}
      </ul>
      <figcaption className="sr-only">
        <table>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <th>{r.label}</th>
                <td>
                  {r.value}
                  {unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  )
}

/** Vertical columns over time (e.g. reports per week) with a hover tooltip. */
export function ColumnChart({ data, label }: { data: { label: string; value: number }[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 560
  const H = 200
  const pad = { top: 16, right: 8, bottom: 26, left: 28 }
  const max = Math.max(1, ...data.map((d) => d.value))
  const ticks = niceTicks(max)
  const top = ticks[ticks.length - 1]
  const innerW = W - pad.left - pad.right
  const innerH = H - pad.top - pad.bottom
  const slot = innerW / data.length
  const bw = Math.min(36, slot * 0.6)
  const y = (v: number) => pad.top + innerH - (v / top) * innerH
  return (
    <figure className="relative" aria-label={label}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} stroke="#E3E8EF" strokeWidth={1} />
            <text x={pad.left - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#64748B">
              {t}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pad.left + slot * i + (slot - bw) / 2
          const h = Math.max(d.value ? 2 : 0, (d.value / top) * innerH)
          return (
            <g key={d.label}>
              <rect
                x={pad.left + slot * i}
                y={pad.top}
                width={slot}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                tabIndex={0}
                role="img"
                aria-label={`Week of ${d.label}: ${d.value} reports`}
              />
              <path
                d={roundedTop(x, y(0) - h, bw, h, Math.min(4, h))}
                fill={hover === i ? '#184A8B' : '#1E5AA8'}
                pointerEvents="none"
              />
              <text x={x + bw / 2} y={H - 8} textAnchor="middle" fontSize={11} fill="#64748B">
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs shadow-pop"
          style={{ left: `${((pad.left + slot * hover + slot / 2) / W) * 100}%`, top: `${(y(data[hover].value) / H) * 100}%` }}
        >
          <span className="block text-muted">Week of {data[hover].label}</span>
          <span className="font-semibold tabular-nums">{data[hover].value} reports</span>
        </div>
      )}
    </figure>
  )
}

function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return ''
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`
}

function niceTicks(max: number): number[] {
  const step = max <= 4 ? 1 : max <= 10 ? 2 : max <= 25 ? 5 : Math.ceil(max / 5 / 5) * 5
  const out: number[] = []
  for (let v = 0; v <= max + step - 1 && out.length < 7; v += step) out.push(v)
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step)
  return out
}

export function Kpi({ label, value, sub, className }: { label: string; value: string | number; sub?: string; className?: string }) {
  return (
    <div className={cx('card p-4 sm:p-5', className)}>
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight sm:text-[28px]">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  )
}
