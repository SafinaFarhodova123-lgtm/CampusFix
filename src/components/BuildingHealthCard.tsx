import { Link } from 'react-router-dom'
import { ArrowRight, Building2, Plus } from 'lucide-react'
import type { Building, BuildingHealth } from '../lib/types'
import { HEALTH_BAND_META, healthBand } from '../lib/health'
import { PRIORITY_LABEL } from '../lib/constants'
import { PRIORITY_ORDER } from '../lib/mapMarkers'
import { cx } from './ui'

export function HealthRing({ score, size = 64 }: { score: number | null; size?: number }) {
  const meta = HEALTH_BAND_META[healthBand(score)]
  const r = (size - 8) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={score === null ? 'Health: insufficient data' : `Health score ${score} of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E7ECF2" strokeWidth={7} />
        {score !== null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={meta.color}
            strokeWidth={7}
            strokeLinecap="round"
            strokeDasharray={`${(score / 100) * c} ${c}`}
            style={{ transition: 'stroke-dasharray .6s ease' }}
          />
        )}
      </svg>
      <span className={cx('absolute inset-0 grid place-items-center font-bold tabular-nums', score === null ? 'text-[11px] text-muted' : size > 60 ? 'text-lg' : 'text-sm')}>
        {score === null ? 'N/A' : score}
      </span>
    </div>
  )
}

export function PriorityChips({ health }: { health: BuildingHealth }) {
  const chips = PRIORITY_ORDER.filter((p) => health.openByPriority[p] > 0)
  if (!chips.length) return <span className="text-xs text-muted">No open verified issues</span>
  const cls: Record<string, string> = {
    critical: 'bg-danger-600 text-white',
    high: 'bg-danger-50 text-danger-700',
    medium: 'bg-orange-50 text-orange-800',
    low: 'bg-brand-50 text-brand-700',
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((p) => (
        <span key={p} className={cx('rounded-md px-1.5 py-0.5 text-[11px] font-semibold', cls[p])}>
          {health.openByPriority[p]} {PRIORITY_LABEL[p]}
        </span>
      ))}
    </div>
  )
}

export function BuildingHealthCard({ building, health, rank }: { building: Building; health: BuildingHealth; rank?: number }) {
  const meta = HEALTH_BAND_META[healthBand(health.score)]
  return (
    <article className="card flex flex-col gap-4 p-5">
      <div className="flex items-start gap-4">
        <HealthRing score={health.score} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {rank != null && <span className="text-xs font-semibold tabular-nums text-muted">#{rank}</span>}
            <h3 className="truncate font-semibold">{building.name}</h3>
          </div>
          <p className={cx('mt-0.5 text-sm font-medium', meta.text)}>{meta.label}</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full" style={{ width: `${health.score ?? 0}%`, background: meta.color }} />
          </div>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-canvas px-3 py-2">
          <dt className="text-xs text-muted">Open issues</dt>
          <dd className="text-lg font-bold tabular-nums">{health.openIssues}</dd>
        </div>
        <div className="rounded-xl bg-canvas px-3 py-2">
          <dt className="text-xs text-muted">Resolved</dt>
          <dd className="text-lg font-bold tabular-nums">{health.resolvedIssues}</dd>
        </div>
      </dl>
      <PriorityChips health={health} />
      <div className="mt-auto flex gap-2 pt-1">
        <Link to={`/map?building=${building.slug}`} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-navy-900 px-3 py-2 text-sm font-semibold text-white hover:bg-navy-800">
          <Building2 className="size-4" /> View Building
        </Link>
        <Link to={`/issues?building=${building.id}`} className="inline-flex items-center justify-center gap-1 rounded-xl border border-line px-3 py-2 text-sm font-semibold hover:bg-slate-50" aria-label={`Issues in ${building.name}`}>
          Issues <ArrowRight className="size-4" />
        </Link>
      </div>
    </article>
  )
}

/** Non-map fallback: every building with its health and a report shortcut. */
export function BuildingDirectory({ buildings, health, onSelect }: { buildings: Building[]; health: Record<string, BuildingHealth>; onSelect?: (id: string) => void }) {
  return (
    <ul className="divide-y divide-line">
      {buildings.map((b) => {
        const h = health[b.id]
        return (
          <li key={b.id} className="flex items-center gap-3 p-3.5">
            <HealthRing score={h?.score ?? null} size={44} />
            <button className="min-w-0 flex-1 text-left" onClick={() => onSelect?.(b.id)}>
              <p className="truncate font-semibold">{b.name}</p>
              <p className="text-xs text-muted">
                {h?.openIssues ?? 0} open · {h?.resolvedIssues ?? 0} resolved
              </p>
            </button>
            <Link to={`/report?building=${b.slug}`} className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100">
              <Plus className="size-3.5" /> Report
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
