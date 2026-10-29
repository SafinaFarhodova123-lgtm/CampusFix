import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Award,
  BookOpen,
  Camera,
  CircleCheck,
  Clock,
  Coffee,
  Copy,
  Flag,
  Gift,
  History,
  Lock,
  Shirt,
  ShieldCheck,
  Star,
  ThumbsUp,
  Ticket,
  Trophy,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { useApp, useLoad, useToast } from '../context/AppContext'
import { Dialog } from '../components/Dialog'
import { Badge, Button, EmptyState, PageHeader, Skeleton, cx } from '../components/ui'
import { POINTS } from '../lib/constants'
import { ACTION_LABEL, mockVoucherCode } from '../lib/notifications'
import { computeAchievements, type Achievement } from '../lib/achievements'
import { formatDate, formatDateTime } from '../lib/format'
import type { PointsTx, Redemption, Reward, RewardImage } from '../lib/types'

type Tab = 'rewards' | 'redeems' | 'history' | 'achievements'

const ART: Record<RewardImage, { icon: LucideIcon; from: string; to: string; fg: string }> = {
  gift: { icon: Gift, from: '#FFF4E5', to: '#FFE1B8', fg: '#B45309' },
  book: { icon: BookOpen, from: '#EAF2FC', to: '#CFE0F7', fg: '#1E5AA8' },
  dining: { icon: Coffee, from: '#FDF0EC', to: '#F8D9CC', fg: '#9A3412' },
  merch: { icon: Shirt, from: '#EEF0F7', to: '#D6DBEB', fg: '#041E42' },
}

export function RewardArt({ imageKey, className }: { imageKey: RewardImage; className?: string }) {
  const a = ART[imageKey] ?? ART.gift
  const Icon = a.icon
  return (
    <div className={cx('relative grid place-items-center overflow-hidden', className)} style={{ background: `linear-gradient(135deg, ${a.from}, ${a.to})` }} aria-hidden>
      <span className="absolute -right-6 -top-6 size-24 rounded-full bg-white/40" />
      <span className="absolute -bottom-8 -left-4 size-20 rounded-full bg-white/30" />
      <Icon className="relative size-10" style={{ color: a.fg }} strokeWidth={1.6} />
    </div>
  )
}

const EARN: { icon: LucideIcon; label: string; points: number; detail: string }[] = [
  { icon: Flag, label: 'First verified reporter', points: POINTS.firstReporter, detail: 'Released when facilities verify your report' },
  { icon: Camera, label: 'Useful photo', points: POINTS.usefulPhoto, detail: 'Staff confirm your photo helped' },
  { icon: ThumbsUp, label: 'Verified support', points: POINTS.verifiedSupport, detail: 'Support a report that gets verified' },
  { icon: Wrench, label: 'Your report gets fixed', points: POINTS.originalResolved, detail: 'When your original report is resolved' },
  { icon: CircleCheck, label: 'Confirm a fix', points: POINTS.resolutionConfirmed, detail: 'Tell us a resolved issue looks fixed' },
]

const ACH_ICON: Record<Achievement['id'], LucideIcon> = { 'first-fix': Award, 'campus-guardian': ShieldCheck, 'community-helper': Users }

function TxRow({ t }: { t: PointsTx }) {
  const positive = t.points > 0
  return (
    <li className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{t.action === 'adjustment' && !t.issueId ? 'Demo balance adjustment' : ACTION_LABEL[t.action]}</p>
        <p className="truncate text-xs text-muted">
          {t.issueRef ? (
            <Link to={`/issues/${t.issueId}`} className="hover:underline">
              {t.issueRef} · {t.issueTitle}
            </Link>
          ) : (
            formatDateTime(t.createdAt)
          )}
        </p>
      </div>
      {t.status === 'pending' && <Badge tone="amber">Pending</Badge>}
      {t.status === 'void' && <Badge tone="neutral">Not awarded</Badge>}
      <span
        className={cx(
          'min-w-14 rounded-full px-2.5 py-1 text-center text-sm font-bold tabular-nums',
          t.status === 'void' ? 'bg-slate-100 text-slate-600 line-through' : positive ? (t.status === 'pending' ? 'bg-warning-50 text-warning-700' : 'bg-success-50 text-success-700') : 'bg-slate-100 text-ink',
        )}
      >
        {positive ? '+' : '−'}
        {Math.abs(t.points)}
      </span>
    </li>
  )
}

