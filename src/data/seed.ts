import { schematicCentroid, schematicFootprint, SCHEMATIC_BUILDINGS } from './campusGeo'
import type { Building, Campus, IssueCategory, Priority, RepairStatus, VerificationStatus, UserRole } from '../lib/types'

/**
 * FICTIONAL sample data. None of these issues describe real campus conditions.
 * Building positions come from the simplified, hand-traced campus layout in campusGeo.ts
 * (geoSource = 'schematic'); they are approximate, not surveyed.
 * This module is the single source for both the in-browser demo driver and supabase/seed.sql.
 */

export const CAMPUS: Campus = {
  id: '00000000-0000-4000-8000-000000000001',
  slug: 'abington',
  name: 'Penn State Abington',
  centerLatitude: 40.1146,
  centerLongitude: -75.1113,
}

const floors3 = ['Ground Floor', 'First Floor', 'Second Floor', 'Third Floor']
const floors2 = ['Ground Floor', 'First Floor', 'Second Floor']

export const BUILDINGS: Building[] = [
  { slug: 'woodland', name: 'Woodland Building', shortName: 'Woodland', latitude: 40.1158, longitude: -75.1125, floors: floors3 },
  { slug: 'lares', name: 'Lares Building', shortName: 'Lares', latitude: 40.1152, longitude: -75.1098, floors: floors2 },
  { slug: 'sutherland', name: 'Sutherland Building', shortName: 'Sutherland', latitude: 40.1139, longitude: -75.1088, floors: floors3 },
  { slug: 'springhouse', name: 'Springhouse', shortName: 'Springhouse', latitude: 40.1163, longitude: -75.1112, floors: ['Ground Floor', 'First Floor'] },
  { slug: 'athletic', name: 'Athletic Building', shortName: 'Athletic', latitude: 40.1124, longitude: -75.1121, floors: floors2 },
  { slug: 'rydal', name: 'Rydal Building', shortName: 'Rydal', latitude: 40.1143, longitude: -75.1136, floors: floors2 },
  { slug: 'academic', name: 'Academic Building', shortName: 'Academic', latitude: 40.1131, longitude: -75.1142, floors: floors3 },
  { slug: 'cloverly', name: 'Cloverly Building', shortName: 'Cloverly', latitude: 40.1123, longitude: -75.1134, floors: floors2 },
].map((b, i) => {
  const c = schematicCentroid(b.slug)
  return {
    ...b,
    id: `00000000-0000-4000-8001-${String(i + 1).padStart(12, '0')}`,
    campusId: CAMPUS.id,
    latitude: c?.lat ?? b.latitude,
    longitude: c?.lng ?? b.longitude,
    geoSource: 'schematic',
    footprint: schematicFootprint(b.slug),
    heightM: SCHEMATIC_BUILDINGS[b.slug]?.heightM ?? 10,
    active: true,
  }
})

export const bySlug = (slug: string) => BUILDINGS.find((b) => b.slug === slug)!

export interface DemoUser {
  id: string
  displayName: string
  role: UserRole
  email: string
  blurb: string
}

export const DEMO_USERS: DemoUser[] = [
  { id: 'u-alex', displayName: 'Alex Rivera', role: 'student', email: 'alex.student@campusfix.demo', blurb: 'Student — reports & rewards' },
  { id: 'u-morgan', displayName: 'Dr. Morgan Chen', role: 'faculty', email: 'morgan.faculty@campusfix.demo', blurb: 'Faculty — same tools as students' },
  { id: 'u-taylor', displayName: 'Taylor Brooks', role: 'staff', email: 'taylor.facilities@campusfix.demo', blurb: 'Facilities staff — review & repair' },
  { id: 'u-casey', displayName: 'Casey Morgan', role: 'admin', email: 'casey.admin@campusfix.demo', blurb: 'Administrator — analytics' },
  // Background reporters (not selectable)
  { id: 'u-jordan', displayName: 'Jordan Lee', role: 'student', email: 'jordan@campusfix.demo', blurb: '' },
  { id: 'u-sam', displayName: 'Sam Patel', role: 'student', email: 'sam@campusfix.demo', blurb: '' },
]

