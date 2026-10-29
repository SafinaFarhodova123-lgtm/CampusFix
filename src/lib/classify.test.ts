import { test } from 'node:test'
import assert from 'node:assert/strict'
import { routeReport, suggestCategory } from './classify'
import { computeAchievements } from './achievements'
import { mockVoucherCode } from './notifications'
import type { Issue } from './types'

const cases: [string, string | null][] = [
  ['Bathroom sink keeps dripping', 'plumbing'],
  ['Toilet will not flush on second floor', 'plumbing'],
  ['Flickering light in hallway', 'electrical'],
  ['Outlet has no power', 'electrical'],
  ['Wobbly chair in lounge', 'furniture'],
  ['Classroom is freezing, radiator cold', 'heating_cooling'],
  ['Trash overflowing near vending machines', 'cleaning'],
  ['Ceiling tile sagging and stained', 'building_damage'],
  ['Exposed wiring by the stairwell outlet', 'safety'],
  ['Hello', null],
]
for (const [text, expected] of cases) {
  test(`suggestCategory: "${text}" → ${expected}`, () => {
    assert.equal(suggestCategory(text)?.category ?? null, expected)
  })
}

test('routeReport flags emergencies, IT and non-facilities requests', () => {
  assert.equal(routeReport('I smell gas in the basement')?.kind, 'emergency')
  assert.equal(routeReport('There is smoke coming from the outlet')?.kind, 'emergency')
  assert.equal(routeReport('Wi-Fi keeps dropping in the library')?.kind, 'it')
  assert.equal(routeReport('I got a parking ticket unfairly')?.kind, 'not_facilities')
  assert.equal(routeReport('Leaking faucet in restroom'), null)
})

test('achievements are derived from records', () => {
  const base = { verificationStatus: 'verified', supportedByMe: false, reporterId: 'me' } as unknown as Issue
  const a = computeAchievements('me', [base, { ...base, reporterId: 'x', supportedByMe: true }])
  assert.deepEqual(a.map((x) => [x.id, x.earned, x.progress]), [
    ['first-fix', true, 1],
    ['campus-guardian', false, 1],
    ['community-helper', false, 1],
  ])
})

test('mock voucher code is stable and clearly labeled', () => {
  const c = mockVoucherCode('3f2a9c10-1111-4222-8333-abcdef123456')
  assert.match(c, /^DEMO-[A-Z0-9]{4}-[A-Z0-9]{4}$/)
  assert.equal(c, mockVoucherCode('3f2a9c10-1111-4222-8333-abcdef123456'))
})
