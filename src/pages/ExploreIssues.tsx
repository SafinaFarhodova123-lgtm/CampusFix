import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Building2, ChevronRight, LayoutGrid, Map, Plus, Search, SearchX, X } from 'lucide-react'
import { useApp, useLoad } from '../context/AppContext'
import { IssueCard, IssueCardSkeleton } from '../components/IssueCard'
import { IssuesTable } from '../components/IssuesTable'
import { ButtonLink, EmptyState, HealthScore, PageHeader, cx } from '../components/ui'
import { CATEGORIES } from '../lib/constants'
import { applyFilters, isPublic } from '../lib/filters'
import { computeBuildingHealth } from '../lib/health'
import type { IssueFilters } from '../lib/types'

type View = 'list' | 'buildings'

export default function ExploreIssues() {
  const { user } = useApp()
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState<View>('list')
  const isStaff = user?.role === 'staff' || user?.role === 'admin'

  const filters: IssueFilters = {
    search: params.get('q') ?? '',
    buildingId: params.get('building') ?? '',
    category: (params.get('category') ?? '') as IssueFilters['category'],
    status: (params.get('status') ?? '') as IssueFilters['status'],
    sort: (params.get('sort') ?? 'newest') as IssueFilters['sort'],
  }
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next, { replace: true })
  }

  const { data, loading, error } = useLoad(async (api) => {
    const [issues, buildings] = await Promise.all([api.listIssues(), api.listBuildings()])
    return { issues: isStaff ? issues : issues.filter(isPublic), buildings }
  }, [isStaff])

  const results = useMemo(() => (data ? applyFilters(data.issues, filters) : []), [data, params.toString()]) // eslint-disable-line react-hooks/exhaustive-deps
  const activeCount = [filters.search, filters.buildingId, filters.category, filters.status].filter(Boolean).length

  const grouped = useMemo(() => {
    if (!data) return []
    return data.buildings
      .map((b) => ({ building: b, health: computeBuildingHealth(b, data.issues), issues: results.filter((i) => i.buildingId === b.id) }))
      .filter((g) => g.issues.length > 0 || !activeCount)
      .sort((a, b) => b.issues.length - a.issues.length)
  }, [data, results, activeCount])

  return (
    <div>
      <PageHeader
        title={isStaff ? 'All Issues' : 'Explore Issues'}
        subtitle="Search campus maintenance reports and follow the ones that affect you."
        actions={!isStaff && <ButtonLink to="/report" icon={Plus}>Report an Issue</ButtonLink>}
      />

      {/* Filters */}
      <div className="card mb-5 p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-10"
              placeholder="Search by title, room, building, or ID (e.g. CF-1001)"
              value={filters.search}
              onChange={(e) => set('q', e.target.value)}
              aria-label="Search issues"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:flex">
            <select className="input lg:w-40" value={filters.buildingId} onChange={(e) => set('building', e.target.value)} aria-label="Building">
              <option value="">All buildings</option>
              {data?.buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.shortName}
                </option>
              ))}
            </select>
            <select className="input lg:w-44" value={filters.category} onChange={(e) => set('category', e.target.value)} aria-label="Category">
              <option value="">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <select className="input lg:w-40" value={filters.status} onChange={(e) => set('status', e.target.value)} aria-label="Status">
              <option value="">All statuses</option>
              <option value="pending_review">Awaiting review</option>
              <option value="reported">Reported</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
            </select>
            <select className="input lg:w-44" value={filters.sort} onChange={(e) => set('sort', e.target.value === 'newest' ? '' : e.target.value)} aria-label="Sort">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="supporters">Most supported</option>
            </select>
          </div>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted" aria-live="polite">
          {data ? (
            <>
              <span className="font-semibold text-ink">{results.length}</span> {results.length === 1 ? 'issue' : 'issues'}
            </>
          ) : (
            'Loading…'
          )}
          {activeCount > 0 && (
            <button onClick={() => setParams({}, { replace: true })} className="ml-3 inline-flex items-center gap-1 font-semibold text-brand-600 hover:underline">
              <X className="size-3.5" /> Clear filters
            </button>
          )}
        </p>
        <div className="flex items-center gap-1 rounded-xl border border-line bg-white p-1">
          <div className="inline-flex" role="tablist" aria-label="View">
          {(
            [
              ['list', 'List', LayoutGrid],
              ['buildings', 'By building', Building2],
            ] as const
          ).map(([v, label, Icon]) => (
            <button
              key={v}
              role="tab"
              aria-label={label}
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cx('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition', view === v ? 'bg-navy-900 text-white' : 'text-muted hover:text-ink')}
            >
              <Icon className="size-4" /> <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
          
        </div>
          <Link to={filters.buildingId ? `/map?building=${filters.buildingId}` : '/map'} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted hover:text-ink" title="Open the campus map">
            <Map className="size-4" /> <span className="hidden sm:inline">Map</span>
          </Link>
        </div>
      </div>

      {error && <p className="mb-4 rounded-xl bg-danger-50 p-4 text-sm text-danger-700">{error}</p>}

      {loading && !data ? (
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => <IssueCardSkeleton key={i} />)}
        </div>
      ) : results.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={SearchX}
            title="No issues match"
            body="Try a different search or clear filters. If the problem isn’t listed, you can report it."
            action={<ButtonLink to="/report" icon={Plus}>Report an Issue</ButtonLink>}
          />
        </div>
      ) : view === 'list' && isStaff ? (
        <IssuesTable issues={results} />
      ) : view === 'list' ? (
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {results.map((i) => (
            <IssueCard key={i.id} issue={i} />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(({ building, health, issues }) => (
            <details key={building.id} className="card group overflow-hidden" open={issues.length > 0 && grouped.length <= 3}>
              <summary className="flex cursor-pointer list-none items-center gap-4 p-4 sm:p-5">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
                  <Building2 className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{building.name}</p>
                  <p className="text-sm text-muted">
                    {issues.length} matching · {health.openIssues} open verified
                  </p>
                </div>
                <div className="hidden w-48 sm:block">
                  <HealthScore score={health.score} />
                </div>
                <ChevronRight className="size-5 text-slate-400 transition group-open:rotate-90" />
              </summary>
              {issues.length > 0 && (
                <div className="grid gap-3 border-t border-line bg-canvas p-4 sm:grid-cols-2 lg:grid-cols-3">
                  {issues.map((i) => (
                    <IssueCard key={i.id} issue={i} compact />
                  ))}
                </div>
              )}
            </details>
          ))}
        </div>
      )}
    </div>
  )
}
