import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Building2, Camera, CircleCheck, Gift, Wrench } from 'lucide-react'
import { useApp, useToast } from '../context/AppContext'
import { Button, cx } from '../components/ui'
import { initials } from '../lib/format'

const ROLE_STYLE: Record<string, string> = {
  student: 'bg-brand-600',
  faculty: 'bg-violet-600',
  staff: 'bg-amber-700',
  admin: 'bg-navy-900',
}

export default function SignIn() {
  const { api, user, setUser, refresh } = useApp()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'
  const [busy, setBusy] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  if (user) return <Navigate to={from} replace />

  const done = (p: Awaited<ReturnType<typeof api.signInDemo>>) => {
    setUser(p)
    refresh()
    navigate(from, { replace: true })
  }

  const demo = async (id: string) => {
    setBusy(id)
    try {
      done(await api.signInDemo(id))
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Sign-in failed', 'error')
    } finally {
      setBusy(null)
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy('password')
    try {
      done(await api.signInWithPassword(email, password))
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Sign-in failed', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-navy-900 p-12 text-white lg:flex lg:flex-col">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '22px 22px' }}
          aria-hidden
        />
        <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-brand-600/30 blur-3xl" aria-hidden />
        <div className="relative flex items-center gap-2.5">
          <span className="grid size-10 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15">
            <Wrench className="size-5" />
          </span>
          <span className="text-lg font-bold">CampusFix</span>
        </div>
        <div className="relative mt-auto max-w-lg">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-200">Penn State Abington</p>
          <h1 className="mt-3 text-[44px] font-bold leading-[1.05] tracking-tight">
            See it. Report it.
            <br />
            Fix it. Get rewarded.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-slate-300">
            Report a broken light, a leaking sink or a wobbly chair in under a minute — then follow it all the way to fixed.
          </p>
          <ul className="mt-10 grid grid-cols-2 gap-4 text-sm text-slate-200">
            {[
              [Camera, 'Snap a photo & pin the room'],
              [Building2, 'Live building health scores'],
              [CircleCheck, 'Track every status change'],
              [Gift, 'Earn points for verified reports'],
            ].map(([Icon, text], i) => {
              const I = Icon as typeof Camera
              return (
                <li key={i} className="flex items-center gap-2.5">
                  <span className="grid size-8 place-items-center rounded-lg bg-white/10">
                    <I className="size-4" />
                  </span>
                  {text as string}
                </li>
              )
            })}
          </ul>
        </div>
      </section>

      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md animate-fade-up">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="grid size-10 place-items-center rounded-xl bg-navy-900 text-white">
              <Wrench className="size-5" />
            </span>
            <span className="text-lg font-bold text-navy-900">CampusFix</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Sign in</h2>

          {api.mode === 'demo' ? (
            <>
              <p className="mt-1.5 text-[15px] text-muted">
                Choose a fictional demo account. Everything runs in this browser — no real names or student data.
              </p>
              <div className="mt-6 space-y-2.5">
                {api.demoAccounts().map((a) => (
                  <button
                    key={a.id}
                    onClick={() => demo(a.id)}
                    disabled={!!busy}
                    className="card group flex w-full items-center gap-3.5 p-3.5 text-left transition hover:border-brand-200 hover:shadow-pop disabled:opacity-60"
                  >
                    <span className={cx('grid size-11 shrink-0 place-items-center rounded-full text-sm font-semibold text-white', ROLE_STYLE[a.role])}>
                      {initials(a.displayName)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{a.displayName}</span>
                      <span className="block text-sm text-muted">{a.blurb}</span>
                    </span>
                    <ArrowRight className="size-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
                  </button>
                ))}
              </div>
              <p className="mt-6 rounded-xl bg-canvas p-3.5 text-xs leading-relaxed text-muted">
                Demo mode is a local sandbox for previewing the interface. With Supabase connected, accounts use real
                authentication and roles are enforced by the database — never by this screen.
              </p>
            </>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <label className="label" htmlFor="email">Email</label>
                <input id="email" type="email" autoComplete="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="password">Password</label>
                <input id="password" type="password" autoComplete="current-password" required className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" loading={busy === 'password'}>
                Sign in
              </Button>
              <p className="text-xs text-muted">Use one of the fictional demo accounts created during setup (see README).</p>
            </form>
          )}
        </div>
      </section>
    </div>
  )
}
