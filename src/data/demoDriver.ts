import type { Api, DemoAccount } from './api'
import { ApiError } from './api'
import { BUILDINGS, CAMPUS, DEMO_USERS, SEED_ISSUES, bySlug } from './seed'
import { REWARDS } from './rewards'
import { historyNotification, pointsNotification } from '../lib/notifications'
import { applyFilters } from '../lib/filters'
import { blobToDataUrl } from '../lib/image'
import { POINTS } from '../lib/constants'
import type {
  AppNotification,
  Building,
  PointsAction,
  PointsTx,
  Redemption,
  RedemptionStatus,
  Reward,
  Issue,
  NewIssueInput,
  PointsSummary,
  PointsStatus,
  Profile,
  RepairStatus,
  StatusHistoryEntry,
} from '../lib/types'

/**
 * LOCAL DEMO DRIVER — a sandbox that mirrors the Supabase rules in the browser so the app
 * runs before a backend is connected. State lives in localStorage on this device only.
 * It is NOT a security boundary; real authorization is enforced by Supabase RLS + functions.
 */

const STORAGE_KEY = 'campusfix-demo-v1'
const SESSION_KEY = 'campusfix-demo-session'
const DAY = 86_400_000

interface StoredIssue extends Omit<Issue, 'supporterCount' | 'supportedByMe' | 'followedByMe' | 'buildingName' | 'reporterName'> {}
interface LedgerRow {
  id: string
  userId: string
  issueId: string | null
  action: string
  points: number
  status: PointsStatus
  key: string
  createdAt: string
}
interface DemoState {
  version: 1
  nextRef: number
  issues: StoredIssue[]
  supporters: { issueId: string; userId: string; createdAt: string }[]
  followers: { issueId: string; userId: string }[]
  history: (Omit<StatusHistoryEntry, 'changedByName'> & { changedBy: string | null })[]
  points: LedgerRow[]
  confirmations: { issueId: string; userId: string; isFixed: boolean }[]
  rewards: Reward[]
  redemptions: { id: string; userId: string; rewardId: string; pointsSpent: number; status: RedemptionStatus; createdAt: string }[]
  buildingPatches: Record<string, { floors?: string[]; active?: boolean; name?: string }>
}

// ---------- storage with graceful fallback (private mode, blocked storage) ----------
let memory: DemoState | null = null
let memorySession: string | null = null

function readStorage(k: string): string | null {
  try {
    return window.localStorage.getItem(k)
  } catch {
    return null
  }
}
function writeStorage(k: string, v: string | null) {
  try {
    if (v === null) window.localStorage.removeItem(k)
    else window.localStorage.setItem(k, v)
    return true
  } catch (e) {
    if (e instanceof DOMException && /quota/i.test(e.name)) {
      throw new ApiError('This browser’s demo storage is full. Reset demo data from your profile, or use a smaller photo.')
    }
    return false
  }
}

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString()

