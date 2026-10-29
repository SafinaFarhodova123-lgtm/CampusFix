import { useState } from 'react'
import { CircleCheck, CircleX, GitMerge, MessageSquare, RotateCcw, ShieldCheck, Wrench } from 'lucide-react'
import { useApp, useLoad, useToast } from '../context/AppContext'
import { Button, cx } from './ui'
import { PRIORITY_LABEL } from '../lib/constants'
import { findDuplicates } from '../lib/similarity'
import type { Issue, Priority } from '../lib/types'

const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'critical']

function PriorityPicker({ value, onChange, disabled }: { value: Priority; onChange: (p: Priority) => void; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-4 gap-1 rounded-xl bg-canvas p-1" role="radiogroup" aria-label="Priority">
      {PRIORITIES.map((p) => (
        <button
          key={p}
          type="button"
          role="radio"
          aria-checked={value === p}
          disabled={disabled}
          onClick={() => onChange(p)}
          className={cx(
            'rounded-lg py-1.5 text-xs font-semibold transition',
            value === p
              ? p === 'critical' || p === 'high'
                ? 'bg-danger-600 text-white shadow-sm'
                : p === 'medium'
                  ? 'bg-orange-700 text-white shadow-sm'
                  : 'bg-brand-600 text-white shadow-sm'
              : 'text-muted hover:bg-white hover:text-ink',
          )}
        >
          {PRIORITY_LABEL[p]}
        </button>
      ))}
    </div>
  )
}