function VoucherCard({ r }: { r: Redemption }) {
  const toast = useToast()
  const code = mockVoucherCode(r.id)
  return (
    <article className="card overflow-hidden">
      <div className="flex">
        <RewardArt imageKey={r.imageKey} className="w-24 shrink-0 sm:w-28" />
        <div className="min-w-0 flex-1 p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold leading-snug">{r.rewardTitle}</h3>
            <Badge tone={r.status === 'fulfilled' ? 'green' : r.status === 'cancelled' ? 'neutral' : 'blue'}>
              {r.status === 'requested' ? 'Ready' : r.status === 'fulfilled' ? 'Used' : 'Cancelled · refunded'}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {r.pointsSpent} points · {formatDate(r.createdAt)}
          </p>
          {r.status !== 'cancelled' && (
            <div className="mt-3 flex items-center gap-2">
              <code className="rounded-lg border border-dashed border-line bg-canvas px-2.5 py-1.5 font-mono text-sm font-semibold tracking-wider">{code}</code>
              <button
                onClick={() =>
                  navigator.clipboard?.writeText(code).then(
                    () => toast('Code copied', 'info'),
                    () => toast('Couldn’t copy — select the code instead', 'error'),
                  )
                }
                className="rounded-lg p-1.5 text-muted hover:bg-slate-100"
                aria-label="Copy code"
              >
                <Copy className="size-4" />
              </button>
            </div>
          )}
          <p className="mt-2 text-[11px] text-muted">Mock reward for demonstration — not redeemable anywhere.</p>
        </div>
      </div>
    </article>
  )
}

