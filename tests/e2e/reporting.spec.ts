import { test, expect, signIn, fileReport, wallet } from './fixtures'

test.describe('student reporting', () => {
  test.beforeEach(async ({ page }) => signIn(page, 'Alex Rivera'))

  test('signed-out users are sent to sign-in', async ({ page }) => {
    await page.evaluate(() => localStorage.removeItem('campusfix-demo-session'))
    await page.goto('/my-reports')
    await expect(page).toHaveURL(/\/sign-in/)
  })

  test('full report flow with photo, duplicate check and pending points', async ({ page }) => {
    const before = await wallet(page)
    await page.goto('/report?building=woodland')
    await expect(page.locator('button[aria-pressed="true"]')).toContainText('Woodland')
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByText('Choose a floor.')).toBeVisible()
    await page.selectOption('#floor', 'First Floor')
    await page.fill('#room', 'Restroom')
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.fill('#title', "Bathroom sink keeps dripping on Woodland's first floor")
    await page.fill('#desc', 'The sink in the first floor bathroom drips constantly.')
    await page.getByRole('button', { name: 'Use suggestion' }).click()
    await expect(page.getByRole('button', { name: /Plumbing/ })).toHaveAttribute('aria-pressed', 'true')
    await page.setInputFiles('#photo', {
      name: 'p.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEklEQVR4nGP4z8CAB+GTG8HSALfKY52fTcuYAAAAAElFTkSuQmCC', 'base64'),
    })
    await expect(page.getByAltText('Selected photo preview')).toBeVisible()
    await page.getByRole('button', { name: 'Check for similar reports' }).click()
    // the spec's own example: dripping sink ≈ leaking faucet
    await expect(page.getByText('Leaking faucet in first-floor restroom')).toBeVisible()
    await page.getByRole('button', { name: 'This Is a Different Issue' }).click()
    await expect(page.getByText('+60 pending points')).toBeVisible()
    await page.getByRole('button', { name: 'Submit report' }).click()
    await expect(page.getByText('Your issue has been reported!')).toBeVisible()
    await expect(page.locator('dl').first()).toContainText('CF-2000')
    await page.getByRole('link', { name: 'View Report' }).click()
    await expect(page.locator('img[src^="data:image/jpeg"]')).toBeVisible()
    await expect(page.getByText('You reported this issue.')).toBeVisible()
    await page.reload() // deep link survives refresh, data persisted
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Bathroom sink')
    const after = await wallet(page)
    expect(after.pending).toBe(before.pending + 60)
  })

  test("supporting a report instead of duplicating it, once per person", async ({ page }) => {
    await page.goto('/issues/seed-1001')
    const count = page.locator('aside p.text-3xl')
    const n = Number(await count.innerText())
    await page.getByRole('button', { name: 'I’m experiencing this too' }).click()
    await expect(page.getByRole('button', { name: 'You support this' })).toBeVisible()
    await expect(count).toHaveText(String(n + 1))
    await page.getByRole('button', { name: 'You support this' }).click()
    await expect(count).toHaveText(String(n))
  })

  test('explore: search, filters and sorting', async ({ page }) => {
    await page.goto('/issues?q=faucet')
    await expect(page.locator('main a[href^="/issues/seed"]')).toHaveCount(1)
    await page.goto('/issues?status=resolved')
    const cards = page.locator('main a[href^="/issues/seed"]')
    await expect(cards.first()).toBeVisible()
    for (const t of await cards.allInnerTexts()) expect(t).toContain('Resolved')
    await page.goto('/issues?sort=supporters')
    await expect(page.locator('main a[href^="/issues/"] h3').first()).toContainText('Heating not working')
  })

  test('emergency and IT requests get routed', async ({ page }) => {
    await page.goto('/report?building=lares')
    await page.selectOption('#floor', 'First Floor')
    await page.fill('#room', 'Lobby')
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.fill('#title', 'Smell of gas near the entrance')
    await expect(page.getByText('Is anyone in danger right now?')).toBeVisible()
    await page.fill('#title', 'Wifi keeps dropping')
    await expect(page.getByText('This looks like an IT request')).toBeVisible()
  })

  test('students cannot open staff or admin pages', async ({ page }) => {
    for (const path of ['/staff', '/staff/incoming', '/admin', '/admin/rewards']) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/$/)
    }
  })

  test('report appears in My Reports', async ({ page }) => {
    await fileReport(page, { building: 'rydal', floor: 'First Floor', room: '104', category: /Furniture/, title: 'Broken desk chair', description: 'Chair back is cracked and unsafe.' })
    await page.goto('/my-reports')
    await expect(page.getByRole('main')).toContainText('Broken desk chair')
  })
})
