import { test, expect, signIn } from './fixtures'

test.beforeEach(async ({ page }) => signIn(page, 'Alex Rivera'))

test('select a building, preview an issue, pin a location and report', async ({ page }) => {
  await page.goto('/map')
  await expect(page.locator('.cf-label')).toHaveCount(8, { timeout: 20_000 })
  await page.locator('.cf-label', { hasText: 'Woodland' }).click()
  await expect(page.getByText(/Health \d+\/100/)).toBeVisible()
  await expect(page.locator('.cf-pin:visible').first()).toBeVisible()
  await page.locator('.cf-pin:visible').first().click()
  await expect(page.getByRole('link', { name: /View Details/ })).toBeVisible()
  await page.getByRole('button', { name: 'Close preview' }).click()

  await page.getByRole('button', { name: 'Report an Issue Here' }).click()
  await page.selectOption('#map-floor', 'First Floor')
  await page.fill('#map-room', 'Room 112')
  await page.getByRole('button', { name: /Drop a pin/ }).click()
  await page.waitForTimeout(900) // view flattens for accurate placement
  const lbl = await page.locator('.cf-label', { hasText: 'Woodland' }).boundingBox()
  await page.mouse.click(lbl!.x + lbl!.width / 2, lbl!.y + lbl!.height + 8)
  await expect(page.getByText('Pin placed on Woodland')).toBeVisible()
  await page.getByRole('button', { name: 'Continue to report' }).click()
  await expect(page).toHaveURL(/building=woodland.*floor=First\+Floor.*room=Room\+112.*lat=/)
  await expect(page.locator('button[aria-pressed="true"]')).toContainText('Woodland')
  await expect(page.locator('#floor')).toHaveValue('First Floor')
  await expect(page.getByText(/Map pin added/)).toBeVisible()
})

test('health mode, issue deep link and list view', async ({ page }) => {
  await page.goto('/map?mode=health')
  await expect(page.getByText('Insufficient Data')).toBeVisible({ timeout: 20_000 })
  await page.goto('/map?issue=seed-1005')
  await expect(page.locator('aside[aria-label="Issue preview"]')).toContainText('Heating not working', { timeout: 20_000 })
  await page.getByRole('radio', { name: 'List' }).click()
  await expect(page.getByRole('link', { name: 'Report', exact: true })).toHaveCount(8)
})

test('falls back to a building list without WebGL', async ({ page }) => {
  await page.addInitScript(() => {
    const g = HTMLCanvasElement.prototype.getContext
    // @ts-expect-error test override
    HTMLCanvasElement.prototype.getContext = function (t: string, ...a: unknown[]) {
      return /webgl/.test(t) ? null : g.call(this, t, ...(a as []))
    }
  })
  await page.goto('/map')
  await expect(page.getByText(/couldn’t load/)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('link', { name: 'Report', exact: true })).toHaveCount(8)
})
