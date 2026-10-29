import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CircleCheck, Info, Star, TriangleAlert } from 'lucide-react'
import { useApp, useLoad } from '../../context/AppContext'
import { sortNotifications } from '../../lib/notifications'
import { timeAgo } from '../../lib/format'
import { cx } from '../ui'

const seenKey = (userId: string) => `campusfix-notif-seen:${userId}`
const readSeen = (userId: string) => {
  try {
    return window.localStorage.getItem(seenKey(userId)) ?? ''
  } catch {
    return ''
  }
}
const writeSeen = (userId: string, v: string) => {
  try {
    window.localStorage.setItem(seenKey(userId), v)
  } catch {
    /* storage unavailable — unread dots just won't persist */
  }
}

const TONE = {
  success: { icon: CircleCheck, cls: 'bg-success-50 text-success-600' },
  warning: { icon: TriangleAlert, cls: 'bg-warning-50 text-warning-600' },
  info: { icon: Info, cls: 'bg-brand-50 text-brand-600' },
  points: { icon: Star, cls: 'bg-amber-50 text-amber-600' },
}

export function NotificationsBell() {
  const { user } = useApp()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(() => (user ? readSeen(user.id) : ''))
  const ref = useRef<HTMLDivElement>(null)
  const { data } = useLoad((api) => api.listNotifications(), [user?.id])
  const items = useMemo(() => sortNotifications(data ?? []), [data])
  const unread = items.filter((n) => n.createdAt > seen).length

  // First visit on this device: treat existing history as read so the badge only counts new updates.
  useEffect(() => {
    if (!user || !data || seen) return
    const latest = items[0]?.createdAt ?? new Date().toISOString()
    writeSeen(user.id, latest)
    setSeen(latest)
  }, [user, data, items, seen])

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [])

  const markAll = () => {
    if (!user) return
    const now = new Date().toISOString()
    writeSeen(user.id, now)
    setSeen(now)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative grid size-10 place-items-center rounded-full text-slate-600 transition hover:bg-slate-100 hover:text-ink"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 grid min-w-[18px] place-items-center rounded-full bg-danger-600 px-1 text-[10px] font-bold leading-[18px] text-white ring-2 ring-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="fixed inset-x-3 top-16 z-50 animate-fade-up overflow-hidden rounded-2xl border border-line bg-white shadow-pop sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-96"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-semibold">Notifications</p>
            {unread > 0 && (
              <button onClick={markAll} className="text-xs font-semibold text-brand-600 hover:underline">
                Mark all as read
              </button>
            )}
          </div>
          <ul className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 && <li className="px-4 py-10 text-center text-sm text-muted">Updates on reports you follow will appear here.</li>}
            {items.map((n) => {
              const t = TONE[n.tone]
              const Icon = t.icon
              const isNew = n.createdAt > seen
              return (
                <li key={n.id}>
                  <button
                    onClick={() => {
                      setOpen(false)
                      if (n.issueId) navigate(`/issues/${n.issueId}`)
                      else navigate('/rewards')
                    }}
                    className={cx('flex w-full gap-3 px-4 py-3 text-left transition hover:bg-canvas', isNew && 'bg-brand-50/50')}
                  >
                    <span className={cx('grid size-8 shrink-0 place-items-center rounded-lg', t.cls)}>
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        {n.title}
                        {isNew && <span className="size-1.5 rounded-full bg-brand-600" aria-label="unread" />}
                      </span>
                      <span className="block truncate text-xs text-muted">{n.body}</span>
                      <span className="block text-[11px] text-muted">{timeAgo(n.createdAt)}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