export default function Rewards() {
  const { api, user, refresh } = useApp()
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('rewards')
  const [confirm, setConfirm] = useState<Reward | null>(null)
  const [redeeming, setRedeeming] = useState(false)
  const [justRedeemed, setJustRedeemed] = useState<Redemption | null>(null)

  const { data } = useLoad(async (a) => {
    const [summary, rewards, history, redemptions, issues] = await Promise.all([
      a.getPointsSummary(),
      a.listRewards(),
      a.getPointsHistory('mine'),
      a.listRedemptions('mine'),
      a.listIssues(),
    ])
    return { summary, rewards, history, redemptions, issues }
  })

  const achievements = useMemo(() => (data && user ? computeAchievements(user.id, data.issues) : []), [data, user])
  const historyByMonth = useMemo(() => {
    const groups: [string, PointsTx[]][] = []
    for (const t of data?.history ?? []) {
      const key = new Date(t.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      const g = groups.find((x) => x[0] === key)
      if (g) g[1].push(t)
      else groups.push([key, [t]])
    }
    return groups
  }, [data])

  const available = data?.summary.available ?? 0

  const doRedeem = async () => {
    if (!confirm) return
    setRedeeming(true)
    try {
      const r = await api.redeemReward(confirm.id)
      setJustRedeemed(r)
      refresh()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Redemption failed', 'error')
      setConfirm(null)
    } finally {
      setRedeeming(false)
    }
  }

  const tabs: [Tab, string, LucideIcon, number | null][] = [
    ['rewards', 'Rewards', Gift, null],
    ['redeems', 'My Redeems', Ticket, data?.redemptions.length ?? null],
    ['history', 'Points History', History, null],
    ['achievements', 'Achievements', Trophy, achievements.filter((a) => a.earned).length],
  ]

  return (
    <div>
      <PageHeader title="Rewards" subtitle="Earn points for verified reports and trade them for campus rewards." />

      {/* Wallet */}
      <section className="relative mb-6 overflow-hidden rounded-3xl bg-navy-900 text-white" aria-label="Points wallet">
        <div className="pointer-events-none absolute -right-20 -top-24 size-80 rounded-full bg-brand-600/40 blur-3xl" aria-hidden />
        <div className="relative grid gap-6 p-6 sm:p-8 md:grid-cols-[1fr_auto] md:items-end">
          <div className="flex items-center gap-4">
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-amber-400/15 ring-1 ring-amber-300/30">
              <Star className="size-7 fill-amber-400 text-amber-400" />
            </span>
            <div>
              <p className="text-sm font-medium text-slate-300">Available points</p>
              {data ? <p className="text-4xl font-bold tabular-nums tracking-tight sm:text-5xl">{available}</p> : <Skeleton className="mt-1 h-12 w-24 opacity-20" />}
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-2 sm:gap-3">
            {(
              [
                ['Pending', data?.summary.pending, Clock],
                ['Lifetime earned', data?.summary.lifetimeEarned, Star],
                ['Redeemed', data?.summary.redeemed, Ticket],
              ] as const
            ).map(([label, v, Icon]) => (
              <div key={label} className="rounded-2xl bg-white/8 px-3 py-2.5 ring-1 ring-white/10 sm:min-w-28 sm:px-4">
                <dt className="flex items-center gap-1.5 text-[11px] font-medium text-slate-300 sm:text-xs">
                  <Icon className="size-3.5" /> {label}
                </dt>
                <dd className="mt-0.5 text-lg font-bold tabular-nums sm:text-xl">{v ?? '—'}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="relative border-t border-white/10 px-6 py-3 text-xs text-slate-300 sm:px-8">
          Pending points are released when facilities verify your report. All rewards are mock placeholders.
        </p>
      </section>

      {/* Tabs */}
      <div className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="inline-flex gap-1 rounded-xl border border-line bg-white p-1" role="tablist" aria-label="Rewards sections">
          {tabs.map(([t, label, Icon, count]) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cx(
                'inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold transition',
                tab === t ? 'bg-navy-900 text-white' : 'text-muted hover:text-ink',
              )}
            >
              <Icon className="size-4" /> {label}
              {count !== null && count > 0 && <span className={cx('rounded-full px-1.5 text-xs', tab === t ? 'bg-white/20' : 'bg-slate-100')}>{count}</span>}
            </button>
          ))}
        </div>
      </div>

      {tab === 'rewards' && (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="grid gap-4 sm:grid-cols-2">
            {!data
              ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-72" />)
              : data.rewards.map((r) => {
                  const enough = available >= r.pointsRequired
                  const pct = Math.min(100, Math.round((available / r.pointsRequired) * 100))
                  return (
                    <article key={r.id} className="card flex flex-col overflow-hidden">
                      <RewardArt imageKey={r.imageKey} className="h-32" />
                      <div className="flex flex-1 flex-col p-5">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-semibold leading-snug">{r.title}</h3>
                          <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold tabular-nums text-amber-700">
                            <Star className="size-3 fill-current" /> {r.pointsRequired}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-muted">{r.description}</p>
                        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${pct}% of the points needed`}>
                          <div className={cx('h-full rounded-full', enough ? 'bg-success-600' : 'bg-brand-600')} style={{ width: `${pct}%` }} />
                        </div>
                        <div className="mt-4 flex-1" />
                        {enough ? (
                          <Button onClick={() => (setJustRedeemed(null), setConfirm(r))}>Redeem for {r.pointsRequired} points</Button>
                        ) : (
                          <p className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-canvas text-sm font-medium text-muted">
                            <Lock className="size-4" /> {r.pointsRequired - available} more points needed
                          </p>
                        )}
                      </div>
                    </article>
                  )
                })}
          </div>
          <aside className="card h-fit p-5">
            <h2 className="font-semibold">How to earn points</h2>
            <ul className="mt-4 space-y-3.5">
              {EARN.map(({ icon: Icon, label, points, detail }) => (
                <li key={label} className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{label}</span>
                    <span className="block text-xs text-muted">{detail}</span>
                  </span>
                  <span className="text-sm font-bold tabular-nums text-success-700">+{points}</span>
                </li>
              ))}
            </ul>
            <p className="mt-5 border-t border-line pt-4 text-xs text-muted">
              Each action pays once. Rejected reports and merged duplicates earn nothing, and nobody can award themselves points.
            </p>
          </aside>
        </div>
      )}

      {tab === 'redeems' &&
        (!data ? (
          <Skeleton className="h-40" />
        ) : data.redemptions.length === 0 ? (
          <div className="card">
            <EmptyState icon={Ticket} title="No redeemed rewards yet" body="Rewards you redeem show up here with their mock voucher code." action={<Button variant="secondary" onClick={() => setTab('rewards')}>Browse rewards</Button>} />
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {data.redemptions.map((r) => (
              <VoucherCard key={r.id} r={r} />
            ))}
          </div>
        ))}

      {tab === 'history' &&
        (!data ? (
          <Skeleton className="h-60" />
        ) : data.history.length === 0 ? (
          <div className="card">
            <EmptyState icon={History} title="No points yet" body="Report an issue to earn your first points." />
          </div>
        ) : (
          <div className="space-y-5">
            {historyByMonth.map(([month, rows]) => (
              <section key={month}>
                <h2 className="mb-2 text-sm font-semibold text-muted">{month}</h2>
                <ul className="card divide-y divide-line overflow-hidden">
                  {rows.map((t) => (
                    <TxRow key={t.id} t={t} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ))}

      {tab === 'achievements' && (
        <div className="grid gap-4 sm:grid-cols-3">
          {achievements.map((a) => {
            const Icon = ACH_ICON[a.id]
            return (
              <article key={a.id} className={cx('card p-5', a.earned && 'border-amber-200 bg-gradient-to-b from-amber-50/70 to-white')}>
                <span className={cx('grid size-14 place-items-center rounded-2xl', a.earned ? 'bg-amber-400 text-white shadow-pop' : 'bg-slate-100 text-slate-400')}>
                  <Icon className="size-7" />
                </span>
                <h3 className="mt-4 font-semibold">{a.name}</h3>
                <p className="mt-1 text-sm text-muted">{a.description}</p>
                <div className="mt-4 flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className={cx('h-full rounded-full', a.earned ? 'bg-amber-500' : 'bg-brand-600')} style={{ width: `${(a.progress / a.goal) * 100}%` }} />
                  </div>
                  <span className="text-xs font-semibold tabular-nums text-muted">
                    {a.progress}/{a.goal}
                  </span>
                </div>
                {a.earned && <p className="mt-2 text-xs font-semibold text-amber-700">Unlocked</p>}
              </article>
            )
          })}
        </div>
      )}

      <Dialog open={!!confirm} onClose={() => (setConfirm(null), setJustRedeemed(null))} title={justRedeemed ? 'Reward redeemed' : 'Redeem this reward?'}>
        {confirm && !justRedeemed && (
          <div>
            <div className="flex items-center gap-4">
              <RewardArt imageKey={confirm.imageKey} className="size-16 shrink-0 rounded-2xl" />
              <div>
                <p className="font-semibold">{confirm.title}</p>
                <p className="text-sm text-muted">{confirm.pointsRequired} points</p>
              </div>
            </div>
            <dl className="mt-5 space-y-2 rounded-2xl bg-canvas p-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Available now</dt>
                <dd className="font-semibold tabular-nums">{available}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Cost</dt>
                <dd className="font-semibold tabular-nums">−{confirm.pointsRequired}</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-2">
                <dt className="font-medium">Balance after</dt>
                <dd className="font-bold tabular-nums">{available - confirm.pointsRequired}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-muted">This is a mock reward for demonstration. No real gift card, voucher or LionCash is issued.</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button loading={redeeming} onClick={doRedeem}>
                Redeem
              </Button>
            </div>
          </div>
        )}
        {justRedeemed && (
          <div className="text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-success-600 text-white ring-8 ring-success-100">
              <CircleCheck className="size-7" />
            </span>
            <p className="mt-4 font-semibold">{justRedeemed.rewardTitle}</p>
            <p className="text-sm text-muted">{justRedeemed.pointsSpent} points spent</p>
            <code className="mt-4 inline-block rounded-xl border border-dashed border-line bg-canvas px-4 py-2 font-mono text-lg font-semibold tracking-wider">{mockVoucherCode(justRedeemed.id)}</code>
            <p className="mt-2 text-xs text-muted">Mock code — not redeemable anywhere.</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => (setConfirm(null), setJustRedeemed(null), setTab('redeems'))}>
                My Redeems
              </Button>
              <Button onClick={() => (setConfirm(null), setJustRedeemed(null))}>Done</Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
