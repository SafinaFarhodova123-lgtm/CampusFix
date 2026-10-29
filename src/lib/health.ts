import type { Building, BuildingHealth, Issue, Priority } from './types'

/**
 * Building Health Score — an illustrative maintenance indicator, not a safety assessment.
 * Mirrors the `building_health` SQL view so both drivers agree.
 */
export const PENALTY: Record<Priority, number> = { critical: 12, high: 7, medium: 4, low: 2 }
export const RECOVERY_PER_ISSUE = 2
export const RECOVERY_MAX = 10
const DAY = 86_400_000

export function computeBuildingHealth(building: Building, issues: Issue[], now = Date.now()): BuildingHealth {
  const verified = issues.filter((i) => i.buildingId === building.id && i.verificationStatus === 'verified')
  const open = verified.filter((i) => i.repairStatus !== 'resolved')
  const resolved = verified.filter((i) => i.repairStatus === 'resolved')
  const openByPriority: Record<Priority, number> = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const i of open) openByPriority[i.priority]++

  let score: number | null = null
  if (verified.length > 0) {
    const penalty = open.reduce((sum, i) => sum + PENALTY[i.priority], 0)
    const recent = resolved.filter((i) => i.resolvedAt && now - new Date(i.resolvedAt).getTime() <= 30 * DAY).length
    const bonus = Math.min(RECOVERY_MAX, recent * RECOVERY_PER_ISSUE)
    score = Math.max(0, Math.min(100, 100 - penalty + bonus))
  }

  return {
    buildingId: building.id,
    name: building.name,
    score,
    openIssues: open.length,
    resolvedIssues: resolved.length,
    openByPriority,
  }
}

export type HealthBand = 'good' | 'attention' | 'improve' | 'critical' | 'none'

export function healthBand(score: number | null): HealthBand {
  if (score === null) return 'none'
  if (score >= 85) return 'good'
  if (score >= 65) return 'attention'
  if (score >= 40) return 'improve'
  return 'critical'
}

export const HEALTH_BAND_META: Record<HealthBand, { label: string; color: string; bg: string; text: string }> = {
  good: { label: 'Good', color: '#15803D', bg: 'bg-success-50', text: 'text-success-700' },
  attention: { label: 'Attention Needed', color: '#CA8A04', bg: 'bg-yellow-50', text: 'text-yellow-800' },
  improve: { label: 'Needs Improvement', color: '#EA580C', bg: 'bg-orange-50', text: 'text-orange-800' },
  critical: { label: 'Critical Attention', color: '#DC2626', bg: 'bg-danger-50', text: 'text-danger-700' },
  none: { label: 'Insufficient Data', color: '#94A3B8', bg: 'bg-slate-100', text: 'text-slate-600' },
}
