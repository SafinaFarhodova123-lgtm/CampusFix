import { useNavigate } from 'react-router-dom'
import { Database, LogOut, RotateCcw, ShieldCheck } from 'lucide-react'
import { useApp, useLoad, useToast } from '../context/AppContext'
import { Button, PageHeader } from '../components/ui'
import { initials } from '../lib/format'

export default function Profile() {
  const { api, user, setUser, refresh } = useApp()
  const toast = useToast()
  const navigate = useNavigate()
  const { data: points } = useLoad((a) => a.getPointsSummary())
  if (!user) return null

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Profile" />
      <section className="card flex items-center gap-4 p-5 sm:p-6">
        <span className="grid size-16 place-items-center rounded-full bg-brand-600 text-xl font-semibold text-white">{initials(user.displayName)}</span>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold">{user.displayName}</p>
          <p className="text-sm capitalize text-muted">{user.role} · Penn State Abington</p>
        </div>
      </section>

      <section className="card mt-4 grid grid-cols-2 divide-x divide-line sm:grid-cols-4">
        {[
          ['Available', points?.available],
          ['Pending', points?.pending],
          ['Lifetime earned', points?.lifetimeEarned],
          ['Redeemed', points?.redeemed],
        ].map(([k, v]) => (
          <div key={k as string} className="p-4">
            <p className="text-xs font-medium text-muted">{k} points</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{v ?? '—'}</p>
          </div>
        ))}
      </section>

      <section className="card mt-4 divide-y divide-line">
        <div className="flex items-start gap-3 p-5">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-success-600" />
          <div className="text-sm">
            <p className="font-semibold">Privacy</p>
            <p className="mt-0.5 text-muted">CampusFix stores a display name and role only — no student IDs. Photos are stripped of location metadata before upload.</p>
          </div>
        </div>
        <div className="flex items-start gap-3 p-5">
          <Database className="mt-0.5 size-5 shrink-0 text-brand-600" />
          <div className="flex-1 text-sm">
            <p className="font-semibold">{api.mode === 'demo' ? 'Demo mode' : 'Connected to Supabase'}</p>
            <p className="mt-0.5 text-muted">
              {api.mode === 'demo'
                ? 'Data is fictional and saved only in this browser. Reset to restore the original sample records.'
                : 'Your reports are stored in the CampusFix database.'}
            </p>
            {api.mode === 'demo' && api.resetDemo && (
              <Button
                size="sm"
                variant="secondary"
                icon={RotateCcw}
                className="mt-3"
                onClick={async () => {
                  await api.resetDemo!()
                  refresh()
                  toast('Demo data reset', 'info')
                }}
              >
                Reset demo data
              </Button>
            )}
          </div>
        </div>
        <div className="p-5">
          <Button
            variant="secondary"
            icon={LogOut}
            onClick={async () => {
              await api.signOut()
              setUser(null)
              refresh()
              navigate('/sign-in')
            }}
          >
            Sign out
          </Button>
        </div>
      </section>
    </div>
  )
}
