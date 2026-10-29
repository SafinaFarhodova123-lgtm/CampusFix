import { useState } from 'react'
import { CircleCheck, ClipboardList, Plus, ThumbsUp } from 'lucide-react'
import { useApp, useLoad } from '../context/AppContext'
import { IssueCard, IssueCardSkeleton } from '../components/IssueCard'
import { ButtonLink, EmptyState, PageHeader, cx } from '../components/ui'

type Tab = 'submitted' | 'supported' | 'resolved'

export default function MyReports() {
  const { user } = useApp()
  const [tab, setTab] = useState<Tab>('submitted')
  const { data, loading } = useLoad((api) => api.listIssues())

  const mine = (data ?? []).filter((i) => i.reporterId === user?.id)
  const supported = (data ?? []).filter((i) => i.supportedByMe)
  const resolved = [...mine, ...supported].filter((i, idx, arr) => i.repairStatus === 'resolved' && arr.findIndex((x) => x.id === i.id) === idx)
  const lists: Record<Tab, typeof mine> = { submitted: mine, supported, resolved }
  const tabs: [Tab, string, number][] = [
    ['submitted', 'Submitted', mine.length],
    ['supported', 'Supported', supported.length],
    ['resolved', 'Resolved', resolved.length],
  ]
  const shown = lists[tab]

  const empty = {
    submitted: { icon: ClipboardList, title: 'You haven’t reported anything yet', body: 'When you spot a problem on campus, report it here and track it to resolution.' },
    supported: { icon: ThumbsUp, title: 'No supported reports', body: 'Tap “I’m experiencing this too” on an existing report to add your voice.' },
    resolved: { icon: CircleCheck, title: 'Nothing resolved yet', body: 'Reports you submit or support will appear here once they’re fixed.' },
  }[tab]

  return (
    <div>
      <PageHeader title="My Reports" subtitle="Everything you’ve reported or supported, and where each one stands." actions={<ButtonLink to="/report" icon={Plus}>Report an Issue</ButtonLink>} />
      <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-line bg-white p-1 sm:inline-flex" role="tablist">
        {tabs.map(([key, label, count]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cx(
              'flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition sm:flex-none',
              tab === key ? 'bg-navy-900 text-white' : 'text-muted hover:text-ink',
            )}
          >
            {label}
            <span className={cx('rounded-full px-1.5 text-xs tabular-nums', tab === key ? 'bg-white/20' : 'bg-slate-100')}>{data ? count : '–'}</span>
          </button>
        ))}
      </div>

      {loading && !data ? (
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => <IssueCardSkeleton key={i} />)}
        </div>
      ) : shown.length === 0 ? (
        <div className="card">
          <EmptyState icon={empty.icon} title={empty.title} body={empty.body} action={tab !== 'resolved' && <ButtonLink to={tab === 'submitted' ? '/report' : '/issues'}>{tab === 'submitted' ? 'Report an Issue' : 'Explore Issues'}</ButtonLink>} />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {shown.map((i) => (
            <IssueCard key={i.id} issue={i} />
          ))}
        </div>
      )}
    </div>
  )
}
