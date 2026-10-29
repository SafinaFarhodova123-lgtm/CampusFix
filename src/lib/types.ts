import type { MultiPolygon, Polygon } from 'geojson'

export type UserRole = 'student' | 'faculty' | 'staff' | 'admin'
export type IssueCategory =
  | 'plumbing'
  | 'electrical'
  | 'furniture'
  | 'heating_cooling'
  | 'cleaning'
  | 'building_damage'
  | 'safety'
  | 'other'
export type VerificationStatus = 'pending' | 'verified' | 'rejected' | 'merged'
export type RepairStatus = 'reported' | 'in_progress' | 'resolved'
export type Priority = 'low' | 'medium' | 'high' | 'critical'
export type PointsStatus = 'pending' | 'available' | 'void'

export interface Profile {
  id: string
  displayName: string
  role: UserRole
}

export interface Campus {
  id: string
  slug: string
  name: string
  centerLatitude: number
  centerLongitude: number
}

export interface Building {
  id: string
  campusId: string
  slug: string
  name: string
  shortName: string
  latitude: number | null
  longitude: number | null
  /** e.g. 'schematic' (hand-traced, approximate) or 'osm:way/123' */
  geoSource: string
  floors: string[]
  footprint: Polygon | MultiPolygon | null
  heightM: number
  active: boolean
}

export interface Issue {
  id: string
  refCode: string
  reporterId: string | null
  reporterName: string | null
  campusId: string
  buildingId: string
  buildingName: string
  floor: string | null
  room: string | null
  locationNote: string | null
  title: string
  description: string
  category: IssueCategory
  photoUrl: string | null
  markerLatitude: number | null
  markerLongitude: number | null
  verificationStatus: VerificationStatus
  repairStatus: RepairStatus
  priority: Priority
  duplicateOfIssueId: string | null
  isSample: boolean
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
  supporterCount: number
  supportedByMe: boolean
  followedByMe: boolean
}

export interface StatusHistoryEntry {
  id: string
  issueId: string
  kind: 'verification' | 'repair' | 'priority' | 'note' | 'merge'
  previousStatus: string | null
  newStatus: string | null
  changedByName: string | null
  note: string | null
  createdAt: string
}

export interface PointsSummary {
  available: number
  pending: number
  lifetimeEarned: number
  redeemed: number
}

export interface NewIssueInput {
  buildingId: string
  floor: string
  room: string
  locationNote: string
  title: string
  description: string
  category: IssueCategory
  photo: Blob | null
  markerLatitude?: number | null
  markerLongitude?: number | null
}

export interface IssueFilters {
  search?: string
  buildingId?: string
  category?: IssueCategory | ''
  status?: RepairStatus | 'pending_review' | ''
  sort?: 'newest' | 'oldest' | 'supporters'
}

export interface BuildingHealth {
  buildingId: string
  name: string
  score: number | null
  openIssues: number
  resolvedIssues: number
  openByPriority: Record<Priority, number>
}

export type PointsAction =
  | 'first_reporter'
  | 'useful_photo'
  | 'verified_support'
  | 'original_resolved'
  | 'resolution_confirmed'
  | 'redemption'
  | 'adjustment'

export interface PointsTx {
  id: string
  userId: string
  userName: string | null
  issueId: string | null
  issueTitle: string | null
  issueRef: string | null
  action: PointsAction
  points: number
  status: PointsStatus
  createdAt: string
}

export type RewardImage = 'gift' | 'book' | 'dining' | 'merch'
export interface Reward {
  id: string
  title: string
  description: string
  pointsRequired: number
  imageKey: RewardImage
  active: boolean
}

export type RedemptionStatus = 'requested' | 'fulfilled' | 'cancelled'
export interface Redemption {
  id: string
  userId: string
  userName: string | null
  rewardId: string
  rewardTitle: string
  imageKey: RewardImage
  pointsSpent: number
  status: RedemptionStatus
  createdAt: string
}

export interface AppNotification {
  id: string
  issueId: string | null
  title: string
  body: string
  tone: 'info' | 'success' | 'warning' | 'points'
  createdAt: string
}
