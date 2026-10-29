import { test as base, expect, type Page } from '@playwright/test'

export type DemoUser = 'Alex Rivera' | 'Dr. Morgan Chen' | 'Taylor Brooks' | 'Casey Morgan'

/**
 * - Fonts are stubbed so tests never depend on an external host.
 * - Every test starts from fresh demo data.
 * - Any page error or console error fails the test.
 */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))
      page.on('pageerror', (e) => errors.push(String(e)))
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
      await page.goto('/sign-in')
      await page.evaluate(() => localStorage.clear())
      await use(errors)
      expect(errors, 'console errors').toEqual([])
    },
    { auto: true },
  ],
})
export { expect }

export async function signIn(page: Page, who: DemoUser) {
  await page.evaluate(() => localStorage.removeItem('campusfix-demo-session'))
  await page.goto('/sign-in')
  await page.getByRole('button', { name: new RegExp(who.replace('.', '\\.')) }).click()
  await page.waitForURL((u) => !u.pathname.endsWith('/sign-in'))
}

export async function wallet(page: Page) {
  await page.goto('/rewards')
  const box = page.locator('section[aria-label="Points wallet"]')
  await expect(box).toContainText(/Available points\s*\d+/)
  const t = await box.innerText()
  const num = (label: string) => Number(t.match(new RegExp(label + '\\s*\\n\\s*(\\d+)'))?.[1])
  return { available: num('Available points'), pending: num('Pending'), redeemed: num('Redeemed') }
}

/** File a report through the full wizard and return its details-page URL. */
export async function fileReport(
  page: Page,
  r: { building: string; floor: string; room: string; category: RegExp; title: string; description: string; photo?: boolean },
) {
  await page.goto(`/report?building=${r.building}`)
  await page.selectOption('#floor', r.floor)
  await page.fill('#room', r.room)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.fill('#title', r.title)
  await page.fill('#desc', r.description)
  await page.getByRole('button', { name: r.category }).click()
  if (r.photo) {
    await page.setInputFiles('#photo', {
      name: 'photo.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEklEQVR4nGP4z8CAB+GTG8HSALfKY52fTcuYAAAAAElFTkSuQmCC', 'base64'),
    })
    await expect(page.getByAltText('Selected photo preview')).toBeVisible()
  }
  await page.getByRole('button', { name: 'Check for similar reports' }).click()
  await page.getByRole('button', { name: /Continue|This Is a Different Issue/ }).click()
  await page.getByRole('button', { name: 'Submit report' }).click()
  await expect(page.getByText('Your issue has been reported!')).toBeVisible()
  await page.getByRole('link', { name: 'View Report' }).click()
  await page.waitForURL(/\/issues\/[0-9a-f-]{20,}/)
  await expect(page.getByRole('heading', { level: 1, name: r.title })).toBeVisible()
  return page.url()
}
