import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, Plus, Save } from 'lucide-react'
import { useApp, useLoad, useToast } from '../context/AppContext'
import { ColumnChart, HBarChart, Kpi } from '../components/charts'
import { HealthScore, Badge, Button, PageHeader, Skeleton, cx } from '../components/ui'
import { RewardArt } from './Rewards'
import { CATEGORIES, PRIORITY_LABEL, categoryLabel } from '../lib/constants'
import { computeBuildingHealth, HEALTH_BAND_META, healthBand } from '../lib/health'
import { ACTION_LABEL } from '../lib/notifications'
import { formatDate, formatDateTime } from '../lib/format'
import type { Building, Issue, Priority, Reward, RewardImage } from '../lib/types'

const DAY = 86_400_000
const isPublic = (i: Issue) => i.verificationStatus !== 'rejected' && i.verificationStatus !== 'merged'
const daysToResolve = (i: Issue) => (i.resolvedAt ? (new Date(i.resolvedAt).getTime() - new Date(i.createdAt).getTime()) / DAY : null)
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const fmtDays = (d: number | null) => (d === null ? '—' : d < 1 ? `${Math.max(1, Math.round(d * 24))} h` : `${d.toFixed(1)} days`)

function useAdminData() {
  return useLoad(async (api) => {
    const [issues, buildings, ledger, redemptions] = await Promise.all([
      api.listIssues(),
      api.listBuildings(),
      api.getPointsHistory('all'),
      api.listRedemptions('all'),
    ])
    return { issues, buildings, ledger, redemptions }
  })
}