function seedState(): DemoState {
  const s: DemoState = {
    version: 1, nextRef: 2000, issues: [], supporters: [], followers: [], history: [], points: [], confirmations: [],
    rewards: REWARDS.map((r) => ({ ...r })), redemptions: [], buildingPatches: {},
  }
  for (const si of SEED_ISSUES) {
    const b = bySlug(si.building)
    const id = `seed-${si.ref}`
    const created = iso(si.daysAgo * DAY + 3 * 3600_000)
    const resolvedAt = si.resolvedDaysAgo != null ? iso(si.resolvedDaysAgo * DAY) : null
    s.issues.push({
      id, refCode: `CF-${si.ref}`, reporterId: si.reporter, campusId: CAMPUS.id, buildingId: b.id, floor: si.floor,
      room: si.room, locationNote: null, title: si.title, description: si.description, category: si.category,
      photoUrl: null, markerLatitude: null, markerLongitude: null, verificationStatus: si.verification,
      repairStatus: si.repair, priority: si.priority, duplicateOfIssueId: null, isSample: true, createdAt: created,
      updatedAt: resolvedAt ?? created, resolvedAt,
    })
    s.history.push({ id: uid(), issueId: id, kind: 'repair', previousStatus: null, newStatus: 'reported', changedBy: si.reporter, note: 'Issue reported', createdAt: created })
    if (si.verification === 'verified') {
      s.history.push({ id: uid(), issueId: id, kind: 'verification', previousStatus: 'pending', newStatus: 'verified', changedBy: 'u-taylor', note: null, createdAt: iso(si.daysAgo * DAY) })
    }
    let prev: RepairStatus = 'reported'
    for (const n of si.notes ?? []) {
      s.history.push({ id: uid(), issueId: id, kind: n.status ? 'repair' : 'note', previousStatus: n.status ? prev : null, newStatus: n.status ?? null, changedBy: 'u-taylor', note: n.note, createdAt: iso(n.daysAgo * DAY) })
      if (n.status) prev = n.status
    }
    si.supporters.forEach((u, k) => {
      s.supporters.push({ issueId: id, userId: u, createdAt: iso(si.daysAgo * DAY - (k + 1) * 3600_000) })
      if (si.verification === 'verified') {
        s.points.push({ id: uid(), userId: u, issueId: id, action: 'verified_support', points: POINTS.verifiedSupport, status: 'available', key: `verified_support:${id}:${u}`, createdAt: iso(si.daysAgo * DAY - (k + 1) * 3600_000) })
      }
    })
    // sample ledger entries so the wallet reflects the same rules as Supabase
    if (si.reporter) {
      const status: PointsStatus = si.verification === 'verified' ? 'available' : si.verification === 'pending' ? 'pending' : 'void'
      s.points.push({ id: uid(), userId: si.reporter, issueId: id, action: 'first_reporter', points: POINTS.firstReporter, status, key: `first_reporter:${id}`, createdAt: created })
      if (si.repair === 'resolved') {
        s.points.push({ id: uid(), userId: si.reporter, issueId: id, action: 'original_resolved', points: POINTS.originalResolved, status: 'available', key: `original_resolved:${id}`, createdAt: resolvedAt! })
      }
    }
  }
  // Clearly labeled demo adjustment so the sample student can try a mock redemption.
  s.points.push({ id: uid(), userId: 'u-alex', issueId: null, action: 'adjustment', points: 300, status: 'available', key: 'demo-topup:u-alex', createdAt: iso(10 * DAY) })
  return s
}

function load(): DemoState {
  if (memory) return memory
  const raw = readStorage(STORAGE_KEY)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as DemoState
      if (parsed.version === 1) {
        // fill fields added after Phase 2 so existing demo data keeps working
        parsed.rewards ??= REWARDS.map((r) => ({ ...r }))
        parsed.redemptions ??= []
        parsed.buildingPatches ??= {}
        return (memory = parsed)
      }
    } catch {
      /* fall through to reseed */
    }
  }
  memory = seedState()
  save()
  return memory
}
function save() {
  if (memory) writeStorage(STORAGE_KEY, JSON.stringify(memory))
}

const nameOf = (userId: string | null) => DEMO_USERS.find((u) => u.id === userId)?.displayName ?? null
const buildingName = (id: string) => BUILDINGS.find((b) => b.id === id)?.name ?? 'Unknown building'
const delay = <T>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 120))

