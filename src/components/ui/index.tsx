import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Armchair,
  CircleHelp,
  Droplet,
  Hammer,
  LoaderCircle,
  ShieldAlert,
  Sparkles,
  Thermometer,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { IssueCategory, Priority, RepairStatus, VerificationStatus } from '../../lib/types'
import { PRIORITY_LABEL, REPAIR_LABEL, VERIFICATION_LABEL, categoryLabel } from '../../lib/constants'
import { HEALTH_BAND_META, healthBand } from '../../lib/health'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

// ---------------------------------------------------------------- Button
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'navy'
type Size = 'sm' | 'md' | 'lg'
const variantCls: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm',
  navy: 'bg-navy-900 text-white hover:bg-navy-800 shadow-sm',
  secondary: 'bg-white text-ink border border-line hover:bg-slate-50 shadow-sm',
  ghost: 'text-ink hover:bg-slate-100',
  danger: 'bg-danger-600 text-white hover:bg-danger-700',
}
const sizeCls: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-11 px-4 text-[15px] gap-2 rounded-xl',
  lg: 'h-12 px-5 text-base gap-2 rounded-xl',
}
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: LucideIcon
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon: Icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cx(
        'inline-flex select-none items-center justify-center font-semibold transition active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100',
        variantCls[variant],
        sizeCls[size],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : Icon ? <Icon className="size-4" aria-hidden /> : null}
      {children}
    </button>
  )
})

export function ButtonLink({
  to,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  className,
  children,
  state,
}: {
  to: string
  variant?: Variant
  size?: Size
  icon?: LucideIcon
  className?: string
  children: ReactNode
  state?: unknown
}) {
  return (
    <Link
      to={to}
      state={state}
      className={cx('inline-flex items-center justify-center font-semibold transition active:scale-[0.98]', variantCls[variant], sizeCls[size], className)}
    >
      {Icon && <Icon className="size-4" aria-hidden />}
      {children}
    </Link>
  )
}

// ---------------------------------------------------------------- Badges
const tone = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  blue: 'bg-brand-50 text-brand-700 ring-brand-200',
  amber: 'bg-warning-50 text-warning-700 ring-warning-100',
  green: 'bg-success-50 text-success-700 ring-success-100',
  red: 'bg-danger-50 text-danger-700 ring-danger-100',
  orange: 'bg-orange-50 text-orange-800 ring-orange-100',
}
export type Tone = keyof typeof tone
export function Badge({ children, tone: t = 'neutral', dot, className }: { children: ReactNode; tone?: Tone; dot?: boolean; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset', tone[t], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  )
}

const repairTone: Record<RepairStatus, Tone> = { reported: 'blue', in_progress: 'amber', resolved: 'green' }
export const RepairBadge = ({ status }: { status: RepairStatus }) => (
  <Badge tone={repairTone[status]} dot>
    {REPAIR_LABEL[status]}
  </Badge>
)

const verifTone: Record<VerificationStatus, Tone> = { pending: 'neutral', verified: 'green', rejected: 'red', merged: 'neutral' }
export const VerificationBadge = ({ status }: { status: VerificationStatus }) => (
  <Badge tone={verifTone[status]}>{VERIFICATION_LABEL[status]}</Badge>
)

const prioTone: Record<Priority, Tone> = { low: 'blue', medium: 'orange', high: 'red', critical: 'red' }
export const PriorityBadge = ({ priority }: { priority: Priority }) => (
  <Badge tone={prioTone[priority]} className={priority === 'critical' ? 'bg-danger-600 text-white ring-danger-600' : ''}>
    {PRIORITY_LABEL[priority]}
  </Badge>
)

/** Shows the most useful single status for a student: awaiting review until verified, then repair status. */
export function IssueStatusBadge({ verification, repair }: { verification: VerificationStatus; repair: RepairStatus }) {
  if (verification === 'pending' && repair === 'reported') return <Badge tone="neutral" dot>Awaiting review</Badge>
  if (verification === 'rejected' || verification === 'merged') return <VerificationBadge status={verification} />
  return <RepairBadge status={repair} />
}

// ---------------------------------------------------------------- Category visuals
export const CATEGORY_META: Record<IssueCategory, { icon: LucideIcon; fg: string; bg: string }> = {
  plumbing: { icon: Droplet, fg: 'text-sky-700', bg: 'bg-sky-50' },
  electrical: { icon: Zap, fg: 'text-amber-700', bg: 'bg-amber-50' },
  furniture: { icon: Armchair, fg: 'text-violet-700', bg: 'bg-violet-50' },
  heating_cooling: { icon: Thermometer, fg: 'text-rose-700', bg: 'bg-rose-50' },
  cleaning: { icon: Sparkles, fg: 'text-teal-700', bg: 'bg-teal-50' },
  building_damage: { icon: Hammer, fg: 'text-orange-700', bg: 'bg-orange-50' },
  safety: { icon: ShieldAlert, fg: 'text-red-700', bg: 'bg-red-50' },
  other: { icon: CircleHelp, fg: 'text-slate-700', bg: 'bg-slate-100' },
}

export function CategoryIcon({ category, size = 'md' }: { category: IssueCategory; size?: 'sm' | 'md' | 'lg' }) {
  const m = CATEGORY_META[category]
  const Icon = m.icon
  const s = { sm: 'size-8 rounded-lg', md: 'size-10 rounded-xl', lg: 'size-14 rounded-2xl' }[size]
  const i = { sm: 'size-4', md: 'size-5', lg: 'size-7' }[size]
  return (
    <span className={cx('inline-grid shrink-0 place-items-center', s, m.bg, m.fg)} title={categoryLabel(category)}>
      <Icon className={i} aria-hidden />
    </span>
  )
}

/** Photo, or a tinted category illustration when no photo exists. */
export function IssueImage({ url, category, alt, className }: { url: string | null; category: IssueCategory; alt: string; className?: string }) {
  if (url) return <img src={url} alt={alt} loading="lazy" className={cx('object-cover', className)} />
  const m = CATEGORY_META[category]
  const Icon = m.icon
  return (
    <div className={cx('grid place-items-center', m.bg, className)} role="img" aria-label={`${categoryLabel(category)} issue, no photo`}>
      <Icon className={cx('size-9 opacity-70', m.fg)} aria-hidden strokeWidth={1.5} />
    </div>
  )
}

// ---------------------------------------------------------------- Health
export function HealthScore({ score, compact }: { score: number | null; compact?: boolean }) {
  const band = healthBand(score)
  const meta = HEALTH_BAND_META[band]
  return (
    <div className={cx('flex items-center gap-3', compact && 'gap-2')}>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100" aria-hidden>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${score ?? 0}%`, background: meta.color }} />
      </div>
      <span className={cx('w-9 text-right text-sm font-semibold tabular-nums', score === null && 'w-auto text-xs font-medium text-muted')}>
        {score === null ? 'No data' : score}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------- Feedback states
export const Skeleton = ({ className }: { className?: string }) => <div className={cx('skeleton', className)} aria-hidden />

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-600">
        <Icon className="size-6" aria-hidden />
      </span>
      <h3 className="text-base font-semibold">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function SampleTag() {
  return (
    <span
      className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700"
      title="Fictional sample record for demonstration — not a real campus condition"
    >
      Sample
    </span>
  )
}
