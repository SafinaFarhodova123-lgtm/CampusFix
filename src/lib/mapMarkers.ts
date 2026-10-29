import type { Building, Issue, Priority } from './types'

/** Marker colour rules from the spec. */
export type PinTone = 'red' | 'orange' | 'blue' | 'green'
const DAY = 86_400_000

export const RECENT_RESOLVED_DAYS = 30

export function pinTone(i: Issue): PinTone {
  if (i.repairStatus === 'resolved') return 'green'
  if (i.verificationStatus === 'pending') return 'blue' // newly reported, not yet prioritised
  if (i.priority === 'critical' || i.priority === 'high') return 'red'
  if (i.priority === 'medium') return 'orange'
  return 'blue'
}

export const PIN_COLOR: Record<PinTone, string> = {
  red: '#DC2626',
  orange: '#EA580C',
  blue: '#1E5AA8',
  green: '#15803D',
}

/** Issues worth drawing: active ones plus fixes from the last 30 days. Rejected/merged never shown. */
export function isMappable(i: Issue, now = Date.now()) {
  if (i.verificationStatus === 'rejected' || i.verificationStatus === 'merged') return false
  if (i.repairStatus !== 'resolved') return true
  return !!i.resolvedAt && now - new Date(i.resolvedAt).getTime() <= RECENT_RESOLVED_DAYS * DAY
}

const TONE_RANK: Record<PinTone, number> = { red: 3, orange: 2, blue: 1, green: 0 }
export const worstTone = (issues: Issue[]): PinTone | null =>
  issues.length ? issues.map(pinTone).reduce((a, b) => (TONE_RANK[b] > TONE_RANK[a] ? b : a)) : null

/**
 * Where to draw an issue. A user-placed pin wins; otherwise issues fan out around the building
 * centre (golden-angle spiral) so they don't stack. This is a visual position only — the
 * floor/room fields are the authoritative indoor location.
 */
export function issuePosition(issue: Issue, building: Building | undefined, indexInBuilding: number): [number, number] | null {
  if (issue.markerLatitude != null && issue.markerLongitude != null) return [issue.markerLongitude, issue.markerLatitude]
  if (!building || building.latitude == null || building.longitude == null) return null
  const angle = indexInBuilding * 2.39996
  const r = indexInBuilding === 0 ? 0 : 7 + 5 * Math.sqrt(indexInBuilding)
  const dLat = (r * Math.sin(angle)) / 111_320
  const dLng = (r * Math.cos(angle)) / (111_320 * Math.cos((building.latitude * Math.PI) / 180))
  return [building.longitude + dLng, building.latitude + dLat]
}

export const PRIORITY_ORDER: Priority[] = ['critical', 'high', 'medium', 'low']
