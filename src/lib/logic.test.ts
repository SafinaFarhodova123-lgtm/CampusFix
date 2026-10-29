import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findDuplicates, scoreDuplicate, textSimilarity, DUPLICATE_THRESHOLD } from './similarity'
import { computeBuildingHealth, healthBand } from './health'
import type { Building, Issue } from './types'

const building = (id: string): Building => ({
  id, campusId: 'c', slug: id, name: id, shortName: id, latitude: null, longitude: null, geoSource: 'schematic', floors: [], footprint: null, heightM: 10, active: true,
})

let n = 0
const issue = (over: Partial<Issue>): Issue => ({
  id: `i${++n}`, refCode: `CF-${1000 + n}`, reporterId: null, reporterName: null, campusId: 'c', buildingId: 'woodland',
  buildingName: 'Woodland', floor: null, room: null, locationNote: null, title: 'x', description: 'x', category: 'other',
  photoUrl: null, markerLatitude: null, markerLongitude: null, verificationStatus: 'verified', repairStatus: 'reported',
  priority: 'low', duplicateOfIssueId: null, isSample: true, createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(), resolvedAt: null, supporterCount: 0, supportedByMe: false, followedByMe: false, ...over,
})

test('spec example: dripping bathroom sink matches leaking restroom faucet', () => {
  const existing = issue({
    buildingId: 'woodland', floor: 'First Floor', room: 'Restroom', category: 'plumbing',
    title: 'Leaking faucet in Woodland first-floor restroom', description: 'Faucet leaks under the counter.',
  })
  const m = scoreDuplicate(
    { buildingId: 'woodland', floor: 'First Floor', room: '', category: 'plumbing',
      title: "Bathroom sink keeps dripping on Woodland's first floor", description: 'The sink drips all the time.' },
    existing,
  )
  assert.ok(m.score >= DUPLICATE_THRESHOLD, `score ${m.score}`)
})

test('same text in a different building is not a duplicate', () => {
  const existing = issue({ buildingId: 'lares', category: 'plumbing', title: 'Leaking faucet in restroom', description: 'Sink drips.' })
  const res = findDuplicates(
    { buildingId: 'woodland', category: 'plumbing', title: 'Leaking faucet in restroom', description: 'Sink drips.' },
    [existing],
  )
  assert.equal(res.length, 0)
})

test('unrelated issue in same building is not suggested', () => {
  const existing = issue({ buildingId: 'woodland', category: 'furniture', title: 'Broken chair in lounge', description: 'Chair leg cracked.' })
  const res = findDuplicates(
    { buildingId: 'woodland', category: 'electrical', title: 'Flickering hallway light', description: 'Light panel flickers.' },
    [existing],
  )
  assert.equal(res.length, 0)
})

test('resolved, rejected and merged issues are never suggested', () => {
  const base = { buildingId: 'woodland', category: 'plumbing' as const, title: 'Leaking faucet', description: 'Sink drips constantly.' }
  const res = findDuplicates(base, [
    issue({ ...base, repairStatus: 'resolved', resolvedAt: new Date().toISOString() }),
    issue({ ...base, verificationStatus: 'rejected' }),
    issue({ ...base, verificationStatus: 'merged' }),
  ])
  assert.equal(res.length, 0)
})

test('text similarity is symmetric-ish and bounded', () => {
  const s = textSimilarity('Heating not working in classroom', 'Classroom radiator cold')
  assert.ok(s > 0.3 && s <= 1)
  assert.equal(textSimilarity('', 'anything'), 0)
})

test('health: no verified history → insufficient data', () => {
  const h = computeBuildingHealth(building('rydal'), [issue({ buildingId: 'rydal', verificationStatus: 'pending' })])
  assert.equal(h.score, null)
  assert.equal(healthBand(h.score), 'none')
})

test('health: penalties per priority, pending/merged excluded', () => {
  const b = building('w')
  const h = computeBuildingHealth(b, [
    issue({ buildingId: 'w', priority: 'critical' }),
    issue({ buildingId: 'w', priority: 'high' }),
    issue({ buildingId: 'w', priority: 'medium' }),
    issue({ buildingId: 'w', priority: 'low' }),
    issue({ buildingId: 'w', priority: 'critical', verificationStatus: 'pending' }),
    issue({ buildingId: 'w', priority: 'critical', verificationStatus: 'merged' }),
  ])
  assert.equal(h.score, 100 - 12 - 7 - 4 - 2)
  assert.equal(h.openIssues, 4)
})

test('health: recovery bonus +2 per recent fix, capped at +10, old fixes ignored, clamped to 100', () => {
  const now = Date.now()
  const recent = new Date(now - 5 * 86_400_000).toISOString()
  const old = new Date(now - 60 * 86_400_000).toISOString()
  const b = building('w')
  const fixes = Array.from({ length: 7 }, () => issue({ buildingId: 'w', repairStatus: 'resolved', resolvedAt: recent }))
  const h = computeBuildingHealth(b, [issue({ buildingId: 'w', priority: 'critical' }), ...fixes,
    issue({ buildingId: 'w', repairStatus: 'resolved', resolvedAt: old })], now)
  assert.equal(h.score, 100 - 12 + 10)
  const clean = computeBuildingHealth(b, fixes, now)
  assert.equal(clean.score, 100)
})

test('health: never below zero; bands', () => {
  const b = building('w')
  const h = computeBuildingHealth(b, Array.from({ length: 10 }, () => issue({ buildingId: 'w', priority: 'critical' })))
  assert.equal(h.score, 0)
  assert.equal(healthBand(90), 'good')
  assert.equal(healthBand(70), 'attention')
  assert.equal(healthBand(50), 'improve')
  assert.equal(healthBand(10), 'critical')
})