export function createDemoApi(): Api {
  const listeners = new Set<(p: Profile | null) => void>()

  const sessionId = () => memorySession ?? readStorage(SESSION_KEY)
  const me = (): Profile | null => {
    const u = DEMO_USERS.find((x) => x.id === sessionId())
    return u ? { id: u.id, displayName: u.displayName, role: u.role } : null
  }
  const requireMe = () => {
    const p = me()
    if (!p) throw new ApiError('Please sign in first.')
    return p
  }
  const requireStaff = () => {
    const p = requireMe()
    if (p.role !== 'staff' && p.role !== 'admin') throw new ApiError('Only facilities staff can do this.')
    return p
  }
  const log = (
    s: DemoState,
    issueId: string,
    kind: StatusHistoryEntry['kind'],
    previousStatus: string | null,
    newStatus: string | null,
    changedBy: string,
    note?: string | null,
  ) => {
    s.history.push({ id: uid(), issueId, kind, previousStatus, newStatus, changedBy, note: note?.trim() || null, createdAt: new Date().toISOString() })
  }
  const requireAdmin = () => {
    const p = requireMe()
    if (p.role !== 'admin') throw new ApiError('Only administrators can do this.')
    return p
  }
  const award = (s: DemoState, userId: string, issueId: string | null, action: PointsAction, points: number, status: PointsStatus, key: string) => {
    if (!s.points.some((t) => t.key === key)) s.points.push({ id: uid(), userId, issueId, action, points, status, key, createdAt: new Date().toISOString() })
  }
  /** +5 once per (issue, supporter) — only while verified and unresolved, never to the reporter. */
  const awardSupport = (s: DemoState, issue: StoredIssue, userId: string) => {
    if (issue.verificationStatus !== 'verified' || issue.repairStatus === 'resolved' || issue.reporterId === userId) return
    award(s, userId, issue.id, 'verified_support', POINTS.verifiedSupport, 'available', `verified_support:${issue.id}:${userId}`)
  }
  const buildings = (s: DemoState): Building[] =>
    BUILDINGS.map((b) => {
      const patch = s.buildingPatches[b.id] ?? {}
      return { ...b, ...patch, floors: patch.floors ?? b.floors, active: patch.active ?? true }
    })
  const toTx = (s: DemoState, t: LedgerRow): PointsTx => {
    const issue = s.issues.find((i) => i.id === t.issueId)
    return {
      id: t.id, userId: t.userId, userName: nameOf(t.userId), issueId: t.issueId, issueTitle: issue?.title ?? null,
      issueRef: issue?.refCode ?? null, action: t.action as PointsAction, points: t.points, status: t.status, createdAt: t.createdAt,
    }
  }
  const toRedemption = (s: DemoState, r: DemoState['redemptions'][number]): Redemption => {
    const reward = s.rewards.find((x) => x.id === r.rewardId)
    return { ...r, userName: nameOf(r.userId), rewardTitle: reward?.title ?? 'Reward', imageKey: reward?.imageKey ?? 'gift' }
  }
  const emit = () => listeners.forEach((cb) => cb(me()))

  const hydrate = (s: DemoState, i: StoredIssue, userId: string | null): Issue => ({
    ...i,
    buildingName: buildingName(i.buildingId),
    reporterName: nameOf(i.reporterId),
    supporterCount: s.supporters.filter((x) => x.issueId === i.id).length,
    supportedByMe: !!userId && s.supporters.some((x) => x.issueId === i.id && x.userId === userId),
    followedByMe: !!userId && s.followers.some((x) => x.issueId === i.id && x.userId === userId),
  })

  const visible = (i: StoredIssue, p: Profile | null) =>
    i.verificationStatus !== 'rejected' || i.reporterId === p?.id || p?.role === 'staff' || p?.role === 'admin'

  return {
    mode: 'demo',

    async getCurrentUser() {
      return me()
    },
    onAuthChange(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    async signInWithPassword() {
      throw new ApiError('Password sign-in is available once Supabase is connected. Choose a demo account below.')
    },
    demoAccounts(): DemoAccount[] {
      return DEMO_USERS.filter((u) => u.blurb).map(({ id, displayName, role, blurb }) => ({ id, displayName, role, blurb }))
    },
    async signInDemo(userId) {
      if (!DEMO_USERS.some((u) => u.id === userId && u.blurb)) throw new ApiError('Unknown demo account')
      memorySession = userId
      writeStorage(SESSION_KEY, userId)
      emit()
      return delay(me()!)
    },
    async signOut() {
      memorySession = null
      writeStorage(SESSION_KEY, null)
      emit()
    },

    async getCampus() {
      return CAMPUS
    },
    async listBuildings() {
      return delay(buildings(load()).filter((b) => b.active))
    },
    async listAllBuildings() {
      requireAdmin()
      return delay(buildings(load()))
    },
    async updateBuilding(id, patch) {
      requireAdmin()
      const s = load()
      if (!BUILDINGS.some((b) => b.id === id)) throw new ApiError('Building not found.')
      if (patch.floors && patch.floors.some((f) => !f.trim())) throw new ApiError('Floor names can’t be empty.')
      s.buildingPatches[id] = { ...s.buildingPatches[id], ...patch }
      save()
    },

    async listIssues(filters) {
      const s = load()
      const p = me()
      const all = s.issues.filter((i) => visible(i, p)).map((i) => hydrate(s, i, p?.id ?? null))
      return delay(applyFilters(all, filters))
    },
    async getIssue(id) {
      const s = load()
      const p = me()
      const i = s.issues.find((x) => x.id === id)
      return delay(i && visible(i, p) ? hydrate(s, i, p?.id ?? null) : null)
    },
    async getHistory(issueId) {
      const s = load()
      return delay(
        s.history
          .filter((h) => h.issueId === issueId)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .map(({ changedBy, ...h }) => ({ ...h, changedByName: nameOf(changedBy) })),
      )
    },

    async createIssue(input: NewIssueInput) {
      const p = requireMe()
      const s = load()
      const b = BUILDINGS.find((x) => x.id === input.buildingId)
      if (!b) throw new ApiError('Please choose a building.')
      if (input.title.trim().length < 4) throw new ApiError('Title is too short.')
      if (input.description.trim().length < 10) throw new ApiError('Please describe the problem in a bit more detail.')
      const photoUrl = input.photo ? await blobToDataUrl(input.photo) : null
      const now = new Date().toISOString()
      const id = uid()
      const issue: StoredIssue = {
        id, refCode: `CF-${s.nextRef}`, reporterId: p.id, campusId: b.campusId, buildingId: b.id,
        floor: input.floor || null, room: input.room.trim() || null, locationNote: input.locationNote.trim() || null,
        title: input.title.trim(), description: input.description.trim(), category: input.category, photoUrl,
        markerLatitude: input.markerLatitude ?? null, markerLongitude: input.markerLongitude ?? null,
        // safe defaults — same as the Supabase insert trigger
        verificationStatus: 'pending', repairStatus: 'reported', priority: 'low', duplicateOfIssueId: null,
        isSample: false, createdAt: now, updatedAt: now, resolvedAt: null,
      }
      const snapshot = JSON.stringify(s)
      s.nextRef++
      s.issues.push(issue)
      s.history.push({ id: uid(), issueId: id, kind: 'repair', previousStatus: null, newStatus: 'reported', changedBy: p.id, note: 'Issue reported', createdAt: now })
      s.followers.push({ issueId: id, userId: p.id })
      const award = (action: string, points: number) => {
        const key = `${action}:${id}`
        if (!s.points.some((t) => t.key === key)) s.points.push({ id: uid(), userId: p.id, issueId: id, action, points, status: 'pending', key, createdAt: now })
      }
      award('first_reporter', POINTS.firstReporter)
      if (photoUrl) award('useful_photo', POINTS.usefulPhoto)
      try {
        save()
      } catch (e) {
        memory = JSON.parse(snapshot) // roll back on quota failure
        throw e
      }
      return hydrate(s, issue, p.id)
    },

    async setSupport(issueId, support) {
      const p = requireMe()
      const s = load()
      const issue = s.issues.find((i) => i.id === issueId)
      if (!issue) throw new ApiError('Issue not found.')
      if (issue.reporterId === p.id) throw new ApiError('You reported this issue, so you’re already counted.')
      const has = s.supporters.some((x) => x.issueId === issueId && x.userId === p.id)
      if (support && !has) {
        s.supporters.push({ issueId, userId: p.id, createdAt: new Date().toISOString() })
        awardSupport(s, issue, p.id)
      }
      if (!support) s.supporters = s.supporters.filter((x) => !(x.issueId === issueId && x.userId === p.id))
      if (support) s.followers.some((x) => x.issueId === issueId && x.userId === p.id) || s.followers.push({ issueId, userId: p.id })
      save()
    },
    async setFollow(issueId, follow) {
      const p = requireMe()
      const s = load()
      s.followers = s.followers.filter((x) => !(x.issueId === issueId && x.userId === p.id))
      if (follow) s.followers.push({ issueId, userId: p.id })
      save()
    },
    async confirmResolution(issueId, isFixed) {
      const p = requireMe()
      const s = load()
      const issue = s.issues.find((i) => i.id === issueId)
      if (issue?.repairStatus !== 'resolved') throw new ApiError('This issue is not resolved yet.')
      s.confirmations = s.confirmations.filter((c) => !(c.issueId === issueId && c.userId === p.id))
      s.confirmations.push({ issueId, userId: p.id, isFixed })
      const involved = issue.reporterId === p.id || s.supporters.some((x) => x.issueId === issueId && x.userId === p.id)
      if (involved) award(s, p.id, issueId, 'resolution_confirmed', POINTS.resolutionConfirmed, 'available', `resolution_confirmed:${issueId}:${p.id}`)
      if (!isFixed) log(s, issueId, 'note', null, null, p.id, 'A community member reports this still isn’t fixed.')
      save()
    },

    async getPointsSummary(): Promise<PointsSummary> {
      const p = me()
      const s = load()
      const mine = s.points.filter((t) => t.userId === p?.id)
      const sum = (f: (t: LedgerRow) => boolean) => mine.filter(f).reduce((n, t) => n + t.points, 0)
      return {
        available: sum((t) => t.status === 'available'),
        pending: sum((t) => t.status === 'pending'),
        lifetimeEarned: sum((t) => t.status === 'available' && t.points > 0),
        redeemed: -sum((t) => t.action === 'redemption' && t.status === 'available'),
      }
    },

    // ---- staff actions (mirror the SECURITY DEFINER functions in 20261029000002_functions.sql)
    async reviewIssue(issueId, decision, opts = {}) {
      const p = requireStaff()
      const s = load()
      const issue = s.issues.find((i) => i.id === issueId)
      if (!issue) throw new ApiError('Issue not found.')
      const selfReview = issue.reporterId === p.id // allowed, but never releases points to oneself
      if (issue.verificationStatus !== 'pending') throw new ApiError('This report has already been reviewed.')
      const now = new Date().toISOString()
      issue.verificationStatus = decision
      if (opts.priority) issue.priority = opts.priority
      issue.updatedAt = now
      log(s, issueId, 'verification', 'pending', decision, p.id, opts.note)
      for (const t of s.points.filter((t) => t.issueId === issueId && t.status === 'pending')) {
        if (decision === 'rejected' || selfReview) t.status = 'void'
        else if (t.action === 'first_reporter') t.status = 'available'
        else if (t.action === 'useful_photo') t.status = opts.photoUseful === false ? 'void' : 'available'
      }
      if (decision === 'verified') {
        for (const sup of s.supporters.filter((x) => x.issueId === issueId && x.userId !== p.id)) awardSupport(s, issue, sup.userId)
      }
      save()
    },
    async setRepairStatus(issueId, status, note) {
      const p = requireStaff()
      const s = load()
      const issue = s.issues.find((i) => i.id === issueId)
      if (!issue) throw new ApiError('Issue not found.')
      if (issue.verificationStatus !== 'verified') throw new ApiError('Only verified issues can change repair status.')
      if (issue.repairStatus === status) return
      const prev = issue.repairStatus
      const now = new Date().toISOString()
      issue.repairStatus = status
      issue.resolvedAt = status === 'resolved' ? now : null
      issue.updatedAt = now
      log(s, issueId, 'repair', prev, status, p.id, note)
      if (status === 'resolved' && issue.reporterId && issue.reporterId !== p.id) {
        const key = `original_resolved:${issueId}`
        if (!s.points.some((t) => t.key === key)) {
          s.points.push({ id: uid(), userId: issue.reporterId, issueId, action: 'original_resolved', points: POINTS.originalResolved, status: 'available', key, createdAt: now })
        }
      }
      save()
    },
    async setPriority(issueId, priority) {
      const p = requireStaff()
      const s = load()
      const issue = s.issues.find((i) => i.id === issueId)
      if (!issue) throw new ApiError('Issue not found.')
      if (issue.priority === priority) return
      log(s, issueId, 'priority', issue.priority, priority, p.id)
      issue.priority = priority
      issue.updatedAt = new Date().toISOString()
      save()
    },
    async addNote(issueId, note) {
      const p = requireStaff()
      if (!note.trim()) throw new ApiError('Write an update first.')
      const s = load()
      log(s, issueId, 'note', null, null, p.id, note)
      save()
    },
    async mergeIssue(issueId, targetId, note) {
      const p = requireStaff()
      if (issueId === targetId) throw new ApiError('Cannot merge a report into itself.')
      const s = load()
      const issue = s.issues.find((i) => i.id === issueId)
      const target = s.issues.find((i) => i.id === targetId)
      if (!issue) throw new ApiError('Issue not found.')
      if (!target || target.verificationStatus === 'rejected' || target.verificationStatus === 'merged') {
        throw new ApiError('That report can’t be merged into.')
      }
      if (issue.verificationStatus === 'merged') throw new ApiError('This report is already merged.')
      const prev = issue.verificationStatus
      issue.verificationStatus = 'merged'
      issue.duplicateOfIssueId = targetId
      issue.updatedAt = new Date().toISOString()
      log(s, issueId, 'merge', prev, 'merged', p.id, note?.trim() || `Merged into ${target.refCode}`)
      // duplicates never earn first-reporter points
      for (const t of s.points) if (t.issueId === issueId && t.status === 'pending') t.status = 'void'
      // the duplicate's reporter becomes a supporter of the original
      if (issue.reporterId && issue.reporterId !== target.reporterId && !s.supporters.some((x) => x.issueId === targetId && x.userId === issue.reporterId)) {
        s.supporters.push({ issueId: targetId, userId: issue.reporterId, createdAt: new Date().toISOString() })
        awardSupport(s, target, issue.reporterId)
      }
      save()
    },

    async getPointsHistory(scope = 'mine') {
      const p = requireMe()
      const s = load()
      if (scope === 'all' && p.role !== 'admin') throw new ApiError('Only administrators can see every transaction.')
      return delay(
        s.points
          .filter((t) => scope === 'all' || t.userId === p.id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((t) => toTx(s, t)),
      )
    },
    async listRewards(opts = {}) {
      const s = load()
      if (opts.includeInactive) requireAdmin()
      return delay(s.rewards.filter((r) => opts.includeInactive || r.active).sort((a, b) => a.pointsRequired - b.pointsRequired))
    },
    async redeemReward(rewardId) {
      const p = requireMe()
      const s = load()
      const reward = s.rewards.find((r) => r.id === rewardId && r.active)
      if (!reward) throw new ApiError('That reward is no longer available.')
      // single synchronous block = atomic in the browser (mirrors the locked SQL function)
      const balance = s.points.filter((t) => t.userId === p.id && t.status === 'available').reduce((n, t) => n + t.points, 0)
      if (balance < reward.pointsRequired) throw new ApiError(`Not enough points — you need ${reward.pointsRequired - balance} more.`)
      const r = { id: uid(), userId: p.id, rewardId, pointsSpent: reward.pointsRequired, status: 'requested' as RedemptionStatus, createdAt: new Date().toISOString() }
      s.redemptions.push(r)
      award(s, p.id, null, 'redemption', -reward.pointsRequired, 'available', `redemption:${r.id}`)
      save()
      return toRedemption(s, r)
    },
    async listRedemptions(scope = 'mine') {
      const p = requireMe()
      const s = load()
      if (scope === 'all' && p.role !== 'admin') throw new ApiError('Only administrators can see all redemptions.')
      return delay(
        s.redemptions
          .filter((r) => scope === 'all' || r.userId === p.id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((r) => toRedemption(s, r)),
      )
    },
    async listNotifications(): Promise<AppNotification[]> {
      const p = me()
      if (!p) return []
      const s = load()
      const followed = new Set(s.followers.filter((f) => f.userId === p.id).map((f) => f.issueId))
      const fromHistory = s.history
        .filter((h) => followed.has(h.issueId) && h.changedBy !== p.id)
        .map((h) => {
          const issue = s.issues.find((i) => i.id === h.issueId)!
          return historyNotification({ ...h, issueRef: issue.refCode, issueTitle: issue.title })
        })
      const fromPoints = s.points.filter((t) => t.userId === p.id).map((t) => pointsNotification(toTx(s, t)))
      return delay([...fromHistory, ...fromPoints].filter((n): n is AppNotification => !!n))
    },
    async saveReward(input) {
      requireAdmin()
      const s = load()
      if (!input.title.trim()) throw new ApiError('Give the reward a name.')
      if (!Number.isInteger(input.pointsRequired) || input.pointsRequired <= 0) throw new ApiError('Points must be a whole number above zero.')
      if (input.id) {
        const r = s.rewards.find((x) => x.id === input.id)
        if (!r) throw new ApiError('Reward not found.')
        Object.assign(r, input)
        save()
        return r
      }
      const r: Reward = { ...input, id: uid() }
      s.rewards.push(r)
      save()
      return r
    },
    async setRedemptionStatus(id, status) {
      requireAdmin()
      const s = load()
      const r = s.redemptions.find((x) => x.id === id)
      if (!r) throw new ApiError('Redemption not found.')
      if (r.status !== 'requested') throw new ApiError(`This redemption is already ${r.status}.`)
      r.status = status
      if (status === 'cancelled') award(s, r.userId, null, 'adjustment', r.pointsSpent, 'available', `refund:${r.id}`)
      save()
    },

    async resetDemo() {
      memory = seedState()
      save()
    },
  }
}
