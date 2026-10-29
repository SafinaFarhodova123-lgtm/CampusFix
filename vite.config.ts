import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Serve the same security headers locally (`vite preview`, used by the e2e tests) as Vercel does,
// so a Content-Security-Policy problem shows up in tests instead of in production.
const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as {
  headers: { source: string; headers: { key: string; value: string }[] }[]
}
const securityHeaders = Object.fromEntries(vercel.headers[0].headers.map((h) => [h.key, h.value]))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The map page (MapLibre) is a lazily loaded ~1 MB chunk by design.
  build: { chunkSizeWarningLimit: 1200 },
  worker: { format: 'es' },
  preview: { headers: securityHeaders },
})
