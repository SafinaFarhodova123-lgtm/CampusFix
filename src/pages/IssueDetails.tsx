import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Bell,
  BellRing,
  Building2,
  Check,
  CircleCheck,
  Copy,
  Layers,
  Map,
  MapPin,
  MessageSquare,
  SearchX,
  ThumbsDown,
  ThumbsUp,
  UserRound,
} from 'lucide-react'
import { useApp, useLoad, useToast } from '../context/AppContext'
import { StaffReviewPanel } from '../components/StaffReviewPanel'
import {
  Badge,
  Button,
  ButtonLink,
  CategoryIcon,
  EmptyState,
  IssueImage,
  IssueStatusBadge,
  PriorityBadge,
  SampleTag,
  Skeleton,
  VerificationBadge,
  cx,
} from '../components/ui'
import { PRIORITY_LABEL, REPAIR_LABEL, VERIFICATION_LABEL, categoryLabel } from '../lib/constants'
import { formatDate, formatDateTime, timeAgo } from '../lib/format'
import type { RepairStatus, StatusHistoryEntry } from '../lib/types'

const TIMELINE: RepairStatus[] = ['reported', 'in_progress', 'resolved']

function describe(h: StatusHistoryEntry): string {
  if (h.kind === 'note') return 'Maintenance update'
  if (h.kind === 'merge') return 'Merged into another report'
  if (h.kind === 'priority') return `Priority set to ${PRIORITY_LABEL[h.newStatus as keyof typeof PRIORITY_LABEL] ?? h.newStatus}`
  if (h.kind === 'verification') return VERIFICATION_LABEL[h.newStatus as keyof typeof VERIFICATION_LABEL] ?? 'Reviewed'
  if (h.newStatus === 'reported') return 'Issue reported'
  return `Marked ${REPAIR_LABEL[h.newStatus as RepairStatus] ?? h.newStatus}`
}

