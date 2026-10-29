import { Link } from 'react-router-dom'
import { ArrowRight, Inbox } from 'lucide-react'
import type { Issue } from '../lib/types'
import { categoryLabel } from '../lib/constants'
import { formatDate, timeAgo } from '../lib/format'
import { CategoryIcon, EmptyState, PriorityBadge, RepairBadge, SampleTag, VerificationBadge, Skeleton } from './ui'

/** Facilities table — becomes stacked cards on small screens. */
export function IssuesTable({ issues, loading, emptyTitle = 'Nothing here', emptyBody, dateField = 'createdAt' }: {
  issues: Issue[]
  loading?: boolean
  emptyTitle?: string
  emptyBody?: string
  dateField?: 'createdAt' | 'resolvedAt'
}) {
  if (loading) {
    return (
      <div className="card space-y-3 p-4">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    )
  }
  if (!issues.length) {
    return (
      <div className="card">
        <EmptyState icon={Inbox} title={emptyTitle} body={emptyBody} />
      </div>
    )
  }
  const action = (i: Issue) => (i.verificationStatus === 'pending' ? 'Review' : i.repairStatus === 'resolved' ? 'View' : 'Update')
  const date = (i: Issue) => (dateField === 'resolvedAt' && i.resolvedAt ? i.resolvedAt : i.createdAt)
  return (
    <>
      {/* Desktop / tablet table */}
      <div className="card hidden overflow-x-auto md:block" tabIndex={0} role="region" aria-label="Issues table">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-line bg-canvas/70 text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Building</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Verification</th>
              <th className="px-4 py-3">Repair</th>
              <th className="px-4 py-3">{dateField === 'resolvedAt' ? 'Resolved' : 'Reported'}</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {issues.map((i) => (
              <tr key={i.id} className="transition hover:bg-canvas/60">
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold text-muted">{i.refCode}</td>
                <td className="max-w-[260px] px-4 py-3">
                  <Link to={`/issues/${i.id}`} className="line-clamp-1 font-semibold hover:text-brand-700">
                    {i.title}
                  </Link>
                  <span className="flex items-center gap-1.5 text-xs text-muted">
                    {[i.floor, i.room].filter(Boolean).join(' · ')} {i.isSample && <SampleTag />}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3">{i.buildingName.replace(' Building', '')}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span className="flex items-center gap-2">
                    <CategoryIcon category={i.category} size="sm" /> {categoryLabel(i.category)}
                  </span>
                </td>
                <td className="px-4 py-3">{i.verificationStatus === 'verified' ? <PriorityBadge priority={i.priority} /> : <span className="text-xs text-muted">—</span>}</td>
                <td className="px-4 py-3">
                  <VerificationBadge status={i.verificationStatus} />
                </td>
                <td className="px-4 py-3">
                  <RepairBadge status={i.repairStatus} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted" title={formatDate(date(i))}>
                  {timeAgo(date(i))}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    to={`/issues/${i.id}`}
                    className={
                      i.verificationStatus === 'pending'
                        ? 'inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700'
                        : 'inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:bg-slate-50'
                    }
                  >
                    {action(i)} <ArrowRight className="size-3.5" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phone cards */}
      <ul className="space-y-2.5 md:hidden">
        {issues.map((i) => (
          <li key={i.id}>
            <Link to={`/issues/${i.id}`} className="card flex gap-3 p-3.5">
              <CategoryIcon category={i.category} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-muted">{i.refCode}</span>
                  <span className="text-xs text-muted">{timeAgo(date(i))}</span>
                </div>
                <p className="mt-0.5 line-clamp-2 font-semibold leading-snug">{i.title}</p>
                <p className="truncate text-xs text-muted">{[i.buildingName, i.floor, i.room].filter(Boolean).join(' · ')}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <VerificationBadge status={i.verificationStatus} />
                  <RepairBadge status={i.repairStatus} />
                  {i.verificationStatus === 'verified' && <PriorityBadge priority={i.priority} />}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
