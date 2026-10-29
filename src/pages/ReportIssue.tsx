import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CircleCheck,
  ImagePlus,
  Map,
  MapPin,
  Sparkles,
  Star,
  ThumbsUp,
  TriangleAlert,
  X,
} from 'lucide-react'
import { useApp, useLoad, useToast } from '../context/AppContext'
import { Button, ButtonLink, CATEGORY_META, IssueStatusBadge, PageHeader, Skeleton, cx } from '../components/ui'
import { CATEGORIES, POINTS, categoryLabel } from '../lib/constants'
import { compressImage, validatePhoto } from '../lib/image'
import { findDuplicates, type DuplicateMatch } from '../lib/similarity'
import { routeReport, suggestCategory } from '../lib/classify'
import { timeAgo } from '../lib/format'
import type { Issue, IssueCategory } from '../lib/types'

const STEPS = ['Location', 'Details', 'Similar reports', 'Review'] as const

function Stepper({ step }: { step: number }) {
  return (
    <ol className="mb-6 flex items-center gap-2" aria-label="Progress">
      {STEPS.map((label, i) => (
        <li key={label} className="flex flex-1 items-center gap-2" aria-current={i === step ? 'step' : undefined}>
          <span
            className={cx(
              'grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold transition',
              i < step && 'bg-brand-600 text-white',
              i === step && 'bg-navy-900 text-white ring-4 ring-brand-100',
              i > step && 'bg-slate-200 text-slate-700',
            )}
          >
            {i < step ? <Check className="size-3.5" /> : i + 1}
          </span>
          <span className={cx('hidden text-sm font-medium sm:block', i === step ? 'text-ink' : 'text-muted')}>{label}</span>
          {i < STEPS.length - 1 && <span className={cx('h-0.5 flex-1 rounded', i < step ? 'bg-brand-600' : 'bg-slate-200')} />}
        </li>
      ))}
    </ol>
  )
}

const FieldError = ({ children }: { children?: string }) =>
  children ? (
    <p className="mt-1.5 text-sm font-medium text-danger-600" role="alert">
      {children}
    </p>
  ) : null

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="card animate-fade-up p-5 sm:p-7">
      <h2 className="text-lg font-semibold">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      <div className="mt-5">{children}</div>
    </section>
  )
}