export default function IssueDetails() {
  const { id = '' } = useParams()
  const { api, user, refresh } = useApp()
  const toast = useToast()
  const navigate = useNavigate()
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState<boolean | null>(null)

  const { data, loading } = useLoad(async (a) => {
    const [issue, history] = await Promise.all([a.getIssue(id), a.getHistory(id)])
    return { issue, history }
  }, [id])

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-10 w-2/3" />
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    )
  }

  const issue = data?.issue
  if (!issue) {
    return (
      <div className="card">
        <EmptyState icon={SearchX} title="Report not found" body="It may have been removed, or you don’t have access to it." action={<ButtonLink to="/issues">Browse issues</ButtonLink>} />
      </div>
    )
  }

  const history = data!.history
  const isMine = issue.reporterId === user?.id
  const isStaff = user?.role === 'staff' || user?.role === 'admin'
  const stepIndex = TIMELINE.indexOf(issue.repairStatus)
  const stepTime = (s: RepairStatus) =>
    s === 'reported' ? issue.createdAt : [...history].reverse().find((h) => h.kind === 'repair' && h.newStatus === s)?.createdAt

  const act = async (key: string, fn: () => Promise<void>, ok: string) => {
    setBusy(key)
    try {
      await fn()
      refresh()
      toast(ok)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Something went wrong', 'error')
    } finally {
      setBusy(null)
    }
  }

  const facts: [string, string, typeof Building2][] = [
    ['Building', issue.buildingName, Building2],
    ['Floor', issue.floor ?? '—', Layers],
    ['Room / area', issue.room ?? '—', MapPin],
  ]

  return (
    <div className="animate-fade-up">
      <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/issues'))} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Back
      </button>

      <header className="mb-6">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button
            onClick={() => navigator.clipboard?.writeText(issue.refCode).then(() => toast('Report ID copied', 'info'))}
            className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-600 hover:bg-slate-200"
            title="Copy report ID"
          >
            {issue.refCode} <Copy className="size-3" />
          </button>
          <IssueStatusBadge verification={issue.verificationStatus} repair={issue.repairStatus} />
          {issue.verificationStatus === 'verified' && <PriorityBadge priority={issue.priority} />}
          {issue.isSample && <SampleTag />}
        </div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{issue.title}</h1>
        <p className="mt-1.5 text-sm text-muted">
          Reported {timeAgo(issue.createdAt)} · {formatDate(issue.createdAt)}
          {issue.reporterName && <> · by {isMine ? 'you' : issue.reporterName}</>}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <section className="card overflow-hidden">
            <IssueImage url={issue.photoUrl} category={issue.category} alt={issue.title} className="aspect-[16/9] max-h-[420px] w-full" />
            <div className="p-5 sm:p-6">
              <div className="mb-4 flex items-center gap-3">
                <CategoryIcon category={issue.category} />
                <div>
                  <p className="text-xs font-medium text-muted">Category</p>
                  <p className="font-semibold">{categoryLabel(issue.category)}</p>
                </div>
              </div>
              <h2 className="text-sm font-semibold text-muted">Description</h2>
              <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed">{issue.description}</p>
              <dl className="mt-5 grid gap-3 sm:grid-cols-3">
                {facts.map(([k, v, Icon]) => (
                  <div key={k} className="rounded-xl bg-canvas p-3.5">
                    <dt className="flex items-center gap-1.5 text-xs font-medium text-muted">
                      <Icon className="size-3.5" /> {k}
                    </dt>
                    <dd className="mt-1 text-sm font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
              {issue.locationNote && <p className="mt-3 text-sm text-muted">Location note: {issue.locationNote}</p>}
            </div>
          </section>

          {/* Status timeline */}
          <section className="card p-5 sm:p-6">
            <h2 className="mb-5 font-semibold">Progress</h2>
            {issue.verificationStatus === 'rejected' || issue.verificationStatus === 'merged' ? (
              <p className="rounded-xl bg-slate-50 p-4 text-sm">
                <VerificationBadge status={issue.verificationStatus} />{' '}
                <span className="ml-1 text-muted">
                  {issue.verificationStatus === 'merged'
                    ? 'This was a duplicate and has been combined with the original report.'
                    : 'Facilities reviewed this report and could not accept it.'}
                </span>
              </p>
            ) : (
              <ol className="grid grid-cols-3">
                {TIMELINE.map((s, i) => {
                  const done = i <= stepIndex
                  const t = stepTime(s)
                  return (
                    <li key={s} className="relative flex flex-col items-center text-center">
                      {i > 0 && <span className={cx('absolute right-1/2 top-4 h-0.5 w-full -translate-y-1/2', i <= stepIndex ? 'bg-brand-600' : 'bg-slate-200')} aria-hidden />}
                      <span
                        className={cx(
                          'relative z-10 grid size-8 place-items-center rounded-full ring-4 ring-white',
                          done ? (s === 'resolved' ? 'bg-success-600 text-white' : 'bg-brand-600 text-white') : 'bg-slate-200 text-slate-700',
                        )}
                      >
                        {done ? <Check className="size-4" /> : <span className="text-xs font-bold">{i + 1}</span>}
                      </span>
                      <span className={cx('mt-2 text-sm font-semibold', !done && 'text-muted')}>{REPAIR_LABEL[s]}</span>
                      <span className="text-xs text-muted">{done && t ? formatDate(t) : ' '}</span>
                    </li>
                  )
                })}
              </ol>
            )}
            {issue.verificationStatus === 'pending' && (
              <p className="mt-5 rounded-xl bg-brand-50 p-3.5 text-sm text-brand-700">
                Awaiting review by facilities staff. Once verified, it will be prioritized and scheduled.
              </p>
            )}
          </section>

          {/* Updates */}
          <section className="card p-5 sm:p-6">
            <h2 className="mb-4 font-semibold">Maintenance updates</h2>
            <ol className="relative space-y-5 border-l-2 border-line pl-6">
              {[...history].reverse().map((h) => (
                <li key={h.id} className="relative">
                  <span
                    className={cx(
                      'absolute -left-[33px] top-0.5 grid size-5 place-items-center rounded-full ring-4 ring-white',
                      h.newStatus === 'resolved' ? 'bg-success-600' : h.kind === 'note' ? 'bg-slate-400' : 'bg-brand-600',
                    )}
                    aria-hidden
                  >
                    {h.kind === 'note' ? <MessageSquare className="size-2.5 text-white" /> : <span className="size-1.5 rounded-full bg-white" />}
                  </span>
                  <p className="text-sm font-semibold">{describe(h)}</p>
                  {h.note && h.note !== 'Issue reported' && <p className="mt-0.5 text-sm text-ink/80">{h.note}</p>}
                  <p className="mt-0.5 text-xs text-muted">
                    {formatDateTime(h.createdAt)}
                    {h.changedByName && ` · ${h.changedByName}`}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/* Actions */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {isStaff && <StaffReviewPanel key={issue.id + issue.updatedAt} issue={issue} />}
          {issue.duplicateOfIssueId && (
            <Link to={`/issues/${issue.duplicateOfIssueId}`} className="card flex items-center justify-between p-4 text-sm font-semibold text-brand-600 hover:bg-brand-50">
              View the original report <ArrowLeft className="size-4 rotate-180" />
            </Link>
          )}
          <section className="card p-5">
            <div className="flex items-baseline justify-between">
              <p className="text-3xl font-bold tabular-nums">{issue.supporterCount}</p>
              <p className="text-sm text-muted">{issue.supporterCount === 1 ? 'person' : 'people'} also affected</p>
            </div>
            <div className="mt-4 space-y-2.5">
              {isStaff ? null : isMine ? (
                <p className="flex items-center gap-2 rounded-xl bg-canvas p-3 text-sm text-muted">
                  <UserRound className="size-4" /> You reported this issue.
                </p>
              ) : (
                <Button
                  className="w-full"
                  variant={issue.supportedByMe ? 'secondary' : 'primary'}
                  icon={issue.supportedByMe ? CircleCheck : ThumbsUp}
                  loading={busy === 'support'}
                  disabled={issue.repairStatus === 'resolved' && !issue.supportedByMe}
                  onClick={() =>
                    act('support', () => api.setSupport(issue.id, !issue.supportedByMe), issue.supportedByMe ? 'Support removed' : 'Thanks — your support was added')
                  }
                >
                  {issue.supportedByMe ? 'You support this' : 'I’m experiencing this too'}
                </Button>
              )}
              <Button
                className="w-full"
                variant="secondary"
                icon={issue.followedByMe ? BellRing : Bell}
                loading={busy === 'follow'}
                onClick={() => act('follow', () => api.setFollow(issue.id, !issue.followedByMe), issue.followedByMe ? 'Stopped following' : 'You’ll follow updates on this report')}
              >
                {issue.followedByMe ? 'Following updates' : 'Follow updates'}
              </Button>
              <ButtonLink to={`/map?issue=${issue.id}`} variant="ghost" icon={Map} className="w-full">
                View location on map
              </ButtonLink>
            </div>
          </section>

          {issue.repairStatus === 'resolved' && !isStaff && (
            <section className="card border-success-100 p-5">
              <h2 className="flex items-center gap-2 font-semibold">
                <CircleCheck className="size-5 text-success-600" /> Marked resolved
              </h2>
              <p className="mt-1 text-sm text-muted">Does it look fixed to you?</p>
              {confirmed !== null ? (
                <p className="mt-3 text-sm font-medium text-success-700">Thanks for confirming — this helps facilities close the loop.</p>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={ThumbsUp}
                    loading={busy === 'fixed'}
                    onClick={() => act('fixed', () => api.confirmResolution(issue.id, true).then(() => setConfirmed(true)), 'Thanks for confirming!')}
                  >
                    Looks fixed
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={ThumbsDown}
                    loading={busy === 'notfixed'}
                    onClick={() => act('notfixed', () => api.confirmResolution(issue.id, false).then(() => setConfirmed(false)), 'Thanks — facilities will be notified')}
                  >
                    Still broken
                  </Button>
                </div>
              )}
            </section>
          )}

          <section className="card p-5 text-sm">
            <dl className="space-y-2.5">
              <div className="flex justify-between">
                <dt className="text-muted">Review</dt>
                <dd>
                  <Badge tone={issue.verificationStatus === 'verified' ? 'green' : 'neutral'}>{VERIFICATION_LABEL[issue.verificationStatus]}</Badge>
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Priority</dt>
                <dd>{issue.verificationStatus === 'verified' ? <PriorityBadge priority={issue.priority} /> : <span className="text-muted">Set after review</span>}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Last updated</dt>
                <dd>{timeAgo(issue.updatedAt)}</dd>
              </div>
            </dl>
            {issue.isSample && <p className="mt-4 text-xs text-muted">Fictional sample record for demonstration — not a real campus condition.</p>}
          </section>

          <Link to={`/issues?building=${issue.buildingId}`} className="block text-center text-sm font-semibold text-brand-600 hover:underline">
            More issues in {issue.buildingName}
          </Link>
        </aside>
      </div>
    </div>
  )
}