function Panel({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cx('card p-5', className)}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

// ======================================================================== Overview
export function AdminOverview() {
  const { data } = useAdminData()
  if (!data) return <AdminSkeleton title="Campus Overview" />
  const { issues, buildings, ledger, redemptions } = data
  const pub = issues.filter(isPublic)
  const resolved = pub.filter((i) => i.repairStatus === 'resolved')
  const open = pub.filter((i) => i.repairStatus !== 'resolved')
  const verified = pub.filter((i) => i.verificationStatus === 'verified')
  const rate = verified.length ? Math.round((resolved.length / verified.length) * 100) : 0
  const avgDays = avg(resolved.map(daysToResolve).filter((x): x is number => x !== null))
  const distributed = ledger.filter((t) => t.status === 'available' && t.points > 0).reduce((n, t) => n + t.points, 0)
  const activeRedemptions = redemptions.filter((r) => r.status !== 'cancelled')

  const byBuilding = buildings
    .map((b) => ({ label: b.shortName, value: pub.filter((i) => i.buildingId === b.id).length, href: `/issues?building=${b.id}` }))
    .sort((a, b) => b.value - a.value)
  const byCategory = CATEGORIES.map((c) => ({ label: c.label, value: pub.filter((i) => i.category === c.value).length, href: `/issues?category=${c.value}` }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
  const health = buildings.map((b) => computeBuildingHealth(b, issues)).sort((a, b) => (a.score ?? 101) - (b.score ?? 101))

  // reports per week, last 8 weeks (Monday-start)
  const weeks = Array.from({ length: 8 }, (_, k) => {
    const start = startOfWeek(Date.now()) - (7 - k) * 7 * DAY
    return { start, label: new Date(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
  })
  const perWeek = weeks.map((w) => ({
    label: w.label,
    value: issues.filter((i) => {
      const t = new Date(i.createdAt).getTime()
      return t >= w.start && t < w.start + 7 * DAY
    }).length,
  }))

  return (
    <div className="space-y-6">
      <PageHeader title="Campus Overview" subtitle="Maintenance activity across Penn State Abington. Sample records are fictional." />
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label="Key figures">
        <Kpi label="Total issues" value={pub.length} sub={`${issues.length - pub.length} rejected or merged`} />
        <Kpi label="Open issues" value={open.length} sub={`${pub.filter((i) => i.verificationStatus === 'pending').length} awaiting review`} />
        <Kpi label="Resolution rate" value={`${rate}%`} sub="of verified issues" />
        <Kpi label="Avg. resolution time" value={fmtDays(avgDays)} sub="report → resolved" />
        <Kpi label="Points distributed" value={distributed.toLocaleString()} sub="released to users" />
        <Kpi label="Mock redemptions" value={activeRedemptions.length} sub={`${activeRedemptions.reduce((n, r) => n + r.pointsSpent, 0)} points`} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Reports by building">
          <HBarChart rows={byBuilding} label="Reports by building" />
        </Panel>
        <Panel title="Reports by category">
          <HBarChart rows={byCategory} label="Reports by category" />
        </Panel>
        <Panel title="Reports per week" action={<span className="text-xs text-muted">Last 8 weeks</span>}>
          <ColumnChart data={perWeek} label="Reports submitted per week, last 8 weeks" />
        </Panel>
        <Panel
          title="Building health ranking"
          action={
            <Link to="/buildings" className="flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">
              Details <ArrowRight className="size-4" />
            </Link>
          }
        >
          <ol className="space-y-3">
            {health.map((h, i) => (
              <li key={h.buildingId} className="flex items-center gap-3">
                <span className="w-5 text-xs font-semibold tabular-nums text-muted">{i + 1}</span>
                <span className="w-32 truncate text-sm font-medium">{h.name}</span>
                <div className="flex-1">
                  <HealthScore score={h.score} compact />
                </div>
                <span className={cx('hidden w-32 text-right text-xs font-medium sm:block', HEALTH_BAND_META[healthBand(h.score)].text)}>
                  {HEALTH_BAND_META[healthBand(h.score)].label}
                </span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </div>
  )
}

function startOfWeek(ms: number) {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  const day = (d.getDay() + 6) % 7
  return d.getTime() - day * DAY
}

function AdminSkeleton({ title }: { title: string }) {
  return (
    <div>
      <PageHeader title={title} />
      <div className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="mt-6 h-72" />
    </div>
  )
}

// ======================================================================== Maintenance statistics
export function AdminStats() {
  const { data } = useAdminData()
  if (!data) return <AdminSkeleton title="Maintenance Statistics" />
  const issues = data.issues
  const total = issues.length
  const funnel = [
    { label: 'Reported', value: total },
    { label: 'Verified', value: issues.filter((i) => i.verificationStatus === 'verified').length },
    { label: 'Work started', value: issues.filter((i) => i.verificationStatus === 'verified' && i.repairStatus !== 'reported').length },
    { label: 'Resolved', value: issues.filter((i) => i.repairStatus === 'resolved').length },
  ]
  const priorities: Priority[] = ['critical', 'high', 'medium', 'low']
  const verified = issues.filter((i) => i.verificationStatus === 'verified')

  return (
    <div className="space-y-6">
      <PageHeader title="Maintenance Statistics" subtitle="How reports move from submission to fix." />
      <Panel title="Pipeline">
        <HBarChart rows={funnel} label="Reports at each stage" />
        <p className="mt-3 text-xs text-muted">
          {issues.filter((i) => i.verificationStatus === 'rejected').length} rejected and {issues.filter((i) => i.verificationStatus === 'merged').length} merged as duplicates.
        </p>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="By priority">
          <StatTable
            head={['Priority', 'Open', 'Resolved', 'Avg. time to fix']}
            rows={priorities.map((p) => {
              const set = verified.filter((i) => i.priority === p)
              const done = set.filter((i) => i.repairStatus === 'resolved')
              return [PRIORITY_LABEL[p], set.length - done.length, done.length, fmtDays(avg(done.map(daysToResolve).filter((x): x is number => x !== null)))]
            })}
          />
        </Panel>
        <Panel title="By category">
          <StatTable
            head={['Category', 'Total', 'Open', 'Avg. time to fix']}
            rows={CATEGORIES.map((c) => {
              const set = issues.filter((i) => i.category === c.value && isPublic(i))
              const done = set.filter((i) => i.repairStatus === 'resolved')
              return [c.label, set.length, set.length - done.length, fmtDays(avg(done.map(daysToResolve).filter((x): x is number => x !== null)))]
            })}
          />
        </Panel>
      </div>
    </div>
  )
}

function StatTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="-mx-5 overflow-x-auto" tabIndex={0} role="region" aria-label="Scrollable table">
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-muted">
            {head.map((h, i) => (
              <th key={h} className={cx('px-5 py-2', i > 0 && 'text-right')}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={String(r[0])}>
              {r.map((c, i) => (
                <td key={i} className={cx('px-5 py-2.5', i === 0 ? 'font-medium' : 'text-right tabular-nums')}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ======================================================================== Rewards management
const IMAGES: RewardImage[] = ['gift', 'book', 'dining', 'merch']

function RewardEditor({ reward, onSaved }: { reward: Reward | null; onSaved: () => void }) {
  const { api } = useApp()
  const toast = useToast()
  const [f, setF] = useState({ title: '', description: '', pointsRequired: 500, imageKey: 'gift' as RewardImage, active: true })
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (reward) setF({ title: reward.title, description: reward.description, pointsRequired: reward.pointsRequired, imageKey: reward.imageKey, active: reward.active })
  }, [reward])
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.saveReward({ ...f, id: reward?.id })
      toast(reward ? 'Reward updated' : 'Reward added')
      if (!reward) setF({ title: '', description: '', pointsRequired: 500, imageKey: 'gift', active: true })
      onSaved()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Couldn’t save', 'error')
    } finally {
      setBusy(false)
    }
  }
  const id = reward?.id ?? 'new'
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_120px_130px_auto] sm:items-end">
      <div>
        <label className="label text-xs" htmlFor={`rw-title-${id}`}>Name</label>
        <input id={`rw-title-${id}`} className="input text-sm" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      </div>
      <div>
        <label className="label text-xs" htmlFor={`rw-pts-${id}`}>Points</label>
        <input id={`rw-pts-${id}`} type="number" min={1} step={1} className="input text-sm tabular-nums" value={f.pointsRequired} onChange={(e) => setF({ ...f, pointsRequired: Number(e.target.value) })} />
      </div>
      <div>
        <label className="label text-xs" htmlFor={`rw-img-${id}`}>Artwork</label>
        <select id={`rw-img-${id}`} className="input text-sm capitalize" value={f.imageKey} onChange={(e) => setF({ ...f, imageKey: e.target.value as RewardImage })}>
          {IMAGES.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-brand-600" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active
        </label>
        <Button size="sm" type="submit" loading={busy} icon={reward ? Save : Plus}>
          {reward ? 'Save' : 'Add'}
        </Button>
      </div>
      <div className="sm:col-span-4">
        <label className="label text-xs" htmlFor={`rw-desc-${id}`}>Description</label>
        <input id={`rw-desc-${id}`} className="input text-sm" required value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </div>
    </form>
  )
}

export function AdminRewards() {
  const { api, refresh } = useApp()
  const toast = useToast()
  const { data } = useLoad(async (a) => {
    const [rewards, redemptions, ledger] = await Promise.all([a.listRewards({ includeInactive: true }), a.listRedemptions('all'), a.getPointsHistory('all')])
    return { rewards, redemptions, ledger }
  })
  const [busy, setBusy] = useState<string | null>(null)
  if (!data) return <AdminSkeleton title="Rewards Management" />

  const act = async (id: string, status: 'fulfilled' | 'cancelled') => {
    setBusy(id + status)
    try {
      await api.setRedemptionStatus(id, status)
      refresh()
      toast(status === 'fulfilled' ? 'Marked as fulfilled' : 'Cancelled and points refunded')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Action failed', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Rewards Management" subtitle="Mock rewards only — nothing here connects to LionCash, Amazon or payments." />
      <Panel title="Rewards catalog">
        <div className="space-y-5">
          {data.rewards.map((r) => (
            <div key={r.id} className="flex gap-4 border-b border-line pb-5">
              <RewardArt imageKey={r.imageKey} className="hidden size-16 shrink-0 rounded-2xl sm:grid" />
              <div className="min-w-0 flex-1">
                {!r.active && <Badge className="mb-2">Hidden from students</Badge>}
                <RewardEditor reward={r} onSaved={refresh} />
              </div>
            </div>
          ))}
          <div>
            <p className="mb-2 text-sm font-semibold">Add a reward</p>
            <RewardEditor reward={null} onSaved={refresh} />
          </div>
        </div>
      </Panel>

      <Panel title="Redemptions">
        {data.redemptions.length === 0 ? (
          <p className="text-sm text-muted">No redemptions yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.redemptions.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{r.rewardTitle}</p>
                  <p className="text-xs text-muted">
                    {r.userName ?? 'User'} · {r.pointsSpent} pts · {formatDateTime(r.createdAt)}
                  </p>
                </div>
                {r.status === 'requested' ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" icon={Check} loading={busy === r.id + 'fulfilled'} onClick={() => act(r.id, 'fulfilled')}>
                      Fulfil
                    </Button>
                    <Button size="sm" variant="ghost" loading={busy === r.id + 'cancelled'} onClick={() => act(r.id, 'cancelled')}>
                      Cancel &amp; refund
                    </Button>
                  </div>
                ) : (
                  <Badge tone={r.status === 'fulfilled' ? 'green' : 'neutral'}>{r.status === 'fulfilled' ? 'Fulfilled' : 'Cancelled · refunded'}</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Points ledger" action={<span className="text-xs text-muted">Latest 50</span>}>
        <div className="-mx-5 overflow-x-auto" tabIndex={0} role="region" aria-label="Scrollable table">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="px-5 py-2">Date</th>
                <th className="px-5 py-2">User</th>
                <th className="px-5 py-2">Action</th>
                <th className="px-5 py-2">Report</th>
                <th className="px-5 py-2">Status</th>
                <th className="px-5 py-2 text-right">Points</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.ledger.slice(0, 50).map((t) => (
                <tr key={t.id}>
                  <td className="whitespace-nowrap px-5 py-2.5 text-muted">{formatDate(t.createdAt)}</td>
                  <td className="whitespace-nowrap px-5 py-2.5">{t.userName ?? '—'}</td>
                  <td className="whitespace-nowrap px-5 py-2.5">{ACTION_LABEL[t.action]}</td>
                  <td className="max-w-[200px] truncate px-5 py-2.5 text-muted">{t.issueRef ?? '—'}</td>
                  <td className="px-5 py-2.5">
                    <Badge tone={t.status === 'available' ? 'green' : t.status === 'pending' ? 'amber' : 'neutral'}>{t.status === 'available' ? 'Settled' : t.status === 'pending' ? 'Pending' : 'Void'}</Badge>
                  </td>
                  <td className={cx('px-5 py-2.5 text-right font-semibold tabular-nums', t.status === 'void' && 'text-slate-500 line-through')}>
                    {t.points > 0 ? '+' : '−'}
                    {Math.abs(t.points)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}

// ======================================================================== Locations & categories
function BuildingRow({ b, onSaved }: { b: Building; onSaved: () => void }) {
  const { api } = useApp()
  const toast = useToast()
  const [floors, setFloors] = useState(b.floors.join(', '))
  const [active, setActive] = useState(b.active) // optimistic toggle
  const [busy, setBusy] = useState(false)
  const dirty = floors !== b.floors.join(', ')
  const save = async (patch: { floors?: string[]; active?: boolean }) => {
    setBusy(true)
    try {
      await api.updateBuilding(b.id, patch)
      toast(patch.active === undefined ? 'Floors updated' : patch.active ? `${b.name} is visible again` : `${b.name} hidden from reporting`)
      onSaved()
    } catch (e) {
      if (patch.active !== undefined) setActive(!patch.active)
      toast(e instanceof Error ? e.message : 'Couldn’t save', 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <tr className={cx(!active && 'bg-canvas/70')}>
      <td className="px-5 py-3">
        <p className="font-semibold">{b.name}</p>
        <p className="text-xs text-muted">{b.geoSource === 'schematic' ? 'Simplified map shape' : `Footprint: ${b.geoSource}`}</p>
      </td>
      <td className="px-5 py-3">
        <div className="flex gap-2">
          <input
            className="input min-w-0 py-2 text-sm"
            value={floors}
            onChange={(e) => setFloors(e.target.value)}
            aria-label={`Floors in ${b.name}, comma separated`}
          />
          <Button size="sm" variant="secondary" disabled={!dirty} loading={busy && dirty} onClick={() => save({ floors: floors.split(',').map((f) => f.trim()).filter(Boolean) })}>
            Save
          </Button>
        </div>
      </td>
      <td className="px-5 py-3 text-right">
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-brand-600"
            checked={active}
            disabled={busy}
            onChange={(e) => {
              setActive(e.target.checked)
              save({ active: e.target.checked })
            }}
          />
          {active ? 'Active' : 'Hidden'}
        </label>
      </td>
    </tr>
  )
}

export function AdminLocations() {
  const { refresh } = useApp()
  const { data: buildings } = useLoad((a) => a.listAllBuildings())
  const sorted = useMemo(() => [...(buildings ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [buildings])
  return (
    <div className="space-y-6">
      <PageHeader title="Locations & Categories" subtitle="Control which buildings and floors appear in the report form." />
      <Panel title="Buildings · Penn State Abington">
        {!buildings ? (
          <Skeleton className="h-60" />
        ) : (
          <div className="-mx-5 overflow-x-auto" tabIndex={0} role="region" aria-label="Scrollable table">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  <th className="px-5 py-2">Building</th>
                  <th className="px-5 py-2">Floors (comma separated)</th>
                  <th className="px-5 py-2 text-right">In report form</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sorted.map((b) => (
                  <BuildingRow key={b.id + b.floors.join() + b.active} b={b} onSaved={refresh} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 text-xs text-muted">
          Hidden buildings keep their history and still count in reports; they just can’t receive new reports. The campus model supports more campuses — add one with a
          new <code>campuses</code> row and its buildings.
        </p>
      </Panel>
      <Panel title="Issue categories">
        <ul className="grid gap-2 sm:grid-cols-2">
          {CATEGORIES.map((c) => (
            <li key={c.value} className="rounded-xl bg-canvas p-3">
              <p className="text-sm font-semibold">{categoryLabel(c.value)}</p>
              <p className="text-xs text-muted">{c.hint}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted">
          Categories are a fixed list enforced by the database, so every report, statistic and health score stays consistent. Adding one is a schema migration.
        </p>
      </Panel>
    </div>
  )
}
