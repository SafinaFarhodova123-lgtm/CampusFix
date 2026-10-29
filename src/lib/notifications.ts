import type { AppNotification, PointsTx } from './types'
import { PRIORITY_LABEL, REPAIR_LABEL } from './constants'

export const ACTION_LABEL: Record<PointsTx['action'], string> = {
  first_reporter: 'First verified reporter',
  useful_photo: 'Useful photo',
  verified_support: 'Verified support',
  original_resolved: 'Your report was resolved',
  resolution_confirmed: 'Confirmed a fix',
  redemption: 'Reward redeemed',
  adjustment: 'Adjustment',
}

interface HistoryLike {
  id: string
  issueId: string
  issueRef: string
  issueTitle: string
  kind: string
  newStatus: string | null
  note: string | null
  createdAt: string
}

/** Turns an issue-history row (on an issue the user follows) into a readable notification. */
export function historyNotification(h: HistoryLike): AppNotification {
  const base = { id: `h-${h.id}`, issueId: h.issueId, createdAt: h.createdAt }
  const subject = `${h.issueRef} · ${h.issueTitle}`
  if (h.kind === 'verification' && h.newStatus === 'verified') return { ...base, title: 'Report verified', body: subject, tone: 'success' }
  if (h.kind === 'verification' && h.newStatus === 'rejected')
    return { ...base, title: 'Report not accepted', body: h.note ? `${subject} — ${h.note}` : subject, tone: 'warning' }
  if (h.kind === 'merge') return { ...base, title: 'Merged into an existing report', body: subject, tone: 'info' }
  if (h.kind === 'priority')
    return { ...base, title: `Priority set to ${PRIORITY_LABEL[h.newStatus as keyof typeof PRIORITY_LABEL] ?? h.newStatus}`, body: subject, tone: 'info' }
  if (h.kind === 'repair' && h.newStatus === 'in_progress') return { ...base, title: 'Work started', body: h.note ? `${subject} — ${h.note}` : subject, tone: 'info' }
  if (h.kind === 'repair' && h.newStatus === 'resolved') return { ...base, title: 'Issue resolved', body: subject, tone: 'success' }
  if (h.kind === 'repair' && h.newStatus) return { ...base, title: `Marked ${REPAIR_LABEL[h.newStatus as keyof typeof REPAIR_LABEL] ?? h.newStatus}`, body: subject, tone: 'info' }
  return { ...base, title: 'Maintenance update', body: h.note ? `${subject} — ${h.note}` : subject, tone: 'info' }
}

/** Released (available) points and redemptions become notifications too. */
export function pointsNotification(t: PointsTx): AppNotification | null {
  if (t.status !== 'available') return null
  if (t.action === 'redemption') return { id: `p-${t.id}`, issueId: null, title: 'Mock reward redeemed', body: `${Math.abs(t.points)} points spent`, tone: 'points', createdAt: t.createdAt }
  if (t.points <= 0) return null
  return {
    id: `p-${t.id}`,
    issueId: t.issueId,
    title: `+${t.points} points`,
    body: t.issueTitle ? `${ACTION_LABEL[t.action]} · ${t.issueTitle}` : ACTION_LABEL[t.action],
    tone: 'points',
    createdAt: t.createdAt,
  }
}

export const sortNotifications = (list: AppNotification[]) => [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 40)

/** Short, human, non-guessable-looking code for a MOCK voucher (not redeemable anywhere). */
export const mockVoucherCode = (redemptionId: string) =>
  'DEMO-' + redemptionId.replace(/[^a-z0-9]/gi, '').slice(-8).toUpperCase().replace(/(.{4})/, '$1-')
