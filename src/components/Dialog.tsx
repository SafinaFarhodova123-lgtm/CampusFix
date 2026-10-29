import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

/** Accessible modal: focus moves in, Escape/backdrop closes, focus returns on close. */
export function Dialog({ open, onClose, title, children, labelledBy = 'dialog-title' }: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  labelledBy?: string
}) {
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    panel.current?.querySelector<HTMLElement>('button, [href], input, select, textarea')?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      prev?.focus()
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-navy-950/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="relative w-full max-w-md animate-fade-up rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)] shadow-pop sm:rounded-3xl"
      >
        <div className="flex items-center justify-between px-6 pt-5">
          <h2 id={labelledBy} className="text-lg font-semibold">
            {title}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-slate-100" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="px-6 pb-6 pt-4">{children}</div>
      </div>
    </div>
  )
}
