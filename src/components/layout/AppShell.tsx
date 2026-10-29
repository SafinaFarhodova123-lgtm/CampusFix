import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Building2,
  ChartColumn,
  ClipboardList,
  Gift,
  House,
  Inbox,
  LayoutDashboard,
  List,
  LogOut,
  Map,
  MapPin,
  Plus,
  Search,
  Settings,
  CircleCheck,
  UserRound,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { cx } from '../ui'
import { NotificationsBell } from './NotificationsBell'
import { initials } from '../../lib/format'
import type { UserRole } from '../../lib/types'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

export const NAV: Record<'member' | 'staff' | 'admin', NavItem[]> = {
  member: [
    { to: '/', label: 'Dashboard', icon: House, end: true },
    { to: '/map', label: 'Campus Map', icon: Map },
    { to: '/report', label: 'Report an Issue', icon: Plus },
    { to: '/issues', label: 'Explore Issues', icon: Search },
    { to: '/my-reports', label: 'My Reports', icon: ClipboardList },
    { to: '/rewards', label: 'Rewards', icon: Gift },
    { to: '/profile', label: 'Profile', icon: UserRound },
  ],
  staff: [
    { to: '/staff', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/staff/incoming', label: 'Incoming Reports', icon: Inbox },
    { to: '/issues', label: 'All Issues', icon: List },
    { to: '/map', label: 'Campus Map', icon: Map },
    { to: '/buildings', label: 'Building Health', icon: Building2 },
    { to: '/staff/resolved', label: 'Resolved Issues', icon: CircleCheck },
  ],
  admin: [
    { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/buildings', label: 'Building Analytics', icon: Building2 },
    { to: '/admin/stats', label: 'Maintenance Statistics', icon: ChartColumn },
    { to: '/admin/rewards', label: 'Rewards Management', icon: Gift },
    { to: '/admin/locations', label: 'Locations & Categories', icon: Settings },
  ],
}

export const portalFor = (role: UserRole) => (role === 'admin' ? 'admin' : role === 'staff' ? 'staff' : 'member')
const PORTAL_LABEL = { member: 'Student & Faculty', staff: 'Facilities Portal', admin: 'Administrator' }

function Logo({ light }: { light?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="CampusFix home">
      <span className="grid size-9 place-items-center rounded-xl bg-navy-900 text-white shadow-sm ring-1 ring-white/10">
        <Wrench className="size-[18px]" aria-hidden />
      </span>
      <span className={cx('text-[17px] font-bold tracking-tight', light ? 'text-white' : 'text-navy-900')}>CampusFix</span>
    </Link>
  )
}

function UserMenu() {
  const { api, user, setUser, refresh } = useApp()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  if (!user) return null
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full p-0.5 pr-0.5 transition hover:bg-slate-100 sm:pr-3"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="grid size-9 place-items-center rounded-full bg-brand-600 text-sm font-semibold text-white">{initials(user.displayName)}</span>
        <span className="hidden text-left sm:block">
          <span className="block text-sm font-semibold leading-tight">{user.displayName}</span>
          <span className="block text-xs capitalize leading-tight text-slate-600">{user.role}</span>
        </span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 z-50 w-56 animate-fade-up rounded-xl border border-line bg-white p-1.5 shadow-pop">
          <Link role="menuitem" to="/profile" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50">
            <UserRound className="size-4 text-muted" /> Profile
          </Link>
          <button
            role="menuitem"
            onClick={async () => {
              await api.signOut()
              setUser(null)
              refresh()
              navigate('/sign-in')
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
          >
            <LogOut className="size-4 text-muted" /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}

function SearchBox() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    navigate(`/issues${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`)
  }
  return (
    <form onSubmit={submit} className="relative w-full max-w-md" role="search">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search buildings, rooms, or issues…"
        aria-label="Search issues"
        className="h-10 w-full rounded-xl border border-line bg-canvas pl-10 pr-3 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-100"
      />
    </form>
  )
}

export function AppShell() {
  const { api, user } = useApp()
  const location = useLocation()
  const portal = portalFor(user!.role)
  const items = NAV[portal]
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  const mobileItems: NavItem[] =
    portal === 'member'
      ? [items[0], items[3], items[2], items[1], items[4]]
      : items.slice(0, 5)

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById('main')?.focus()
        }}
        className="sr-only z-[80] rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to main content
      </a>
      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-white lg:flex">
        <div className="flex h-16 items-center px-5">
          <Logo />
        </div>
        <p className="px-5 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{PORTAL_LABEL[portal]}</p>
        <nav className="flex-1 space-y-0.5 px-3" aria-label="Main">
          {items.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14.5px] font-medium transition',
                  isActive ? 'bg-navy-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-ink',
                )
              }
            >
              <Icon className="size-[18px] shrink-0" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="m-3 rounded-xl bg-canvas p-3.5 text-xs text-muted">
          <p className="flex items-center gap-1.5 font-semibold text-ink">
            <MapPin className="size-3.5" aria-hidden /> Penn State Abington
          </p>
          <p className="mt-1 leading-relaxed">
            {api.mode === 'demo'
              ? 'Demo mode — fictional data stored in this browser.'
              : 'Connected to CampusFix database.'}
          </p>
        </div>
      </aside>

      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-line bg-white/85 backdrop-blur lg:ml-64">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
          <div className="lg:hidden">
            <Logo />
          </div>
          <div className="hidden flex-1 md:block">
            <SearchBox />
          </div>
          <div className="flex-1 md:hidden" />
          {(
            <Link
              to="/report"
              className="hidden h-10 items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 sm:inline-flex"
            >
              <Plus className="size-4" aria-hidden /> Report Issue
            </Link>
          )}
          <NotificationsBell />
          <UserMenu />
        </div>
      </header>

      <main id="main" tabIndex={-1} className="px-4 pb-28 pt-6 outline-none sm:px-6 lg:ml-64 lg:px-8 lg:pb-12 lg:pt-8">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>

      {/* Bottom nav (mobile) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        aria-label="Mobile"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {mobileItems.map(({ to, label, icon: Icon, end }) => {
            const isReport = to === '/report'
            return (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cx(
                    'flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium',
                    isActive && !isReport ? 'text-brand-600' : 'text-slate-600',
                  )
                }
              >
                {isReport ? (
                  <span className="-mt-5 grid size-12 place-items-center rounded-2xl bg-brand-600 text-white shadow-pop ring-4 ring-white">
                    <Icon className="size-6" aria-hidden />
                  </span>
                ) : (
                  <Icon className="size-[22px]" aria-hidden />
                )}
                <span className={isReport ? 'text-ink' : ''}>{isReport ? 'Report' : label.replace('Explore Issues', 'Explore').replace('Campus Map', 'Map').replace('My Reports', 'Mine').replace('Incoming Reports', 'Incoming').replace('Building Health', 'Health')}</span>
              </NavLink>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
