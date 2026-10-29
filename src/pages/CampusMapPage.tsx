import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  Box,
  Building2,
  CircleCheck,
  Info,
  List,
  LocateFixed,
  MapPin,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Square,
  X,
} from 'lucide-react'
import { useLoad, useToast } from '../context/AppContext'
import { CampusMap, type MapMode } from '../components/map/CampusMap'
import { BuildingDirectory, HealthRing, PriorityChips } from '../components/BuildingHealthCard'
import { Button, CategoryIcon, IssueStatusBadge, Skeleton, cx } from '../components/ui'
import { CATEGORIES, PRIORITY_LABEL, categoryLabel } from '../lib/constants'
import { computeBuildingHealth, HEALTH_BAND_META, healthBand } from '../lib/health'
import { PIN_COLOR, isMappable } from '../lib/mapMarkers'
import { formatDate, timeAgo } from '../lib/format'
import type { BuildingHealth, Issue, IssueCategory, Priority } from '../lib/types'

type StatusFilter = '' | 'pending_review' | 'reported' | 'in_progress' | 'resolved'

function useIsDesktop() {
  const q = '(min-width: 1024px)'
  const [v, setV] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const m = window.matchMedia(q)
    const f = () => setV(m.matches)
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [])
  return v
}

function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: [T, string, typeof Box][]; label: string }) {
  return (
    <div className="inline-flex rounded-xl bg-slate-100 p-0.5" role="radiogroup" aria-label={label}>
      {options.map(([v, text, Icon]) => (
        <button
          key={v}
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cx('inline-flex h-8 items-center gap-1.5 rounded-[10px] px-2.5 text-xs font-semibold transition', value === v ? 'bg-white text-ink shadow-sm' : 'text-slate-600 hover:text-ink')}
        >
          <Icon className="size-3.5" /> {text}
        </button>
      ))}
    </div>
  )
}

