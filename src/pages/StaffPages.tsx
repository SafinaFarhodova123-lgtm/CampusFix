import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CircleCheck, Inbox, Search, Siren, TriangleAlert, Wrench, type LucideIcon } from 'lucide-react'
import { useLoad } from '../context/AppContext'
import { IssuesTable } from '../components/IssuesTable'
import { HealthScore, PageHeader, Skeleton, cx } from '../components/ui'
import { computeBuildingHealth, HEALTH_BAND_META, healthBand } from '../lib/health'
import { applyFilters } from '../lib/filters'
import type { Issue } from '../lib/types'

const isOpen = (i: Issue) => i.verificationStatus === 'verified' && i.repairStatus !== 'resolved'
const PRI_RANK = { critical: 0, high: 1, medium: 2, low: 3 }

function SummaryCard({ icon: Icon, label, value, tint, to }: { icon: LucideIcon; label: string; value?: number; tint: string; to: string }) {
  return (
    <Link to={to} className="card flex items-center gap-3 p-4 transition hover:shadow-pop">
      <span className={cx('grid size-10 shrink-0 place-items-center rounded-xl', tint)}>
        <Icon className="size-5" />
      </span>
      <span>
        <span className="block text-[13px] font-medium leading-tight text-muted">{label}</span>
        {value === undefined ? <Skeleton className="mt-1 h-6 w-8" /> : <span className="block text-2xl font-bold tabular-nums">{value}</span>}
      </span>
    </Link>
  )
}

export function StaffOverview() {
  const { data } = useLoad(async (api) => {
    const [issues, buildings] = await Promise.all([api.listIssues(), api.listBuildings()])
    return { issues, buildings }
  })
  const issues = data?.issues ?? []
  const pending = issues.filter((i) => i.verificationStatus === 'pending').sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const open = issues.filter(isOpen)
  const urgent = open
    .filter((i) => i.priority === 'critical' || i.priority === 'high')
    .sort((a, b) => PRI_RANK[a.priority] - PRI_RANK[b.priority] || a.createdAt.localeCompare(b.createdAt))
  const health = (data?.buildings ?? []).map((b) => computeBuildingHealth(b, issues)).sort((a, b) => (a.score ?? 101) - (b.score ?? 101))

  return (
    <div className="space-y-6">
      <PageHeader title="Facilities Overview" subtitle="What needs review, what’s urgent, and how each building is doing." />
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" aria-label="Summary">
        <SummaryCard icon={Inbox} label="Pending Verification" value={!data ? undefined : pending.length} tint="bg-slate-100 text-slate-700" to="/staff/incoming" />
        <SummaryCard icon={TriangleAlert} label="Open Issues" value={!data ? undefined : open.length} tint="bg-danger-50 text-danger-600" to="/issues?status=reported" />
        <SummaryCard icon={Wrench} label="In Progress" value={!data ? undefined : open.filter((i) => i.repairStatus === 'in_progress').length} tint="bg-warning-50 text-warning-600" to="/issues?status=in_progress" />
        <SummaryCard icon={CircleCheck} label="Resolved" value={!data ? undefined : issues.filter((i) => i.repairStatus === 'resolved').length} tint="bg-success-50 text-success-600" to="/staff/resolved" />
        <SummaryCard icon={Siren} label="Critical Issues" value={!data ? undefined : open.filter((i) => i.priority === 'critical').length} tint="bg-danger-600 text-white" to="/issues" />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Needs review</h2>
              <Link to="/staff/incoming" className="flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">
                All incoming <ArrowRight className="size-4" />
              </Link>
            </div>
            <IssuesTable issues={pending.slice(0, 6)} loading={!data} emptyTitle="Inbox zero" emptyBody="Every report has been reviewed." />
          </section>
          <section>
            <h2 className="mb-3 text-lg font-semibold">Urgent open work</h2>
            <IssuesTable issues={urgent} loading={!data} emptyTitle="No high-priority work" emptyBody="Nothing critical or high is open." />
          </section>
        </div>
        <aside className="card h-fit p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Building health</h2>
            <Link to="/buildings" className="text-sm font-semibold text-brand-600 hover:underline">
              All
            </Link>
          </div>
          <ul className="space-y-3.5">
            {health.map((h) => (
              <li key={h.buildingId}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="font-medium">{h.name}</span>
                  <span className={cx('text-xs font-medium', HEALTH_BAND_META[healthBand(h.score)].text)}>{HEALTH_BAND_META[healthBand(h.score)].label}</span>
                </div>
                <HealthScore score={h.score} />
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  )
}

function QueuePage({ title, subtitle, select, dateField, emptyTitle, emptyBody }: {
  title: string
  subtitle: string
  select: (issues: Issue[]) => Issue[]
  dateField?: 'createdAt' | 'resolvedAt'
  emptyTitle: string
  emptyBody: string
}) {
  const [q, setQ] = useState('')
  const [building, setBuilding] = useState('')
  const { data } = useLoad(async (api) => {
    const [issues, buildings] = await Promise.all([api.listIssues(), api.listBuildings()])
    return { issues, buildings }
  })
  const rows = useMemo(() => (data ? select(applyFilters(data.issues, { search: q, buildingId: building })) : []), [data, q, building, select])
  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-10" placeholder="Search title, room or ID" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        </div>
        <select className="input sm:w-52" value={building} onChange={(e) => setBuilding(e.target.value)} aria-label="Building">
          <option value="">All buildings</option>
          {data?.buildings.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>
      <p className="mb-3 text-sm text-muted">{data ? `${rows.length} ${rows.length === 1 ? 'report' : 'reports'}` : 'Loading…'}</p>
      <IssuesTable issues={rows} loading={!data} dateField={dateField} emptyTitle={emptyTitle} emptyBody={emptyBody} />
    </div>
  )
}

const incoming = (issues: Issue[]) => issues.filter((i) => i.verificationStatus === 'pending').sort((a, b) => a.createdAt.localeCompare(b.createdAt))
const resolved = (issues: Issue[]) =>
  issues.filter((i) => i.repairStatus === 'resolved').sort((a, b) => (b.resolvedAt ?? '').localeCompare(a.resolvedAt ?? ''))

export const StaffIncoming = () => (
  <QueuePage title="Incoming Reports" subtitle="Oldest first. Verify, reject or merge each report." select={incoming} emptyTitle="Inbox zero" emptyBody="Every report has been reviewed." />
)
export const StaffResolved = () => (
  <QueuePage title="Resolved Issues" subtitle="Most recently fixed first." select={resolved} dateField="resolvedAt" emptyTitle="Nothing resolved yet" emptyBody="Resolved reports will appear here." />
)
