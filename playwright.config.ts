import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests run against the production build in local demo mode (no Supabase needed).
 *   npm run test:e2e         (first time: npx playwright install chromium)
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  // software WebGL is CPU-heavy; give long end-to-end flows room
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1360, height: 900 },
        // software WebGL so the 3D map renders in headless CI
        launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
      },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } },
      testMatch: /(mobile|a11y)\.spec\.ts/,
    },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // tests always run the local demo driver, never the production database
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', VITE_ALLOW_DEMO: 'true' },
  },
})