export default function CampusMapPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const isDesktop = useIsDesktop()

  const { data, loading } = useLoad(async (api) => {
    const [buildings, issues] = await Promise.all([api.listBuildings(), api.listIssues()])
    return { buildings, issues }
  })

  const [category, setCategory] = useState<IssueCategory | ''>('')
  const [status, setStatus] = useState<StatusFilter>('')
  const [priority, setPriority] = useState<Priority | ''>('')
  const [mode, setMode] = useState<MapMode>(params.get('mode') === 'health' ? 'health' : 'issues')
  const [is3D, setIs3D] = useState(true)
  const [failed, setFailed] = useState<string | null>(null)
  const [listView, setListView] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [previewIssue, setPreviewIssue] = useState<Issue | null>(null)
  const [reportHere, setReportHere] = useState(false)
  const [floor, setFloor] = useState('')
  const [room, setRoom] = useState('')
  const [pinMode, setPinMode] = useState(false)
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null)
  const [resetSignal, setResetSignal] = useState(0)

  const buildings = data?.buildings ?? []
  const selectedId = buildings.find((b) => b.slug === params.get('building') || b.id === params.get('building'))?.id ?? null
  const selected = buildings.find((b) => b.id === selectedId) ?? null
  const focusedIssueId = params.get('issue')
  const picking = params.get('pick') === '1'

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next, { replace: true })
  }
  const selectBuilding = (id: string | null) => {
    const b = buildings.find((x) => x.id === id)
    const next = new URLSearchParams(params)
    if (b) next.set('building', b.slug)
    else next.delete('building')
    next.delete('issue')
    setParams(next, { replace: true })
    setPreviewIssue(null)
    setReportHere(false)
    setPinMode(false)
    setPin(null)
    setFloor('')
    setRoom('')
  }

  // Health always uses every record (filters only change what's drawn).
  const health = useMemo(() => {
    const out: Record<string, BuildingHealth> = {}
    for (const b of buildings) out[b.id] = computeBuildingHealth(b, data?.issues ?? [])
    return out
  }, [buildings, data])

  const mappable = useMemo(() => {
    const all = (data?.issues ?? []).filter((i) => isMappable(i))
    return all.filter((i) => {
      if (category && i.category !== category) return false
      if (priority && (i.verificationStatus !== 'verified' || i.priority !== priority)) return false
      if (status === 'pending_review' && i.verificationStatus !== 'pending') return false
      if (status && status !== 'pending_review' && i.repairStatus !== status) return false
      return true
    })
  }, [data, category, status, priority])

  // ?issue=<id> deep link (from Issue Details "View location on map")
  useEffect(() => {
    if (!data || !focusedIssueId) return
    const issue = data.issues.find((i) => i.id === focusedIssueId)
    if (issue) setPreviewIssue(issue)
  }, [data, focusedIssueId])

  const activeFilters = [category, status, priority].filter(Boolean).length
  const panelOpen = !!(selected || previewIssue)
  const sheetH = typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.42) : 300
  const padding = isDesktop
    ? { top: 150, right: panelOpen ? 470 : 80, bottom: 90, left: 80 }
    : { top: 110, right: 24, bottom: panelOpen ? sheetH : 60, left: 24 }

  const selIssues = selected ? (data?.issues ?? []).filter((i) => i.buildingId === selected.id && isMappable(i)) : []
  const selOpen = selIssues.filter((i) => i.repairStatus !== 'resolved')
  const selResolved = selIssues.filter((i) => i.repairStatus === 'resolved')
  const selHealth = selected ? health[selected.id] : null

  const continueToReport = () => {
    if (!selected) return
    const q = new URLSearchParams({ building: selected.slug })
    if (floor) q.set('floor', floor)
    if (room.trim()) q.set('room', room.trim())
    if (pin) {
      q.set('lat', pin.lat.toFixed(7))
      q.set('lng', pin.lng.toFixed(7))
    }
    navigate(`/report?${q}`)
  }

  const filterControls = (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:flex">
      <select className="input h-9 py-1.5 text-sm lg:w-40" value={category} onChange={(e) => setCategory(e.target.value as IssueCategory | '')} aria-label="Filter by category">
        <option value="">All categories</option>
        {CATEGORIES.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
      <select className="input h-9 py-1.5 text-sm lg:w-40" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} aria-label="Filter by status">
        <option value="">All active + recent fixes</option>
        <option value="pending_review">Awaiting review</option>
        <option value="reported">Reported</option>
        <option value="in_progress">In Progress</option>
        <option value="resolved">Resolved (30 days)</option>
      </select>
      <select className="input h-9 py-1.5 text-sm lg:w-36" value={priority} onChange={(e) => setPriority(e.target.value as Priority | '')} aria-label="Filter by priority">
        <option value="">Any priority</option>
        {(['critical', 'high', 'medium', 'low'] as Priority[]).map((p) => (
          <option key={p} value={p}>
            {PRIORITY_LABEL[p]}
          </option>
        ))}
      </select>
      <select className="input h-9 py-1.5 text-sm lg:w-40" value={selectedId ?? ''} onChange={(e) => selectBuilding(e.target.value || null)} aria-label="Jump to building">
        <option value="">Jump to building…</option>
        {buildings.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      {activeFilters > 0 && (
        <button
          onClick={() => {
            setCategory('')
            setStatus('')
            setPriority('')
          }}
          className="text-left text-xs font-semibold text-brand-600 hover:underline lg:self-center"
        >
          Clear filters
        </button>
      )}
    </div>
  )

  // ------------------------------------------------------------------ side panel / bottom sheet content
  const panel = previewIssue ? (
    <div className="p-4 sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <CategoryIcon category={previewIssue.category} size="sm" />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">{categoryLabel(previewIssue.category)}</span>
        </div>
        <button onClick={() => (setPreviewIssue(null), setParam('issue', null))} className="rounded-lg p-1.5 text-muted hover:bg-slate-100" aria-label="Close preview">
          <X className="size-4" />
        </button>
      </div>
      <h2 className="text-lg font-semibold leading-snug">{previewIssue.title}</h2>
      <p className="mt-1 flex items-center gap-1 text-sm text-muted">
        <MapPin className="size-3.5" /> {[previewIssue.buildingName, previewIssue.floor, previewIssue.room].filter(Boolean).join(' · ')}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
        <IssueStatusBadge verification={previewIssue.verificationStatus} repair={previewIssue.repairStatus} />
        <span>
          {previewIssue.refCode} · {formatDate(previewIssue.createdAt)}
        </span>
      </div>
      <p className="mt-3 rounded-lg bg-canvas p-2.5 text-xs text-muted">The pin shows the building area; floor and room above give the indoor location.</p>
      <div className="mt-4 flex gap-2">
        <Link to={`/issues/${previewIssue.id}`} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
          View Details <ArrowRight className="size-4" />
        </Link>
        {selected?.id !== previewIssue.buildingId && (
          <Button variant="secondary" size="md" onClick={() => selectBuilding(previewIssue.buildingId)}>
            Building
          </Button>
        )}
      </div>
    </div>
  ) : selected && selHealth ? (
    <div>
      <div className="flex items-start gap-4 border-b border-line p-4 sm:p-5">
        <HealthRing score={selHealth.score} size={58} />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold leading-tight">{selected.name}</h2>
          <p className={cx('text-sm font-medium', HEALTH_BAND_META[healthBand(selHealth.score)].text)}>
            Health {selHealth.score ?? '—'}/100 · {HEALTH_BAND_META[healthBand(selHealth.score)].label}
          </p>
          <p className="mt-1 text-xs text-muted">
            {selHealth.openIssues} open · {selHealth.resolvedIssues} resolved (verified)
          </p>
        </div>
        <button onClick={() => selectBuilding(null)} className="rounded-lg p-1.5 text-muted hover:bg-slate-100" aria-label="Close building panel">
          <X className="size-4" />
        </button>
      </div>

      <div className="space-y-5 p-4 sm:p-5">
        {!reportHere ? (
          <Button size="lg" icon={Plus} className="w-full" onClick={() => setReportHere(true)}>
            Report an Issue Here
          </Button>
        ) : (
          <div className="space-y-3 rounded-2xl border border-brand-200 bg-brand-50/60 p-3.5">
            <p className="text-sm font-semibold">Where in {selected.shortName}?</p>
            <div className="grid grid-cols-2 gap-2">
              <select id="map-floor" className="input h-10 py-2 text-sm" value={floor} onChange={(e) => setFloor(e.target.value)} aria-label="Floor">
                <option value="">Floor…</option>
                {selected.floors.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
              <input id="map-room" className="input h-10 py-2 text-sm" placeholder="Room or area" value={room} onChange={(e) => setRoom(e.target.value)} aria-label="Room or area" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant={pinMode ? 'navy' : 'secondary'}
                icon={LocateFixed}
                onClick={() => {
                  setPinMode((v) => !v)
                  if (!pinMode) toast(`Tap inside ${selected.shortName} on the map to drop a pin`, 'info')
                }}
              >
                {pin ? 'Move pin' : pinMode ? 'Tap the building…' : 'Drop a pin (optional)'}
              </Button>
              {pin && (
                <button onClick={() => setPin(null)} className="text-xs font-semibold text-muted hover:text-ink">
                  Remove pin
                </button>
              )}
            </div>
            {pin && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-success-700">
                <CircleCheck className="size-3.5" /> Pin placed on {selected.shortName}
              </p>
            )}
            <div className="flex gap-2">
              <Button className="flex-1" icon={ArrowRight} onClick={continueToReport}>
                Continue to report
              </Button>
              <Button variant="ghost" onClick={() => (setReportHere(false), setPinMode(false), setPin(null))}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        <PriorityChips health={selHealth} />

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Open issues ({selOpen.length})</h3>
          {selOpen.length === 0 ? (
            <p className="text-sm text-muted">Nothing open right now.</p>
          ) : (
            <ul className="space-y-1.5">
              {selOpen.map((i) => (
                <IssueRow key={i.id} issue={i} />
              ))}
            </ul>
          )}
        </section>
        {selResolved.length > 0 && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Recently resolved</h3>
            <ul className="space-y-1.5">
              {selResolved.map((i) => (
                <IssueRow key={i.id} issue={i} />
              ))}
            </ul>
          </section>
        )}
        <p className="flex gap-1.5 text-[11px] leading-relaxed text-muted">
          <Info className="mt-px size-3.5 shrink-0" /> Health is an illustrative maintenance indicator based on verified reports, not a safety assessment.
        </p>
      </div>
    </div>
  ) : null

  return (
    <div className="relative -mx-4 -mt-6 h-[calc(100dvh-9rem)] min-h-[460px] overflow-hidden border-line bg-canvas sm:-mx-6 lg:mx-0 lg:mt-0 lg:h-[calc(100dvh-8rem)] lg:rounded-2xl lg:border lg:shadow-card">
      {loading && !data ? (
        <Skeleton className="absolute inset-0 rounded-none" />
      ) : failed || listView ? (
        <div className="absolute inset-0 overflow-y-auto bg-white pt-16">
          {failed && (
            <p className="mx-4 mb-2 mt-2 rounded-xl bg-warning-50 p-3 text-sm text-warning-700">
              The 3D map couldn’t load ({failed}). Here is every building instead — reporting works the same.
            </p>
          )}
          <BuildingDirectory
            buildings={buildings}
            health={health}
            onSelect={(id) => {
              if (failed) navigate(`/issues?building=${id}`)
              else {
                setListView(false)
                selectBuilding(id)
              }
            }}
          />
        </div>
      ) : (
        <CampusMap
          buildings={buildings}
          issues={mode === 'issues' ? mappable : []}
          health={health}
          selectedBuildingId={selectedId}
          focusedIssueId={focusedIssueId}
          mode={mode}
          is3D={is3D}
          pinMode={pinMode}
          pin={pin}
          padding={padding}
          resetSignal={resetSignal}
          onSelectBuilding={selectBuilding}
          onSelectIssue={(i) => {
            setPreviewIssue(i)
            setParam('issue', i.id)
          }}
          onPin={(p, outside) => {
            if (outside) toast(`Place the pin inside ${selected?.shortName ?? 'the selected building'}`, 'error')
            else if (p) {
              setPin(p)
              setPinMode(false)
            }
          }}
          onFail={setFailed}
        />
      )}

      {/* Toolbar */}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-col gap-2 lg:right-auto">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-white/95 p-2 shadow-card backdrop-blur">
          <h1 className="hidden px-1.5 text-sm font-bold sm:block">Campus Map</h1>
          {!failed && (
            <>
              <Segmented
                label="Map mode"
                value={listView ? 'list' : mode}
                onChange={(v) => {
                  if (v === 'list') setListView(true)
                  else {
                    setListView(false)
                    setMode(v as MapMode)
                  }
                }}
                options={[
                  ['issues', 'Issues', MapPin],
                  ['health', 'Health', Building2],
                  ['list', 'List', List],
                ]}
              />
              {!listView && (
                <>
                  <Segmented label="Perspective" value={is3D ? '3d' : '2d'} onChange={(v) => setIs3D(v === '3d')} options={[['3d', '3D', Box], ['2d', '2D', Square]]} />
                  <button onClick={() => setResetSignal((n) => n + 1)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-slate-100 hover:text-ink" aria-label="Reset view" title="Reset view">
                    <RotateCcw className="size-4" />
                  </button>
                </>
              )}
            </>
          )}
          {mode === 'issues' && !listView && !failed && (
            <button
              onClick={() => setFiltersOpen((o) => !o)}
              className={cx('inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold lg:hidden', activeFilters ? 'bg-brand-50 text-brand-700' : 'text-muted hover:bg-slate-100')}
              aria-expanded={filtersOpen}
            >
              <SlidersHorizontal className="size-3.5" /> Filters{activeFilters ? ` (${activeFilters})` : ''}
            </button>
          )}
        </div>
        {mode === 'issues' && !listView && !failed && (
          <div className={cx('pointer-events-auto rounded-2xl border border-line bg-white/95 p-2 shadow-card backdrop-blur', filtersOpen ? 'block' : 'hidden lg:block')}>{filterControls}</div>
        )}
        {(picking || pinMode) && !failed && (
          <div className="pointer-events-auto self-start rounded-xl bg-navy-900 px-3.5 py-2 text-sm font-medium text-white shadow-pop">
            {pinMode ? `Tap inside ${selected?.shortName} to place your pin` : 'Tap a building, then choose “Report an Issue Here”.'}
          </div>
        )}
      </div>

      {/* Legend */}
      {!failed && !listView && (
        <div className={cx('pointer-events-none absolute bottom-3 left-3 z-10 max-w-[calc(100%-5rem)]', panelOpen && !isDesktop && 'hidden')}>
          <div className="pointer-events-auto rounded-xl border border-line bg-white/95 px-3 py-2 text-[11px] shadow-card backdrop-blur">
            {mode === 'issues' ? (
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {(
                  [
                    ['red', 'High / critical'],
                    ['orange', 'Medium'],
                    ['blue', 'Low / new'],
                    ['green', 'Recently fixed'],
                  ] as const
                ).map(([t, l]) => (
                  <span key={t} className="flex items-center gap-1.5 font-medium">
                    <span className="size-2.5 rounded-full" style={{ background: PIN_COLOR[t] }} /> {l}
                  </span>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {(['good', 'attention', 'improve', 'critical', 'none'] as const).map((b) => (
                  <span key={b} className="flex items-center gap-1.5 font-medium">
                    <span className="size-2.5 rounded-sm" style={{ background: HEALTH_BAND_META[b].color }} /> {HEALTH_BAND_META[b].label}
                  </span>
                ))}
              </div>
            )}
            <p className="mt-1 text-muted">Simplified campus layout — positions approximate, not to scale.</p>
          </div>
        </div>
      )}

      {/* Building / issue panel */}
      {panel && !listView && !failed && (
        <aside
          className={cx(
            'absolute z-20 animate-fade-up overflow-y-auto bg-white shadow-pop',
            isDesktop ? 'bottom-3 right-3 top-3 w-[380px] rounded-2xl border border-line' : 'inset-x-0 bottom-0 max-h-[52%] rounded-t-3xl border-t border-line',
          )}
          aria-label={previewIssue ? 'Issue preview' : `${selected?.name} details`}
        >
          {!isDesktop && <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-slate-200" aria-hidden />}
          {panel}
        </aside>
      )}

      {/* Empty hint (desktop) */}
      {!panel && !failed && !listView && isDesktop && data && (
        <div className="pointer-events-none absolute bottom-3 right-3 z-10 w-72 rounded-2xl border border-line bg-white/95 p-4 text-sm shadow-card">
          <p className="font-semibold">Select a building</p>
          <p className="mt-1 text-muted">See its health score and open issues, or report a problem there.</p>
        </div>
      )}
    </div>
  )
}

function IssueRow({ issue }: { issue: Issue }) {
  return (
    <li>
      <Link to={`/issues/${issue.id}`} className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-canvas">
        <CategoryIcon category={issue.category} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{issue.title}</span>
          <span className="block truncate text-xs text-muted">
            {[issue.floor, issue.room].filter(Boolean).join(' · ')} · {timeAgo(issue.createdAt)}
          </span>
        </span>
        <IssueStatusBadge verification={issue.verificationStatus} repair={issue.repairStatus} />
      </Link>
    </li>
  )
}
