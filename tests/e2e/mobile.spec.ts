import { test, expect, signIn, type DemoUser } from './fixtures'

const ROUTES: [DemoUser, string[]][] = [
  ['Alex Rivera', ['/', '/report?building=lares', '/issues', '/issues/seed-1005', '/my-reports', '/rewards', '/profile', '/map?building=sutherland', '/buildings']],
  ['Taylor Brooks', ['/staff', '/staff/incoming', '/issues']],
  ['Casey Morgan', ['/admin', '/admin/stats', '/admin/rewards', '/admin/locations']],
]

for (const [user, paths] of ROUTES) {
  test(`${user}: no horizontal scrolling on any page`, async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile layout check')
    await signIn(page, user)
    for (const path of paths) {
      await page.goto(path)
      await page.waitForTimeout(500)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow, path).toBeLessThanOrEqual(0)
    }
    await expect(page.getByRole('navigation', { name: 'Mobile' })).toBeVisible()
  })
}
