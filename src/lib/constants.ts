import type { IssueCategory, Priority, RepairStatus, VerificationStatus } from './types'

export const CATEGORIES: { value: IssueCategory; label: string; hint: string }[] = [
  { value: 'plumbing', label: 'Plumbing', hint: 'Leaks, clogs, sinks, toilets, fountains' },
  { value: 'electrical', label: 'Electrical', hint: 'Lights, outlets, power, wiring' },
  { value: 'furniture', label: 'Furniture', hint: 'Chairs, desks, tables, shelving' },
  { value: 'heating_cooling', label: 'Heating & Cooling', hint: 'Too hot, too cold, vents, radiators' },
  { value: 'cleaning', label: 'Cleaning', hint: 'Spills, trash, restrooms, odors' },
  { value: 'building_damage', label: 'Building Damage', hint: 'Ceilings, walls, doors, windows, floors' },
  { value: 'safety', label: 'Safety', hint: 'Trip hazards, exposed wiring, broken locks' },
  { value: 'other', label: 'Other', hint: 'Anything else about the physical campus' },
]

export const categoryLabel = (c: IssueCategory) => CATEGORIES.find((x) => x.value === c)?.label ?? 'Other'

export const REPAIR_LABEL: Record<RepairStatus, string> = {
  reported: 'Reported',
  in_progress: 'In Progress',
  resolved: 'Resolved',
}

export const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  pending: 'Awaiting review',
  verified: 'Verified',
  rejected: 'Not accepted',
  merged: 'Merged duplicate',
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
}

export const POINTS = {
  firstReporter: 50,
  usefulPhoto: 10,
  verifiedSupport: 5,
  originalResolved: 20,
  resolutionConfirmed: 10,
} as const

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024
export const ACCEPTED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
