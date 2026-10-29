# CampusFix

**See it. Report it. Fix it. Get rewarded.**

CampusFix is a campus maintenance platform, starting with Penn State Abington. Students and faculty report facility problems with a photo and an indoor location, follow them to resolution, and earn points for verified reports. Facilities staff verify, prioritize and resolve issues on a 3D campus map; administrators track building health and maintenance performance.

> All sample data is **fictional** (flagged `is_sample`) and does not describe real campus conditions. Rewards and voucher codes are **mock placeholders** — nothing connects to LionCash, Amazon or any payment system. CampusFix is not affiliated with or endorsed by Penn State.

## Features

| Area | What it does |
|---|---|
| Reporting | 4-step flow: location (map or manual: campus, building, floor, room) → details + photo → duplicate check → review. Photos are resized and stripped of location metadata. |
| Duplicate detection | Deterministic: building, floor, room, category + text similarity with a maintenance synonym table. “I’m experiencing this too” adds support instead of a duplicate. Nothing is auto-merged. |
| Smart helpers | Category suggestion as you type; emergency (“call 911 / University Police”), IT and non-facilities routing. No paid AI APIs. |
| 3D campus map | MapLibre GL with extruded buildings, building panels, priority-colored issue pins, filters, health mode, 2D/3D, pin placement inside a building, list fallback without WebGL. |
| Facilities | Overview, incoming queue, all issues table, resolved list; per-report review panel: verify/reject with priority, mark in progress/resolved/reopen, notes, merge duplicates. |
| Building Health | `clamp(100 − open penalties + recovery bonus, 0, 100)` from verified reports only; ranking page and map colors. Illustrative, not a safety rating. |
| Points & rewards | Ledger with idempotency keys (+50 first reporter, +10 photo, +5 verified support, +20 resolved, +10 confirm fix). Pending until verified; atomic redemption; history; achievements. |
| Admin | KPIs and charts (by building, category, week), maintenance statistics, rewards & redemptions, building floors/visibility. |
| Notifications | In-app bell for updates on followed reports, released points and redemptions. |

## Tech stack

React 19 · TypeScript · Vite 6 · Tailwind CSS 4 · React Router 7 · Lucide · MapLibre GL 6 · Supabase (Postgres, Auth, Storage, RLS) · Vercel · Playwright + axe-core · PGlite

## Run it locally (demo mode — no backend needed)

```bash
npm install
npm run dev            # http://localhost:5173
```

With no Supabase variables, the app uses a **local demo driver**: fictional data in your browser and demo accounts (student, faculty, facilities staff, admin) on the sign-in screen. Demo mode is a UI sandbox, not a security boundary. **Profile → Reset demo data** restores the sample records.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Type-check + production build to `dist/` |
| `npm run preview` | Serve the build (with the same security headers as Vercel) |
| `npm test` | Unit tests: duplicate detection, health score, category suggestion, routing, achievements |
| `npm run test:db` | Applies every migration + seed to an in-process Postgres (PGlite) and checks RLS, permissions, points, redemption, refunds, notifications |
| `npm run test:e2e` | Playwright end-to-end + accessibility (axe WCAG 2.1 AA) on desktop and mobile. First run: `npx playwright install chromium` |
| `npm run test:all` | All of the above |
| `npm run db:bundle` | Regenerates `supabase/seed.sql` and the one-file `supabase/setup.sql` |

## Architecture

```
src/
  data/api.ts             Api interface; picks the Supabase driver when env vars are set, else demo
  data/supabaseDriver.ts  Production driver (RLS-scoped queries, storage uploads, RPCs)
  data/demoDriver.ts      In-browser sandbox mirroring the database rules
  data/seed.ts            Single source of fictional sample data (also generates seed.sql)
  data/campusGeo.ts       Simplified campus layout used by the map
  lib/                    similarity, health, classify, filters, notifications, achievements (unit-tested)
  components/map/         MapLibre map
  pages/                  Student, staff and admin screens
supabase/
  migrations/             Schema · functions & views · RLS & storage · rewards/admin/notifications
  seed.sql, setup.sql     Generated; setup.sql = all migrations + seed in one file
  demo-accounts.sql       Assigns roles to the fictional demo users
tests/
  db.test.mjs             Database rules (PGlite)
  e2e/                    Playwright specs incl. a11y and mobile
```

