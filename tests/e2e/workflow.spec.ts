import { test, expect, signIn, fileReport, wallet } from './fixtures'

async function woodlandScore(page: import('@playwright/test').Page) {
  await page.goto('/buildings')
  const card = page.locator('article', { hasText: 'Woodland Building' })
  await expect(card).toBeVisible()
  return Number((await card.innerText()).match(/^(\d+)/)?.[1])
}

test('report → verify → in progress → resolved: points, health and history', async ({ page }) => {
  await signIn(page, 'Alex Rivera')
  const start = await wallet(page)
  const healthBefore = await woodlandScore(page)
  const url = await fileReport(page, {
    building: 'woodland', floor: 'Second Floor', room: 'Room 210', category: /Electrical/,
    title: 'Outlet sparks when plugging in laptop', description: 'The outlet under the window sparks and smells burnt.',
  })
  await expect(page.getByText('Facilities review')).toHaveCount(0) // students never see staff controls

  await signIn(page, 'Taylor Brooks')
  await page.goto(url)
  await page.getByRole('radio', { name: 'High' }).click()
  await page.fill('#review-note', 'Electrician notified.')
  await page.getByRole('button', { name: 'Verify' }).click()
  await page.fill('#progress-note', 'Breaker off, part ordered.')
  await page.getByRole('button', { name: 'Mark In Progress' }).click()
  await expect(page.getByRole('button', { name: 'Mark Resolved' })).toBeVisible()

  await signIn(page, 'Alex Rivera')
  const verified = await wallet(page)
  expect(verified.available).toBe(start.available + 50) // released once on verification
  expect(await woodlandScore(page)).toBe(healthBefore - 7) // open high-priority issue

  await signIn(page, 'Taylor Brooks')
  await page.goto(url)
  await page.getByRole('button', { name: 'Mark Resolved' }).click()
  await expect(page.getByRole('button', { name: 'Reopen' })).toBeVisible()
  const history = page.locator('section', { hasText: 'Maintenance updates' })
  for (const t of ['Issue reported', 'Verified', 'Electrician notified.', 'Marked In Progress', 'Breaker off, part ordered.', 'Marked Resolved']) {
    await expect(history).toContainText(t)
  }

  await signIn(page, 'Alex Rivera')
  expect((await wallet(page)).available).toBe(start.available + 70) // +20 when resolved
  expect(await woodlandScore(page)).toBe(Math.min(100, healthBefore + 2)) // recovery bonus
  await page.goto('/')
  await page.getByRole('button', { name: /Notifications, \d+ unread/ }).click()
  await expect(page.getByRole('dialog', { name: 'Notifications' })).toContainText('Issue resolved')
})

test('staff can review their own report but earn no points', async ({ page }) => {
  await signIn(page, 'Taylor Brooks')
  await expect(page.getByRole('heading', { name: 'Needs review' })).toBeVisible()
  await fileReport(page, { building: 'lares', floor: 'Ground Floor', room: 'Lobby', category: /Cleaning/, title: 'Muddy floor at lobby entrance', description: 'Mud tracked across the lobby floor near the doors.' })
  await expect(page.getByText('You can review it, but it won’t earn you points.')).toBeVisible()
  await page.getByRole('button', { name: 'Verify' }).click()
  await page.getByRole('button', { name: 'Mark Resolved' }).click()
  await expect(page.getByRole('button', { name: 'Reopen' })).toBeVisible()
  const w = await wallet(page)
  expect([w.available, w.pending]).toEqual([0, 0])
})

test('merging a duplicate', async ({ page }) => {
  await signIn(page, 'Taylor Brooks')
  await page.goto('/issues/seed-1008')
  await page.getByText('Merge as duplicate').click()
  await page.selectOption('#merge-target', 'seed-1007')
  await page.getByRole('button', { name: 'Merge', exact: true }).click()
  await expect(page.getByText('View the original report')).toBeVisible()
  await signIn(page, 'Alex Rivera')
  await page.goto('/issues?q=projector')
  await expect(page.locator('main a[href^="/issues/seed"]')).toHaveCount(0) // hidden from students
})

test('staff queues and building health page', async ({ page }) => {
  await signIn(page, 'Taylor Brooks')
  await page.goto('/staff/incoming')
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await page.goto('/issues')
  await expect(page.locator('thead')).toHaveCount(1)
  await page.goto('/buildings')
  const cards = page.locator('article')
  await expect(cards).toHaveCount(8)
  await expect(cards.first()).toContainText('#1')
})

test('rewards: redeem, history, achievements; admin refunds and edits', async ({ page }) => {
  await signIn(page, 'Alex Rivera')
  const w0 = await wallet(page)
  await page.getByRole('button', { name: /Redeem for 500 points/ }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Redeem', exact: true }).click()
  await expect(page.getByRole('dialog').getByText(/DEMO-/)).toBeVisible()
  await page.getByRole('button', { name: 'Done' }).click()
  const w1 = await wallet(page)
  expect([w1.available, w1.redeemed]).toEqual([w0.available - 500, 500])
  await expect(page.getByText(/more points needed/).first()).toBeVisible()
  await page.getByRole('tab', { name: /Points History/ }).click()
  await expect(page.getByRole('main')).toContainText('Reward redeemed')
  await page.getByRole('tab', { name: /Achievements/ }).click()
  await expect(page.locator('article', { hasText: 'First Fix' })).toContainText('Unlocked')

  await signIn(page, 'Casey Morgan')
  await expect(page.locator('section[aria-label="Key figures"]')).toContainText(/Mock redemptions\s*1/)
  await page.goto('/admin/rewards')
  await page.fill('#rw-pts-00000000-0000-4000-8003-000000000004', '650')
  await page.locator('form').filter({ has: page.locator('#rw-pts-00000000-0000-4000-8003-000000000004') }).getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Reward updated')).toBeVisible()
  await page.getByRole('button', { name: /Cancel & refund/ }).click()
  await expect(page.getByText('Cancelled and points refunded')).toBeVisible()
  await page.goto('/admin/locations')
  await page.locator('tr', { hasText: 'Cloverly Building' }).getByRole('checkbox').uncheck()
  await expect(page.getByText('Cloverly Building hidden from reporting')).toBeVisible()

  await signIn(page, 'Alex Rivera')
  expect((await wallet(page)).available).toBe(w0.available)
  await expect(page.getByText('650').first()).toBeVisible()
  await page.goto('/report')
  await expect(page.getByRole('button', { name: /Lares/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Cloverly/ })).toHaveCount(0)
})