/** Facilities controls on the issue page. Visible to staff/admin only; every action is re-checked by the backend. */
export function StaffReviewPanel({ issue }: { issue: Issue }) {
  const { api, user, refresh } = useApp()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [priority, setPriority] = useState<Priority>(issue.priority === 'low' && issue.verificationStatus === 'pending' ? 'medium' : issue.priority)
  const [photoUseful, setPhotoUseful] = useState(true)
  const [note, setNote] = useState('')
  const [mergeTarget, setMergeTarget] = useState('')
  const [showMerge, setShowMerge] = useState(false)

  const { data: candidates } = useLoad(async (a) => {
    const all = (await a.listIssues()).filter((i) => i.id !== issue.id && i.verificationStatus !== 'rejected' && i.verificationStatus !== 'merged')
    const suggested = findDuplicates(issue, all, 5).map((m) => m.issue)
    const sameBuilding = all.filter((i) => i.buildingId === issue.buildingId && i.repairStatus !== 'resolved' && !suggested.some((s) => s.id === i.id))
    return { suggested, sameBuilding }
  }, [issue.id])

  const run = async (key: string, fn: () => Promise<void>, ok: string) => {
    setBusy(key)
    try {
      await fn()
      setNote('')
      refresh()
      toast(ok)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Action failed', 'error')
    } finally {
      setBusy(null)
    }
  }

  const ownReport = issue.reporterId === user?.id
  const closed = issue.verificationStatus === 'rejected' || issue.verificationStatus === 'merged'

  return (
    <section className="card overflow-hidden border-amber-200" aria-labelledby="staff-panel-title">
      <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-5 py-3">
        <ShieldCheck className="size-4 text-amber-700" aria-hidden />
        <h2 id="staff-panel-title" className="text-sm font-semibold text-amber-900">
          Facilities review
        </h2>
      </div>

      <div className="space-y-5 p-5">
        {ownReport && !closed && (
          <p className="rounded-xl bg-canvas p-3 text-sm text-muted">You submitted this report. You can review it, but it won’t earn you points.</p>
        )}

        {closed && (
          <p className="rounded-xl bg-canvas p-3 text-sm text-muted">
            This report was {issue.verificationStatus === 'merged' ? 'merged into another report' : 'rejected'}. No further actions.
          </p>
        )}

        {/* --- Pending: verify / reject --- */}
        {issue.verificationStatus === 'pending' && (
          <div className="space-y-4">
            <div>
              <p className="label">Priority if verified</p>
              <PriorityPicker value={priority} onChange={setPriority} disabled={!!busy} />
            </div>
            {issue.photoUrl && (
              <label className={cx('flex items-center gap-2.5 text-sm', ownReport && 'hidden')}>
                <input id="photo-useful" type="checkbox" checked={photoUseful} onChange={(e) => setPhotoUseful(e.target.checked)} className="size-4 accent-brand-600" />
                Photo was useful (+10 pts to reporter)
              </label>
            )}
            <div>
              <label className="label" htmlFor="review-note">
                Note to reporter <span className="font-normal text-muted">(optional)</span>
              </label>
              <textarea id="review-note" rows={2} maxLength={1000} className="input resize-y text-sm" placeholder="e.g. Thanks — scheduled for this week." value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                icon={CircleCheck}
                loading={busy === 'verify'}
                disabled={!!busy}
                onClick={() => run('verify', () => api.reviewIssue(issue.id, 'verified', { priority, photoUseful, note }), `Verified as ${PRIORITY_LABEL[priority].toLowerCase()} priority`)}
              >
                Verify
              </Button>
              <Button
                variant="secondary"
                icon={CircleX}
                loading={busy === 'reject'}
                disabled={!!busy}
                className="text-danger-700"
                onClick={() => run('reject', () => api.reviewIssue(issue.id, 'rejected', { note }), 'Report rejected')}
              >
                Reject
              </Button>
            </div>
          </div>
        )}

        {/* --- Verified: repair workflow --- */}
        {issue.verificationStatus === 'verified' && (
          <div className="space-y-4">
            <div>
              <p className="label">Priority</p>
              <PriorityPicker
                value={issue.priority}
                disabled={!!busy}
                onChange={(p) => run('priority', () => api.setPriority(issue.id, p), `Priority set to ${PRIORITY_LABEL[p].toLowerCase()}`)}
              />
            </div>
            <div>
              <label className="label" htmlFor="progress-note">Progress note</label>
              <textarea id="progress-note" rows={2} maxLength={1000} className="input resize-y text-sm" placeholder="e.g. Part ordered, technician assigned." value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="grid gap-2">
              {issue.repairStatus === 'reported' && (
                <Button icon={Wrench} loading={busy === 'progress'} disabled={!!busy} onClick={() => run('progress', () => api.setRepairStatus(issue.id, 'in_progress', note), 'Marked in progress')}>
                  Mark In Progress
                </Button>
              )}
              {issue.repairStatus !== 'resolved' && (
                <Button
                  icon={CircleCheck}
                  variant={issue.repairStatus === 'in_progress' ? 'primary' : 'secondary'}
                  className={issue.repairStatus === 'in_progress' ? '!bg-success-600 hover:!bg-success-700' : ''}
                  loading={busy === 'resolve'}
                  disabled={!!busy}
                  onClick={() => run('resolve', () => api.setRepairStatus(issue.id, 'resolved', note), 'Marked resolved')}
                >
                  Mark Resolved
                </Button>
              )}
              {issue.repairStatus === 'resolved' && (
                <Button variant="secondary" icon={RotateCcw} loading={busy === 'reopen'} disabled={!!busy} onClick={() => run('reopen', () => api.setRepairStatus(issue.id, 'in_progress', note || 'Reopened'), 'Issue reopened')}>
                  Reopen
                </Button>
              )}
              <Button
                variant="ghost"
                icon={MessageSquare}
                loading={busy === 'note'}
                disabled={!!busy || !note.trim()}
                onClick={() => run('note', () => api.addNote(issue.id, note), 'Update posted')}
              >
                Post note only
              </Button>
            </div>
          </div>
        )}

        {/* --- Merge duplicate --- */}
        {!closed && issue.repairStatus !== 'resolved' && (
          <div className="border-t border-line pt-4">
            {!showMerge ? (
              <button onClick={() => setShowMerge(true)} className="flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline">
                <GitMerge className="size-4" /> Merge as duplicate…
                {candidates && candidates.suggested.length > 0 && (
                  <span className="rounded-full bg-brand-50 px-1.5 text-xs">{candidates.suggested.length} likely</span>
                )}
              </button>
            ) : (
              <div className="space-y-2.5">
                <label className="label" htmlFor="merge-target">Original report</label>
                <select id="merge-target" className="input text-sm" value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)}>
                  <option value="">Choose the original…</option>
                  {candidates && candidates.suggested.length > 0 && (
                    <optgroup label="Likely duplicates">
                      {candidates.suggested.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.refCode} · {i.title}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {candidates && candidates.sameBuilding.length > 0 && (
                    <optgroup label={`Other open in ${issue.buildingName}`}>
                      {candidates.sameBuilding.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.refCode} · {i.title}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <p className="text-xs text-muted">The reporter becomes a supporter of the original and doesn’t earn first-reporter points.</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="navy"
                    icon={GitMerge}
                    disabled={!mergeTarget || !!busy}
                    loading={busy === 'merge'}
                    onClick={() => run('merge', () => api.mergeIssue(issue.id, mergeTarget), 'Merged into the original report')}
                  >
                    Merge
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowMerge(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
