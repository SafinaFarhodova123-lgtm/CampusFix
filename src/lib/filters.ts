import type { Issue, IssueFilters } from './types'
import { categoryLabel } from './constants'

/** Shared search / filter / sort so both data drivers behave identically. */
export function applyFilters(issues: Issue[], f: IssueFilters = {}): Issue[] {
  const q = (f.search ?? '').trim().toLowerCase()
  let out = issues.filter((i) => {
    if (f.buildingId && i.buildingId !== f.buildingId) return false
    if (f.category && i.category !== f.category) return false
    if (f.status === 'pending_review' && i.verificationStatus !== 'pending') return false
    if (f.status && f.status !== 'pending_review' && i.repairStatus !== f.status) return false
    if (q) {
      const hay = `${i.refCode} ${i.title} ${i.description} ${i.buildingName} ${i.room ?? ''} ${i.floor ?? ''} ${categoryLabel(i.category)}`.toLowerCase()
      if (!q.split(/\s+/).every((word) => hay.includes(word))) return false
    }
    return true
  })
  const sort = f.sort ?? 'newest'
  out = [...out].sort((a, b) => {
    if (sort === 'supporters') return b.supporterCount - a.supporterCount || b.createdAt.localeCompare(a.createdAt)
    if (sort === 'oldest') return a.createdAt.localeCompare(b.createdAt)
    return b.createdAt.localeCompare(a.createdAt)
  })
  return out
}

/** Issues that are publicly visible in feeds (rejected and merged duplicates hidden). */
export const isPublic = (i: Issue) => i.verificationStatus !== 'rejected' && i.verificationStatus !== 'merged'