export interface SeedIssue {
  ref: number
  building: string
  floor: string
  room: string
  title: string
  description: string
  category: IssueCategory
  priority: Priority
  verification: VerificationStatus
  repair: RepairStatus
  daysAgo: number
  resolvedDaysAgo?: number
  reporter: string | null
  supporters: string[]
  notes?: { daysAgo: number; status?: RepairStatus; note: string }[]
}

export const SEED_ISSUES: SeedIssue[] = [
  { ref: 1001, building: 'woodland', floor: 'First Floor', room: 'Restroom near Room 112', title: 'Leaking faucet in first-floor restroom',
    description: 'The left sink faucet leaks constantly and water pools under the counter.', category: 'plumbing', priority: 'medium',
    verification: 'verified', repair: 'reported', daysAgo: 2, reporter: 'u-jordan', supporters: ['u-sam', 'u-morgan'] },
  { ref: 1002, building: 'lares', floor: 'First Floor', room: 'Dining area', title: 'Broken chair in dining area',
    description: 'One of the chairs near the windows has a cracked leg and wobbles badly when you sit down.', category: 'furniture', priority: 'medium',
    verification: 'verified', repair: 'in_progress', daysAgo: 6, reporter: 'u-sam', supporters: ['u-alex'],
    notes: [{ daysAgo: 4, status: 'in_progress', note: 'Chair removed from service; replacement ordered.' }] },
  { ref: 1003, building: 'sutherland', floor: 'Second Floor', room: 'Hallway outside Room 214', title: 'Flickering light in hallway',
    description: 'Ceiling light panel flickers on and off all day. Noticeable when walking to class.', category: 'electrical', priority: 'low',
    verification: 'verified', repair: 'reported', daysAgo: 3, reporter: 'u-alex', supporters: ['u-jordan'] },
  { ref: 1004, building: 'springhouse', floor: 'First Floor', room: 'Main room', title: 'Damaged ceiling tile',
    description: 'A ceiling tile is stained and sagging in the corner of the main room.', category: 'building_damage', priority: 'medium',
    verification: 'verified', repair: 'resolved', daysAgo: 14, resolvedDaysAgo: 5, reporter: 'u-morgan', supporters: [],
    notes: [{ daysAgo: 10, status: 'in_progress', note: 'Inspected; tile replacement scheduled.' }, { daysAgo: 5, status: 'resolved', note: 'Tile replaced.' }] },
  { ref: 1005, building: 'woodland', floor: 'Second Floor', room: 'Room 218', title: 'Heating not working in classroom',
    description: 'The classroom is very cold. The radiator does not seem to turn on even with the thermostat set high.', category: 'heating_cooling', priority: 'high',
    verification: 'verified', repair: 'in_progress', daysAgo: 4, reporter: 'u-alex', supporters: ['u-jordan', 'u-sam', 'u-morgan'],
    notes: [{ daysAgo: 2, status: 'in_progress', note: 'HVAC technician assigned.' }] },
  { ref: 1006, building: 'woodland', floor: 'Ground Floor', room: 'Stairwell B', title: 'Exposed wiring by stairwell outlet',
    description: 'The outlet cover is missing near the bottom of stairwell B and wires are visible.', category: 'safety', priority: 'critical',
    verification: 'verified', repair: 'reported', daysAgo: 1, reporter: 'u-sam', supporters: ['u-alex'] },
  { ref: 1007, building: 'woodland', floor: 'First Floor', room: 'Lounge', title: 'Overflowing trash bins in lounge',
    description: 'Both trash bins in the student lounge are overflowing by the afternoon.', category: 'cleaning', priority: 'low',
    verification: 'verified', repair: 'reported', daysAgo: 1, reporter: 'u-jordan', supporters: [] },
  { ref: 1008, building: 'woodland', floor: 'Third Floor', room: 'Room 305', title: 'Projector screen will not retract',
    description: 'Pull-down projector screen is stuck halfway and blocks part of the whiteboard.', category: 'other', priority: 'low',
    verification: 'pending', repair: 'reported', daysAgo: 0, reporter: 'u-sam', supporters: [] },
  { ref: 1009, building: 'lares', floor: 'Ground Floor', room: 'Entrance', title: 'Front door closer slams shut',
    description: 'The front entrance door closer is broken so the door slams loudly and fast.', category: 'building_damage', priority: 'medium',
    verification: 'verified', repair: 'resolved', daysAgo: 20, resolvedDaysAgo: 12, reporter: 'u-jordan', supporters: ['u-alex'] },
  { ref: 1010, building: 'sutherland', floor: 'First Floor', room: 'Room 120', title: 'Window latch broken',
    description: 'Window latch in Room 120 is broken and the window cannot be closed fully.', category: 'safety', priority: 'high',
    verification: 'verified', repair: 'in_progress', daysAgo: 8, reporter: 'u-morgan', supporters: [],
    notes: [{ daysAgo: 6, status: 'in_progress', note: 'Part ordered.' }] },
  { ref: 1011, building: 'sutherland', floor: 'Ground Floor', room: 'Main restroom', title: 'Clogged sink in main restroom',
    description: 'Sink drains very slowly and water backs up.', category: 'plumbing', priority: 'medium',
    verification: 'verified', repair: 'resolved', daysAgo: 9, resolvedDaysAgo: 7, reporter: 'u-sam', supporters: [] },
  { ref: 1012, building: 'athletic', floor: 'Ground Floor', room: "Men's locker room", title: 'Locker room floor drain backing up',
    description: 'The shower floor drain backs up and water spreads across the locker room floor. Slippery.', category: 'plumbing', priority: 'critical',
    verification: 'verified', repair: 'in_progress', daysAgo: 3, reporter: 'u-jordan', supporters: ['u-sam', 'u-alex'],
    notes: [{ daysAgo: 2, status: 'in_progress', note: 'Area coned off; plumber scheduled.' }] },
  { ref: 1013, building: 'athletic', floor: 'First Floor', room: 'Gym bleachers', title: 'Loose bleacher step',
    description: 'One of the bleacher steps on the left side is loose and shifts underfoot.', category: 'safety', priority: 'high',
    verification: 'verified', repair: 'reported', daysAgo: 5, reporter: 'u-alex', supporters: [] },
  { ref: 1014, building: 'athletic', floor: 'Ground Floor', room: 'Lobby', title: 'Water bottle filler not working',
    description: 'The bottle filling station in the lobby does not dispense water.', category: 'plumbing', priority: 'medium',
    verification: 'verified', repair: 'reported', daysAgo: 6, reporter: 'u-sam', supporters: ['u-jordan'] },
  { ref: 1015, building: 'athletic', floor: 'First Floor', room: 'Gym', title: 'Several gym lights out',
    description: 'Three of the overhead lights in the gym are dark, making the far court dim.', category: 'electrical', priority: 'medium',
    verification: 'verified', repair: 'reported', daysAgo: 7, reporter: 'u-jordan', supporters: [] },
  { ref: 1016, building: 'springhouse', floor: 'Ground Floor', room: 'Kitchenette', title: 'Sticky spill on kitchenette floor',
    description: 'Large sticky spill near the kitchenette counter that has not been cleaned.', category: 'cleaning', priority: 'low',
    verification: 'verified', repair: 'resolved', daysAgo: 4, resolvedDaysAgo: 3, reporter: 'u-alex', supporters: [] },
  { ref: 1017, building: 'lares', floor: 'Second Floor', room: 'Room 204', title: 'Desk with broken writing surface',
    description: 'Fold-out writing surface on a desk in Room 204 is snapped off.', category: 'furniture', priority: 'low',
    verification: 'verified', repair: 'reported', daysAgo: 2, reporter: 'u-morgan', supporters: [] },
]
