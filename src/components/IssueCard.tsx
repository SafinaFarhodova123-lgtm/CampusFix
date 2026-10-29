import { Link } from 'react-router-dom'
import { MapPin, ThumbsUp } from 'lucide-react'
import type { Issue } from '../lib/types'
import { categoryLabel } from '../lib/constants'
import { timeAgo } from '../lib/format'
import { IssueImage, IssueStatusBadge, SampleTag, cx } from './ui'

export function IssueCard({ issue, compact }: { issue: Issue; compact?: boolean }) {
  const where = [issue.buildingName.replace(' Building', ''), issue.floor, issue.room].filter(Boolean).join(' · ')
  return (
    <Link
      to={`/issues/${issue.id}`}
      className="group card flex overflow-hidden transition hover:-translate-y-0.5 hover:shadow-pop focus-visible:-translate-y-0.5 sm:flex-col"
    >
      <IssueImage
        url={issue.photoUrl}
        category={issue.category}
        alt={issue.title}
        className={cx('w-28 shrink-0 sm:h-40 sm:w-full', compact && 'sm:h-32')}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3.5 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-semibold uppercase tracking-wide text-muted">{categoryLabel(issue.category)}</span>
          <IssueStatusBadge verification={issue.verificationStatus} repair={issue.repairStatus} />
        </div>
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink group-hover:text-brand-700">{issue.title}</h3>
        <p className="flex items-center gap-1.5 truncate text-[13px] text-muted">
          <MapPin className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{where}</span>
        </p>
        <div className="mt-auto flex items-center justify-between pt-1 text-xs text-muted">
          <span className="flex items-center gap-2">
            {timeAgo(issue.createdAt)}
            {issue.isSample && <SampleTag />}
          </span>
          <span className={cx('flex items-center gap-1 font-medium', issue.supportedByMe && 'text-brand-600')}>
            <ThumbsUp className="size-3.5" aria-hidden />
            {issue.supporterCount}
            <span className="sr-only"> supporters</span>
          </span>
        </div>
      </div>
    </Link>
  )
}

export function IssueCardSkeleton() {
  return (
    <div className="card flex overflow-hidden sm:flex-col" aria-hidden>
      <div className="skeleton h-28 w-28 rounded-none sm:h-40 sm:w-full" />
      <div className="flex-1 space-y-2.5 p-4">
        <div className="skeleton h-3 w-24" />
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-3 w-2/3" />
      </div>
    </div>
  )
}
