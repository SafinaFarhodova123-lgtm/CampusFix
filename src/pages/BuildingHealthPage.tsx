import { useState } from 'react'
import { Map } from 'lucide-react'
import { useLoad } from '../context/AppContext'
import { BuildingHealthCard } from '../components/BuildingHealthCard'
import { ButtonLink, PageHeader, Skeleton, cx } from '../components/ui'
import { computeBuildingHealth, HEALTH_BAND_META, PENALTY, RECOVERY_MAX, RECOVERY_PER_ISSUE } from '../lib/health'

type Sort = 'worst' | 'best' | 'name'

export default function BuildingHealthPage() {
  const [sort, setSort] = useState<Sort>('worst')
  const { data } = useLoad(async (api) => {
    const [buildings, issues] = await Promise.all([api.listBuildings(), api.listIssues()])
    return { buildings, issues }
  })
  const rows = (data?.buildings ?? []).map((b) => ({ building: b, health: computeBuildingHealth(b, data!.issues) }))
  rows.sort((a, b) => {
    if (sort === 'name') return a.building.name.localeCompare(b.building.name)
    const sa = a.health.score ?? (sort === 'worst' ? 101 : -1)
    const sb = b.health.score ?? (sort === 'worst' ? 101 : -1)
    return sort === 'worst' ? sa - sb : sb - sa
  })

  return (
    <div>
      <PageHeader
        title="Building Health"
        subtitle="Calculated live from verified reports. An illustrative maintenance indicator, not an official safety assessment."
        actions={<ButtonLink to="/map?mode=health" variant="secondary" icon={Map}>Health map</ButtonLink>}
      />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-line bg-white p-1" role="radiogroup" aria-label="Sort">
          {(
            [
              ['worst', 'Needs attention first'],
              ['best', 'Healthiest first'],
              ['name', 'A–Z'],
            ] as [Sort, string][]
          ).map(([v, l]) => (
            <button
              key={v}
              role="radio"
              aria-checked={sort === v}
              onClick={() => setSort(v)}
              className={cx('rounded-lg px-3 py-1.5 text-sm font-medium transition', sort === v ? 'bg-navy-900 text-white' : 'text-muted hover:text-ink')}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          {(['good', 'attention', 'improve', 'critical', 'none'] as const).map((b) => (
            <span key={b} className="flex items-center gap-1.5 font-medium text-muted">
              <span className="size-2.5 rounded-full" style={{ background: HEALTH_BAND_META[b].color }} /> {HEALTH_BAND_META[b].label}
            </span>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {!data
          ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-72" />)
          : rows.map((r, i) => <BuildingHealthCard key={r.building.id} building={r.building} health={r.health} rank={sort === 'name' ? undefined : i + 1} />)}
      </div>
      <details className="card mt-6 p-5 text-sm">
        <summary className="cursor-pointer font-semibold">How the score works</summary>
        <p className="mt-3 text-muted">
          Each building starts at 100. Every unresolved verified issue subtracts points by priority — critical {PENALTY.critical}, high {PENALTY.high}, medium{' '}
          {PENALTY.medium}, low {PENALTY.low}. Each verified fix in the last 30 days adds {RECOVERY_PER_ISSUE}, up to {RECOVERY_MAX}. Scores are clamped to 0–100.
          Pending, rejected and merged duplicate reports don’t count. Buildings with no verified history show “Insufficient Data”.
        </p>
      </details>
    </div>
  )
}