### Security model

- **Roles live in the database.** `profiles.role` can’t be changed by users (column-level grant). New sign-ups are always `student`; staff/admin are granted by SQL.
- **Students insert reports only as themselves.** A trigger forces `pending / reported / low` and the caller as reporter, whatever the client sends. No user can update or delete issues directly.
- **Every privileged action is a `SECURITY DEFINER` function that checks the caller’s role**: verify/reject, status, priority, notes, merge, redemption, refunds.
- **Points can’t be self-awarded.** The ledger has no client write access; each award has a unique idempotency key; staff never earn points on reports they review; redemption locks the user row and checks the balance in one transaction.
- **Photos** go to a private bucket; users can upload only into their own folder; reads use short-lived signed URLs.
- **Browser hardening** (`vercel.json`): strict Content-Security-Policy, `X-Frame-Options: DENY`, `nosniff`, referrer and permissions policies. The e2e suite runs with the same CSP.
- Only the **anon** key is used in the frontend. Never put the service-role key in a `VITE_` variable.

## Deploy

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor → New query**: paste all of `supabase/setup.sql`, **Run** (once, on a new project).
3. **Authentication → Users → Add user** for each demo account listed in `supabase/demo-accounts.sql` (tick *Auto Confirm User*), then run `supabase/demo-accounts.sql` in the SQL editor.
4. **Authentication → Sign In / Providers**: turn off *Allow new users to sign up* (or restrict to your campus email domain) so only intended users get accounts.
5. **Project Settings → API**: copy the *Project URL* and the *anon public* key.

### 2. GitHub

```bash
git remote add origin https://github.com/<you>/campusfix.git
git push -u origin main
```

### 3. Vercel

1. [vercel.com/new](https://vercel.com/new) → import the GitHub repo (framework: Vite is detected; build `npm run build`, output `dist`).
2. **Environment variables**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_ALLOW_DEMO=false` (so a missing config shows an error instead of silently running demo mode).
3. Deploy. `vercel.json` rewrites every route to `index.html`, so deep links work on refresh.

To publish a **demo-only** site without Supabase, leave the Supabase variables empty and set `VITE_ALLOW_DEMO=true`.

### Production checklist

Sign in as each role · file a report with a photo · confirm it appears in Supabase (**Table Editor → issues**) and on the map · verify, start and resolve it as staff · check points, Building Health and notifications · redeem a reward · try a student URL on `/admin` (should redirect).

## Real building footprints

The map currently uses a **simplified, hand-traced layout** (`geo_source = 'schematic'`), labeled as approximate in the UI. To use OpenStreetMap footprints:

1. Open `https://overpass-api.de/api/interpreter?data=[out:json];way["building"](around:700,40.1146,-75.1113);out tags geom;` in a browser and save the JSON.
2. `npx tsx scripts/import-osm.ts overpass.json > supabase/osm_footprints.sql`, review the matches it prints, run the SQL in Supabase. Only buildings whose OSM name matches are updated. Footprints © OpenStreetMap contributors (ODbL).

## Known limitations

- Map geometry is schematic until real footprints are imported.
- Notifications are in-app only (no email/push).
- Issue lists are fetched per campus and filtered client-side (fine for one campus; add server-side pagination for many).
- Any signed-in user can view issue photos (needed for duplicate checking); restrict the storage policy if photos may contain sensitive content.
- Penn State Go integration is a future step; the app is a standard web app that can be linked or embedded once `frame-ancestors` is relaxed for that host.
