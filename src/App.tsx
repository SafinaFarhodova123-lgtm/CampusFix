import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppProvider, useApp } from './context/AppContext'
import { AppShell, portalFor } from './components/layout/AppShell'
import SignIn from './pages/SignIn'
import Dashboard from './pages/Dashboard'
import ReportIssue from './pages/ReportIssue'
import ExploreIssues from './pages/ExploreIssues'
import IssueDetails from './pages/IssueDetails'
import MyReports from './pages/MyReports'
import Profile from './pages/Profile'
import NotFound from './pages/NotFound'
import BuildingHealthPage from './pages/BuildingHealthPage'
import Rewards from './pages/Rewards'
import { AdminLocations, AdminOverview, AdminRewards, AdminStats } from './pages/AdminPages'
import { StaffIncoming, StaffOverview, StaffResolved } from './pages/StaffPages'
import type { UserRole } from './lib/types'

// MapLibre is large — load the map page on demand so the rest of the app stays fast.
const CampusMapPage = lazy(() => import('./pages/CampusMapPage'))
const MapFallback = () => (
  <div className="grid h-[60vh] place-items-center">
    <div className="size-8 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600" aria-label="Loading map" />
  </div>
)

const Router = import.meta.env.VITE_HASH_ROUTER === 'true' ? HashRouter : BrowserRouter

function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useApp()
  const location = useLocation()
  if (!user) return <Navigate to="/sign-in" replace state={{ from: location.pathname + location.search }} />
  return <>{children}</>
}

/** UI convenience only — the database independently enforces every permission. */
function RequireRole({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { user } = useApp()
  if (!user || !roles.includes(user.role)) return <Navigate to="/" replace />
  return <>{children}</>
}

function Home() {
  const { user } = useApp()
  const portal = portalFor(user!.role)
  if (portal === 'staff') return <Navigate to="/staff" replace />
  if (portal === 'admin') return <Navigate to="/admin" replace />
  return <Dashboard />
}

const STAFF: UserRole[] = ['staff', 'admin']
const ADMIN: UserRole[] = ['admin']

export default function App() {
  return (
    <AppProvider>
      <Router>
        <Routes>
          <Route path="/sign-in" element={<SignIn />} />
          <Route
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route index element={<Home />} />
            <Route path="report" element={<ReportIssue />} />
            <Route path="issues" element={<ExploreIssues />} />
            <Route path="issues/:id" element={<IssueDetails />} />
            <Route path="my-reports" element={<MyReports />} />
            <Route path="profile" element={<Profile />} />
            <Route path="map" element={<Suspense fallback={<MapFallback />}><CampusMapPage /></Suspense>} />
            <Route path="rewards" element={<Rewards />} />
            <Route path="buildings" element={<BuildingHealthPage />} />
            <Route path="staff" element={<RequireRole roles={STAFF}><StaffOverview /></RequireRole>} />
            <Route path="staff/incoming" element={<RequireRole roles={STAFF}><StaffIncoming /></RequireRole>} />
            <Route path="staff/resolved" element={<RequireRole roles={STAFF}><StaffResolved /></RequireRole>} />
            <Route path="admin" element={<RequireRole roles={ADMIN}><AdminOverview /></RequireRole>} />
            <Route path="admin/stats" element={<RequireRole roles={ADMIN}><AdminStats /></RequireRole>} />
            <Route path="admin/rewards" element={<RequireRole roles={ADMIN}><AdminRewards /></RequireRole>} />
            <Route path="admin/locations" element={<RequireRole roles={ADMIN}><AdminLocations /></RequireRole>} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Router>
    </AppProvider>
  )
}