export default function ReportIssue() {
  const { api, user, refresh } = useApp()
  const toast = useToast()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { data: buildings } = useLoad((a) => a.listBuildings())
  const { data: campus } = useLoad((a) => a.getCampus())

  const [step, setStep] = useState(0)
  const [buildingId, setBuildingId] = useState('')
  const [floor, setFloor] = useState('')
  const [room, setRoom] = useState('')
  const [locationNote, setLocationNote] = useState('')
  const [marker, setMarker] = useState<{ lat: number; lng: number } | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<IssueCategory | ''>('')
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [matches, setMatches] = useState<DuplicateMatch[] | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [supportingId, setSupportingId] = useState<string | null>(null)
  const [created, setCreated] = useState<Issue | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const topRef = useRef<HTMLDivElement>(null)

  // Prefill from map / building links: /report?building=woodland&floor=First%20Floor&room=112
  useEffect(() => {
    if (!buildings) return
    const slug = params.get('building')
    const b = buildings.find((x) => x.slug === slug || x.id === slug)
    if (b) {
      setBuildingId(b.id)
      const f = params.get('floor')
      if (f && b.floors.includes(f)) setFloor(f)
      setRoom(params.get('room') ?? '')
      const lat = Number(params.get('lat'))
      const lng = Number(params.get('lng'))
      setMarker(params.get('lat') && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null)
    }
  }, [buildings, params])

  useEffect(() => () => void (photoPreview && URL.revokeObjectURL(photoPreview)), [photoPreview])

  const building = buildings?.find((b) => b.id === buildingId)
  const go = (s: number) => {
    setStep(s)
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const validate = (s: number) => {
    const e: Record<string, string> = {}
    if (s === 0) {
      if (!buildingId) e.building = 'Choose the building where the problem is.'
      if (!floor) e.floor = 'Choose a floor.'
      if (!room.trim()) e.room = 'Add a room number or area so staff can find it.'
    }
    if (s === 1) {
      if (!category) e.category = 'Choose the category that fits best.'
      if (title.trim().length < 4) e.title = 'Give the issue a short title (at least 4 characters).'
      if (description.trim().length < 10) e.description = 'Describe the problem in a bit more detail (at least 10 characters).'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const onPhoto = async (file: File | undefined) => {
    if (!file) return
    const err = validatePhoto(file)
    if (err) {
      setErrors((x) => ({ ...x, photo: err }))
      return
    }
    setPhotoBusy(true)
    try {
      const blob = await compressImage(file)
      setPhoto(blob)
      setPhotoPreview(URL.createObjectURL(blob))
      setErrors(({ photo: _p, ...rest }) => rest)
    } catch (e) {
      setErrors((x) => ({ ...x, photo: e instanceof Error ? e.message : 'Could not use that image.' }))
    } finally {
      setPhotoBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const runDuplicateCheck = async () => {
    setMatches(null)
    go(2)
    try {
      const all = await api.listIssues()
      setMatches(
        findDuplicates({ buildingId, floor, room, category: category as IssueCategory, title, description }, all),
      )
    } catch {
      setMatches([])
    }
  }

  const supportExisting = async (issue: Issue) => {
    setSupportingId(issue.id)
    try {
      if (!issue.supportedByMe && issue.reporterId !== user?.id) await api.setSupport(issue.id, true)
      refresh()
      toast('Thanks! You’re now supporting this report and will see its updates.')
      navigate(`/issues/${issue.id}`)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not add your support', 'error')
    } finally {
      setSupportingId(null)
    }
  }

  const submit = async () => {
    setSubmitting(true)
    try {
      const issue = await api.createIssue({
        buildingId,
        floor,
        room,
        locationNote,
        title,
        description,
        category: category as IssueCategory,
        photo,
        markerLatitude: marker?.lat ?? null,
        markerLongitude: marker?.lng ?? null,
      })
      refresh()
      setCreated(issue)
      topRef.current?.scrollIntoView({ block: 'start' })
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not submit your report', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const typed = `${title} ${description}`
  const suggestion = useMemo(() => (typed.trim().length >= 6 ? suggestCategory(typed) : null), [typed])
  const advice = useMemo(() => (typed.trim().length >= 4 ? routeReport(typed) : null), [typed])

  const pendingPoints = POINTS.firstReporter + (photo ? POINTS.usefulPhoto : 0)
  const descLeft = 2000 - description.length

  const buildingsSorted = useMemo(() => [...(buildings ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [buildings])

  // ------------------------------------------------------------------ success
  if (created) {
    return (
      <div ref={topRef} className="mx-auto max-w-xl animate-fade-up">
        <div className="card overflow-hidden text-center">
          <div className="bg-gradient-to-b from-success-50 to-white px-6 pb-6 pt-10">
            <span className="mx-auto grid size-16 place-items-center rounded-full bg-success-600 text-white shadow-pop ring-8 ring-success-100">
              <CircleCheck className="size-8" />
            </span>
            <h1 className="mt-5 text-2xl font-bold tracking-tight">Your issue has been reported!</h1>
            <p className="mt-1.5 text-muted">Facilities staff will review it shortly. You’ll see every update on the report page.</p>
          </div>
          <dl className="grid grid-cols-3 divide-x divide-line border-y border-line text-left">
            <div className="p-4">
              <dt className="text-xs font-medium text-muted">Report ID</dt>
              <dd className="mt-1 font-mono text-[15px] font-semibold">{created.refCode}</dd>
            </div>
            <div className="p-4">
              <dt className="text-xs font-medium text-muted">Status</dt>
              <dd className="mt-1">
                <IssueStatusBadge verification={created.verificationStatus} repair={created.repairStatus} />
              </dd>
            </div>
            <div className="p-4">
              <dt className="text-xs font-medium text-muted">Pending points</dt>
              <dd className="mt-1 flex items-center gap-1 text-[15px] font-semibold text-amber-600">
                <Star className="size-4 fill-current" /> +{pendingPoints}
              </dd>
            </div>
          </dl>
          <p className="px-6 pt-4 text-xs text-muted">Points are released once facilities staff verify the report.</p>
          <div className="flex flex-col gap-2.5 p-6 sm:flex-row sm:justify-center">
            <ButtonLink to={`/issues/${created.id}`} icon={ArrowRight}>
              View Report
            </ButtonLink>
            <Button
              variant="secondary"
              onClick={() => {
                setCreated(null)
                setStep(0)
                setTitle('')
                setDescription('')
                setCategory('')
                setPhoto(null)
                setPhotoPreview(null)
                setRoom('')
                setLocationNote('')
                setMarker(null)
                setMatches(null)
              }}
            >
              Report another issue
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ------------------------------------------------------------------ wizard
  return (
    <div ref={topRef} className="mx-auto max-w-3xl scroll-mt-24">
      <PageHeader title="Report an Issue" subtitle="Tell facilities what’s wrong and exactly where — it takes about a minute." />
      <Stepper step={step} />

      {step === 0 && (
        <Section title="Where is the problem?" subtitle="Outdoor map points can’t pinpoint an indoor room, so please add the floor and room or area.">
          <div className="mb-5 grid gap-3 sm:grid-cols-2">
            <Link to="/map?pick=1" className="flex items-start gap-3 rounded-xl border border-line bg-white p-4 transition hover:border-brand-200 hover:bg-brand-50">
              <Map className="mt-0.5 size-5 shrink-0 text-brand-600" />
              <div>
                <p className="text-sm font-semibold">Select on 3D map</p>
                <p className="text-xs text-muted">Tap a building, pick the floor and drop an optional pin.</p>
              </div>
            </Link>
            <div className="flex items-start gap-3 rounded-xl border-2 border-brand-600 bg-brand-50 p-4">
              <Building2 className="mt-0.5 size-5 shrink-0 text-brand-600" />
              <div>
                <p className="text-sm font-semibold">Select manually</p>
                <p className="text-xs text-slate-600">Choose campus, building, floor and room below.</p>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <label className="label" htmlFor="campus">Campus</label>
              <select id="campus" className="input" value={campus?.id ?? ''} disabled>
                <option value={campus?.id ?? ''}>{campus?.name ?? 'Loading…'}</option>
              </select>
            </div>

            <fieldset>
              <legend className="label">Building</legend>
              {!buildings ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-14" />)}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {buildingsSorted.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => {
                        setBuildingId(b.id)
                        if (!b.floors.includes(floor)) setFloor('')
                        setErrors(({ building: _b, ...r }) => r)
                      }}
                      aria-pressed={buildingId === b.id}
                      className={cx(
                        'flex min-h-14 items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition',
                        buildingId === b.id ? 'border-brand-600 bg-brand-50 text-brand-700 ring-2 ring-brand-100' : 'border-line bg-white hover:border-slate-300',
                      )}
                    >
                      <Building2 className="size-4 shrink-0 opacity-70" aria-hidden />
                      {b.shortName}
                    </button>
                  ))}
                </div>
              )}
              <FieldError>{errors.building}</FieldError>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="floor">Floor</label>
                <select id="floor" className="input" value={floor} onChange={(e) => setFloor(e.target.value)} disabled={!building}>
                  <option value="">{building ? 'Choose a floor' : 'Choose a building first'}</option>
                  {building?.floors.map((f) => <option key={f}>{f}</option>)}
                </select>
                <FieldError>{errors.floor}</FieldError>
              </div>
              <div>
                <label className="label" htmlFor="room">Room or area</label>
                <input id="room" className="input" placeholder="e.g. Restroom near Room 112" maxLength={80} value={room} onChange={(e) => setRoom(e.target.value)} />
                <FieldError>{errors.room}</FieldError>
              </div>
            </div>
            {marker && (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-success-50 px-3.5 py-2.5 text-sm text-success-700">
                <span className="flex items-center gap-2 font-medium">
                  <MapPin className="size-4" /> Map pin added on {building?.shortName ?? 'the building'}
                </span>
                <button type="button" className="text-xs font-semibold hover:underline" onClick={() => setMarker(null)}>
                  Remove
                </button>
              </div>
            )}
            <div>
              <label className="label" htmlFor="note">
                Extra location details <span className="font-normal text-muted">(optional)</span>
              </label>
              <input id="note" className="input" placeholder="e.g. Second sink from the door" maxLength={200} value={locationNote} onChange={(e) => setLocationNote(e.target.value)} />
            </div>
          </div>

          <div className="mt-7 flex justify-end">
            <Button onClick={() => validate(0) && go(1)} icon={ArrowRight} className="w-full flex-row-reverse sm:w-auto">
              Continue
            </Button>
          </div>
        </Section>
      )}

      {step === 1 && (
        <Section title="Describe the problem" subtitle="Clear details and a photo help staff fix it faster. We’ll suggest a category as you type.">

          <div className="space-y-5">
            <div>
              <label className="label" htmlFor="title">Title</label>
              <input id="title" className="input" placeholder="e.g. Leaking faucet in restroom" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
              <FieldError>{errors.title}</FieldError>
            </div>
            <div>
              <label className="label" htmlFor="desc">Description</label>
              <textarea
                id="desc"
                rows={4}
                className="input resize-y"
                placeholder="What’s wrong, how bad is it, and since when?"
                maxLength={2000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <div className="flex justify-between">
                <FieldError>{errors.description}</FieldError>
                <span className={cx('ml-auto mt-1.5 text-xs', descLeft < 100 ? 'text-warning-700' : 'text-muted')}>{descLeft} characters left</span>
              </div>
            </div>

            {advice && (
              <div
                role={advice.kind === 'emergency' ? 'alert' : 'note'}
                className={cx(
                  'flex gap-3 rounded-xl p-3.5 text-sm',
                  advice.kind === 'emergency' ? 'bg-danger-50 text-danger-700 ring-1 ring-danger-100' : 'bg-warning-50 text-warning-700 ring-1 ring-warning-100',
                )}
              >
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <div>
                  <p className="font-semibold">{advice.title}</p>
                  <p className="mt-0.5">{advice.body}</p>
                </div>
              </div>
            )}

            <fieldset>
            <legend className="label">Category</legend>
            {suggestion && suggestion.category !== category && (
              <div className="mb-2.5 flex flex-wrap items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-700">
                <Sparkles className="size-4 shrink-0" aria-hidden />
                <span>
                  Looks like <strong>{categoryLabel(suggestion.category)}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setCategory(suggestion.category)
                    setErrors(({ category: _c, ...r }) => r)
                  }}
                  className="ml-auto rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-brand-700 shadow-sm ring-1 ring-brand-200 hover:bg-brand-100"
                >
                  Use suggestion
                </button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CATEGORIES.map((c) => {
                const m = CATEGORY_META[c.value]
                const Icon = m.icon
                const active = category === c.value
                return (
                  <button
                    key={c.value}
                    type="button"
                    title={c.hint}
                    onClick={() => {
                      setCategory(c.value)
                      setErrors(({ category: _c, ...r }) => r)
                    }}
                    aria-pressed={active}
                    className={cx(
                      'flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition',
                      active ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-100' : 'border-line bg-white hover:border-slate-300',
                    )}
                  >
                    <span className={cx('grid size-8 place-items-center rounded-lg', m.bg, m.fg)}>
                      <Icon className="size-4" />
                    </span>
                    <span className="text-sm font-semibold leading-tight">{c.label}</span>
                  </button>
                )
              })}
            </div>
            <FieldError>{errors.category}</FieldError>
          </fieldset>

            <div>
              <span className="label">
                Photo <span className="font-normal text-muted">(optional, +{POINTS.usefulPhoto} pts if useful)</span>
              </span>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" id="photo" onChange={(e) => onPhoto(e.target.files?.[0])} />
              {photoPreview ? (
                <div className="relative w-full overflow-hidden rounded-xl border border-line sm:w-72">
                  <img src={photoPreview} alt="Selected photo preview" className="h-48 w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => {
                      setPhoto(null)
                      setPhotoPreview(null)
                    }}
                    className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-navy-900/80 text-white backdrop-blur hover:bg-navy-900"
                    aria-label="Remove photo"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <label
                  htmlFor="photo"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    onPhoto(e.dataTransfer.files?.[0])
                  }}
                  className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line bg-canvas px-4 py-8 text-center transition hover:border-brand-200 hover:bg-brand-50"
                >
                  {photoBusy ? (
                    <span className="size-6 animate-spin rounded-full border-2 border-brand-100 border-t-brand-600" />
                  ) : (
                    <span className="grid size-11 place-items-center rounded-xl bg-white text-brand-600 shadow-card">
                      <ImagePlus className="size-5" />
                    </span>
                  )}
                  <span className="text-sm font-semibold">
                    <span className="sm:hidden">Take or choose a photo</span>
                    <span className="hidden sm:inline">Drop a photo here or click to browse</span>
                  </span>
                  <span className="text-xs text-muted">JPG, PNG or WebP · up to 8 MB · location data is removed</span>
                </label>
              )}
              <FieldError>{errors.photo}</FieldError>
            </div>
          </div>

          <div className="mt-7 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-between">
            <Button variant="secondary" icon={ArrowLeft} onClick={() => go(0)}>
              Back
            </Button>
            <Button onClick={() => validate(1) && runDuplicateCheck()} icon={ArrowRight} className="flex-row-reverse" disabled={photoBusy}>
              Check for similar reports
            </Button>
          </div>
        </Section>
      )}

      {step === 2 && (
        <Section title="Has someone already reported this?" subtitle={`We compared your report with open issues in ${building?.name ?? 'this building'}.`}>
          {matches === null ? (
            <div className="space-y-3" aria-busy>
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          ) : matches.length === 0 ? (
            <div className="flex items-center gap-3 rounded-xl bg-success-50 p-4 text-success-700">
              <CircleCheck className="size-5 shrink-0" />
              <p className="text-sm font-medium">No similar open reports found — yours looks new.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {matches.map(({ issue, score, reasons }) => (
                <li key={issue.id} className="rounded-xl border border-line p-4">
                  <div className="flex items-start gap-3">
                    <span className={cx('grid size-10 shrink-0 place-items-center rounded-xl', CATEGORY_META[issue.category].bg, CATEGORY_META[issue.category].fg)}>
                      {(() => {
                        const I = CATEGORY_META[issue.category].icon
                        return <I className="size-5" />
                      })()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/issues/${issue.id}`} target="_blank" className="font-semibold hover:text-brand-700">
                          {issue.title}
                        </Link>
                        <IssueStatusBadge verification={issue.verificationStatus} repair={issue.repairStatus} />
                      </div>
                      <p className="mt-0.5 flex items-center gap-1 text-sm text-muted">
                        <MapPin className="size-3.5" /> {[issue.buildingName, issue.floor, issue.room].filter(Boolean).join(' · ')}
                      </p>
                      <p className="mt-1 line-clamp-2 text-sm">{issue.description}</p>
                      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                        <span className="font-semibold text-brand-700">{Math.round(score * 100)}% match</span>
                        <span>{reasons.join(' · ')}</span>
                        <span>
                          {issue.refCode} · {timeAgo(issue.createdAt)} · {issue.supporterCount} supporters
                        </span>
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={ThumbsUp}
                    className="mt-3 w-full sm:w-auto"
                    loading={supportingId === issue.id}
                    disabled={!!supportingId}
                    onClick={() => supportExisting(issue)}
                  >
                    I’m Experiencing This Too
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-7 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-between">
            <Button variant="secondary" icon={ArrowLeft} onClick={() => go(1)}>
              Back
            </Button>
            <Button onClick={() => go(3)} disabled={matches === null} variant={matches?.length ? 'navy' : 'primary'}>
              {matches?.length ? 'This Is a Different Issue' : 'Continue'}
            </Button>
          </div>
        </Section>
      )}

      {step === 3 && (
        <Section title="Review and submit" subtitle="Make sure the location is right — you can still go back and change anything.">
          <div className="overflow-hidden rounded-xl border border-line">
            {photoPreview && <img src={photoPreview} alt="" className="h-48 w-full object-cover" />}
            <dl className="divide-y divide-line text-sm">
              {[
                ['Location', [building?.name, floor, room].filter(Boolean).join(' · ') + (locationNote ? ` — ${locationNote}` : '') + (marker ? ' · map pin added' : ''), 0],
                ['Category', category ? categoryLabel(category) : '', 1],
                ['Title', title, 1],
                ['Description', description, 1],
              ].map(([k, v, s]) => (
                <div key={k as string} className="flex gap-4 p-3.5">
                  <dt className="w-24 shrink-0 font-medium text-muted">{k}</dt>
                  <dd className="min-w-0 flex-1 whitespace-pre-line break-words">{v}</dd>
                  <button className="text-xs font-semibold text-brand-600 hover:underline" onClick={() => go(s as number)}>
                    Edit
                  </button>
                </div>
              ))}
            </dl>
          </div>
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
            <Star className="size-5 shrink-0 fill-amber-400 text-amber-500" />
            <p>
              You’ll earn <strong>+{pendingPoints} pending points</strong>, released once facilities verify this report.
            </p>
          </div>
          <div className="mt-7 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-between">
            <Button variant="secondary" icon={ArrowLeft} onClick={() => go(2)}>
              Back
            </Button>
            <Button onClick={submit} loading={submitting} icon={Check} size="lg">
              Submit report
            </Button>
          </div>
        </Section>
      )}
    </div>
  )
}
