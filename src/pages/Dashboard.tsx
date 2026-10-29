import { Link } from 'react-router-dom'
import {
  ArrowRight,
  CircleCheck,
  ClipboardList,
  Clock,
  Map,
  Plus,
  Star,
  TriangleAlert,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { useApp, useLoad } from '../context/AppContext'
import { IssueCard, IssueCardSkeleton } from '../components/IssueCard'
import { ButtonLink, EmptyState, HealthScore, Skeleton, cx } from '../components/ui'
import { computeBuildingHealth, healthBand, HEALTH_BAND_META } from '../lib/health'
import { isPublic } from '../lib/filters'
import { firstName } from '../lib/format'

function Stat({ icon: Icon, label, value, tint, to }: { icon: LucideIcon; label: string; value: number | null; tint: string; to: string }) {
  return (
    <Link to={to} className="card flex items-center gap-3.5 p-4 transition hover:shadow-pop sm:p-5">
      <span className={cx('grid size-11 shrink-0 place-items-center rounded-xl', tint)}>
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium leading-tight text-muted">{label}</span>
        {value === null ? <Skeleton className="mt-1 h-7 w-10" /> : <span className="block text-2xl font-bold tabular-nums">{value}</span>}
      </span>
    </Link>
  )
}

export default function Dashboard() {
  const { user } = useApp()
  const { data, loading, error } = useLoad(async (api) => {
    const [issues, buildings, points] = await Promise.all([api.listIssues(), api.listBuildings(), api.getPointsSummary()])
    return { issues, buildings, points }
  })

  const issues = data?.issues ?? []
  const pub = issues.filter(isPublic)
  const me = user!.id
  const stats = data
    ? {
        open: pub.filter((i) => i.repairStatus === 'reported').length,
        progress: pub.filter((i) => i.repairStatus === 'in_progress').length,
        resolved: pub.filter((i) => i.repairStatus === 'resolved').length,
        mine: issues.filter((i) => i.reporterId === me || i.supportedByMe).length,
      }
    : null

  const health = (data?.buildings ?? [])
    .map((b) => computeBuildingHealth(b, issues))
    .sort((a, b) => (a.score ?? 101) - (b.score ?? 101))
    .slice(0, 5)

  const recent = pub.slice(0, 6)

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Welcome */}
      <section className="relative overflow-hidden rounded-3xl bg-navy-900 p-6 text-white sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-20 size-72 rounded-full bg-brand-600/40 blur-3xl" aria-hidden />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '20px 20px' }}
          aria-hidden
        />
        <div className="relative">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Welcome back, {firstName(user!.displayName)}!</h1>
          <p className="mt-1.5 text-[15px] text-slate-300 sm:text-base">Help make our campus better, one fix at a time.</p>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <ButtonLink to="/report" icon={Plus} className="bg-white !text-navy-900 hover:bg-brand-50">
              Report an Issue
            </ButtonLink>
            <ButtonLink to="/map" icon={Map} variant="ghost" className="bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/15">
              Explore Campus Map
            </ButtonLink>
            <ButtonLink to="/my-reports" icon={ClipboardList} variant="ghost" className="bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/15">
              View My Reports
            </ButtonLink>
          </div>
        </div>
      </section>

      {error && (
        <p className="rounded-xl bg-danger-50 p-4 text-sm text-danger-700" role="alert">
          Couldn’t load campus data: {error}
        </p>
      )}

      {/* Stats */}
      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" aria-label="Campus statistics">
        <Stat icon={TriangleAlert} label="Open Issues" value={stats?.open ?? null} tint="bg-danger-50 text-danger-600" to="/issues?status=reported" />
        <Stat icon={Wrench} label="In Progress" value={stats?.progress ?? null} tint="bg-warning-50 text-warning-600" to="/issues?status=in_progress" />
        <Stat icon={CircleCheck} label="Resolved" value={stats?.resolved ?? null} tint="bg-success-50 text-success-600" to="/issues?status=resolved" />
        <Stat icon={Star} label="My Contributions" value={stats?.mine ?? null} tint="bg-brand-50 text-brand-600" to="/my-reports" />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* Recent reports */}
        <section className="order-2 lg:order-1">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent reports</h2>
            <Link to="/issues" className="flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700">
              View all <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
            {loading && !data
              ? Array.from({ length: 6 }, (_, i) => <IssueCardSkeleton key={i} />)
              : recent.map((i) => <IssueCard key={i.id} issue={i} compact />)}
          </div>
          {data && recent.length === 0 && (
            <div className="card">
              <EmptyState icon={CircleCheck} title="No reports yet" body="Spot something broken? Be the first to report it." action={<ButtonLink to="/report" icon={Plus}>Report an Issue</ButtonLink>} />
            </div>
          )}
        </section>

        <aside className="order-1 space-y-6 lg:order-2">
          {/* Rewards summary */}
          <section className="card overflow-hidden">
            <div className="flex items-center gap-3 border-b border-line bg-gradient-to-br from-brand-50 to-white p-5">
              <span className="grid size-11 place-items-center rounded-xl bg-amber-100 text-amber-600">
                <Star className="size-5 fill-current" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-medium text-muted">Available Points</p>
                <p className="text-2xl font-bold tabular-nums">{data ? data.points.available : '—'}</p>
              </div>
            </div>
            <div className="flex items-center justify-between p-4 px-5">
              <p className="flex items-center gap-1.5 text-sm text-muted">
                <Clock className="size-4" aria-hidden />
                <span>
                  <span className="font-semibold text-ink tabular-nums">{data ? data.points.pending : '—'}</span> pending review
                </span>
              </p>
              <Link to="/rewards" className="text-sm font-semibold text-brand-600 hover:text-brand-700">
                View Rewards
              </Link>
            </div>
          </section>

          {/* Campus health */}
          <section className="card p-5">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="font-semibold">Campus health</h2>
              <span className="text-xs text-muted">Needs attention first</span>
            </div>
            <p className="mb-4 text-xs text-muted">Illustrative maintenance indicator — not a safety rating.</p>
            <ul className="space-y-3.5">
              {loading && !data
                ? Array.from({ length: 5 }, (_, idx) => (
                    <li key={idx}>
                      <Skeleton className="mb-2 h-3.5 w-32" />
                      <Skeleton className="h-2 w-full" />
                    </li>
                  ))
                : health.map((h) => {
                    const meta = HEALTH_BAND_META[healthBand(h.score)]
                    return (
                      <li key={h.buildingId}>
                        <div className="mb-1.5 flex items-center justify-between text-sm">
                          <span className="font-medium">{h.name}</span>
                          <span className={cx('text-xs font-medium', meta.text)}>{meta.label}</span>
                        </div>
                        <HealthScore score={h.score} />
                      </li>
                    )
                  })}
            </ul>
            <Link to="/map" className="mt-5 flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700">
              Explore All Buildings <ArrowRight className="size-4" />
            </Link>
          </section>
        </aside>
      </div>
    </div>
  )
}
