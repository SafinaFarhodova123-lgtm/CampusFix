import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { CircleCheck, Info, TriangleAlert, X } from 'lucide-react'
import { getApi, type Api } from '../data/api'
import type { Profile } from '../lib/types'
import { cx } from '../components/ui'

// ---------------------------------------------------------------- Toasts
type ToastKind = 'success' | 'error' | 'info'
interface Toast {
  id: number
  kind: ToastKind
  message: string
}
const ToastCtx = createContext<(message: string, kind?: ToastKind) => void>(() => undefined)
export const useToast = () => useContext(ToastCtx)

function ToastViewport({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  const icon = { success: CircleCheck, error: TriangleAlert, info: Info }
  const color = { success: 'text-success-600', error: 'text-danger-600', info: 'text-brand-600' }
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:px-6"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const Icon = icon[t.kind]
        return (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex w-full max-w-sm animate-fade-up items-start gap-3 rounded-xl border border-line bg-white p-3.5 shadow-pop"
          >
            <Icon className={cx('mt-0.5 size-5 shrink-0', color[t.kind])} aria-hidden />
            <p className="flex-1 text-sm font-medium text-ink">{t.message}</p>
            <button onClick={() => dismiss(t.id)} className="rounded p-0.5 text-muted hover:text-ink" aria-label="Dismiss">
              <X className="size-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------- App (api + session + data version)
interface AppState {
  api: Api
  user: Profile | null
  setUser: (p: Profile | null) => void
  /** Incremented after any mutation so pages re-fetch. */
  version: number
  refresh: () => void
}
const AppCtx = createContext<AppState | null>(null)
export function useApp() {
  const v = useContext(AppCtx)
  if (!v) throw new Error('useApp outside provider')
  return v
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [api, setApi] = useState<Api | null>(null)
  const [user, setUser] = useState<Profile | null>(null)
  const [ready, setReady] = useState(false)
  const [bootError, setBootError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const toast = useCallback(
    (message: string, kind: ToastKind = 'success') => {
      const id = nextId.current++
      setToasts((t) => [...t.slice(-2), { id, kind, message }])
      setTimeout(() => dismiss(id), kind === 'error' ? 6000 : 3800)
    },
    [dismiss],
  )

  useEffect(() => {
    let unsub = () => {}
    getApi()
      .then(async (a) => {
        setApi(a)
        setUser(await a.getCurrentUser())
        unsub = a.onAuthChange(setUser)
      })
      .catch((e) => setBootError(e instanceof Error ? e.message : String(e)))
      .finally(() => setReady(true))
    return () => unsub()
  }, [])

  const refresh = useCallback(() => setVersion((v) => v + 1), [])

  if (bootError) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <p className="font-semibold">CampusFix couldn’t start.</p>
          <p className="mt-1 text-sm text-muted">{bootError}</p>
        </div>
      </div>
    )
  }
  if (!ready || !api) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="size-8 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600" aria-label="Loading" />
      </div>
    )
  }

  return (
    <AppCtx.Provider value={{ api, user, setUser, version, refresh }}>
      <ToastCtx.Provider value={toast}>
        {children}
        <ToastViewport toasts={toasts} dismiss={dismiss} />
      </ToastCtx.Provider>
    </AppCtx.Provider>
  )
}

/** Small data-loading hook that re-runs when deps or the global data version change. */
export function useLoad<T>(fn: (api: Api) => Promise<T>, deps: unknown[] = []) {
  const { api, version } = useApp()
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    setLoading(true)
    fn(api)
      .then((d) => alive && (setData(d), setError(null)))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, version, ...deps])
  return { data, error, loading }
}
