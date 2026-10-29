import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'

// @axe-core/playwright is typed against playwright-core; the runtime Page is identical.
// preload:false stops axe fetching cross-origin stylesheets, which our CSP (correctly) blocks.
const axe = (page: Page) => new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]['page'] }).options({ preload: false })
import { test, expect, signIn, type DemoUser } from './fixtures'

const PAGES: [DemoUser, string[]][] = [
  ['Alex Rivera', ['/', '/report', '/issues', '/issues/seed-1005', '/my-reports', '/rewards', '/profile', '/map', '/buildings']],
  ['Taylor Brooks', ['/staff', '/staff/incoming', '/staff/resolved', '/issues', '/issues/seed-1008']],
  ['Casey Morgan', ['/admin', '/admin/stats', '/admin/rewards', '/admin/locations']],
]

test('sign-in page has no WCAG A/AA violations', async ({ page }) => {
  await page.goto('/sign-in')
  await page.waitForTimeout(600) // entrance animation
  const r = await axe(page).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(r.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')} — ${n.failureSummary?.split('\n').slice(-1)[0] ?? ''}`))).toEqual([])
})

for (const [user, paths] of PAGES) {
  test(`${user}: pages have no WCAG A/AA violations`, async ({ page }) => {
    await signIn(page, user)
    const all: string[] = []
    for (const path of paths) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(600) // let skeletons resolve
      const r = await axe(page)
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .exclude('.maplibregl-canvas') // WebGL canvas has its own accessible name on the region
        .analyze()
      for (const v of r.violations) for (const n of v.nodes) all.push(`${path} ${v.id}: ${n.target.join(' ')} — ${n.failureSummary?.split('\n').slice(-1)[0] ?? ''}`)
    }
    expect(all).toEqual([])
  })
}
